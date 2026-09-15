// backfillGameSeason.js
// Put the existing game prompts into the beta pre-season (season 0).
//
// Beta rankings decide what Season 1 is. At public launch an admin runs
// End Season, and 0 -> 1 turns the beta votes into an official deck:
// prompts voted down retire, winning candidates join, and public players
// start Season 1 on a deck the beta already cleaned up.
//
// Every game prompt so far was added by an admin and predates statuses,
// so they have no `status`, `season` or vote counts. Queries on those
// fields silently skip documents that lack them - the Game Prompts tab
// would list nothing - so this stamps them as the beta's live deck.
//
// Run from repo root:
//   node scripts/backfillGameSeason.js          # report only
//   node scripts/backfillGameSeason.js --write  # actually write
//
// Uses Firebase Admin via gcloud Application Default Credentials.

const fs = require('fs');
const admin = require('../functions/node_modules/firebase-admin');

try {
  const credPath = process.env.APPDATA + '\\gcloud\\application_default_credentials.json';
  if (fs.existsSync(credPath)) process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
} catch (e) { /* non-fatal - admin falls through to other ADC paths */ }

admin.initializeApp({ projectId: 'snapplepark' });
const db = admin.firestore();

const WRITE = process.argv.includes('--write');

async function main() {
  const season = await db.doc('config/season').get();
  console.log('config/season:', season.exists ? JSON.stringify(season.data()) : 'MISSING');
  if (!season.exists && WRITE) {
    await db.doc('config/season').set({
      current: 0,
      startedAt: admin.firestore.FieldValue.serverTimestamp(),
    });
    console.log('  created at season 0 (beta)');
  }

  const snap = await db.collection('gamePrompts').get();
  let changes = 0;
  let batch = db.batch();
  let pending = 0;

  for (const doc of snap.docs) {
    const p = doc.data();
    const update = {};
    // Only fill what is missing. A prompt that already has a status was
    // placed deliberately and must not be dragged back into the beta.
    if (p.status === undefined) update.status = 'live';
    if (p.season === undefined) update.season = 0;
    if (p.likeCount === undefined) update.likeCount = 0;
    if (p.dislikeCount === undefined) update.dislikeCount = 0;
    if (p.reportCount === undefined) update.reportCount = 0;
    if (!Object.keys(update).length) continue;

    changes++;
    if (WRITE) {
      batch.update(doc.ref, update);
      if (++pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
    }
  }
  if (WRITE && pending) await batch.commit();

  console.log(`gamePrompts: ${snap.size}, needing fields: ${changes}`);
  console.log(WRITE ? `WROTE ${changes}` : 'DRY RUN - pass --write');
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
