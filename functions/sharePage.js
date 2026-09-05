/**
 * sharePage.js — Snappled share pages with real Open Graph tags.
 *
 * Facebook, WhatsApp, iMessage and Discord fetch a shared URL with a
 * crawler that does not execute JavaScript. A page that loads its content
 * client-side therefore unfurls identically for every snapple, with no
 * thumbnail — which is what this replaces.
 *
 * Lives in the Snappled project alongside the data it renders. It used to
 * sit in the studio project and reach across to snapplepark over HTTPS,
 * because a Hosting rewrite cannot target a function in another project.
 * Now that snappled.com is served from this project that hop is gone —
 * this reads Firestore directly, so there is one less service to fail and
 * no cross-project dependency.
 */

const functions = require('firebase-functions');
const fs = require('fs');
const path = require('path');

const admin = require('firebase-admin');

// No branded fallback image exists on the site yet. Emitting og:image
// pointing at a 404 is worse than omitting it — several crawlers cache
// the failed fetch and keep showing a broken card afterwards. Drop a
// real image in and set this to use it.
const FALLBACK_IMAGE = null;

// Read once at cold start rather than per request.
const TEMPLATE = fs.readFileSync(
  path.join(__dirname, 'shareTemplate.html'), 'utf8');

const DESCRIPTION =
  'Answer a prompt in ten seconds of video. The crowd votes, ' +
  'the votes decide the round.';

/** Escape for use inside a double-quoted HTML attribute. */
function attr(value) {
  return String(value == null ? '' : value)
    .split('&').join('&amp;')
    .split('"').join('&quot;')
    .split('<').join('&lt;')
    .split('>').join('&gt;');
}

function tag(property, content) {
  if (!content && content !== 0) return '';
  var key = property.indexOf('twitter:') === 0 ? 'name' : 'property';
  return '<meta ' + key + '="' + property + '" content="' + attr(content) + '">';
}

/**
 * Build the unfurl block.
 *
 * og:image is the one that actually matters: WhatsApp will never play a
 * video inline and shows a thumbnail card instead, and Facebook falls back
 * to the image whenever it declines inline playback. og:video is best
 * effort on top of that — Facebook and Discord honour it, most others
 * ignore it.
 */
function buildOg(card, pageUrl, promptOverride) {
  const prompt = promptOverride || (card && card.prompt) || '';
  const title = prompt
    ? '"' + prompt + '"'
    : 'A snapple on Snappled';
  const creator = card && card.creatorUsername
    ? 'by @' + card.creatorUsername + ' — ' + DESCRIPTION
    : DESCRIPTION;
  const image = (card && card.thumbUrl) || FALLBACK_IMAGE;
  // tag() already drops empties, so a null image emits nothing.

  const tags = [
    tag('og:site_name', 'Snappled'),
    tag('og:url', pageUrl),
    tag('og:title', title),
    tag('og:description', creator),
    tag('og:image', image),
    tag('og:image:secure_url', image),
    tag('twitter:title', title),
    tag('twitter:description', creator),
    tag('twitter:image', image),
  ];

  if (card && card.videoUrl && card.width && card.height) {
    tags.push(
      tag('og:type', 'video.other'),
      tag('og:video', card.videoUrl),
      tag('og:video:secure_url', card.videoUrl),
      tag('og:video:type', 'video/mp4'),
      tag('og:video:width', card.width),
      tag('og:video:height', card.height),
      tag('og:image:width', card.width),
      tag('og:image:height', card.height),
      // A player card needs a hosted iframe and domain allowlisting, so
      // the large image card is the honest choice here.
      tag('twitter:card', 'summary_large_image'),
    );
  } else {
    tags.push(tag('og:type', 'website'), tag('twitter:card', 'summary_large_image'));
  }

  return tags.filter(Boolean).join('\n');
}

function idFromPath(reqPath) {
  const parts = String(reqPath || '').split('/').filter(Boolean);
  const last = parts[parts.length - 1];
  if (!last || last === 's' || last === 'snappled' || last === 'index.html') {
    return null;
  }
  return decodeURIComponent(last);
}

exports.snappleShare = functions.https.onRequest(async (req, res) => {
  const id = idFromPath(req.path) || (req.query && req.query.id) || null;

  // Build the canonical from the REQUEST, not a constant. This function
  // now serves two hosts — snappled.com/s/<id> and the original
  // bigvibestudios.com/snappled/s/<id> — and hardcoding one meant the
  // other advertised a canonical pointing somewhere else.
  // Behind a Hosting rewrite, req.host is the *function's* host
  // (us-central1-….cloudfunctions.net). Hosting forwards the real one in
  // x-forwarded-host, so prefer that and only fall back to req.host for
  // direct invocations. Getting this wrong put the raw function URL in
  // og:url, which is worse than the hardcoded constant it replaced.
  const fwd = req.get && req.get('x-forwarded-host');
  const rawHost = fwd || (req.get && req.get('host')) || '';
  const host = /cloudfunctions\.net|run\.app/.test(rawHost) || !rawHost
    ? 'snappled.com'
    : rawHost;
  const pageUrl = 'https://' + host + (req.path || ('/s/' + (id || '')));

  // Optional prompt override, ?p=... — a snapple gets REPLAYED against
  // other prompts, and a share from a game round is answering that
  // round's prompt, not the one the clip was recorded for. Passing it in
  // the URL means the same clip can unfurl with the right context on
  // every share, with no re-render.
  const promptOverride = req.query && typeof req.query.p === 'string'
    ? req.query.p.slice(0, 200)
    : '';

  let card = null;
  let failure = null;

  if (!id) {
    failure = { title: 'Nothing to show', body: 'This link is missing a snapple id.' };
  } else {
    try {
      // Same shape getShareCard returned, read straight from Firestore.
      const snap = await admin.firestore()
        .collection('snapples').doc(String(id)).get();

      if (!snap.exists) {
        failure = {
          title: 'Snapple not found',
          body: 'It may have expired, or the link is incomplete.',
        };
      } else if (snap.data().isPrivate) {
        failure = {
          title: 'This snapple is private',
          body: 'Its creator has not shared it publicly.',
        };
      } else {
        const s = snap.data();
        card = {
          id: snap.id,
          prompt: s.prompt || '',
          creatorUsername: s.creatorUsername || 'anonymous',
          videoUrl: s.sharedVideoUrl || s.videoUrl || null,
          thumbUrl: s.shareThumbUrl || null,
          width: s.shareWidth || null,
          height: s.shareHeight || null,
        };
      }
    } catch (error) {
      console.error('[snappleShare] lookup failed', id, error);
    }
  }

  // Crawlers re-fetch often and the payload rarely changes, so let the
  // Hosting CDN absorb it instead of billing an invocation per view.
  res.set('Cache-Control', 'public, max-age=300, s-maxage=3600');
  res.set('Content-Type', 'text/html; charset=utf-8');

  let data = '';
  if (card) {
    // Hand the client the payload the server already fetched. </script>
    // inside JSON would close this block early, so neutralise it.
    data = '<script>window.__SNAPPLE__ = ' +
      JSON.stringify(card).split('<').join('\\u003c') + ';</script>';
  } else if (failure) {
    data = '<script>window.__SNAPPLE_ERROR__ = ' +
      JSON.stringify(failure).split('<').join('\\u003c') + ';</script>';
  }

  const pageTitle = promptOverride || (card && card.prompt) || '';
  const title = pageTitle ? pageTitle + ' — Snappled' : 'Snapple — Snappled';

  const html = TEMPLATE
    .split('__OG__').join(buildOg(card, pageUrl, promptOverride))
    .split('__DATA__').join(data)
    .split('__TITLE__').join(attr(title));

  res.status(failure && !card ? 404 : 200).send(html);
});
