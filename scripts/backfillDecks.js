// backfillDecks.js
// Give every existing player a deck, now that the deck is what gets
// dealt.
//
// Until this change ownedCards was a list you could arrange in
// DeckBuilder that changed nothing: the game dealt from everything you
// had created plus everything you owned, and the maxDeckSize upgrade
// sold a cap no code ever read. So most accounts have an empty or
// long-stale ownedCards, and the first game after the update would deal
// them nothing but community cards.
//
// This seeds ownedCards from what they actually have - their own
// creations first, then anything they bought - capped at their
// maxDeckSize. Own creations first because a deck that drops YOUR
// snapples to make room for cards you bought is the wrong way round.
//
// Run from repo root:
//   node scripts/backfillDecks.js          # report only
//   node scripts/backfillDecks.js --write  # actually write
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
// Mirrors DECK_SIZE_START in StoreScreen and functions/store.js.
const DEFAULT_MAX_DECK = 50;

async function main() {
  // One pass over snapples, grouped by creator. Reading them all once
  // offline is the point - this is exactly the work we are removing
  // from the request path.
  const snapples = await db.collection('snapples').get();
  const byCreator = new Map();
  const live = new Set();

  snapples.forEach((d) => {
    const s = d.data();
    // A banned or deactivated snapple should not be seeded into a deck;
    // it would occupy a slot and never be dealt.
    if (s.isActive === false || s.isBanned === true) return;
    live.add(d.id);
    if (!s.creatorId) return;
    if (!byCreator.has(s.creatorId)) byCreator.set(s.creatorId, []);
    byCreator.get(s.creatorId).push(d.id);
  });

  console.log(`${snapples.size} snapples, ${live.size} playable, `
    + `${byCreator.size} creators`);

  const users = await db.collection('users').get();
  let changes = 0;
  let batch = db.batch();
  let pending = 0;

  for (const doc of users.docs) {
    const data = doc.data();
    const existing = data.ownedCards || [];
    // Already curated a real deck? Leave it alone - that is a choice
    // somebody made, even if it did nothing at the time.
    if (existing.length > 0) continue;

    const max = data.upgrades?.maxDeckSize || DEFAULT_MAX_DECK;
    const mine = byCreator.get(doc.id) || [];
    const bought = (data.ownedSnapples || []).filter(
      id => live.has(id) && !mine.includes(id),
    );

    const deck = [...mine, ...bought].slice(0, max);
    if (deck.length === 0) continue;

    changes++;
    console.log(`  ${data.username || doc.id}: ${deck.length} cards `
      + `(${mine.length} created, ${bought.length} bought, cap ${max})`);

    if (WRITE) {
      batch.update(doc.ref, { ownedCards: deck });
      if (++pending >= 400) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
  }

  if (WRITE && pending) await batch.commit();
  console.log(WRITE
    ? `wrote ${changes} decks`
    : `${changes} users would get a deck (--write to apply)`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
