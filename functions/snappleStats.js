// snappleStats.js — keeping a creator's like totals current.
//
// Two achievement families ask how many likes someone has received in
// total, and how many the best single snapple got. Both used to be
// answered by fetching every snapple that person had ever made and
// adding them up, on login, after every game, after every upload, and
// every time the achievements screen opened.
//
// A like arrives one at a time, so the totals can be kept one at a time
// too. This applies the delta as it happens and the check becomes a
// read of the user document that was already being read.
//
// `likes` is the counter the reaction batch maintains on the snapple.
// The array `likedBy` is the source of truth for who; this watches the
// number, because that is what the milestones are counted in.

const functions = require('firebase-functions');
const admin = require('firebase-admin');

const db = admin.firestore();
const FV = admin.firestore.FieldValue;

exports.onSnappleLikesChanged = functions.firestore
  .document('snapples/{snappleId}')
  .onUpdate(async (change) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};

    const was = before.likes || 0;
    const now = after.likes || 0;
    if (was === now) return null;

    const creatorId = after.creatorId;
    if (!creatorId) return null;

    const userRef = db.collection('users').doc(creatorId);

    // The running total moves by the delta, so an unlike takes it back
    // down. maxLikesOnOne only ever climbs: "get 25 likes on a single
    // snapple" is something you achieved, and someone unliking it later
    // does not un-achieve it. Achievements are already one-way - the
    // award is kept once granted - so a high-water mark is the reading
    // that matches.
    const updates = {
      'stats.totalLikesReceived': FV.increment(now - was),
      updatedAt: FV.serverTimestamp(),
    };

    if (now > was) {
      // A transaction only because the high-water mark is a compare,
      // and a compare against a value another like might be changing
      // has to read and write together.
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(userRef);
        if (!snap.exists) return;
        const best = (snap.data().stats && snap.data().stats.maxLikesOnOne) || 0;
        if (now > best) updates['stats.maxLikesOnOne'] = now;
        tx.update(userRef, updates);
      }).catch(e => console.warn('[snappleStats]', creatorId, e.message));
      return null;
    }

    // Going down needs no compare, so it needs no transaction.
    await userRef.update(updates)
      .catch(e => console.warn('[snappleStats]', creatorId, e.message));
    return null;
  });
