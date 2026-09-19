// gifts.js — presents from the supreme leader.
//
// An admin gives every player coins and tickets at once. The naive
// version of that is a fan-out: loop the users collection and increment
// each document. At seven users it is instant; at a hundred thousand it
// is a hundred thousand writes, minutes of function time, and a partial
// failure that leaves half the playerbase gifted with no clean way to
// retry.
//
// So a gift is ONE document, and players claim it when they next open
// the app. The admin write is a single doc no matter how many people
// play, and the cost of granting is spread across the people actually
// showing up. Claims are keyed <giftId>_<uid>, the same idempotency
// shape as prompt votes, game reward claims and the IAP ledger, so a
// double tap or a retried request cannot pay twice.
//
// The tradeoff, stated plainly: someone who never opens the app never
// receives their gift. For a present that announces itself with an
// alert, that is the better behaviour - the grant and the telling
// happen together, so nobody is silently given something and never
// told.

// v1 explicitly: firebase-functions v5+ makes the root import v2, which
// has no functions.firestore.document. Same note as the top of index.js.
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

const db = admin.firestore();
const FV = admin.firestore.FieldValue;

// Mirrors ADMIN_UIDS in functions/gamePrompts.js and isAdmin() in
// firestore.rules. Three copies is two too many, but they are read by
// three different runtimes.
const ADMIN_UIDS = ['SrB8T1TmftQzu90H7phQkRJXkRn2'];

// A gift stops being claimable after this long. Without a cutoff, an
// account created a year from now would open the app and collect every
// gift ever sent, which is both a strange first impression and an
// unbounded pile of currency.
const GIFT_LIFETIME_DAYS = 30;

// How many gifts one claim call will process. Anyone returning after a
// long absence collects the most recent few rather than a wall of
// alerts.
const MAX_CLAIMS_PER_CALL = 5;

// Ceilings on a single gift. These exist because the admin screen is a
// text field and a typo is silent: 100000 instead of 1000 would mint
// more currency than the store has ever sold, to everybody, instantly,
// with no way to take it back short of a migration.
const MAX_GIFT_COINS = 10000;
const MAX_GIFT_TICKETS = 1000;

/**
 * createGlobalGift — send one gift to everybody.
 *
 * Writes a single document. Nothing is granted here; the gift is
 * claimed by each player when they next open the app.
 */
exports.createGlobalGift = functions.https.onCall(async (data, context) => {
  const uid = context.auth && context.auth.uid;
  if (!uid || !ADMIN_UIDS.includes(uid)) {
    throw new functions.https.HttpsError('permission-denied', 'Admins only.');
  }

  const coins = Math.floor(Number((data && data.coins) || 0));
  const tickets = Math.floor(Number((data && data.tickets) || 0));
  const message = String((data && data.message) || '').trim().slice(0, 200);

  if (!Number.isFinite(coins) || !Number.isFinite(tickets)) {
    throw new functions.https.HttpsError('invalid-argument', 'Numbers only.');
  }
  // Gifts only give. A negative gift would be a tax, and taking currency
  // from everyone at once is not something that should be one typo away.
  if (coins < 0 || tickets < 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Gifts cannot be negative.');
  }
  if (coins === 0 && tickets === 0) {
    throw new functions.https.HttpsError('invalid-argument', 'Gift is empty.');
  }
  if (coins > MAX_GIFT_COINS || tickets > MAX_GIFT_TICKETS) {
    throw new functions.https.HttpsError(
      'invalid-argument',
      `Too large. Max ${MAX_GIFT_COINS} coins and ${MAX_GIFT_TICKETS} tickets per gift.`);
  }

  const now = Date.now();
  const ref = db.collection('globalGifts').doc();
  await ref.set({
    coins,
    tickets,
    message,
    createdBy: uid,
    createdAt: FV.serverTimestamp(),
    // Stored as a plain number as well as a timestamp: the claim query
    // filters on it, and a client clock is never involved in either.
    expiresAtMs: now + GIFT_LIFETIME_DAYS * 24 * 60 * 60 * 1000,
    createdAtMs: now,
  });

  return { success: true, giftId: ref.id, coins, tickets };
});

/**
 * claimGifts — collect whatever this player has not collected yet.
 *
 * One call, one query, one transaction per gift. Returns what was
 * granted so the app can say so; returns an empty list the rest of the
 * time, which is the overwhelmingly common case and costs one query.
 */
exports.claimGifts = functions.https.onCall(async (data, context) => {
  const uid = context.auth && context.auth.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  }

  const now = Date.now();
  // Only gifts that are still live. Ordered newest first so someone
  // returning after months gets the recent ones rather than the oldest
  // five of a long backlog.
  const snap = await db.collection('globalGifts')
    .where('expiresAtMs', '>', now)
    .orderBy('expiresAtMs', 'desc')
    .limit(MAX_CLAIMS_PER_CALL)
    .get();

  if (snap.empty) return { success: true, claimed: [] };

  const userRef = db.collection('users').doc(uid);
  const claimed = [];

  for (const doc of snap.docs) {
    const gift = doc.data();
    const claimRef = db.collection('giftClaims').doc(`${doc.id}_${uid}`);
    try {
      const granted = await db.runTransaction(async (tx) => {
        const [claimSnap, userSnap] = await Promise.all([
          tx.get(claimRef), tx.get(userRef),
        ]);
        // The claim document IS the idempotency key. There is no way to
        // write a second one, so there is no way to be paid twice.
        if (claimSnap.exists) return false;
        if (!userSnap.exists) return false;

        const updates = { updatedAt: FV.serverTimestamp() };
        if (gift.coins) updates['resources.coins'] = FV.increment(gift.coins);
        if (gift.tickets) updates['resources.tokens'] = FV.increment(gift.tickets);
        tx.update(userRef, updates);
        tx.create(claimRef, {
          giftId: doc.id,
          uid,
          coins: gift.coins || 0,
          tickets: gift.tickets || 0,
          claimedAt: FV.serverTimestamp(),
        });
        return true;
      });
      if (granted) {
        claimed.push({
          giftId: doc.id,
          coins: gift.coins || 0,
          tickets: gift.tickets || 0,
          message: gift.message || '',
        });
      }
    } catch (e) {
      // One gift failing must not stop the others. The claim document
      // was never written, so the next open tries again.
      console.warn('[gifts] claim failed', doc.id, uid, e.message);
    }
  }

  if (claimed.length) {
    console.log(`[gifts] ${uid} claimed ${claimed.length}`);
  }
  return { success: true, claimed };
});
