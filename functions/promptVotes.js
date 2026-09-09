/**
 * promptVotes.js — one document per vote, counters kept by trigger.
 *
 * The old path had the client read the prompt, then write itself into a
 * `likes[]` array on that same document. Three things were wrong with
 * it, and a swipe-to-rate feature makes all three worse by design:
 *
 * 1. UNBOUNDED ARRAY. A UID costs ~33 bytes inside an array, so a prompt
 *    tops out near 31,000 voters before it hits Firestore's 1 MiB
 *    document limit — and then every further vote fails outright.
 *
 * 2. SINGLE-DOCUMENT WRITE CEILING. Firestore sustains roughly one write
 *    per second to any one document. At a hundred thousand users, a live
 *    prompt taking 10% engagement in an hour is ~2.8 writes/second on
 *    that one doc — about triple the budget.
 *
 * 3. LOST UPDATE. read-then-write meant two simultaneous votes both saw
 *    the same `wasDisliked` and could double-decrement the counter.
 *
 * A vote is now its own document, keyed by target + voter. That makes it
 * idempotent by construction (voting twice is the same write, not two),
 * removes the array entirely, and lets any number of people vote in
 * parallel because no two voters touch the same document.
 *
 * The counter still lives on the prompt, so the trigger below is the one
 * place that serialises. That is a deliberate trade: selection has to
 * ORDER BY score, and Firestore cannot sort across sharded counters. If
 * a single prompt ever sustains more than ~1 vote/second, the fix is to
 * shard THIS increment across N subdocuments and sum them when the score
 * is recomputed — the client contract above does not change.
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

const db = admin.firestore();

// Which fields carry the counts, per collection. A promptPool doc holds
// CUMULATIVE totals under the `...Lifetime` names; an activePrompts doc
// holds just the current run's under the plain ones, which
// accrueLifetimeStats folds into the pool when the prompt expires.
// Getting this backwards writes votes somewhere nothing ever reads.
const FIELDS = {
  activePrompts: { like: 'likeCount', dislike: 'dislikeCount' },
  promptPool: { like: 'likeCountLifetime', dislike: 'dislikeCountLifetime' },
};

/**
 * The document id for one person's vote on one prompt.
 *
 * Deterministic on purpose — it IS the idempotency key. Swiping the same
 * prompt twice overwrites one document rather than adding a second vote,
 * so no amount of retrying or double-tapping can inflate a count.
 */
function voteId(target, promptId, userId) {
  return `${target}_${promptId}_${userId}`;
}

exports.voteId = voteId;
exports.VOTE_FIELDS = FIELDS;

/**
 * Roll a vote up into its prompt's counters.
 *
 * Works off the DELTA between the old and new vote rather than the new
 * value alone, so flipping a like to a dislike moves both counters by
 * one and re-writing the same vote moves nothing. That is what lets the
 * client write blindly without first checking what it voted last time.
 */
exports.onPromptVoteWritten = functions.firestore
  .document('promptVotes/{voteId}')
  .onWrite(async (change) => {
    const before = change.before.exists ? change.before.data() : null;
    const after = change.after.exists ? change.after.data() : null;

    const prev = before ? before.value : 0;
    const next = after ? after.value : 0;
    if (prev === next) return null;

    const doc = after || before;
    const target = doc.target;
    const promptId = doc.promptId;
    const fields = FIELDS[target];
    // An unrecognised target is a bug in the client, not a transient
    // failure — retrying it forever would just burn invocations.
    if (!fields || !promptId) {
      console.warn('[votes] unroutable vote', target, promptId);
      return null;
    }

    const inc = admin.firestore.FieldValue.increment;
    const likeDelta = (next === 1 ? 1 : 0) - (prev === 1 ? 1 : 0);
    const dislikeDelta = (next === -1 ? 1 : 0) - (prev === -1 ? 1 : 0);

    const update = {};
    if (likeDelta) update[fields.like] = inc(likeDelta);
    if (dislikeDelta) update[fields.dislike] = inc(dislikeDelta);
    if (!Object.keys(update).length) return null;

    try {
      await db.collection(target).doc(promptId).update(update);
    } catch (e) {
      // The prompt can legitimately vanish between the swipe and this
      // trigger — an active prompt expires on a schedule. Losing the
      // vote is correct there; the prompt it belonged to is gone.
      if (e.code === 5 || /NOT_FOUND/i.test(e.message || '')) {
        console.log('[votes] prompt gone, dropping', target, promptId);
        return null;
      }
      throw e;
    }
    return null;
  });
