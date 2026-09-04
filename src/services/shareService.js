/**
 * shareService.js — every outbound share in the app.
 *
 * Before this, all three share sites posted a text blob with a raw Firebase
 * Storage URL pasted in. Nothing attached, and the link was `snappled://`,
 * which does nothing on a device that doesn't already have the app — i.e.
 * for exactly the people a share is meant to reach.
 *
 * Now: the actual video file is attached, with the prompt as the caption.
 * A good snapple is the ad, so the job here is to get the video itself in
 * front of someone, with the prompt attached so it reads as a bit rather
 * than a stray clip.
 *
 * Platform split, and it's deliberate:
 *   iOS     - Share.share({ message, url }) attaches the file AND the caption.
 *   Android - RN's Share ignores `url` entirely, so the file goes out via
 *             expo-sharing and the caption is lost. Two things cover that
 *             gap: the server-side burned-in overlay (see renderedUrl
 *             below), and copying the caption to the clipboard so it's
 *             one paste away in the receiving app's own caption field.
 *
 * On the clipboard: Android's share intent does have a text slot
 * (EXTRA_TEXT alongside EXTRA_STREAM), but expo-sharing doesn't expose
 * it AND WhatsApp — the likeliest destination — ignores it for media,
 * preferring its own caption box. The clipboard sidesteps whether the
 * receiving app honours caption extras at all, because it works with any
 * app that has a text field.
 */

import { Platform, Share } from 'react-native';
import * as Sharing from 'expo-sharing';
import * as Clipboard from 'expo-clipboard';

// Where a non-user lands. The per-snapple page plays the clip and hands
// them a download link; the bare URL is the fallback when there's no id.
const SHARE_URL = 'https://bigvibestudios.com/snappled';

// Mirrors the /snappled/s/** rewrite on bigvibestudios.com.
function snappleUrl(snappleId) {
  return snappleId ? `${SHARE_URL}/s/${snappleId}` : SHARE_URL;
}

const CACHE_PREFIX = 'share-';

// djb2 — short stable filename per remote URL so repeat shares of the
// same snapple reuse the cached file instead of re-downloading.
function hashUrl(url) {
  let h = 5381;
  for (let i = 0; i < url.length; i++) h = ((h << 5) + h + url.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// How long to wait on a first-time server render before giving up and
// sharing the un-overlaid clip. A cold function plus a download plus an
// ffmpeg transcode plus an upload routinely ran past the old 12s, which
// is why a first share so often came out with no burned-in prompt.
//
// Raised twice. 12s was chosen when the wait was invisible; 22s once
// callers showed a pending state. Measured renders then came in at
// 13-22s — one logged 22028ms and lost the race by 28 milliseconds,
// which is exactly the "share worked but the overlay is missing" case.
// 45s leaves real headroom rather than sitting on the boundary.
//
// The wait is only ever paid once per clip+caption: the render caches
// server-side, so a repeat share returns in ~60ms.
const RENDER_TIMEOUT_MS = 45000;

/**
 * Ask the backend for a copy with the prompt burned into the frames.
 * `promptText` overrides which caption gets burned — a snapple replayed in
 * a game round is answering that ROUND's prompt, not the one it was
 * recorded for, and the burned-in text is the only thing that survives an
 * Android share (see the platform note at the top of this file).
 * Cached server-side after the first call, so this is usually one fast
 * Firestore read. Returns null on any failure — the caller then shares
 * the original video, which is a worse ad but still a working share.
 */
async function requestRenderedVideo(snappleId, promptText) {
  if (!snappleId) return null;
  try {
    const { httpsCallable } = await import('firebase/functions');
    const { functions } = await import('./firebase');
    const render = httpsCallable(functions, 'renderShareVideo');

    const result = await Promise.race([
      render({ snappleId, promptText: promptText || undefined }),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('render timeout')), RENDER_TIMEOUT_MS)),
    ]);
    return result?.data?.url || null;
  } catch (error) {
    console.warn('[ShareService] render unavailable:', error?.message);
    return null;
  }
}

/**
 * Pull a remote video into the cache directory so it can be attached.
 * Returns a local file:// URI, or null if anything goes wrong — callers
 * fall back to a text share rather than failing the whole action.
 */
async function cacheVideo(videoUrl) {
  try {
    const LegacyFS = require('expo-file-system/legacy');
    if (!LegacyFS.cacheDirectory) return null;

    const target = `${LegacyFS.cacheDirectory}${CACHE_PREFIX}${hashUrl(videoUrl)}.mp4`;

    // Reuse a previous download. Storage URLs are content-addressed by
    // token, so a hit here is genuinely the same file.
    const existing = await LegacyFS.getInfoAsync(target);
    if (existing.exists && existing.size > 0) return target;

    const result = await LegacyFS.downloadAsync(videoUrl, target);
    if (result?.status !== 200) return null;
    return result.uri;
  } catch (error) {
    console.warn('[ShareService] cache failed:', error?.message);
    return null;
  }
}

/**
 * Share a video with a caption, attaching the real file where the platform
 * allows it. Falls back to caption-only if the download or the native
 * sheet is unavailable, so the button always does something.
 *
 * @param {object}  opts
 * @param {string}  opts.videoUrl    - remote source video
 * @param {string}  opts.caption     - text to send alongside
 * @param {string} [opts.renderedUrl]- pre-rendered copy with the prompt burned
 *                                     in; preferred over videoUrl when present
 * @param {string} [opts.dialogTitle]
 */
async function shareVideo({ videoUrl, caption, renderedUrl, dialogTitle = 'Share Snapple' }) {
  const source = renderedUrl || videoUrl;

  try {
    // Copy BEFORE the sheet opens, so the paste chip most Android
    // keyboards show for freshly-copied text is already armed when the
    // caption field takes focus. Best-effort: a clipboard failure must
    // never block the share itself.
    let copied = false;
    if (Platform.OS === 'android' && caption) {
      try {
        await Clipboard.setStringAsync(caption);
        copied = true;
      } catch (e) {
        console.warn('[ShareService] clipboard copy failed:', e?.message);
      }
    }

    if (!source) {
      await Share.share({ message: caption });
      return { success: true, attached: false };
    }

    const localUri = await cacheVideo(source);

    if (localUri && Platform.OS === 'ios') {
      await Share.share({ message: caption, url: localUri });
      return { success: true, attached: true };
    }

    if (localUri && (await Sharing.isAvailableAsync())) {
      await Sharing.shareAsync(localUri, {
        mimeType: 'video/mp4',
        dialogTitle,
        UTI: 'public.movie',
      });
      return { success: true, attached: true, captionCopied: copied };
    }

    // No file — send the caption with a link so it's still actionable.
    await Share.share({ message: `${caption}\n\n${source}` });
    return { success: true, attached: false };
  } catch (error) {
    // A user dismissing the share sheet lands here on some platforms.
    // Not an error worth surfacing.
    console.warn('[ShareService] share failed:', error?.message);
    return { success: false, error: error?.message };
  }
}

export const shareService = {
  SHARE_URL,

  /** Caption for a single snapple: the prompt is the hook, so it leads. */
  buildSnappleCaption(prompt, creatorUsername, snappleId) {
    const lines = [];
    if (prompt) lines.push(`"${prompt}"`);
    if (creatorUsername) lines.push(`@${creatorUsername} on Snappled`);
    else lines.push('on Snappled');
    lines.push('');
    // Deep-links to the snapple itself rather than the app front door,
    // so a creator sharing their own work sends people to their work.
    lines.push(`Watch it — ${snappleUrl(snappleId)}`);
    return lines.join('\n');
  },

  /** Share one snapple from the feed / overlay. */
  async shareSnapple(snapple) {
    if (!snapple) return { success: false, error: 'No snapple' };

    // Falls back to the raw clip so the button never dead-ends on a
    // render failure.
    const rendered =
      // Always ask the function; never short-circuit on the URL cached on
      // the doc. That shortcut meant the client served its own stale copy
      // and the function was never invoked, so a layout change on the
      // server could never reach an already-rendered snapple — the cache
      // check it added was simply never consulted.
      //
      // Costs nothing: when the render is current the function returns
      // the same URL from a single Firestore read, ~100ms.
      await requestRenderedVideo(snapple.id);

    return shareVideo({
      videoUrl: snapple.videoUrl,
      renderedUrl: rendered,
      caption: this.buildSnappleCaption(
        snapple.prompt, snapple.creatorUsername, snapple.id),
      dialogTitle: 'Share Snapple',
    });
  },

  /** Share the winning clip of a single round, with the round's prompt. */
  async shareRound({ prompt, winningSubmission, players = [] }) {
    const standings = [...players]
      .sort((a, b) => (b.points || 0) - (a.points || 0))
      .map((p, i) => `${i + 1}. ${p.username}`)
      .join('\n');

    const caption = [
      prompt ? `"${prompt}"` : '',
      winningSubmission?.creatorUsername
        ? `Round won by @${winningSubmission.creatorUsername}`
        : 'Round winner',
      '',
      standings,
      '',
      `Watch it — ${snappleUrl(winningSubmission?.snappleId)}`,
    ].filter(Boolean).join('\n');

    // Deliberately NOT falling back to winningSubmission.sharedVideoUrl:
    // that's the render of the snapple's own prompt, which is the wrong
    // caption for a round. Ask for this round's prompt instead.
    const rendered = await requestRenderedVideo(
      winningSubmission?.snappleId,
      prompt,
    );

    return shareVideo({
      videoUrl: winningSubmission?.videoUrl,
      renderedUrl: rendered,
      caption,
      dialogTitle: 'Share Round',
    });
  },

  /** Share the final scoreboard plus the winner's clip. */
  async shareGameResult({ rewards = [], winningSubmission, prompt }) {
    const winner = rewards[0];
    const board = rewards
      .map(p => `#${p.placement} ${p.username} — ${p.points} pts`)
      .join('\n');

    const caption = [
      winner ? `${winner.username} won on Snappled` : 'Game over on Snappled',
      prompt ? `Final prompt: "${prompt}"` : '',
      '',
      board,
      '',
      `Watch it — ${snappleUrl(winningSubmission?.snappleId)}`,
    ].filter(Boolean).join('\n');

    // Same reasoning as shareRound — burn the prompt that was actually
    // being answered, not the snapple's original.
    const rendered = await requestRenderedVideo(
      winningSubmission?.snappleId,
      prompt,
    );

    return shareVideo({
      videoUrl: winningSubmission?.videoUrl,
      renderedUrl: rendered,
      caption,
      dialogTitle: 'Share Result',
    });
  },
};

export default shareService;
