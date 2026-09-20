// achievements.js — deciding what someone has earned, and paying it.
//
// This ran on the client, and it took the stats to check as an
// ARGUMENT. Four different screens each assembled their own version of
// that object from their own queries, passed it in, and the service
// paid out against it. Which meant the answer to "have I won the 500
// followers award" was whatever the caller said it was, and the payout
// went straight onto the caller's own balance.
//
// So the stats are derived here now, from the user document alone. The
// client keeps its own copy of the catalogue for the achievements
// SCREEN - showing someone what they are working towards is a display
// job - but nothing it computes decides a payout.
//
// Every condition in the old switch was the same shape, `stat >= n`,
// so the table below replaces it outright. Adding an achievement is a
// row rather than a case.

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

const ACHIEVEMENTS = {
  first_snapple:     { stat: 'videosCreated', need: 1, coins: 50, xp: 25, name: 'First Snap' },
  snapple_5:         { stat: 'videosCreated', need: 5, coins: 100, xp: 50, name: 'Getting Started' },
  snapple_25:        { stat: 'videosCreated', need: 25, coins: 250, xp: 150, name: 'Content Creator' },
  snapple_50:        { stat: 'videosCreated', need: 50, coins: 500, xp: 300, name: 'Prolific' },
  snapple_100:       { stat: 'videosCreated', need: 100, coins: 1000, xp: 500, name: 'Machine' },
  multi_prompt:      { stat: 'uniquePromptsUsed', need: 10, coins: 200, xp: 100, name: 'Versatile' },
  likes_10:          { stat: 'totalLikesReceived', need: 10, coins: 50, xp: 25, name: 'Likeable' },
  likes_50:          { stat: 'totalLikesReceived', need: 50, coins: 150, xp: 75, name: 'Crowd Pleaser' },
  likes_100:         { stat: 'totalLikesReceived', need: 100, coins: 300, xp: 150, name: 'Fan Favorite' },
  likes_500:         { stat: 'totalLikesReceived', need: 500, coins: 750, xp: 400, name: 'Beloved' },
  likes_1000:        { stat: 'totalLikesReceived', need: 1000, coins: 1500, xp: 750, name: 'Icon' },
  single_like_25:    { stat: 'maxLikesOnOne', need: 25, coins: 200, xp: 100, name: 'Banger' },
  rounds_1:          { stat: 'roundsWon', need: 1, coins: 25, xp: 15, name: 'Round Winner' },
  rounds_10:         { stat: 'roundsWon', need: 10, coins: 100, xp: 50, mulligans: 1, name: 'On A Roll' },
  rounds_50:         { stat: 'roundsWon', need: 50, coins: 300, xp: 200, name: 'Round Master' },
  rounds_100:        { stat: 'roundsWon', need: 100, coins: 600, xp: 400, mulligans: 1, name: 'Dominator' },
  swaps_5:           { stat: 'swapsUsed', need: 5, coins: 100, xp: 50, name: 'Second Thoughts' },
  swaps_25:          { stat: 'swapsUsed', need: 25, coins: 300, xp: 150, name: 'Picky' },
  swaps_100:         { stat: 'swapsUsed', need: 100, coins: 800, xp: 400, name: 'Never Satisfied' },
  sweep:             { stat: 'cleanSweeps', need: 1, coins: 500, xp: 250, name: 'Clean Sweep' },
  comeback:          { stat: 'comebacks', need: 1, coins: 250, xp: 150, name: 'Comeback Kid' },
  first_win:         { stat: 'gamesWon', need: 1, coins: 100, xp: 50, name: 'Winner' },
  wins_5:            { stat: 'gamesWon', need: 5, coins: 200, xp: 100, name: 'Competitor' },
  wins_10:           { stat: 'gamesWon', need: 10, coins: 400, xp: 200, name: 'Champion' },
  wins_25:           { stat: 'gamesWon', need: 25, coins: 750, xp: 400, name: 'Veteran' },
  wins_50:           { stat: 'gamesWon', need: 50, coins: 1500, xp: 750, name: 'Legend' },
  wins_100:          { stat: 'gamesWon', need: 100, coins: 3000, xp: 1500, name: 'GOAT' },
  win_streak_3:      { stat: 'winStreak', need: 3, coins: 300, xp: 150, name: 'Hot Streak' },
  win_streak_5:      { stat: 'winStreak', need: 5, coins: 750, xp: 400, name: 'Unstoppable' },
  first_sale:        { stat: 'snapplesSold', need: 1, coins: 50, xp: 25, name: 'Entrepreneur' },
  sales_10:          { stat: 'snapplesSold', need: 10, coins: 200, xp: 100, name: 'Salesman' },
  sales_50:          { stat: 'snapplesSold', need: 50, coins: 500, xp: 300, name: 'Hustler' },
  sales_100:         { stat: 'snapplesSold', need: 100, coins: 1000, xp: 500, name: 'Mogul' },
  revenue_10k:       { stat: 'totalRevenue', need: 10000, coins: 1000, xp: 500, name: 'Big Money' },
  level_5:           { stat: 'level', need: 5, coins: 100, trophies: 2, name: 'Warming Up' },
  level_10:          { stat: 'level', need: 10, coins: 250, trophies: 5, name: 'Double Digits' },
  level_25:          { stat: 'level', need: 25, coins: 500, trophies: 10, name: 'Seasoned' },
  level_50:          { stat: 'level', need: 50, coins: 1000, trophies: 20, name: 'Elite' },
  level_75:          { stat: 'level', need: 75, coins: 2000, trophies: 35, name: 'Master' },
  level_100:         { stat: 'level', need: 100, coins: 5000, trophies: 50, name: 'Max Level' },
  ranked_10:         { stat: 'promptsRanked', need: 10, coins: 50, xp: 25, tickets: 5, name: 'Tastemaker' },
  ranked_50:         { stat: 'promptsRanked', need: 50, coins: 150, xp: 75, tickets: 15, name: 'Critic' },
  ranked_250:        { stat: 'promptsRanked', need: 250, coins: 500, xp: 250, tickets: 50, name: 'Season Shaper' },
  trophies_25:       { stat: 'trophies', need: 25, coins: 200, xp: 100, mulligans: 1, name: 'Bronze' },
  trophies_50:       { stat: 'trophies', need: 50, coins: 400, xp: 200, name: 'Silver' },
  trophies_100:      { stat: 'trophies', need: 100, coins: 750, xp: 400, mulligans: 1, name: 'Gold' },
  trophies_250:      { stat: 'trophies', need: 250, coins: 1500, xp: 750, name: 'Platinum' },
  trophies_500:      { stat: 'trophies', need: 500, coins: 3000, xp: 1500, mulligans: 2, name: 'Diamond' },
  followers_1:       { stat: 'followerCount', need: 1, coins: 50, xp: 25, name: 'Noticed' },
  followers_10:      { stat: 'followerCount', need: 10, coins: 150, xp: 75, name: 'Circle' },
  followers_50:      { stat: 'followerCount', need: 50, coins: 400, xp: 200, name: 'Crowd' },
  followers_100:     { stat: 'followerCount', need: 100, coins: 800, xp: 400, name: 'Draw' },
  followers_500:     { stat: 'followerCount', need: 500, coins: 2500, xp: 1200, trophies: 25, name: 'Household Name' },
  following_5:       { stat: 'followingCount', need: 5, coins: 50, xp: 25, name: 'Curious' },
  following_25:      { stat: 'followingCount', need: 25, coins: 150, xp: 75, name: 'Regular' },
  mutual_10:         { stat: 'mutualCount', need: 10, coins: 300, xp: 150, name: 'Mutuals' },
};

/** XP needed to go from level-1 to `level`. Mirrors src/services/levelService. */
function xpForLevel(level) {
  if (level <= 1) return 0;
  return Math.floor(100 * Math.pow(1.15, level - 2));
}

/** Level from total XP, by spending the total up the ladder. */
function levelFromXP(totalXP) {
  let level = 1;
  let used = 0;
  for (;;) {
    const needed = xpForLevel(level + 1);
    if (used + needed > totalXP) return level;
    used += needed;
    level++;
  }
}

/**
 * deriveStats — everything the catalogue can be checked against.
 *
 * Reads only the user document. No queries, which is the whole point:
 * this runs on login, after every game, after every upload and every
 * time the achievements screen opens, and the first version counted a
 * user's likes by fetching every snapple they had ever made. Fine at
 * six users; at a thousand snapples it was the most expensive call in
 * the app, and it fired four ways.
 *
 * The counts it used to compute are maintained as they happen instead —
 * videosCreated and xpEarnedPrompts by onNewSnapple, the like totals by
 * onSnappleLikesChanged. Social is counted from arrays already on the
 * document, which costs nothing.
 */
function deriveStats(uid, userData) {
  const stats = Object.assign({}, userData.stats || {});
  const social = userData.social || {};
  const followers = social.followers || [];
  const following = social.following || [];
  const followerSet = new Set(followers);

  stats.followerCount = followers.length;
  stats.followingCount = following.length;
  stats.mutualCount = following.filter((id) => followerSet.has(id)).length;
  stats.trophies = (userData.resources && userData.resources.trophies) || 0;
  stats.level = levelFromXP(
    (userData.profile && (userData.profile.xp || userData.profile.experience)) || 0);

  // xpEarnedPrompts is the list of prompts this user has been paid XP
  // for, one entry per prompt, appended by onNewSnapple. That is the
  // same thing as "distinct prompts answered", so the unique-prompt
  // milestone needs no separate counter and no query.
  stats.uniquePromptsUsed = (userData.xpEarnedPrompts || []).length;

  // videosCreated, totalLikesReceived and maxLikesOnOne are maintained
  // by triggers. Defaulted here so an account that predates them reads
  // as zero rather than undefined — run scripts/backfillUserStats.js to
  // give existing users their real numbers.
  stats.videosCreated = stats.videosCreated || 0;
  stats.totalLikesReceived = stats.totalLikesReceived || 0;
  stats.maxLikesOnOne = stats.maxLikesOnOne || 0;

  return stats;
}

/**
 * checkAchievements — award everything newly earned, once each.
 *
 * Takes no arguments: the caller says "look at me", and what is found
 * is found. Already-held achievements are skipped by id, and the whole
 * payout goes on in one transaction so two screens calling at the same
 * moment cannot both award the same milestone.
 */
exports.checkAchievements = functions.https.onCall(async (data, context) => {
  const uid = context.auth && context.auth.uid;
  if (!uid) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in first.');
  }

  const userRef = db.collection('users').doc(uid);
  const userSnap = await userRef.get();
  if (!userSnap.exists) {
    throw new functions.https.HttpsError('not-found', 'No account found.');
  }
  const stats = deriveStats(uid, userSnap.data());

  return db.runTransaction(async (tx) => {
    // Re-read inside the transaction: the achievement list is what we
    // are about to append to, and appending to a stale copy is how you
    // pay the same milestone twice.
    const fresh = await tx.get(userRef);
    const existing = (fresh.data().achievements) || [];
    const held = new Set(existing.map((a) => a.id));

    const earned = [];
    const totals = { coins: 0, xp: 0, trophies: 0, mulligans: 0, tickets: 0 };
    const earnedAt = new Date().toISOString();

    for (const id of Object.keys(ACHIEVEMENTS)) {
      if (held.has(id)) continue;
      const a = ACHIEVEMENTS[id];
      if ((stats[a.stat] || 0) < a.need) continue;
      earned.push({ id, name: a.name, earnedAt });
      for (const k of Object.keys(totals)) totals[k] += a[k] || 0;
    }

    if (earned.length === 0) return { success: true, earned: [] };

    const updates = {
      achievements: existing.concat(earned),
      updatedAt: FV.serverTimestamp(),
    };
    // increment() rather than read-then-write: a purchase or a round
    // reward landing between the read and the write would otherwise be
    // overwritten, and a payout that eats currency someone just paid
    // for is the worst version of that bug.
    if (totals.coins) updates['resources.coins'] = FV.increment(totals.coins);
    if (totals.xp) {
      updates['profile.xp'] = FV.increment(totals.xp);
      updates['profile.experience'] = FV.increment(totals.xp);
    }
    if (totals.trophies) updates['resources.trophies'] = FV.increment(totals.trophies);
    if (totals.mulligans) updates['inventory.mulligans'] = FV.increment(totals.mulligans);
    if (totals.tickets) updates['resources.tokens'] = FV.increment(totals.tickets);

    tx.update(userRef, updates);

    // The full catalogue entry goes back so the client can show the
    // icon and description it already has locally.
    return {
      success: true,
      earned: earned.map((e) => Object.assign({}, ACHIEVEMENTS[e.id], e)),
      totals,
    };
  });
});
