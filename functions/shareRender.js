/**
 * shareRender.js — burns the prompt onto a snapple so a shared clip
 * carries its own context.
 *
 * A shared video with no prompt is just a stranger doing something odd.
 * With the prompt on it, it reads as a bit, and the watermark tells you
 * where it came from. That's the whole advertising case, so the text has
 * to live in the pixels — it survives re-upload to any platform, which a
 * caption does not.
 *
 * Renders are cached: the output URL is written back to the snapple doc
 * as `sharedVideoUrl`, and a second share of the same snapple is a plain
 * Firestore read. Transcoding is by far the most expensive thing this
 * backend does, so it must happen at most once per snapple.
 */

const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ffmpegPath = require('ffmpeg-static');

// Anton — heavy condensed sans. Holds up at small sizes over busy video,
// which a lighter face would not.
const FONT_PATH = require.resolve(
  '@expo-google-fonts/anton/400Regular/Anton_400Regular.ttf'
);

const OUTPUT_DIR = 'shared';
// Roughly what fits across a 720px-wide frame at the caption size below.
const WRAP_CHARS = 26;
const MAX_LINES = 3;

/**
 * Hard-wrap on word boundaries. drawtext has no wrapping of its own, and
 * a long prompt would otherwise run off both edges of the frame.
 */
function wrapText(text, width = WRAP_CHARS) {
  const words = String(text || '').trim().split(/\s+/);
  const lines = [];
  let line = '';

  for (const word of words) {
    if (!line) {
      line = word;
    } else if ((line + ' ' + word).length <= width) {
      line += ' ' + word;
    } else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);

  if (lines.length > MAX_LINES) {
    const kept = lines.slice(0, MAX_LINES);
    kept[MAX_LINES - 1] = kept[MAX_LINES - 1].replace(/.{1}$/, '') + '…';
    return kept;
  }
  return lines;
}

function run(bin, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(bin, args);
    let stderr = '';
    // ffmpeg writes progress to stderr; only kept for the failure message.
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) return resolve();
      reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

/**
 * Build the filter chain: scale to 720 wide, prompt across the top in a
 * translucent box, SNAPPLED bottom-right.
 *
 * Text comes from files rather than inline `text=` on purpose — drawtext
 * treats `:`, `'` and `\` as syntax, and user-authored prompts are full
 * of apostrophes. textfile= sidesteps that, and expansion=none below
 * handles `%`, which textfile= alone does NOT protect against.
 */
function buildFilter(captionFile, markFile) {
  const esc = p => p.replace(/\\/g, '/').replace(/:/g, '\\:');
  return [
    'scale=720:-2',
    [
      `drawtext=textfile='${esc(captionFile)}'`,
      `fontfile='${esc(FONT_PATH)}'`,
      // expansion=none or drawtext parses %-sequences in the prompt as
      // format specifiers and silently renders NOTHING. A prompt like
      // "100% unhinged energy" is enough to blank the whole caption.
      'expansion=none',
      'fontcolor=white',
      'fontsize=34',
      'line_spacing=8',
      'box=1',
      'boxcolor=black@0.55',
      'boxborderw=18',
      'x=(w-text_w)/2',
      'y=48',
    ].join(':'),
    [
      `drawtext=textfile='${esc(markFile)}'`,
      `fontfile='${esc(FONT_PATH)}'`,
      'expansion=none',
      'fontcolor=white@0.85',
      'fontsize=22',
      'box=1',
      'boxcolor=black@0.4',
      'boxborderw=10',
      'x=w-text_w-28',
      'y=h-text_h-28',
    ].join(':'),
  ].join(',');
}

exports.renderShareVideo = functions
  // Transcoding is CPU-bound; 2GB buys proportionally more CPU on GCF and
  // a 10s clip lands in a few seconds rather than timing out.
  .runWith({ memory: '2GB', timeoutSeconds: 300 })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError(
        'unauthenticated', 'Sign in to share.'
      );
    }

    const snappleId = data && data.snappleId;
    if (!snappleId) {
      throw new functions.https.HttpsError(
        'invalid-argument', 'snappleId is required.'
      );
    }

    const db = admin.firestore();
    const snapRef = db.collection('snapples').doc(snappleId);
    const snap = await snapRef.get();
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Snapple not found.');
    }

    const snapple = snap.data();

    // Cache hit — the expensive path only ever runs once per snapple.
    if (snapple.sharedVideoUrl) {
      return { url: snapple.sharedVideoUrl, cached: true };
    }

    if (!snapple.filename) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Snapple has no stored video file to render.'
      );
    }

    const bucket = admin.storage().bucket();
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshare-'));
    const input = path.join(work, 'in.mp4');
    const output = path.join(work, 'out.mp4');
    const captionFile = path.join(work, 'caption.txt');
    const markFile = path.join(work, 'mark.txt');

    try {
      await bucket.file(snapple.filename).download({ destination: input });

      fs.writeFileSync(captionFile, wrapText(snapple.prompt).join('\n'), 'utf8');
      fs.writeFileSync(markFile, 'SNAPPLED', 'utf8');

      await run(ffmpegPath, [
        '-y',
        '-i', input,
        '-vf', buildFilter(captionFile, markFile),
        '-c:v', 'libx264',
        '-preset', 'veryfast',
        '-crf', '24',
        '-c:a', 'aac',
        '-b:a', '128k',
        // faststart puts the index up front so the clip previews without
        // a full download when someone opens the share.
        '-movflags', '+faststart',
        output,
      ]);

      const destination = `${OUTPUT_DIR}/${snappleId}.mp4`;
      const token = `${snappleId}-${Date.now()}`;
      await bucket.upload(output, {
        destination,
        metadata: {
          contentType: 'video/mp4',
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });

      const url =
        `https://firebasestorage.googleapis.com/v0/b/${bucket.name}` +
        `/o/${encodeURIComponent(destination)}?alt=media&token=${token}`;

      await snapRef.update({
        sharedVideoUrl: url,
        sharedVideoRenderedAt: admin.firestore.FieldValue.serverTimestamp(),
      });

      return { url, cached: false };
    } catch (error) {
      console.error('[renderShareVideo]', snappleId, error);
      throw new functions.https.HttpsError(
        'internal', 'Could not render the share video.'
      );
    } finally {
      // /tmp is an in-memory tmpfs on GCF — leaving files there counts
      // against the function's own memory on every warm invocation.
      fs.rmSync(work, { recursive: true, force: true });
    }
  });
