// backfillPoolEligible.js
// Stamp `poolEligible` onto every snapple.
//
// getActiveSnapples now filters on this flag server-side instead of
// fetching 2,000 documents and sorting them in JavaScript. Until the
// flag exists the query matches nothing and the client falls back to the
// old scan, so nothing breaks - it just stays expensive. This is what
// switches it over.
//
// The onSnappleEligibilityChanged trigger keeps it current afterwards,
// but it only fires on a write, and these documents aren't being
// written. One-time catch-up.
//
// Run from repo root:
//   node scripts/backfillPoolEligible.js          # report only
//   node scripts/backfillPoolEligible.js --write  # actually write
//
// Uses Firebase Admin via gcloud Application Default Credentials.

const fs = require('fs');
const admin = require('../functions/node_modules/firebase-admin');
const { isPoolEligible } = require('../functions/snappleEligibility');

try {
  const credPath = process.env.APPDATA + '\\gcloud\\application_default_credentials.json';
  if (fs.existsSync(credPath)) process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
} catch (e) { /* non-fatal - admin falls through to other ADC paths */ }

admin.initializeApp({ projectId: 'snapplepark' });
const db = admin.firestore();

const WRITE = process.argv.includes('--write');

async function main() {
  const snap = await db.collection('snapples').get();
  console.log(`snapples: ${snap.size}\n`);

  let eligible = 0;
  let blocked = 0;
  let alreadyRight = 0;

  // Batches cap at 500 writes; chunk rather than assume the collection
  // stays small.
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
    const want = isPoolEligible(data);
    if (want) eligible++; else blocked++;

    if (data.poolEligible === want) { alreadyRight++; continue; }
    if (WRITE) {
      batch.update(doc.ref, { poolEligible: want });
      if (++pending >= 400) await flush();
    }
  }
  await flush();

  console.log(`pool-eligible: ${eligible}`);
  console.log(`excluded:      ${blocked}`);
  console.log(`already right: ${alreadyRight}`);
  console.log(WRITE
    ? `WROTE ${snap.size - alreadyRight} docs`
    : `DRY RUN - ${snap.size - alreadyRight} would change (pass --write)`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
