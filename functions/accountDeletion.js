// accountDeletion.js — erasing an account, and everything it left behind.
//
// Both stores require this: Google Play for any app that lets you make
// an account, Apple under 5.1.1(v). Neither accepts "email us" as the
// only route, and neither accepts an account you can still sign into.
//
// THE SHAPE OF IT
//
// One callable would time out. A creator with 200 snapples means 200
// deletes, each fanning out to refund every buyer - so the work is
// split three ways:
//
//   requestAccountDeletion      fast. Marks the user doc and deletes
//                               the Auth user, so they are locked out
//                               in the same second they confirm. That
//                               is the part the stores actually check.
//   onAccountDeletionRequested  the sweep, with no clock on it.
//   sweepStalledDeletions       picks up anything still marked an hour
//                               later. Triggers are at-least-once, not
//                               exactly-once, and a sweep that dies
//                               halfway would otherwise strand data.
//
// Order is load-bearing. The user document is the INDEX of what to
// clean - their own following/followers lists are how we find the other
// accounts to sweep without querying every user in the database - so it
// is the last thing deleted, not the first.
//
// DELETE, ANONYMISE, OR KEEP
//
// Not everything is the same kind of data, so not everything gets the
// same treatment:
//
//   delete      snapples (which refunds their buyers), videos,
//               comments, votes, decks, wishlists, gift claims, and
//               this uid out of every array on every other account.
//
//   anonymise   game prompts and pool prompts they wrote. Prompt TEXT
//               is community property, may be live in this season's
//               deck, and unlike a video it genuinely can be separated
//               from its author. Ripping prompts out of running games
//               to honour a deletion request is the wrong trade.
//
//   keep        transactions, stripped to a uid and an amount.
//               Financial records, retained under the legal-obligation
//               exception rather than deleted. Reports they filed keep
//               their substance and lose their author, or anyone could
//               erase their own moderation trail by deleting an
//               account.
//
// KEEPING SNAPPLES
//
// A snapple is somebody's face and voice. You can strip a username off
// a text post and it is anonymous; you cannot do that to a video, the
// person is still in it. So keeping one needs explicit consent, opt-in,
// asked at deletion time - never a default.
//
// When they say yes, the snapple does NOT need a placeholder account to
// point at. Attribution is already denormalised onto the snapple doc
// (creatorUsername), and every render path reads it from there with an
// 'anonymous' fallback. Null the creatorId and the card goes on being
// browsable, buyable and playable with nobody behind it - while every
// creator-only control, which all test creatorId === user.uid,
// correctly disappears.
//
// Keeping is also the better outcome for whoever BOUGHT it. Deleting
// refunds their coins and takes the card; keeping means they still have
// the thing they chose. The refund is the consolation prize.

// v1 explicitly: firebase-functions v5+ makes the bare root import v2,
// which has no functions.firestore.document and passes onCall a single
// argument. Same note as the top of index.js.
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

const db = admin.firestore();
const FV = admin.firestore.FieldValue;

// How fresh a sign-in has to be to delete an account. Deleting is
// irreversible and the confirmation sits inside an app that is already
// signed in, so a phone left unlocked is the threat. Ten minutes is
// long enough to re-authenticate and read the confirmation properly,
// short enough that a borrowed phone is not enough on its own.
const REAUTH_WINDOW_SECONDS = 10 * 60;

// Firestore caps a batch at 500 writes. 300 leaves room for the extra
// writes a single pass adds around the edges.
const BATCH_SIZE = 300;

// How long a deletion may sit marked before the sweeper assumes the
// trigger died and runs it again. The sweep is idempotent, so running
// twice costs a few reads and changes nothing.
const STALLED_AFTER_MS = 60 * 60 * 1000;

// What a kept snapple says instead of a username. Not the real one: the
// account is gone and the name may be taken by somebody else tomorrow,
// which would attribute a stranger's video to them.
const ORPHAN_NAME = 'Deleted Account';

/**
 * Delete every document a query matches, a batch at a time.
 *
 * Re-queries rather than paginating, because each pass deletes what it
 * just read - the next `limit` is always the next unprocessed page.
 */
async function deleteByQuery(ref, field, uid) {
  let removed = 0;
  for (;;) {
    const snap = await ref.where(field, '==', uid).limit(BATCH_SIZE).get();
    if (snap.empty) return removed;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.delete(d.ref));
    await batch.commit();
    removed += snap.size;
    if (snap.size < BATCH_SIZE) return removed;
  }
}

/**
 * Blank the author on every document a query matches, keep the rest.
 *
 * The `where` clause is on the same field being cleared, so each pass
 * stops matching what it just wrote and the loop ends on its own.
 */
async function anonymizeByQuery(ref, field, uid, extra = {}) {
  let touched = 0;
  for (;;) {
    const snap = await ref.where(field, '==', uid).limit(BATCH_SIZE).get();
    if (snap.empty) return touched;
    const batch = db.batch();
    snap.docs.forEach((d) => batch.update(d.ref, { [field]: null, ...extra }));
    await batch.commit();
    touched += snap.size;
    if (snap.size < BATCH_SIZE) return touched;
  }
}

/**
 * Everything the confirmation screen needs to state real numbers.
 *
 * Counted on the server because working out what would be refunded
 * means summing priceHistory, which has one entry per purchase and on a
 * popular snapple is thousands of them - not a thing to pull down to a
 * phone to render one sentence.
 *
 * Reads every snapple this person made, priceHistory and all. Fine at
 * the scale one person can record video at; if a creator ever holds
 * thousands of snapples with thousands of purchases each, the fix is a
 * running refundOwed total incremented on the snapple at purchase time,
 * so this becomes a sum of small numbers instead of a walk of big ones.
 */
exports.previewAccountDeletion = functions
  .runWith({ memory: '512MB' })
  .https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  }
  const uid = context.auth.uid;

  const [userSnap, snapples] = await Promise.all([
    db.collection('users').doc(uid).get(),
    db.collection('snapples').where('creatorId', '==', uid).get(),
  ]);
  const user = userSnap.exists ? userSnap.data() : {};

  let purchased = 0;
  let refundCoins = 0;
  const buyers = new Set();
  snapples.forEach((d) => {
    const s = d.data() || {};
    if ((s.buyCount || 0) > 0) purchased++;
    for (const p of (s.priceHistory || [])) {
      if (!p.buyer || p.buyer === uid) continue;
      buyers.add(p.buyer);
      refundCoins += p.price || 0;
    }
  });

  return {
    snappleCount: snapples.size,
    // How many would survive the "keep what people bought" option, and
    // so how many buyers would keep their card instead of their coins.
    purchasedCount: purchased,
    buyerCount: buyers.size,
    refundCoins,
    coins: (user.resources && user.resources.coins) || 0,
    tickets: (user.resources && user.resources.tokens) || 0,
  };
});

/**
 * Start a deletion: mark the account, then lock it out.
 *
 * Marking first matters. If the Auth user went first and the mark
 * failed, there would be a user document with no way left to
 * authenticate as it and nothing to tell the sweeper it was orphaned.
 */
exports.requestAccountDeletion = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  }
  const uid = context.auth.uid;

  // Recent sign-in required. The admin SDK does not enforce this the
  // way the client SDK's own delete() does, so it is enforced here.
  const authTime = context.auth.token && context.auth.token.auth_time;
  if (!authTime || (Date.now() / 1000) - authTime > REAUTH_WINDOW_SECONDS) {
    throw new functions.https.HttpsError(
      'failed-precondition', 'Please sign in again to confirm this.');
  }

  const keepPurchased = !!(data && data.keepPurchased === true);

  // set-merge rather than update: an Auth user with no Firestore
  // document is rare but real (a signup that died between the two), and
  // update() would throw on it - leaving somebody unable to delete an
  // account precisely because it is already broken.
  await db.collection('users').doc(uid).set({
    deletion: {
      status: 'deleting',
      keepPurchased,
      requestedAt: FV.serverTimestamp(),
    },
  }, { merge: true });

  // From here they cannot sign in, which is what "the account is gone"
  // has to mean on the day it is reviewed. The data sweep follows on
  // its own schedule.
  try {
    await admin.auth().deleteUser(uid);
  } catch (e) {
    // Already gone is a success, not a failure - a previous attempt got
    // this far and died, and the sweeper is finishing its work.
    if (e.code !== 'auth/user-not-found') {
      console.error('[deletion] auth delete failed', uid, e.message);
      throw new functions.https.HttpsError('internal', 'Could not delete the account.');
    }
  }

  console.log(`[deletion] requested ${uid} keepPurchased=${keepPurchased}`);
  return { success: true, keepPurchased };
});

/**
 * Their snapples: deleted, or orphaned and left in the game.
 *
 * Deleting is one call per document ON PURPOSE. onSnappleDeleted is
 * what refunds the buyers, sweeps the id out of everyone who owned or
 * liked or wishlisted it, and removes the video and poster - so the
 * account path and the ordinary "delete my snapple" path can never
 * drift apart, because they are the same path.
 */
async function clearSnapples(uid, keepPurchased) {
  const snap = await db.collection('snapples').where('creatorId', '==', uid).get();
  let deleted = 0;
  const keptIds = [];
  const keptFiles = [];

  for (const doc of snap.docs) {
    const s = doc.data() || {};
    const bought = (s.buyCount || 0) > 0;

    if (keepPurchased && bought) {
      await doc.ref.update({
        creatorId: null,
        creatorUsername: ORPHAN_NAME,
        // They stop owning it along with everything else they are
        // leaving; the buyers in `owners` keep theirs.
        owners: FV.arrayRemove(uid),
        orphanedAt: FV.serverTimestamp(),
      });
      const file = s.filename || (s.videoId ? `videos/${uid}/${s.videoId}.mp4` : null);
      if (file) keptFiles.push(file);
      keptIds.push(doc.id);
      continue;
    }

    await doc.ref.delete();
    deleted++;
  }

  return { deleted, keptIds, keptFiles };
}

/**
 * Their uploads in Storage, except the ones still being played.
 *
 * Listing the folder rather than deleting per-snapple catches the
 * orphans too: a recording that uploaded and then failed to become a
 * snapple leaves a file with no document pointing at it, and that is
 * still video of the person who asked to be forgotten.
 */
async function clearUploads(uid, keptFiles) {
  const keep = new Set(keptFiles);
  let removed = 0;
  try {
    const [files] = await admin.storage().bucket().getFiles({
      prefix: `videos/${uid}/`,
    });
    for (const file of files) {
      if (keep.has(file.name)) continue;
      try {
        await file.delete();
        removed++;
      } catch (e) {
        if (e.code !== 404) {
          console.warn('[deletion] file delete failed', file.name, e.message);
        }
      }
    }
  } catch (e) {
    console.warn('[deletion] storage list failed', uid, e.message);
  }
  return removed;
}

/**
 * Take this uid out of everyone else's account.
 *
 * Driven off the leaving user's OWN social lists rather than a query
 * across the users collection - they already hold both directions, so
 * the work is bounded by how social one person was instead of by how
 * many accounts exist.
 */
async function clearSocialGraph(uid, user) {
  const social = user.social || {};
  const others = new Set([
    ...(social.following || []),
    ...(social.followers || []),
    ...(social.blockedUsers || []),
    ...(social.blockedBy || []),
    ...(social.mutedNotifications || []),
  ].filter(Boolean));

  let touched = 0;
  for (const otherId of others) {
    try {
      await db.collection('users').doc(otherId).update({
        'social.following': FV.arrayRemove(uid),
        'social.followers': FV.arrayRemove(uid),
        'social.blockedUsers': FV.arrayRemove(uid),
        'social.blockedBy': FV.arrayRemove(uid),
        'social.mutedNotifications': FV.arrayRemove(uid),
      });
      touched++;
    } catch (e) {
      // An account deleted before this one is the ordinary reason.
      console.warn('[deletion] social sweep failed', otherId, e.message);
    }
  }
  return touched;
}

/**
 * Snapples they bought but did not make.
 *
 * The inverse indexes on someone else's snapple still name this uid
 * after their own document is gone, and nothing else would ever come
 * back to clear them.
 */
async function clearOwnedElsewhere(uid, user) {
  const ids = new Set([
    ...(user.ownedSnapples || []),
    ...(user.wishlistedSnapples || []),
    ...(user.likedSnapples || []),
    ...(user.dislikedSnapples || []),
  ].filter(Boolean));

  let touched = 0;
  for (const id of ids) {
    try {
      await db.collection('snapples').doc(id).update({
        owners: FV.arrayRemove(uid),
        wishlistedBy: FV.arrayRemove(uid),
        likedBy: FV.arrayRemove(uid),
        dislikedBy: FV.arrayRemove(uid),
      });
      touched++;
    } catch (e) {
      // A snapple deleted already - nothing left to clean.
    }
  }
  return touched;
}

/**
 * The whole sweep, in the order the data allows.
 *
 * Idempotent from end to end: every step either matches nothing the
 * second time or writes the same value again, so the scheduled retry
 * can re-run a half-finished deletion without doing any harm.
 */
async function sweepUser(uid) {
  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) return;
  const user = userSnap.data() || {};
  const keepPurchased = !!(user.deletion && user.deletion.keepPurchased);

  const { deleted, keptIds, keptFiles } = await clearSnapples(uid, keepPurchased);
  const files = await clearUploads(uid, keptFiles);

  // Theirs to remove outright.
  const removed = {};
  removed.comments = await deleteByQuery(db.collection('comments'), 'userId', uid);
  removed.votes = await deleteByQuery(db.collection('promptVotes'), 'userId', uid);
  removed.decks = await deleteByQuery(db.collection('decks'), 'userId', uid);
  removed.gameDecks = await deleteByQuery(db.collection('gameDecks'), 'userId', uid);
  removed.wishlists = await deleteByQuery(db.collection('wishlists'), 'userId', uid);
  removed.interactions = await deleteByQuery(
    db.collection('user_interactions'), 'userId', uid);
  removed.giftClaims = await deleteByQuery(db.collection('giftClaims'), 'userId', uid);
  removed.videos = await deleteByQuery(db.collection('videos'), 'userId', uid);

  // Theirs to be forgotten as the author of, not to remove. The text
  // stays in the game; the name comes off it.
  const anon = {};
  anon.gamePrompts = await anonymizeByQuery(
    db.collection('gamePrompts'), 'createdBy', uid, { creatorUsername: null });
  // A summoned snapple prompt is written to promptPool AND copied into
  // whichever rotation collection it is currently sitting in, each with
  // its own createdBy. Anonymising only the pool copy would leave their
  // name on the one actually being shown in the app.
  for (const c of ['promptPool', 'activePrompts', 'onDeckPrompts',
    'recycledPrompts', 'hourlyPrompts', 'snapplePrompts']) {
    anon[c] = await anonymizeByQuery(
      db.collection(c), 'createdBy', uid, { creatorUsername: null });
  }
  // Moderation keeps its substance and loses its author - otherwise
  // deleting an account is a way to withdraw every report you filed.
  anon.reports = await anonymizeByQuery(db.collection('reports'), 'reporterId', uid);
  anon.promptReports = await anonymizeByQuery(
    db.collection('promptReports'), 'userId', uid);
  // transactions are deliberately NOT touched. They are the record of
  // what was charged, retained under the legal-obligation exception,
  // and nulling the uid would leave a pile of amounts that reconcile
  // against nothing - destroying the value without improving the
  // privacy, because a uid whose account no longer exists identifies
  // nobody.

  const social = await clearSocialGraph(uid, user);
  const owned = await clearOwnedElsewhere(uid, user);

  // The user document last: it is the index every step above read from.
  await userRef.delete();

  // Proof it happened, holding nothing that identifies anyone. This is
  // what answers "did you actually delete my data" a year from now.
  await db.collection('deletedAccounts').doc(uid).set({
    deletedAt: FV.serverTimestamp(),
    keepPurchased,
    snapplesDeleted: deleted,
    filesDeleted: files,
    // The IDS of what was kept, not just how many. Consent is normally
    // something you can withdraw, and this is the only way that stays
    // possible: once the account is gone there is nothing left linking
    // a person to their videos, so somebody who changes their mind has
    // no way to point at one. With this, a mail to the address on the
    // deletion page can be honoured - admins can delete an orphaned
    // snapple, which is what the isAdmin() clause on snapples is for.
    //
    // It identifies nobody on its own: a uid with no account behind it
    // and a list of video ids that no longer name an author.
    snapplesKept: keptIds,
  });

  console.log(`[deletion] swept ${uid}: ${deleted} deleted, ${keptIds.length} kept, `
    + `${files} files, ${JSON.stringify(removed)} ${JSON.stringify(anon)} `
    + `social=${social} owned=${owned}`);
}

/**
 * Runs the sweep when an account is marked for deletion.
 *
 * Guarded on the transition rather than the value: the sweep writes to
 * other user documents, and every one of those writes fires this same
 * trigger again.
 */
exports.onAccountDeletionRequested = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .firestore.document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const was = before.deletion && before.deletion.status;
    const now = after.deletion && after.deletion.status;
    if (now !== 'deleting' || was === 'deleting') return null;

    try {
      await sweepUser(context.params.userId);
    } catch (e) {
      // Left marked on purpose. The scheduled sweeper is what turns a
      // failure here into a retry instead of a silent half-deletion.
      console.error('[deletion] sweep failed', context.params.userId, e.message);
    }
    return null;
  });

/**
 * Re-runs any deletion still sitting marked an hour later.
 *
 * Firestore triggers are at-least-once, not exactly-once, and a sweep
 * that runs out of time leaves an account half-erased with nothing
 * watching it. This is the net under that.
 */
exports.sweepStalledDeletions = functions
  .runWith({ timeoutSeconds: 540, memory: '512MB' })
  .pubsub.schedule('every 1 hours')
  .onRun(async () => {
    const cutoff = new Date(Date.now() - STALLED_AFTER_MS);
    const stalled = await db.collection('users')
      .where('deletion.status', '==', 'deleting')
      .where('deletion.requestedAt', '<', cutoff)
      .limit(20)
      .get();

    for (const doc of stalled.docs) {
      try {
        await sweepUser(doc.id);
      } catch (e) {
        console.error('[deletion] stalled sweep failed', doc.id, e.message);
      }
    }
    if (!stalled.empty) console.log(`[deletion] retried ${stalled.size} stalled`);
    return null;
  });
