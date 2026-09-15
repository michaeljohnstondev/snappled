// grantBetaTickets.js
// Give every existing user 500 tickets, once.
//
// Seeds the ticket economy as game prompts and ranking rewards arrive, so
// beta players start with enough to take part rather than earning up
// from a median balance of 10.
//
// Idempotent. Each user is stamped `grants.beta500` in the same write as
// the tickets, and anyone already stamped is skipped - so a retry, a
// timeout halfway through, or running it twice by mistake can never pay
// anyone a second time. `increment` rather than a set, so a balance that
// changed while this runs isn't overwritten.
//
// Run from repo root:
//   node scripts/grantBetaTickets.js          # report only
//   node scripts/grantBetaTickets.js --write  # actually grant
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
const AMOUNT = 500;

async function main() {
  const snap = await db.collection('users').get();
  const eligible = snap.docs.filter(d => !(d.data().grants && d.data().grants.beta500));
  console.log(`users: ${snap.size}, already granted: ${snap.size - eligible.length}, to grant: ${eligible.length}`);

  if (!WRITE) {
    console.log(`DRY RUN - would add ${AMOUNT} tickets to ${eligible.length} users (pass --write)`);
    return;
  }

  let batch = db.batch();
  let pending = 0;
  for (const doc of eligible) {
    batch.update(doc.ref, {
      'resources.tokens': admin.firestore.FieldValue.increment(AMOUNT),
      'grants.beta500': true,
      'grants.beta500At': admin.firestore.FieldValue.serverTimestamp(),
    });
    if (++pending >= 400) { await batch.commit(); batch = db.batch(); pending = 0; }
  }
  if (pending) await batch.commit();
  console.log(`GRANTED ${AMOUNT} tickets to ${eligible.length} users`);
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
