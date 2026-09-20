// gameRewards.js — paying out at the end of a game.
//
// The client used to do this: read its own reward off a list it had
// computed itself, double it if it believed it had a boost, then
// increment its own coins. Nothing in that chain was checked. The
// placement came from the phone, the payout table came from the phone,
// and the boost check read a document the phone could write.
//
// Here the game document is the evidence. It holds every player and
// every score, written round by round as the game was played, so
// placement is recomputed from it rather than accepted. Boosts are read
// server-side from the user document. And the claim is recorded, so a
// game pays out once no matter how many times the call is retried —
// which mattered even without an attacker, because the old code ran its
// commit inside an animation callback that a backgrounded app could
// fire twice.

// v1 explicitly. The bare require is the v2 API in firebase-functions
// v5+, and a v2 onCall handler is passed ONE argument - so the
// (data, context) signature below silently bound context to
// something that is not the auth context, context.auth came back
// undefined, and every call threw 'unauthenticated'. Every other
// function in this codebase is 1st gen; see the top of index.js.
const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

const db = admin.firestore();
const FV = admin.firestore.FieldValue;

// Coins by finishing position. Ties share the higher placement, so two
// players on equal points both take the better prize rather than the
// sort order silently deciding it.
const PLACEMENT_COINS = [50, 30, 15, 5, 0, 0];

/**
 * placementsFor — final standings, computed from the game's own scores.
 *
 * Mirrors gameService.calculateRewards, which still runs on the client
 * to DISPLAY the results screen. This is the copy that gets paid.
 */
function placementsFor(players) {
  const sorted = [...players].sort((a, b) => (b.points || 0) - (a.points || 0));
  let placement = 1;
  return sorted.map((p, i, arr) => {
    if (i > 0 && (arr[i - 1].points || 0) !== (p.points || 0)) {
      placement = i + 1;
    }
    return {
      uid: p.uid,
      placement,
      coinsEarned: PLACEMENT_COINS[placement - 1] || 0,
    };
  });
}

/**
 * claimGameReward — pay one player for one finished game.
 *
 * Takes a game id. Everything else is read: who played, what they
 * scored, where that puts them, and what boosts they had running. The
 * claim document is created in the same transaction as the payout, so
 * a second call finds it there and pays nothing.
 */
exports.claimGameReward = functions.https.onCall(async (data, context) => {
  const uid = context.auth && context.auth.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  }
  const gameId = data && data.gameId;
  if (!gameId) {
    throw new functions.https.HttpsError('invalid-argument', 'Which game?');
  }

  const gameSnap = await db.collection('games').doc(gameId).get();
  if (!gameSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'That game is gone.');
  }
  const game = gameSnap.data();

  if (game.phase !== 'finalResults') {
    throw new functions.https.HttpsError(
      'failed-precondition', 'That game has not finished.');
  }

  const players = game.players || [];
  const mine = placementsFor(players).find(p => p.uid === uid);
  if (!mine) {
    throw new functions.https.HttpsError(
      'permission-denied', 'You were not in that game.');
  }

  // One claim document per player per game. The id is the idempotency
  // key — there is no way to write a second one.
  const claimRef = db.collection('gameRewardClaims').doc(`${gameId}_${uid}`);
  const userRef = db.collection('users').doc(uid);

  return db.runTransaction(async (tx) => {
    const [claimSnap, userSnap] = await Promise.all([
      tx.get(claimRef), tx.get(userRef),
    ]);
    if (claimSnap.exists) {
      // Already paid. Hand back what was paid the first time so the
      // results screen shows the same numbers on a retry.
      const prior = claimSnap.data();
      return {
        success: true, alreadyClaimed: true,
        coins: prior.coins || 0, xp: prior.xp || 0,
        trophies: prior.trophies || 0, placement: prior.placement,
      };
    }
    if (!userSnap.exists) {
      throw new functions.https.HttpsError('not-found', 'No account found.');
    }
    const userData = userSnap.data();

    let coins = mine.coinsEarned;
    // XP and trophies only flow from ranked games, and ranked does not
    // exist yet — practice and custom award neither. The boost maths
    // below is here so that turning ranked on is a one-line change
    // rather than a rewrite.
    let xp = 0;
    let trophies = 0;

    const boosts = userData.boosts || {};
    const nowISO = new Date().toISOString();
    if (boosts.xpBoost && boosts.xpBoost > nowISO) xp = xp * 2;
    if (boosts.trophyBoost && boosts.trophyBoost > nowISO && trophies > 0) {
      trophies = trophies * 2;
    }

    // A shield eats one game's trophy loss and is consumed doing it.
    const shields = (userData.inventory && userData.inventory.shields) || 0;
    let shieldUsed = false;
    if (trophies < 0 && shields > 0) {
      trophies = 0;
      shieldUsed = true;
    }

    const won = mine.placement === 1;
    const streak = won ? ((userData.stats && userData.stats.winStreak) || 0) + 1 : 0;

    const updates = {
      'profile.experience': FV.increment(xp),
      'profile.xp': FV.increment(xp),
      'stats.gamesPlayed': FV.increment(1),
      'stats.totalCoinsEarned': FV.increment(coins),
      // Read-then-write on the streak is safe here: the user document
      // was read inside this transaction, so a concurrent change to it
      // aborts and retries rather than overwriting.
      'stats.winStreak': streak,
      updatedAt: FV.serverTimestamp(),
    };
    if (won) updates['stats.gamesWon'] = FV.increment(1);
    if (coins > 0) updates['resources.coins'] = FV.increment(coins);
    if (trophies !== 0) updates['resources.trophies'] = FV.increment(trophies);
    if (shieldUsed) updates['inventory.shields'] = FV.increment(-1);

    tx.update(userRef, updates);
    tx.create(claimRef, {
      gameId, uid,
      placement: mine.placement,
      coins, xp, trophies, shieldUsed,
      claimedAt: FV.serverTimestamp(),
    });

    return {
      success: true, alreadyClaimed: false,
      coins, xp, trophies, shieldUsed, placement: mine.placement,
    };
  });
});
