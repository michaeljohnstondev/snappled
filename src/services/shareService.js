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
/**
 * Link to one snapple. `prompt` is optional and only passed for GAME
 * shares: a snapple gets replayed against other prompts, so a round
 * share is answering that round's prompt, not the one the clip was
 * recorded for. The page reads ?p= and uses it for the card title and
 * the caption drawn over the video — same clip, right context, nothing
 * re-rendered.
 */
function snappleUrl(snappleId, prompt) {
  if (!snappleId) return SHARE_URL;
  const base = `${SHARE_URL}/s/${snappleId}`;
  return prompt ? `${base}?p=${encodeURIComponent(prompt)}` : base;
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

  /**
   * Caption for a snapple share: the link, and nothing else.
   *
   * Everything worth reading is in the card the link unfurls into - the
   * prompt is its title, the clip is its image. Writing it out again as
   * message text said the same thing twice, and the two disagreed: the
   * text carried the round's prompt while the URL was built without
   * one, so the card fell back to the prompt the clip was recorded for.
   * A snapple played against a new prompt is funny precisely BECAUSE
   * it is out of context, and the card was quietly restoring it.
   *
   * No creator either. Whoever receives this is not in the game; if
   * they want to know who made it, it is a tap away in the app.
   *
   * creatorUsername stays in the signature only so existing callers
   * do not have to change shape.
   */
  buildSnappleCaption(prompt, creatorUsername, snappleId) {
    return snappleUrl(snappleId, prompt);
  },

  /** Share one snapple from the feed / overlay. */
  /**
   * @param {Object} snapple
   * @param {string} [promptOverride] the round's prompt when sharing from
   *   inside a game — a snapple gets replayed against other prompts, so
   *   the one it was recorded for is the wrong caption there.
   */
  async shareSnapple(snapple, promptOverride) {
    if (!snapple) return { success: false, error: 'No snapple' };

    return shareVideo({
      caption: this.buildSnappleCaption(
        promptOverride, snapple.creatorUsername, snapple.id),
      dialogTitle: 'Share Snapple',
    });
  },

  /** Share the winning clip of a single round, with the round's prompt. */
  async shareRound({ prompt, winningSubmission }) {
    // Deliberately lean. A mid-game scoreboard is noise to whoever
    // receives it - they are not in the game - and the standings are
    // half-finished anyway. Those belong on the final share, where
    // they are a result rather than a progress update.
    //
    // Not even a winner line. The card carries the round's prompt as
    // its title and the clip as its image, which is the whole joke;
    // text above it only competes with what it is introducing.
    return shareVideo({
      caption: snappleUrl(winningSubmission?.snappleId, prompt),
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
      // Same reasoning as shareRound: the prompt is the card's title via
      // ?p=, so repeating it here says it twice in one message.
      winner ? `${winner.username} won on Snappled` : 'Game over on Snappled',
      '',
      board,
      '',
      `Watch it — ${snappleUrl(winningSubmission?.snappleId, prompt)}`,
    ].filter(Boolean).join('\n');

    return shareVideo({
      caption,
      dialogTitle: 'Share Result',
    });
  },
};

export default shareService;
