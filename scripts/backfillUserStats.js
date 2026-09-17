// backfillUserStats.js
// Give existing users the creation and like counters that achievements
// now read instead of computing.
//
// checkAchievements used to answer "how many likes have I received" by
// fetching every snapple a user had ever made and adding them up, every
// time it ran. Those totals are maintained by triggers now - but only
// from the moment the triggers went live. Accounts that predate them
// have no counters at all, which reads as zero, which would quietly
// un-earn milestones people had already passed.
//
// This walks the snapples once and writes the numbers the triggers
// would have arrived at. Run it once, right after deploying
// onSnappleLikesChanged.
//
// videosCreated is taken as a MAX, not a set: onNewSnapple has been
// incrementing it for a while, and a snapple that was created and later
// deleted still counts as one the user made. The lower of the two
// numbers is the one missing information.
//
// Run from repo root:
//   node scripts/backfillUserStats.js          # report only
//   node scripts/backfillUserStats.js --write  # actually write
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
  // One pass over snapples, tallied per creator. Reading every snapple
  // is exactly what we are removing from the request path - doing it
  // once here, offline, is the point.
  const snapples = await db.collection('snapples').get();
  const tally = new Map();

  snapples.forEach((d) => {
    const s = d.data();
    if (!s.creatorId) return;
    const t = tally.get(s.creatorId)
      || { created: 0, likes: 0, best: 0, prompts: new Set() };
    t.created += 1;
    const likes = s.likes || s.likeCount || (s.likedBy || []).length || 0;
    t.likes += likes;
    if (likes > t.best) t.best = likes;
    if (s.promptId) t.prompts.add(s.promptId);
    tally.set(s.creatorId, t);
  });

  console.log(`${snapples.size} snapples across ${tally.size} creators`);

  const users = await db.collection('users').get();
  let changes = 0;
  let batch = db.batch();
  let pending = 0;

  for (const doc of users.docs) {
    const data = doc.data();
    const stats = data.stats || {};
    const t = tally.get(doc.id) || { created: 0, likes: 0, best: 0, prompts: new Set() };

    const update = {};
    const created = Math.max(stats.videosCreated || 0, t.created);
    if (created !== (stats.videosCreated || 0)) update['stats.videosCreated'] = created;
    if ((stats.totalLikesReceived || 0) !== t.likes) {
      update['stats.totalLikesReceived'] = t.likes;
    }
    // High-water mark, so a milestone someone already passed is not
    // taken back by likes that have since been withdrawn.
    const best = Math.max(stats.maxLikesOnOne || 0, t.best);
    if (best !== (stats.maxLikesOnOne || 0)) update['stats.maxLikesOnOne'] = best;

    // uniquePromptsUsed is read from xpEarnedPrompts, which onNewSnapple
    // appends to. Users who created snapples before that existed have a
    // short list; union it with what they actually answered.
    const known = new Set(data.xpEarnedPrompts || []);
    const missing = [...t.prompts].filter(id => !known.has(id));
    if (missing.length) {
      update.xpEarnedPrompts = admin.firestore.FieldValue.arrayUnion(...missing);
    }

    if (Object.keys(update).length === 0) continue;
    changes++;
    console.log(`  ${data.username || doc.id}:`, JSON.stringify({
      ...update,
      ...(missing.length ? { xpEarnedPrompts: `+${missing.length}` } : {}),
    }));

    if (WRITE) {
      batch.update(doc.ref, update);
      if (++pending >= 400) {
        await batch.commit();
        batch = db.batch();
        pending = 0;
      }
    }
  }

  if (WRITE && pending) await batch.commit();
  console.log(WRITE ? `wrote ${changes} users` : `${changes} users would change (--write to apply)`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
