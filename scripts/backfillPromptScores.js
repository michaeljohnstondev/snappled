// backfillPromptScores.js
// Seed the engagement baseline and give every promptPool doc a `score`.
//
// Two things need a one-time catch-up before scoring means anything:
//
// 1. `stats/promptEngagement` holds the running answers-per-rotation
//    totals that scoring calibrates against. From here on they are kept
//    up to date by increment() as prompts rotate and get answered, but
//    the history already on the pool has to be added once or the
//    baseline starts at zero and every prompt looks untested forever.
//
// 2. Selection now orders by `score`, and a Firestore where()/orderBy()
//    clause silently EXCLUDES documents that lack the field — so until
//    this runs, prompts written before scoring existed are invisible to
//    both lanes and the fill falls back to plain least-used. Nothing
//    breaks; nothing improves either. The onPromptScoreInputChanged
//    trigger keeps scores current afterwards, but it only fires on a
//    WRITE, and these documents aren't being written.
//
// Run from repo root:
//   node scripts/backfillPromptScores.js          # report only
//   node scripts/backfillPromptScores.js --write  # actually write
//
// Uses Firebase Admin via gcloud Application Default Credentials.

const fs = require('fs');
const admin = require('../functions/node_modules/firebase-admin');
const { scoreFor, BASELINE_DOC } = require('../functions/promptScore');

try {
  const credPath = process.env.APPDATA + '\\gcloud\\application_default_credentials.json';
  if (fs.existsSync(credPath)) process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
} catch (e) { /* non-fatal — admin falls through to other ADC paths */ }

admin.initializeApp({ projectId: 'snapplepark' });
const db = admin.firestore();

const WRITE = process.argv.includes('--write');

async function main() {
  const snap = await db.collection('promptPool').get();
  console.log(`promptPool: ${snap.size} docs\n`);

  // Pass one: the baseline, which pass two needs in order to score.
  let totalRotations = 0, totalAnswers = 0;
  snap.forEach(d => {
    const p = d.data();
    totalRotations += p.timesUsed || 0;
    totalAnswers += p.responseCount || 0;
  });
  const baseline = totalRotations > 0 ? totalAnswers / totalRotations : 0;
  console.log(`baseline: ${totalAnswers} answers / ${totalRotations} rotations`
    + ` = ${baseline.toFixed(4)} per rotation`);
  if (WRITE) {
    await db.doc(BASELINE_DOC).set(
      { totalRotations, totalAnswers, backfilledAt: new Date().toISOString() },
      { merge: true },
    );
    console.log(`seeded ${BASELINE_DOC}`);
  }
  console.log('');

  // Pass two: scores.
  let untested = 0, scored = 0, alreadyRight = 0, wouldDrop = 0;
  const buckets = { '0.00-0.15': 0, '0.15-0.40': 0, '0.40-0.70': 0, '0.70-1.00': 0 };

  // Batches cap at 500 writes, and this collection is already close
  // enough to that to be worth chunking rather than assuming.
  let batch = db.batch();
  let pending = 0;
  const flush = async () => {
    if (!WRITE || pending === 0) return;
    await batch.commit();
    batch = db.batch();
    pending = 0;
  };

  for (const doc of snap.docs) {
    const data = doc.data();
    const score = scoreFor(data, baseline);
    // -1 is the stored stand-in for untested: Firestore sorts null FIRST
    // ascending, which would rank unproven prompts above proven ones in
    // a descending sort — the opposite of what selection wants.
    const stored = score === null ? -1 : score;

    if (score === null) untested++;
    else {
      scored++;
      if (score < 0.15) { wouldDrop++; buckets['0.00-0.15']++; }
      else if (score < 0.40) buckets['0.15-0.40']++;
      else if (score < 0.70) buckets['0.40-0.70']++;
      else buckets['0.70-1.00']++;
    }

    if (data.score === stored) { alreadyRight++; continue; }
    if (WRITE) {
      batch.update(doc.ref, { score: stored });
      if (++pending >= 400) await flush();
    }
  }
  await flush();

  console.log(`untested (stored -1): ${untested}`);
  console.log(`scored:               ${scored}`);
  for (const [k, v] of Object.entries(buckets)) if (v) console.log(`  ${k}: ${v}`);
  console.log(`\nwould be DISCARDED at expiry (score < 0.15): ${wouldDrop}`);
  console.log(`already correct:      ${alreadyRight}`);
  console.log(WRITE
    ? `WROTE ${snap.size - alreadyRight} docs`
    : `DRY RUN — ${snap.size - alreadyRight} would change (pass --write)`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
