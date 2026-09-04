/**
 * shareService.js — every outbound share in the app.
 *
 * Shares a LINK, not the video file.
 *
 * Attaching the file forced a chain of workarounds, because Android
 * drops the caption whenever a file is attached: the prompt had to be
 * burned into the pixels by a server-side ffmpeg render, which cost
 * 5-30s, blew past MMS size limits, and had to be raced against a
 * client-side timeout. Every one of those problems came from the
 * attachment.
 *
 * A link removes them all. Share.share sends text on both platforms, so
 * the caption travels intact, and bigvibestudios.com/snappled/s/<id>
 * serves Open Graph tags with the prompt as og:title and a poster as
 * og:image — so the message unfurls into a card showing the prompt and a
 * thumbnail. The YouTube model.
 *
 * It's also the only version that leads anywhere: an attached video is a
 * dead end, whereas the page can hand someone the app.
 */

import { Share } from 'react-native';

// Where a non-user lands. The per-snapple page plays the clip and hands
// them a download link; the bare URL is the fallback when there's no id.
//
// Own domain rather than a studio subpath: this string is seen by every
// share recipient, so it's the most public text in the product.
const SHARE_URL = 'https://snappled.com';

// Mirrors the /snappled/s/** rewrite on bigvibestudios.com.
function snappleUrl(snappleId) {
  return snappleId ? `${SHARE_URL}/s/${snappleId}` : SHARE_URL;
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
/**
 * Share a snapple as a LINK, not a file.
 *
 * This used to attach the video itself, which forced a chain of
 * workarounds: Android drops the caption when a file is attached, so the
 * prompt had to be burned into the pixels by a server-side ffmpeg
 * render, which cost 5-30s, blew past MMS size limits, and had to be
 * raced against a client timeout.
 *
 * A link removes every one of those constraints at once. Share.share
 * sends text fine on both platforms, so the caption travels; and
 * bigvibestudios.com/snappled/s/<id> serves Open Graph tags carrying the
 * prompt as og:title with a poster as og:image, so the message unfurls
 * into a card with the prompt and a thumbnail — the YouTube model.
 *
 * It's also the only version that leads anywhere. An attached video is a
 * dead end; the page can hand someone the app.
 */
async function shareVideo({ caption, dialogTitle = 'Share Snapple' }) {
  try {
    // `caption` already ends with the snapple URL (see buildSnappleCaption
    // and the game captions), which is what the receiving app unfurls.
    await Share.share({ message: caption }, { dialogTitle });
    return { success: true, attached: false, link: true };
  } catch (error) {
    // Dismissing the sheet lands here on some platforms. Not an error.
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

    return shareVideo({
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

    return shareVideo({
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

    return shareVideo({
      caption,
      dialogTitle: 'Share Result',
    });
  },
};

export default shareService;
