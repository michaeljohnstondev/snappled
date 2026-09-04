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

// firebase-functions v5+ made the ROOT import the v2 API. Every
// definition in this codebase is 1st gen (functions.firestore.document,
// functions.https.onCall, functions.pubsub.schedule, .runWith), so it
// imports the v1 surface explicitly. Dropping the /v1 here silently
// swaps the whole API shape.
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { spawn } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
// ffmpeg-static is PINNED to 5.2.0 (binary release b6.0) on purpose.
//
// 5.3.0 ships release b6.1.1, whose linux-x64 build has no `drawtext`
// filter — it isn't compiled with libfreetype. Every render in
// production failed in ~1.7s with "No such filter: 'drawtext'" and a
// 500, and the client silently fell back to the un-overlaid clip, so
// the overlay never worked once while sharing appeared fine.
//
// It passed local testing because the WINDOWS binary of the same
// package does have drawtext. Verified by string-scanning both linux
// builds: b6.0 contains 'drawtext', b6.1.1 does not.
//
// So: do not bump this without checking the linux binary first.
const ffmpegPath = require('ffmpeg-static');

// Anton — heavy condensed sans. Holds up at small sizes over busy video,
// which a lighter face would not.
const FONT_PATH = require.resolve(
  '@expo-google-fonts/anton/400Regular/Anton_400Regular.ttf'
);

const OUTPUT_DIR = 'shared';

// Bump when the burned-in LAYOUT changes (position, size, colour).
// Renders are cached per snapple, so without this a tweak would only
// ever show on clips nobody had shared yet — every existing one would
// keep serving the old framing forever.
const LAYOUT_VERSION = 5;

// Short stable id for a caption, so a render of the same text reuses the
// same Storage object instead of transcoding again. djb2 — collisions are
// irrelevant here; the worst case is two captions sharing a cache slot,
// and the caption is re-burned from the request either way.
function hashText(text) {
  let h = 5381;
  for (let i = 0; i < text.length; i++) h = ((h << 5) + h + text.charCodeAt(i)) >>> 0;
  return h.toString(36);
}
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
    // ffmpeg reports both progress and stream info on stderr.
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', reject);
    proc.on('close', code => {
      if (code === 0) return resolve(stderr);
      reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-1200)}`));
    });
  });
}

/**
 * Read a file's pixel dimensions. Invoking ffmpeg with no output is an
 * error by design, but it prints the stream table first — and ffmpeg-static
 * ships no ffprobe, so this is the available route.
 *
 * og:video:width / height are not decorative: Facebook sizes the player
 * from them and will skip inline playback when they are missing.
 */
function probeDimensions(bin, file) {
  return new Promise(resolve => {
    const proc = spawn(bin, ['-i', file]);
    let stderr = '';
    proc.stderr.on('data', d => { stderr += d.toString(); });
    proc.on('error', () => resolve(null));
    proc.on('close', () => {
      const line = stderr.split('\n').find(l => l.includes('Video:'));
      if (!line) return resolve(null);
      // Pull the first WxH token out of the comma-separated stream line.
      for (const chunk of line.split(',')) {
        const token = chunk.trim().split(' ')[0];
        const parts = token.split('x');
        if (parts.length === 2) {
          const w = parseInt(parts[0], 10);
          const h = parseInt(parts[1], 10);
          if (w > 0 && h > 0) return resolve({ width: w, height: h });
        }
      }
      return resolve(null);
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
    // Cap at 720 wide, never UPSCALE. This was 'scale=720:-2', which
    // blew a 406x720 phone clip up to 720x1276 — triple the pixels, a
    // file nearly twice the size of the original (0.96MB -> 1.76MB), and
    // no added detail, since upscaling invents nothing. The bloat pushed
    // shares past what SMS/MMS will carry, so Google Messages refused to
    // send them outright.
    "scale='min(720,iw)':-2",
    [
      `drawtext=textfile='${esc(captionFile)}'`,
      `fontfile='${esc(FONT_PATH)}'`,
      // expansion=none or drawtext parses %-sequences in the prompt as
      // format specifiers and silently renders NOTHING. A prompt like
      // "100% unhinged energy" is enough to blank the whole caption.
      'expansion=none',
      'fontcolor=white',
      // Proportional: 34/720 of the width, so it reads the same at any
      // source size now that we no longer normalise everything to 720.
      'fontsize=w*0.047',
      'line_spacing=8',
      'box=1',
      'boxcolor=black@0.55',
      'boxborderw=18',
      'x=(w-text_w)/2',
      // Not near the top: WhatsApp (and most messengers) overlay their
      // own chrome there — toolbar, frame scrubber, download/edit
      // buttons — and it sat right on the caption. Just above centre
      // clears both that and the caption bar at the bottom, while
      // staying off the subject's face more than dead centre would.
      'y=h*0.38',
    ].join(':'),
    [
      `drawtext=textfile='${esc(markFile)}'`,
      `fontfile='${esc(FONT_PATH)}'`,
      'expansion=none',
      'fontcolor=white@0.85',
      'fontsize=w*0.031',
      'box=1',
      'boxcolor=black@0.4',
      'boxborderw=10',
      'x=w-text_w-28',
      // Lifted off the very bottom edge for the same reason — the
      // receiving app's caption field sits there.
      'y=h-text_h-96',
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

    // Optional caption override. A snapple carries the prompt it was
    // recorded for, but it gets REPLAYED against other prompts — a game
    // round is a different prompt entirely. Sharing a round used to burn
    // in the snapple's original prompt, which is the wrong caption for
    // the thing being shared.
    const promptOverride =
      data && typeof data.promptText === 'string' ? data.promptText.trim() : '';

    const db = admin.firestore();
    const snapRef = db.collection('snapples').doc(snappleId);
    const snap = await snapRef.get();
    if (!snap.exists) {
      throw new functions.https.HttpsError('not-found', 'Snapple not found.');
    }

    const snapple = snap.data();
    const basePrompt = snapple.prompt || '';
    // Only treat it as an override when it actually differs, so a caller
    // that helpfully passes the same text still gets the shared cache.
    const usingOverride = !!promptOverride && promptOverride !== basePrompt;
    const effectivePrompt = usingOverride ? promptOverride : basePrompt;

    // Cache hit — the expensive path only ever runs once per snapple.
    // Skipped for overrides: sharedVideoUrl is the render of the snapple's
    // OWN prompt, and handing that back for a round share is exactly the
    // bug this override exists to fix.
    if (!usingOverride
        && snapple.sharedVideoUrl
        && snapple.shareLayoutVersion === LAYOUT_VERSION) {
      return {
        url: snapple.sharedVideoUrl,
        thumbUrl: snapple.shareThumbUrl || null,
        width: snapple.shareWidth || null,
        height: snapple.shareHeight || null,
        cached: true,
      };
    }

    // Older snapples predate `filename` being stored on the doc. They
    // still have a public videoUrl, so fall back to fetching that rather
    // than refusing outright — a missing field was returning 400 and
    // leaving those clips permanently un-overlaid.
    if (!snapple.filename && !snapple.videoUrl) {
      throw new functions.https.HttpsError(
        'failed-precondition',
        'Snapple has no video to render.'
      );
    }

    const bucket = admin.storage().bucket();
    const work = fs.mkdtempSync(path.join(os.tmpdir(), 'snapshare-'));
    const input = path.join(work, 'in.mp4');
    const output = path.join(work, 'out.mp4');
    const poster = path.join(work, 'poster.jpg');
    const captionFile = path.join(work, 'caption.txt');
    const markFile = path.join(work, 'mark.txt');

    try {
      if (snapple.filename) {
        await bucket.file(snapple.filename).download({ destination: input });
      } else {
        const res = await fetch(snapple.videoUrl);
        if (!res.ok) {
          throw new Error(`source fetch failed: ${res.status}`);
        }
        fs.writeFileSync(input, Buffer.from(await res.arrayBuffer()));
      }

      fs.writeFileSync(captionFile, wrapText(snapple.prompt).join('\n'), 'utf8');
      fs.writeFileSync(markFile, 'SNAPPLED', 'utf8');

      await run(ffmpegPath, [
        '-y',
        '-i', input,
        '-vf', buildFilter(captionFile, markFile),
        '-c:v', 'libx264',
        // 'veryfast' + crf 24 was a visibly lossy second generation on
        // top of an already-compressed 406x720 upload. 'fast' + crf 22
        // buys real quality for a modest size increase and only a couple
        // of seconds of render time — which matters, because the client
        // gives up at 22s and a slower preset would blow through it.
        //
        // Size is the hard constraint, not time: at 1.68MB a share was
        // refused outright by SMS/MMS. Don't drop crf below ~21 without
        // checking what the output actually weighs.
        '-preset', 'fast',
        '-crf', '22',
        '-c:a', 'aac',
        '-b:a', '128k',
        // faststart puts the index up front so the clip previews without
        // a full download when someone opens the share.
        '-movflags', '+faststart',
        output,
      ]);

      // Poster frame, taken from the OVERLAID render so the prompt is
      // visible in the unfurl thumbnail. Seek a little past the start —
      // frame zero of a phone recording is very often a black or
      // half-exposed frame.
      //
      // 720px wide at q:v 4 lands around 60-120kb. That ceiling matters:
      // WhatsApp quietly gives up on preview images that are too large.
      await run(ffmpegPath, [
        '-y', '-ss', '0.5', '-i', output,
        '-frames:v', '1', '-q:v', '4', poster,
      ]).catch(async () => {
        // Clip shorter than the seek point — retake from the first frame.
        await run(ffmpegPath, ['-y', '-i', output, '-frames:v', '1', '-q:v', '4', poster]);
      });

      const dims = await probeDimensions(ffmpegPath, output);

      const token = `${snappleId}-${Date.now()}`;

      // One token covers both objects; they are created together and are
      // equally public once shared.
      const publicUrl = (dest) =>
        `https://firebasestorage.googleapis.com/v0/b/${bucket.name}` +
        `/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;

      // Overrides get their own object so a round render never clobbers
      // the snapple's canonical one (or vice versa).
      const variant = usingOverride ? `-${hashText(promptOverride)}` : '';
      // Layout version rides in the filename too, so a re-render writes a
      // new object instead of racing the CDN's copy of the old one.
      const v = `-v${LAYOUT_VERSION}`;
      const videoDest = `${OUTPUT_DIR}/${snappleId}${variant}${v}.mp4`;
      const posterDest = `${OUTPUT_DIR}/${snappleId}${variant}${v}.jpg`;

      await bucket.upload(output, {
        destination: videoDest,
        metadata: {
          contentType: 'video/mp4',
          metadata: { firebaseStorageDownloadTokens: token },
        },
      });

      let thumbUrl = null;
      if (fs.existsSync(poster)) {
        await bucket.upload(poster, {
          destination: posterDest,
          metadata: {
            contentType: 'image/jpeg',
            metadata: { firebaseStorageDownloadTokens: token },
          },
        });
        thumbUrl = publicUrl(posterDest);
      }

      const url = publicUrl(videoDest);

      // Only the canonical render is recorded on the doc. An override is
      // one caption among many, so writing it here would make the next
      // plain share serve a round's caption.
      if (!usingOverride) {
        await snapRef.update({
          sharedVideoUrl: url,
          shareLayoutVersion: LAYOUT_VERSION,
          shareThumbUrl: thumbUrl,
          shareWidth: dims ? dims.width : null,
          shareHeight: dims ? dims.height : null,
          sharedVideoRenderedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      return {
        url,
        thumbUrl,
        width: dims ? dims.width : null,
        height: dims ? dims.height : null,
        cached: false,
      };
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

/**
 * getShareCard — public JSON for the web share page.
 *
 * The snapples collection requires auth to read, and the share page is by
 * definition for people who do not have the app. Rather than loosen those
 * rules, this runs on the admin SDK and hands back only the fields a
 * public page should ever see. Private snapples are refused outright.
 */
exports.getShareCard = functions.https.onRequest(async (req, res) => {
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET');
  // The page is static and the payload is public, so let the CDN carry
  // the load rather than paying for a function invocation per viewer.
  res.set('Cache-Control', 'public, max-age=300, s-maxage=3600');

  if (req.method === 'OPTIONS') return res.status(204).send('');

  const snappleId = req.query.id;
  if (!snappleId) return res.status(400).json({ error: 'Missing id.' });

  try {
    const snap = await admin.firestore()
      .collection('snapples').doc(String(snappleId)).get();

    if (!snap.exists) return res.status(404).json({ error: 'Not found.' });

    const s = snap.data();
    if (s.isPrivate) return res.status(403).json({ error: 'Private snapple.' });

    return res.json({
      id: snap.id,
      prompt: s.prompt || '',
      creatorUsername: s.creatorUsername || 'anonymous',
      // Prefer the overlaid render so the web page shows the same thing
      // that got shared to socials.
      videoUrl: s.sharedVideoUrl || s.videoUrl || null,
      // Unfurl metadata. Only present once a render has run — the OG
      // renderer degrades to a text-only card without it.
      thumbUrl: s.shareThumbUrl || null,
      width: s.shareWidth || null,
      height: s.shareHeight || null,
      price: s.currentPrice || s.basePrice || null,
      owners: Array.isArray(s.owners) ? s.owners.length : 0,
    });
  } catch (error) {
    console.error('[getShareCard]', snappleId, error);
    return res.status(500).json({ error: 'Lookup failed.' });
  }
});
