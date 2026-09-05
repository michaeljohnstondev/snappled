/**
 * shareRender.js - the picture a shared link unfurls with.
 *
 * This used to transcode the whole clip, burning the prompt and a
 * watermark into every frame, because Android strips the caption off an
 * attached file and the text had to survive re-upload. Shares are links
 * now: the prompt travels as og:title and the page only needs an image,
 * so that render is gone along with the 5-30s of CPU it cost per share.
 *
 * What's left is a single frame grab fitted to an unfurl card, plus the
 * JSON endpoint the share page falls back to.
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
// ffmpeg-static was PINNED to 5.2.0 (binary release b6.0) because
// 5.3.0's linux-x64 build ships without the `drawtext` filter, and the
// burned-in overlay depended on it. Nothing here calls drawtext any
// more - a poster is scale + pad, which every build has - so that
// constraint is lifted and the pin can move whenever there's a reason.
// It is left where it is only because there is currently no reason.
const ffmpegPath = require('ffmpeg-static');

// Unfurl card geometry. 1.91:1 is what every messenger lays out inline
// at a sane size; POSTER_BG is the site's own page background, so the
// letterboxing around a portrait clip looks intentional.
const POSTER_W = 1200;
const POSTER_H = 630;
const POSTER_BG = '#05080F';

// Bumped whenever the poster's SHAPE changes, so existing snapples
// regenerate instead of keeping a stale one.
const POSTER_VERSION = 2;


const OUTPUT_DIR = 'shared';

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
async function ensureSharePoster(snappleId, snapple) {
  if (!snappleId || !snapple) return null;
  // Version-gated so a shape change actually reaches snapples that
  // already have a poster. Without this, every clip shared before this
  // deploy would keep its portrait one forever.
  if (snapple.shareThumbUrl && snapple.sharePosterV === POSTER_VERSION) {
    return snapple.shareThumbUrl;
  }

  const bucket = admin.storage().bucket();
  const work = fs.mkdtempSync(path.join(os.tmpdir(), 'snapposter-'));
  const input = path.join(work, 'in.mp4');
  const poster = path.join(work, 'poster.jpg');

  try {
    if (snapple.filename) {
      await bucket.file(snapple.filename).download({ destination: input });
    } else if (snapple.videoUrl) {
      const res = await fetch(snapple.videoUrl);
      if (!res.ok) throw new Error(`source fetch failed: ${res.status}`);
      fs.writeFileSync(input, Buffer.from(await res.arrayBuffer()));
    } else {
      return null;
    }

    // One frame a second in, so it isn't a black lead-in frame, then
    // fitted onto a 1200x630 card.
    //
    // The frame itself is 9:16. Handed a portrait og:image, messengers
    // lay it out full-width and it dominates the conversation - which
    // is exactly what it was doing. force_original_aspect_ratio=decrease
    // scales the whole frame to fit without cropping (nothing in a
    // snapple is safe to cut - the joke can be anywhere in it), and pad
    // fills the sides with the site's own background so the letterbox
    // reads as the card's design rather than as empty space.
    await run(ffmpegPath, [
      '-y', '-ss', '1', '-i', input, '-frames:v', '1',
      '-vf', `scale=${POSTER_W}:${POSTER_H}:force_original_aspect_ratio=decrease,`
        + `pad=${POSTER_W}:${POSTER_H}:(ow-iw)/2:(oh-ih)/2:color=${POSTER_BG}`,
      '-q:v', '3', poster,
    ]);
    if (!fs.existsSync(poster)) return null;

    // Probe the SOURCE clip while it's already on disk. sharePage needs
    // these for og:video, and the deleted render was the only thing that
    // ever wrote them - without this, og:video would quietly stop being
    // emitted and Facebook and Discord would lose inline playback.
    // Best-effort: a failed probe just means no og:video, same as today
    // for every snapple that was never rendered.
    let dims = null;
    try {
      dims = await probeDimensions(ffmpegPath, input);
    } catch (e) {
      dims = null;
    }

    const token = `${snappleId}-${Date.now()}`;
    const dest = `${OUTPUT_DIR}/${snappleId}-poster.jpg`;
    await bucket.upload(poster, {
      destination: dest,
      metadata: {
        contentType: 'image/jpeg',
        metadata: { firebaseStorageDownloadTokens: token },
      },
    });
    const url = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}`
      + `/o/${encodeURIComponent(dest)}?alt=media&token=${token}`;

    await admin.firestore().collection('snapples').doc(snappleId)
      .update(Object.assign(
        { shareThumbUrl: url, sharePosterV: POSTER_VERSION },
        dims && dims.width && dims.height
          ? { shareWidth: dims.width, shareHeight: dims.height }
          : {},
      ));
    return url;
  } catch (error) {
    console.warn('[ensureSharePoster]', snappleId, error.message);
    return null;
  } finally {
    try { fs.rmSync(work, { recursive: true, force: true }); } catch (e) {}
  }
}

exports.ensureSharePoster = ensureSharePoster;

/**
 * Regenerate posters whose shape predates the current POSTER_VERSION.
 *
 * ensureSharePoster only ever runs from onNewSnapple, so a change to
 * the card's shape would otherwise reach new snapples only and every
 * clip already shared would keep unfurling at the old proportions.
 *
 * Idempotent and resumable: it processes a bounded batch and reports
 * how many remain, so it can simply be called again rather than
 * needing to finish inside one timeout.
 */
exports.backfillSharePosters = functions
  .runWith({ memory: '2GB', timeoutSeconds: 540 })
  .https.onCall(async (data, context) => {
    if (!context.auth) {
      throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
    }
    const limit = Math.min(Number(data && data.limit) || 25, 100);
    const snap = await admin.firestore().collection('snapples').get();

    const stale = snap.docs.filter(
      (d) => (d.data().sharePosterV || 0) !== POSTER_VERSION);

    let done = 0;
    let failed = 0;
    for (const doc of stale.slice(0, limit)) {
      // Safe to call directly: ensureSharePoster's early return checks
      // the VERSION, not merely the presence of a URL, so a stale
      // poster is regenerated rather than kept.
      const result = await ensureSharePoster(doc.id, doc.data());
      if (result) done++; else failed++;
    }
    return {
      success: true,
      done,
      failed,
      remaining: Math.max(0, stale.length - limit),
    };
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
      // videoUrl, never sharedVideoUrl. The latter is a leftover
      // render with the snapple's ORIGINAL prompt burned into every
      // frame - so a game share of an older clip would unfurl with
      // the right prompt in its title and the wrong one painted on
      // the video itself. The raw clip is the honest source.
      videoUrl: s.videoUrl || null,
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
