/**
 * gamePrompts.js — player-made game prompts, seasons, and the ticket
 * faucet that pays for them.
 *
 * Game prompts are what a round asks the room. Until now only admins
 * could add one. Players can now submit them, rank them, and the best
 * become next season's deck - so the community authors each season.
 *
 * The economy has to be opened in the right order. Creating a snapple
 * prompt costs 1 ticket and was the only sink; the only faucet was 1
 * ticket when someone keeps a snapple you made. The median player held
 * 10, so a priced game prompt on that economy would not be valuable, it
 * would be unreachable - so this file opens a faucet (tickets for
 * posting snapples) alongside the new sink.
 *
 * Creation and rollover run here rather than on the client because
 * they move currency and decide what a whole room reads aloud. Neither
 * is safe to trust a phone with.
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');
const { wilsonLowerBound } = require('./promptScore');

const db = admin.firestore();

// Mirrors src/lib/admin.js. Duplicated because the client bundle can be
// edited and this cannot.
const ADMIN_UIDS = ['SrB8T1TmftQzu90H7phQkRJXkRn2'];

// ── Economy ──
// Free during the beta (season 0). The beta exists to build Season 1's
// deck, so the more suggestions it gets to rank the better that deck is,
// and a fee is only friction. DAILY_PROMPT_SUBMISSIONS is the brake on
// spam instead of the price.
const BETA_GAME_PROMPT_COST = 0;
// The launch price. Deliberately low to start: it is easy to raise a
// price once there is a real economy to read, and hard to cut one
// without angering everyone who already paid the old rate. Tune it with
// TICKETS_PER_SNAPPLE - moving one without the other floods or empties
// the pool.
const GAME_PROMPT_COST = 25;
const DAILY_PROMPT_SUBMISSIONS = 5;
const TICKETS_PER_SNAPPLE = 5;
// Ranking pays too, because a ranked prompt is the whole point of the
// season. But a swipe costs nothing to make, so it pays little and stops
// paying fast - uncapped, the most profitable thing in the app would be
// swiping without reading.
const TICKETS_PER_RANKING = 1;
const DAILY_RANKING_REWARDS = 10;
// Only the first few snapples a day pay. Without a cap the faucet pays
// per upload, and the cheapest way to buy a game prompt becomes
// recording twenty throwaway clips.
const DAILY_TICKET_SNAPPLES = 3;

// ── Submission limits ──
const MIN_LEN = 6;
const MAX_LEN = 80;

// ── Season rollover ──
// Never confuse "bad" with "unknown": a prompt below MIN_VOTES has not
// been judged, so rollover leaves it where it is rather than retiring a
// live prompt nobody rated or rejecting a candidate nobody saw.
const MIN_VOTES = 3;
// Wilson lower bound needed to STAY live. Low on purpose - a live
// prompt is retired only when the room has actively voted it down.
const KEEP_THRESHOLD = 0.2;
// ...and to be PROMOTED into the deck. Higher, because it has to earn a
// slot rather than keep one. 3 likes and no dislikes clears it (~0.44);
// 2 likes and 1 dislike does not (~0.21).
const PROMOTE_THRESHOLD = 0.3;

const SEASON_DOC = 'config/season';

/** Same normalisation the rest of the app de-dups prompt text with. */
function normalizePromptText(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function todayKey() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The current season. 0 is the beta pre-season, before public launch.
 *
 * Checked by type, not `|| 1`: season 0 is falsy, so the obvious default
 * silently read the beta as Season 1 - which would have sent every beta
 * submission straight to Season 2 and made the launch rollover skip the
 * season the beta was meant to build.
 */
async function currentSeason() {
  const snap = await db.doc(SEASON_DOC).get();
  const current = snap.exists ? snap.data().current : undefined;
  return typeof current === 'number' ? current : 0;
}

/**
 * Pay a creator for posting a snapple, up to the daily cap.
 *
 * Transactional because the count and the balance have to move
 * together: two uploads landing at once would otherwise both read "2
 * paid today" and both pay the third.
 */
async function grantSnappleTickets(uid) {
  if (!uid) return false;
  const ref = db.collection('users').doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const stats = snap.data().stats || {};
    const today = todayKey();
    const paidToday = stats.snappleTicketDay === today ? (stats.snappleTicketCount || 0) : 0;
    if (paidToday >= DAILY_TICKET_SNAPPLES) return false;

    tx.update(ref, {
      'resources.tokens': admin.firestore.FieldValue.increment(TICKETS_PER_SNAPPLE),
      'stats.snappleTicketDay': today,
      'stats.snappleTicketCount': paidToday + 1,
    });
    return true;
  });
}

/**
 * Count a new ranking and pay for it, up to the daily cap.
 *
 * The count is unconditional - it is what the ranking achievements read -
 * while the ticket stops after DAILY_RANKING_REWARDS a day. Transactional
 * for the same reason as the snapple grant: parallel swipes would
 * otherwise all read the same "paid today" and all get paid.
 */
async function recordRanking(uid) {
  if (!uid) return false;
  const ref = db.collection('users').doc(uid);
  return db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists) return false;
    const stats = snap.data().stats || {};
    const today = todayKey();
    const paidToday = stats.rankRewardDay === today ? (stats.rankRewardCount || 0) : 0;

    const update = { 'stats.promptsRanked': admin.firestore.FieldValue.increment(1) };
    if (paidToday < DAILY_RANKING_REWARDS) {
      update['resources.tokens'] = admin.firestore.FieldValue.increment(TICKETS_PER_RANKING);
      update['stats.rankRewardDay'] = today;
      update['stats.rankRewardCount'] = paidToday + 1;
    }
    tx.update(ref, update);
    return true;
  });
}

exports.recordRanking = recordRanking;

/** What a submission costs in a given season. */
function costForSeason(season) {
  return season === 0 ? BETA_GAME_PROMPT_COST : GAME_PROMPT_COST;
}

exports.grantSnappleTickets = grantSnappleTickets;
exports.costForSeason = costForSeason;

/**
 * Submit a game prompt. Charges the fee and creates a CANDIDATE.
 *
 * A candidate never reaches a live game directly: it only enters the
 * deck by winning the vote at season rollover. That is the moderation
 * buffer - nothing a player writes is read aloud to a room until other
 * players have seen it and chosen it.
 *
 * The fee (free during the beta) buys a place in the vote, not a
 * guaranteed slot, and is not refunded if the prompt is voted down or
 * reported out.
 */
exports.createGamePrompt = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Sign in to create a prompt.');
  }
  const uid = context.auth.uid;
  const text = String((data && data.text) || '').replace(/\s+/g, ' ').trim();

  if (text.length < MIN_LEN) {
    throw new functions.https.HttpsError('invalid-argument', `Prompts need at least ${MIN_LEN} characters.`);
  }
  if (text.length > MAX_LEN) {
    throw new functions.https.HttpsError('invalid-argument', `Keep it under ${MAX_LEN} characters.`);
  }

  const textKey = normalizePromptText(text);
  if (!textKey) {
    throw new functions.https.HttpsError('invalid-argument', 'That prompt has no words in it.');
  }

  const banned = await db.collection('bannedPromptTexts').doc(textKey).get();
  if (banned.exists) {
    throw new functions.https.HttpsError('failed-precondition', 'That prompt isn\'t allowed.');
  }

  const season = await currentSeason();
  const userRef = db.collection('users').doc(uid);
  const promptRef = db.collection('gamePrompts').doc();

  const result = await db.runTransaction(async (tx) => {
    // Duplicate check inside the transaction, so two people submitting
    // the same text at once can't both pay for one prompt.
    const dupes = await tx.get(
      db.collection('gamePrompts').where('textKey', '==', textKey).limit(1));
    if (!dupes.empty) {
      const status = dupes.docs[0].data().status || 'live';
      if (status !== 'retired') return { error: 'already-exists' };
    }

    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) return { error: 'no-user' };
    const user = userSnap.data();

    // Daily cap in the same transaction as the charge, so two taps at
    // once can't both slip under it.
    const stats = user.stats || {};
    const today = todayKey();
    const submittedToday = stats.promptSubmitDay === today ? (stats.promptSubmitCount || 0) : 0;
    if (submittedToday >= DAILY_PROMPT_SUBMISSIONS) return { error: 'daily-limit' };

    const cost = costForSeason(season);
    const balance = (user.resources && user.resources.tokens) || 0;
    if (balance < cost) return { error: 'insufficient', balance, cost };

    const userUpdate = {
      'stats.promptSubmitDay': today,
      'stats.promptSubmitCount': submittedToday + 1,
    };
    if (cost > 0) {
      userUpdate['resources.tokens'] = admin.firestore.FieldValue.increment(-cost);
    }
    tx.update(userRef, userUpdate);
    tx.set(promptRef, {
      text,
      textKey,
      category: 'player',
      status: 'candidate',
      // The season it is competing to ENTER, not the one it was made in.
      season: season + 1,
      createdBy: uid,
      creatorUsername: user.username || (user.profile && user.profile.username) || null,
      likeCount: 0,
      dislikeCount: 0,
      reportCount: 0,
      usageCount: 0,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    return { id: promptRef.id, cost };
  });

  if (result.error === 'already-exists') {
    throw new functions.https.HttpsError('already-exists', 'Someone already submitted that one.');
  }
  if (result.error === 'insufficient') {
    throw new functions.https.HttpsError('failed-precondition',
      `You need ${result.cost} tickets. You have ${result.balance}.`);
  }
  if (result.error === 'daily-limit') {
    throw new functions.https.HttpsError('resource-exhausted',
      `That's ${DAILY_PROMPT_SUBMISSIONS} prompts today. Come back tomorrow.`);
  }
  if (result.error) {
    throw new functions.https.HttpsError('not-found', 'Account not found.');
  }
  return { id: result.id, cost: result.cost, season: season + 1 };
});

/**
 * Decide one prompt's fate at rollover.
 *
 * Returns 'live', 'candidate' (carry forward, not judged yet) or
 * 'retired'. Banned prompts are left alone by the caller.
 */
function rolloverOutcome(prompt) {
  const likes = prompt.likeCount || 0;
  const dislikes = prompt.dislikeCount || 0;
  const judged = likes + dislikes >= MIN_VOTES;
  const score = wilsonLowerBound(likes, dislikes);
  const status = prompt.status || 'live';

  if (status === 'live') {
    return judged && score < KEEP_THRESHOLD ? 'retired' : 'live';
  }
  if (status === 'candidate') {
    if (!judged) return 'candidate';
    if (score >= PROMOTE_THRESHOLD) return 'live';
    // Liked more than disliked, just not decisively. That is thin
    // evidence on the POSITIVE side, not a verdict - retiring a 2-to-1
    // prompt someone may have paid for would treat "not proven yet" as
    // "rejected". It gets another season with fresh votes.
    if (likes > dislikes) return 'candidate';
    return 'retired';
  }
  return status;
}

exports.rolloverOutcome = rolloverOutcome;

/**
 * End the current season and build the next deck. Admin only.
 *
 * Votes are CLEARED on everything that carries forward. Otherwise a
 * prompt's standing is decided forever by the first season's handful of
 * voters, and next season's room never gets a say.
 *
 * Pass { dryRun: true } to see the outcome without writing anything.
 */
exports.rolloverSeason = functions.https.onCall(async (data, context) => {
  if (!context.auth || !ADMIN_UIDS.includes(context.auth.uid)) {
    throw new functions.https.HttpsError('permission-denied', 'Admins only.');
  }

  const season = await currentSeason();
  const next = season + 1;
  const dryRun = !!(data && data.dryRun);

  const snap = await db.collection('gamePrompts').get();
  const tally = { live: 0, promoted: 0, retired: 0, carried: 0, banned: 0 };
  const writes = [];

  snap.forEach((doc) => {
    const p = doc.data();
    if (p.status === 'banned') { tally.banned++; return; }
    if (p.status === 'retired') return;

    const outcome = rolloverOutcome(p);
    const was = p.status || 'live';
    if (outcome === 'live' && was === 'candidate') tally.promoted++;
    else if (outcome === 'live') tally.live++;
    else if (outcome === 'retired') tally.retired++;
    else if (outcome === 'candidate') tally.carried++;

    // Counts are NOT zeroed here. They are the sum of the vote documents,
    // and deleting those below fires onPromptVoteWritten once per vote,
    // which decrements them back to zero. Zeroing them here as well sent
    // every carried-forward prompt negative.
    const update = { status: outcome };
    if (outcome === 'live') update.season = next;
    if (outcome === 'candidate') update.season = next + 1;
    writes.push({ ref: doc.ref, update });
  });

  if (dryRun) return { dryRun: true, from: season, to: next, ...tally };

  for (let i = 0; i < writes.length; i += 400) {
    const batch = db.batch();
    writes.slice(i, i + 400).forEach(w => batch.update(w.ref, w.update));
    await batch.commit();
  }
  await db.doc(SEASON_DOC).set({
    current: next,
    startedAt: admin.firestore.FieldValue.serverTimestamp(),
  }, { merge: true });

  // Old votes point at prompts whose counts were just zeroed. Leaving
  // them would stop those players voting again, since a vote document
  // already exists for them.
  const votes = await db.collection('promptVotes').where('target', '==', 'gamePrompts').get();
  for (let i = 0; i < votes.docs.length; i += 400) {
    const batch = db.batch();
    votes.docs.slice(i, i + 400).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }

  console.log(`[Season] ${season} -> ${next}`, tally);
  return { from: season, to: next, ...tally };
});
