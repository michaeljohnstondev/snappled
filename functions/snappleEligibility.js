/**
 * snappleEligibility.js — one boolean so the pool query can be a query.
 *
 * Whether a snapple can be drawn into a hand is four conditions:
 * isActive !== false, and not banned, private or excluded from the pool.
 * Three of those treat a MISSING field as fine, which Firestore cannot
 * express - `where('isPrivate', '==', false)` drops every document that
 * never had the field, and 34 of 59 don't.
 *
 * So the client couldn't filter server-side and did it in JavaScript
 * instead: fetch 2,000 documents, keep the ~200 that pass. Firestore
 * bills all 2,000. At 2,000 daily players that one query was about 12
 * million reads a day, roughly 93% of the database bill, to use a
 * fraction of what it paid for.
 *
 * Collapsing the four conditions into a stored boolean makes it an
 * indexed query that reads exactly as many documents as it returns.
 */

const functions = require('firebase-functions/v1');

/** The pool predicate, in one place. */
function isPoolEligible(d) {
  return d.isActive !== false
    && d.isBanned !== true
    && d.isPrivate !== true
    && d.excludeFromPool !== true;
}

exports.isPoolEligible = isPoolEligible;

/**
 * Keep `poolEligible` in step with the fields it summarises.
 *
 * Writes only when the answer actually changes - this trigger fires on
 * its own write, so without that check it would recurse forever.
 */
exports.onSnappleEligibilityChanged = functions.firestore
  .document('snapples/{snappleId}')
  .onWrite(async (change) => {
    if (!change.after.exists) return null;
    const after = change.after.data();
    const want = isPoolEligible(after);
    if (after.poolEligible === want) return null;
    return change.after.ref.update({ poolEligible: want });
  });
