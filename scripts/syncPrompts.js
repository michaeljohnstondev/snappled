// syncPrompts.js
// Make Firestore match the JSON file EXACTLY. Anything in
// scripts/prompts/{game,snapple}.json gets added if missing; anything
// in Firestore that's NOT in the JSON gets DELETED. Existing matches
// stay (dedup by normalized textKey).
//
// This is the "I rewrote the file, replace everything" workflow.
// seedPrompts.js is the safer additive workflow (add-only).
//
// Dry-run by default so you can see what would change before
// committing. Add --apply to actually write.
//
// Run from repo root:
//   node scripts/syncPrompts.js                # dry-run, prints diff
//   node scripts/syncPrompts.js --apply        # actually mutate Firestore
//   node scripts/syncPrompts.js --apply --only game     # one collection
//   node scripts/syncPrompts.js --apply --only snapple
//
// Uses Firebase Admin via gcloud Application Default Credentials or
// GOOGLE_APPLICATION_CREDENTIALS service account JSON.

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

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const onlyIdx = args.indexOf('--only');
const ONLY = onlyIdx >= 0 ? args[onlyIdx + 1] : null; // 'game' | 'snapple' | null

// Mirror src/utils/promptKey.js — keep in sync with the rest of the
// prompt pipeline so dedup keys agree across writes / queries / rules.
function normalizePromptText(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

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

// Same shape as seedPrompts.buildDoc — kept inline so this script is
// self-contained and the two stay obviously distinct.
function buildDoc(collection, text, category) {
  const nowISO = new Date().toISOString();
  const base = {
    text,
    textKey: normalizePromptText(text),
    category: category || 'general',
    createdAt: nowISO,
    createdBy: 'admin-sync',
    creatorUsername: 'admin',
  };
  if (collection === 'gamePrompts') return { ...base, usageCount: 0 };
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

async function syncCollection(collectionName, file, defaultCategory) {
  const jsonPrompts = loadPromptFile(file, defaultCategory);
  const jsonByKey = new Map();
  for (const p of jsonPrompts) {
    jsonByKey.set(normalizePromptText(p.text), p);
  }

  const snap = await db.collection(collectionName).get();
  const firestoreByKey = new Map();
  snap.forEach(d => {
    const data = d.data();
    const key = data?.textKey || normalizePromptText(data?.text || '');
    if (key) firestoreByKey.set(key, { id: d.id, text: data.text || '(no text)' });
  });

  const toAddKeys = [...jsonByKey.keys()].filter(k => !firestoreByKey.has(k));
  const toDeleteKeys = [...firestoreByKey.keys()].filter(k => !jsonByKey.has(k));
  const kept = jsonByKey.size - toAddKeys.length;

  console.log(`\n=== ${collectionName} ===`);
  console.log(`JSON file       : ${jsonPrompts.length} prompts`);
  console.log(`Firestore now   : ${firestoreByKey.size} prompts`);
  console.log(`Will ADD        : ${toAddKeys.length}`);
  console.log(`Will DELETE     : ${toDeleteKeys.length}`);
  console.log(`Will KEEP       : ${kept} (already in both)`);

  if (toAddKeys.length > 0) {
    console.log(`\n  + ADDING (sample of first 5):`);
    for (const k of toAddKeys.slice(0, 5)) {
      console.log(`      "${jsonByKey.get(k).text}"`);
    }
    if (toAddKeys.length > 5) console.log(`      … ${toAddKeys.length - 5} more`);
  }
  if (toDeleteKeys.length > 0) {
    console.log(`\n  - DELETING (sample of first 5):`);
    for (const k of toDeleteKeys.slice(0, 5)) {
      console.log(`      "${firestoreByKey.get(k).text}"`);
    }
    if (toDeleteKeys.length > 5) console.log(`      … ${toDeleteKeys.length - 5} more`);
  }

  if (!APPLY) {
    console.log(`\n  [dry-run] no changes written. Re-run with --apply to commit.`);
    return;
  }

  // Apply — batched 400 at a time (Firestore cap is 500, headroom).
  let batch = db.batch();
  let opsInBatch = 0;
  const commitIfFull = async () => {
    if (opsInBatch >= 400) {
      await batch.commit();
      batch = db.batch();
      opsInBatch = 0;
    }
  };

  for (const k of toDeleteKeys) {
    batch.delete(db.collection(collectionName).doc(firestoreByKey.get(k).id));
    opsInBatch++;
    await commitIfFull();
  }
  for (const k of toAddKeys) {
    const p = jsonByKey.get(k);
    batch.set(db.collection(collectionName).doc(), buildDoc(collectionName, p.text, p.category));
    opsInBatch++;
    await commitIfFull();
  }
  if (opsInBatch > 0) await batch.commit();

  console.log(`\n  ✔ ${collectionName} synced.`);
}

(async () => {
  if (!APPLY) {
    console.log('=== DRY RUN — no changes will be made ===');
  } else {
    console.log('=== APPLYING — Firestore will be mutated ===');
  }

  if (!ONLY || ONLY === 'game') {
    await syncCollection(
      'gamePrompts',
      path.join(__dirname, 'prompts', 'game.json'),
      'general',
    );
  }
  if (!ONLY || ONLY === 'snapple') {
    await syncCollection(
      'promptPool',
      path.join(__dirname, 'prompts', 'snapple.json'),
      'general',
    );
  }

  process.exit(0);
})().catch(err => {
  console.error('Sync failed:', err.message);
  process.exit(1);
});
