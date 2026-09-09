/**
 * promptScore.js — how good is a prompt, and how sure are we.
 *
 * The pool is AI-written and mostly weak, and the fix has to work at six
 * users and at a hundred thousand without being redesigned in between.
 * Two things were wrong with the old arrangement:
 *
 * Selection ignored quality entirely — fillFromPool ordered by timesUsed
 * ascending, so votes could never influence what anyone saw.
 *
 * And the recycle decision used a RAW RATIO, which treats five votes and
 * eight thousand as equally trustworthy: 3 likes / 2 dislikes (60%)
 * survived while 4000 / 4100 (49%) died. It also read `totalVotes === 0`
 * as approval, so an unrated prompt was recycled forever — which is why
 * a pool of 348 mostly-terrible prompts has never shrunk.
 *
 * The whole file turns on one idea: NEVER CONFUSE "BAD" WITH "UNKNOWN".
 * Both signals get that treatment, because both can be thin.
 */

const functions = require('firebase-functions/v1');
const admin = require('firebase-admin');

// 95% confidence. Higher is more conservative about thin evidence.
const Z = 1.96;

// How much of the score is "do people like it" versus "do people
// actually answer it". Weighted toward answers on purpose: a vote is a
// tap, an answer is someone recording a video. Votes are plentiful and
// shallow, answers are scarce and honest, and an AI prompt that reads
// well but cannot be shot fails exactly this way.
const VOTE_WEIGHT = 0.4;
const ANSWER_WEIGHT = 0.6;

// How far a prompt must beat the pool average to max out the engagement
// term. RELATIVE, not absolute — see poolBaseline. An earlier version
// hardcoded "3 answers per rotation", which is a hundred-thousand-user
// number; the live pool averages 0.017, so it scored all 348 prompts
// near zero and would have condemned 319 of them.
const OUTPERFORM = 1.5;

// Expected answers a prompt must have had the chance to collect before
// silence means anything. This is the engagement half of the same
// caution Wilson gives the votes: 321 of the 348 live prompts have run
// exactly ONCE, and "used once, nobody answered" in a six-person
// community is not evidence of a bad prompt. Scale-free by
// construction — at a hundred thousand users one rotation clears it, at
// six it takes many, and nothing needs re-tuning in between.
const MIN_EXPECTED_ANSWERS = 3;

// Used until the stats doc exists. Deliberately optimistic: it makes
// prompts judgeable sooner, and being wrong here only costs a rotation.
const FALLBACK_BASELINE = 0.5;

// Running totals for the pool-wide answers-per-rotation average. A
// single doc of two counters rather than an aggregate over the pool,
// because reading every prompt to score one prompt is exactly the shape
// that stops working at the size this is being built for.
const BASELINE_DOC = 'stats/promptEngagement';

/**
 * Wilson lower bound of the like ratio.
 *
 * Answers "given this many votes, what is the worst the true approval
 * rate plausibly is". Thin evidence scores low without being called BAD;
 * heavy evidence converges on the real ratio. This is what makes one
 * score work at both community sizes — and it fixes the
 * unrated-means-approved bug for free, since zero votes returns 0.
 */
function wilsonLowerBound(likes, dislikes) {
  const n = (likes || 0) + (dislikes || 0);
  if (n === 0) return 0;
  const p = (likes || 0) / n;
  const z2 = Z * Z;
  const numerator = p + z2 / (2 * n)
    - Z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n);
  return Math.max(0, numerator / (1 + z2 / n));
}

/**
 * The pool's current answers-per-rotation average.
 *
 * This is what makes the engagement term scale-free: a prompt is judged
 * against what prompts ACTUALLY achieve in this community right now,
 * not against a constant that was true at some other size.
 */
async function poolBaseline(db) {
  try {
    const snap = await db.doc(BASELINE_DOC).get();
    const d = snap.exists ? snap.data() : null;
    const rotations = (d && d.totalRotations) || 0;
    const answers = (d && d.totalAnswers) || 0;
    if (rotations <= 0) return FALLBACK_BASELINE;
    return answers / rotations;
  } catch (e) {
    // A baseline read must never be the thing that stops a rotation.
    console.error('[promptScore] baseline read failed', e);
    return FALLBACK_BASELINE;
  }
}

/**
 * Add to the running totals behind poolBaseline.
 *
 * increment() rather than read-then-write: rotations and answers land
 * concurrently, and a computed total would silently discard whichever
 * write lost the race.
 */
function bumpBaseline(db, opts) {
  const inc = admin.firestore.FieldValue.increment;
  const update = {};
  if (opts && opts.rotations) update.totalRotations = inc(opts.rotations);
  if (opts && opts.answers) update.totalAnswers = inc(opts.answers);
  if (!Object.keys(update).length) return Promise.resolve();
  return db.doc(BASELINE_DOC).set(update, { merge: true });
}

/**
 * A prompt's score, 0..1.
 *
 * `null` means UNTESTED rather than bad. A prompt with no votes that has
 * not yet had a real chance to be answered has produced no evidence
 * either way, and scoring it zero would be indistinguishable from one
 * the community actively rejected. Selection and recycling both need to
 * tell those apart, or the pool never drains and good prompts get thrown
 * out for being new.
 *
 * The two halves are weighted by which evidence actually exists, so a
 * prompt with strong votes and no engagement data is judged on its votes
 * rather than capped at 0.4 for missing the other half.
 */
function scoreFor(prompt, baseline = FALLBACK_BASELINE) {
  const timesUsed = prompt.timesUsed || 0;
  // Two document shapes reach this. A promptPool doc keeps CUMULATIVE
  // votes under `likeCountLifetime` (accrueLifetimeStats rolls each
  // expired instance into it); an activePrompts doc keeps the current
  // run's under plain `likeCount`. Reading only the plain names scored
  // every pool prompt at zero votes forever - verified against live
  // data, where `likeCount` is not merely zero but ABSENT from all 348.
  const likes = prompt.likeCountLifetime ?? prompt.likeCount ?? 0;
  const dislikes = prompt.dislikeCountLifetime ?? prompt.dislikeCount ?? 0;
  const answers = prompt.responseCount || 0;

  const hasVotes = likes + dislikes > 0;
  // Chances to be answered, not rotations: one rotation in a busy
  // community carries more evidence than twenty in an empty one.
  const hasEngagement = timesUsed * baseline >= MIN_EXPECTED_ANSWERS;
  if (!hasVotes && !hasEngagement) return null;

  const quality = wilsonLowerBound(likes, dislikes);
  const perRotation = timesUsed > 0 ? answers / timesUsed : 0;
  const engagement = baseline > 0
    ? Math.min(1, perRotation / (baseline * OUTPERFORM))
    : 0;

  const wv = hasVotes ? VOTE_WEIGHT : 0;
  const we = hasEngagement ? ANSWER_WEIGHT : 0;
  return (wv * quality + we * engagement) / (wv + we);
}

/**
 * Should this prompt come back after its run?
 *
 * Untested prompts are recycled — they have not had their chance yet.
 * Tested ones have to clear the bar, which is what actually drains the
 * pool of the bad ones over time.
 */
function shouldRecycle(prompt, baseline = FALLBACK_BASELINE, threshold = 0.15) {
  const score = scoreFor(prompt, baseline);
  if (score === null) return true;
  return score >= threshold;
}

exports.wilsonLowerBound = wilsonLowerBound;
exports.scoreFor = scoreFor;
exports.shouldRecycle = shouldRecycle;
exports.poolBaseline = poolBaseline;
exports.bumpBaseline = bumpBaseline;
exports.BASELINE_DOC = BASELINE_DOC;

/**
 * Keep the stored score current.
 *
 * Stored rather than computed at read time because selection has to
 * ORDER BY it, and Firestore cannot sort on something it does not hold.
 * Sorting in memory would mean reading the whole pool on every fill —
 * survivable at 348 prompts, not at the size this is being built for.
 *
 * Writes only when the inputs actually moved, or the function's own
 * write would retrigger it forever.
 */
exports.onPromptScoreInputChanged = functions.firestore
  .document('promptPool/{promptId}')
  .onWrite(async (change) => {
    if (!change.after.exists) return null;
    const after = change.after.data();
    const before = change.before.exists ? change.before.data() : {};

    const moved = ['likeCount', 'dislikeCount', 'responseCount', 'timesUsed']
      .some(k => (before[k] || 0) !== (after[k] || 0));
    if (!moved && after.score !== undefined) return null;

    const baseline = await poolBaseline(admin.firestore());
    const score = scoreFor(after, baseline);
    // Untested prompts store -1 rather than null: Firestore sorts nulls
    // FIRST ascending, so a descending sort would rank unproven prompts
    // above proven ones — the opposite of what selection wants.
    const stored = score === null ? -1 : score;
    if (after.score === stored) return null;

    return change.after.ref.update({ score: stored });
  });
