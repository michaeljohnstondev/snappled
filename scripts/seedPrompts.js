// seedPrompts.js
// Read scripts/prompts/game.json + snapple.json, push any NEW prompts
// to their Firestore collections. Dedupe by normalized text key so
// re-running is always safe — only previously-absent text gets added.
//
// Run from repo root:
//   node scripts/seedPrompts.js
//
// Uses Firebase Admin via gcloud Application Default Credentials.
// Run `gcloud auth application-default login` once if you hit auth
// errors.

const fs = require('fs');
const path = require('path');

const admin = require('../functions/node_modules/firebase-admin');

try {
  const credPath = process.env.APPDATA + '\\gcloud\\application_default_credentials.json';
  if (fs.existsSync(credPath)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
  }
} catch (e) { /* non-fatal */ }

admin.initializeApp({ projectId: 'snapplepark' });
const db = admin.firestore();

// Mirrors src/utils/promptKey.js + functions/index.js normalizePromptText.
// Strips punctuation, collapses whitespace, lowercases — used as the
// dedup key so "Slay or be slayed!" and "slay or be slayed" can't both
// land in the collection.
function normalizePromptText(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Read a JSON array, accept either plain strings or { text, category }
// objects. Always normalize the output to { text, category } shape.
function loadPromptFile(file, defaultCategory) {
  if (!fs.existsSync(file)) return [];
  const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  if (!Array.isArray(raw)) return [];
  return raw
    .map(entry => {
      if (typeof entry === 'string') {
        return { text: entry.trim(), category: defaultCategory };
      }
      if (entry && typeof entry === 'object' && entry.text) {
        return {
          text: String(entry.text).trim(),
          category: entry.category || defaultCategory,
        };
      }
      return null;
    })
    .filter(p => p && p.text.length > 0);
}

// Pull existing textKeys for a collection so we can dedupe before
// writing. Cheaper than per-doc round-trips and avoids the
// arrayContains 30-item limit.
async function loadExistingKeys(collection) {
  const snap = await db.collection(collection).get();
  const keys = new Set();
  snap.forEach(d => {
    const data = d.data();
    if (data?.textKey) keys.add(data.textKey);
    else if (data?.text) keys.add(normalizePromptText(data.text));
  });
  return keys;
}

// Build a fresh doc payload for the given collection. gamePrompts and
// promptPool have different lifecycle fields; we only set the minimum
// needed at seed time and let in-app code accrue the rest.
function buildDoc(collection, text, category) {
  const nowISO = new Date().toISOString();
  const base = {
    text,
    textKey: normalizePromptText(text),
    category: category || 'general',
    createdAt: nowISO,
    createdBy: 'admin-seed',
    creatorUsername: 'admin',
  };
  if (collection === 'gamePrompts') {
    return { ...base, usageCount: 0 };
  }
  if (collection === 'promptPool') {
    return {
      ...base,
      used: false,
      timesUsed: 0,
      instanceCount: 0,
      likeCountLifetime: 0,
      dislikeCountLifetime: 0,
      participantCountLifetime: 0,
      totalViewsLifetime: 0,
      isSystem: true,
    };
  }
  return base;
}

// Write prompts that aren't already in the collection. Batched 400 at
// a time (Firestore cap is 500 — leaving headroom).
async function seedCollection(collection, prompts) {
  const existing = await loadExistingKeys(collection);
  const newOnes = prompts.filter(p => !existing.has(normalizePromptText(p.text)));
  if (newOnes.length === 0) {
    console.log(`${collection}: nothing new to add (${prompts.length} in file, all already present)`);
    return;
  }

  console.log(`${collection}: adding ${newOnes.length} new prompts (skipped ${prompts.length - newOnes.length} duplicates)`);
  let batch = db.batch();
  let count = 0;
  for (const p of newOnes) {
    const ref = db.collection(collection).doc();
    batch.set(ref, buildDoc(collection, p.text, p.category));
    count++;
    if (count % 400 === 0) {
      await batch.commit();
      batch = db.batch();
    }
  }
  if (count % 400 !== 0) await batch.commit();
  console.log(`${collection}: done.`);
}

(async () => {
  const gameFile = path.join(__dirname, 'prompts', 'game.json');
  const snappleFile = path.join(__dirname, 'prompts', 'snapple.json');

  const gamePrompts = loadPromptFile(gameFile, 'general');
  const snapplePrompts = loadPromptFile(snappleFile, 'general');

  console.log(`Loaded ${gamePrompts.length} game + ${snapplePrompts.length} snapple prompts from JSON`);

  if (gamePrompts.length > 0) await seedCollection('gamePrompts', gamePrompts);
  if (snapplePrompts.length > 0) await seedCollection('promptPool', snapplePrompts);

  process.exit(0);
})().catch(err => {
  console.error('Seed failed:', err.message);
  process.exit(1);
});
