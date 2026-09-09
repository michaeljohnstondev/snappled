/**
 * promptModeration.js — reports that actually do something.
 *
 * Reporting a prompt wrote a row into `promptReports` and that was the
 * end of it: nothing read the collection, so every report ever filed sat
 * unseen. A report button that does nothing is worse than no button,
 * because it tells someone the problem has been handled.
 *
 * Bans were half-wired too. `bannedPromptTexts` was written only by the
 * admin screen, and only the CLIENT ever consulted it — on the summon
 * flow. The server never checked it anywhere, so a banned prompt could
 * still be drawn out of the pool by rotation and put back in front of
 * everyone. Banning here therefore removes the prompt from circulation
 * as well as recording the ban.
 *
 * ONE REPORT PER PERSON PER PROMPT is load-bearing. The report document
 * is keyed `<promptId>_<uid>`, so reporting twice overwrites one row
 * rather than filing two. Without that, auto-banning on a count would
 * let a single person delete any prompt in the game by tapping report
 * three times.
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

const db = admin.firestore();

// Distinct reporters needed before a prompt is pulled. Low because the
// key above makes each one a different person, and a prompt that three
// separate people flag is not worth an argument. Raise it if real
// traffic shows people reporting things they merely dislike — that is
// what the dislike swipe is for.
const REPORT_BAN_THRESHOLD = 3;

/** Same normalization the rest of the app de-dups prompt text with. */
function normalizePromptText(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Take a prompt out of circulation and remember the text.
 *
 * Deletes rather than flags. A flag would need every future query to
 * remember to exclude it, and the pool is read from several places —
 * one forgotten filter and the banned prompt is live again. The
 * bannedPromptTexts entry is the durable record, and it is what the
 * summon flow already checks before letting the text come back.
 */
async function banPromptText(text, reason, reportCount) {
  const textKey = normalizePromptText(text);
  if (!textKey) return;

  await db.collection('bannedPromptTexts').doc(textKey).set({
    text,
    reason: reason || 'reported by the community',
    reportCount: reportCount || 0,
    bannedAt: admin.firestore.FieldValue.serverTimestamp(),
    bannedBy: 'auto',
  }, { merge: true });

  // Pull every copy: the pool entry it would be redrawn from, anything
  // queued on deck, and any live instance.
  for (const col of ['promptPool', 'onDeckPrompts', 'activePrompts']) {
    const matches = await db.collection(col).where('textKey', '==', textKey).get();
    await Promise.all(matches.docs.map(d => d.ref.delete()));
  }

  // Recycled copies are keyed by document id rather than textKey, so
  // they need matching on the normalized text instead.
  const recycled = await db.collection('recycledPrompts').get();
  await Promise.all(recycled.docs
    .filter(d => normalizePromptText(d.data().text) === textKey)
    .map(d => d.ref.delete()));

  console.log(`[Moderation] banned "${text}" (${reportCount} reports)`);
}

exports.banPromptText = banPromptText;
exports.REPORT_BAN_THRESHOLD = REPORT_BAN_THRESHOLD;

/**
 * Count a report and ban the prompt once enough people agree.
 *
 * Counts rows rather than trusting a counter field: the deterministic
 * document id already guarantees one row per person, so the number of
 * rows IS the number of distinct reporters, and no separate tally can
 * drift away from it.
 */
exports.onPromptReported = functions.firestore
  .document('promptReports/{reportId}')
  .onCreate(async (snap) => {
    const report = snap.data() || {};
    const promptId = report.promptId;
    if (!promptId) return null;

    const reports = await db.collection('promptReports')
      .where('promptId', '==', promptId)
      .get();
    const count = reports.size;

    // Keep the running total visible to the admin screen even before
    // the threshold, so a prompt trending toward a ban can be seen.
    const activeRef = db.collection('activePrompts').doc(promptId);
    const active = await activeRef.get();
    if (!active.exists) return null;

    await activeRef.update({ reportCount: count }).catch(() => {});
    if (count < REPORT_BAN_THRESHOLD) return null;

    await banPromptText(
      active.data().text,
      report.reason || 'reported by the community',
      count,
    );
    return null;
  });
