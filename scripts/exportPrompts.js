// exportPrompts.js
// Dump current gamePrompts + promptPool from Firestore into
// scripts/prompts/*.json. Run periodically so the local JSON files
// reflect what's already live — this lets you (or me) add new
// prompts without duplicating ones that already exist.
//
// Run from repo root:
//   node scripts/exportPrompts.js
//
// Uses Firebase Admin via gcloud Application Default Credentials.
// Run `gcloud auth application-default login` once if you hit auth
// errors.

const fs = require('fs');
const path = require('path');

// Reach into functions/node_modules so we don't have to install
// firebase-admin at the repo root (same trick as seedGamePrompts.js).
const admin = require('../functions/node_modules/firebase-admin');

try {
  const credPath = process.env.APPDATA + '\\gcloud\\application_default_credentials.json';
  if (fs.existsSync(credPath)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
  }
} catch (e) { /* non-fatal — admin will fall through to other ADC paths */ }

admin.initializeApp({ projectId: 'snapplepark' });
const db = admin.firestore();

const OUT_DIR = path.join(__dirname, 'prompts');
fs.mkdirSync(OUT_DIR, { recursive: true });

// Pull every doc from a collection. Small collections, no pagination
// needed (a few thousand at most).
async function dumpCollection(name) {
  const snap = await db.collection(name).get();
  const docs = [];
  snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
  return docs;
}

(async () => {
  console.log('Exporting prompts from Firestore...');

  const [gameDocs, poolDocs] = await Promise.all([
    dumpCollection('gamePrompts'),
    dumpCollection('promptPool'),
  ]);

  // gamePrompts: drop to text + category for cleanliness. Sort
  // alphabetically so diffs are stable.
  const gameOut = gameDocs
    .filter(d => d.text)
    .map(d => ({ text: d.text, category: d.category || 'general' }))
    .sort((a, b) => a.text.localeCompare(b.text));

  // promptPool same shape.
  const poolOut = poolDocs
    .filter(d => d.text)
    .map(d => ({ text: d.text, category: d.category || 'general' }))
    .sort((a, b) => a.text.localeCompare(b.text));

  fs.writeFileSync(
    path.join(OUT_DIR, 'game.json'),
    JSON.stringify(gameOut, null, 2) + '\n',
  );
  fs.writeFileSync(
    path.join(OUT_DIR, 'snapple.json'),
    JSON.stringify(poolOut, null, 2) + '\n',
  );

  console.log(`Wrote ${gameOut.length} game prompts → scripts/prompts/game.json`);
  console.log(`Wrote ${poolOut.length} snapple prompts → scripts/prompts/snapple.json`);
  process.exit(0);
})().catch(err => {
  console.error('Export failed:', err.message);
  process.exit(1);
});
