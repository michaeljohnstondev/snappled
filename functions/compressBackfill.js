/**
 * compressBackfill.js — one-off: shrink snapples uploaded before the
 * client-side compression step existed.
 *
 * Every snapple in the library predates videoCompression.js, so none has
 * ever been through it. Recordings are capped at 10 seconds, yet some
 * clips are 40MB+ — roughly 33Mbps — which is what makes a hand
 * undownloadable on cellular however the concurrency is tuned.
 *
 * Compression on the client is a native module, so this re-encodes
 * server-side with the ffmpeg the functions already depend on. Output is
 * H.264 rather than the H.265 the camera records: it is far more widely
 * hardware-decoded, and HEVC decode was itself a suspect in the playback
 * stutter on some Android devices.
 *
 * Writes to a NEW storage path and repoints the doc, KEEPING the
 * original and recording originalVideoUrl / originalFilename so any
 * doc can be put back. The download URL carries a token tied to the
 * object, so overwriting in place is not an option anyway. Poster and grid thumbnails are
 * unaffected: they are separate images and the frame is unchanged.
 *
 *   node compressBackfill.js            # dry run, prints what it would do
 *   node compressBackfill.js --apply    # actually re-encode
 */

const admin = require('firebase-admin');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const ffmpegPath = require('ffmpeg-static');

admin.initializeApp({
  projectId: 'snapplepark',
  storageBucket: 'snapplepark.firebasestorage.app',
});

const APPLY = process.argv.includes('--apply');

// Anything at or under this is already fine; re-encoding it would cost
// quality for no meaningful saving.
const THRESHOLD_BYTES = 4 * 1024 * 1024;

// 720p is the capture height already, so this only ever downscales an
// oversized source. CRF 28 on a 10s phone clip lands around 1-2MB.
const MAX_HEIGHT = 1280;
const CRF = '28';

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    let err = '';
    proc.stderr.on('data', (d) => { err += d.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => (
      code === 0 ? resolve() : reject(new Error(err.slice(-400)))
    ));
  });
}

/** Storage object path out of a Firebase download URL. */
function pathFromUrl(url) {
  const m = String(url || '').match(/\/o\/([^?]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

const mb = (b) => (b / 1048576).toFixed(1);

(async () => {
  const bucket = admin.storage().bucket();
  const db = admin.firestore();
  const snap = await db.collection('snapples').get();

  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'snapcompress-'));
  let considered = 0;
  let done = 0;
  let failed = 0;
  let savedBytes = 0;

  for (const docSnap of snap.docs) {
    const data = docSnap.data();
    const objPath = data.filename || pathFromUrl(data.videoUrl);
    if (!objPath) continue;

    const file = bucket.file(objPath);
    let size = 0;
    try {
      const [meta] = await file.getMetadata();
      size = Number(meta.size || 0);
    } catch (e) {
      continue; // object is gone; nothing to compress
    }
    if (size <= THRESHOLD_BYTES) continue;

    // Never re-encode something this script already encoded. Lossy ->
    // lossy is generational loss: a second pass throws away detail the
    // first pass already discarded, and it compounds every run. The
    // size threshold catches most of it, but a clip that landed above
    // it would otherwise be re-crushed on every invocation.
    if (data.compressedBytes) {
      console.log(`skip ${docSnap.id}: already compressed by this script`);
      continue;
    }

    considered++;
    if (!APPLY) {
      console.log(`would compress ${docSnap.id}  ${mb(size)}MB  ${objPath}`);
      continue;
    }

    const input = path.join(work, `${docSnap.id}-in.mp4`);
    const output = path.join(work, `${docSnap.id}-out.mp4`);
    try {
      await file.download({ destination: input });
      await run(ffmpegPath, [
        '-y', '-i', input,
        '-vf', `scale=-2:'min(${MAX_HEIGHT},ih)'`,
        '-c:v', 'libx264', '-preset', 'medium', '-crf', CRF,
        '-c:a', 'aac', '-b:a', '96k',
        '-movflags', '+faststart',
        output,
      ]);

      const outSize = fs.statSync(output).size;
      if (outSize >= size) {
        console.log(`skip ${docSnap.id}: re-encode was not smaller`);
        continue;
      }

      // New path + new token. The old URL's token is tied to the old
      // object, so this cannot be done in place.
      const token = `${docSnap.id}-${Date.now()}`;
      const dest = objPath.replace(/\.mp4$/i, '') + '-c.mp4';
      await bucket.upload(output, {
        destination: dest,
        metadata: {
          contentType: 'video/mp4',
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });
      const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}`
        + `/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;

      // The original is KEPT, and the doc records how to get back to
      // it. Nothing here is verified yet - the whole point of this run
      // is to find out whether the re-encoded clips play correctly - and
      // deleting the only copy of the source before knowing that would
      // make a bad re-encode unrecoverable. Sweep the originals once
      // the compressed set has been played.
      await docSnap.ref.update({
        videoUrl: url,
        filename: dest,
        compressionSkipped: false,
        compressedBytes: outSize,
        originalBytes: size,
        originalVideoUrl: data.videoUrl || null,
        originalFilename: objPath,
      });

      savedBytes += size - outSize;
      done++;
      console.log(`${docSnap.id}: ${mb(size)}MB -> ${mb(outSize)}MB`);
    } catch (e) {
      failed++;
      console.log(`FAILED ${docSnap.id}: ${String(e.message).slice(0, 120)}`);
    } finally {
      [input, output].forEach((f) => {
        try { fs.existsSync(f) && fs.unlinkSync(f); } catch (err) { /* ignore */ }
      });
    }
  }

  try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) { /* ignore */ }

  if (!APPLY) {
    console.log(`\n${considered} over ${mb(THRESHOLD_BYTES)}MB. `
      + 'Re-run with --apply to compress.');
  } else {
    console.log(`\ncompressed ${done}, failed ${failed}, saved ${mb(savedBytes)}MB`);
  }
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
