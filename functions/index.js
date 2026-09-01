const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

const MAX_ACTIVE_PROMPTS = 24;
const PROMPT_DURATION_HOURS = 24;
const LOCKOUT_MINUTES = 10;
const APPROVAL_THRESHOLD = 0.5; // 50% likes to recycle a prompt
const TICKET_REWARD = 1; // Tickets earned for promoted snapples

// Mirrors src/utils/promptKey.js — keep in sync.
function normalizePromptText(text) {
  if (!text) return '';
  return String(text)
    .toLowerCase()
    .trim()
    .replace(/[^\p{Letter}\p{Number}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Roll a finishing prompt's per-instance stats into its promptPool entry's
// lifetime totals. If no pool entry exists yet (legacy prompt or pre-revive
// flow), create one keyed by textKey so future revives find it.
async function accrueLifetimeStats(prompt) {
  const textKey = prompt.textKey || normalizePromptText(prompt.text || '');
  if (!textKey) return;

  let poolRef = null;
  if (prompt.poolDocId) {
    poolRef = db.collection('promptPool').doc(prompt.poolDocId);
    const snap = await poolRef.get();
    if (!snap.exists) poolRef = null;
  }
  if (!poolRef) {
    // Look up by textKey
    const matchQuery = await db.collection('promptPool')
      .where('textKey', '==', textKey)
      .limit(1)
      .get();
    if (!matchQuery.empty) {
      poolRef = matchQuery.docs[0].ref;
    } else {
      // Create a fresh pool doc.
      poolRef = db.collection('promptPool').doc();
      await poolRef.set({
        text: prompt.text,
        textKey,
        category: prompt.category || 'general',
        createdBy: prompt.createdBy || null,
        creatorUsername: prompt.creatorUsername || null,
        createdAt: prompt.createdAt || new Date().toISOString(),
        likeCountLifetime: 0,
        dislikeCountLifetime: 0,
        participantCountLifetime: 0,
        totalViewsLifetime: 0,
        instanceCount: 0,
        used: false,
      }, { merge: true });
    }
  }

  await poolRef.update({
    likeCountLifetime: admin.firestore.FieldValue.increment(prompt.likeCount || 0),
    dislikeCountLifetime: admin.firestore.FieldValue.increment(prompt.dislikeCount || 0),
    participantCountLifetime: admin.firestore.FieldValue.increment(prompt.participantCount || 0),
    totalViewsLifetime: admin.firestore.FieldValue.increment(prompt.totalViews || 0),
    instanceCount: admin.firestore.FieldValue.increment(1),
    lastExpiredAt: new Date().toISOString(),
    used: false, // free to be picked again by rotation
  });
}

// ── Scheduled: runs every hour ──
exports.hourlyPromptRotation = functions.pubsub
  .schedule('0 * * * *')
  .timeZone('UTC')
  .onRun(async () => {
    console.log('[Cron] Running hourly prompt rotation...');
    try {
      // Set lock so onPromptDeleted trigger doesn't double-dip
      await db.collection('system').doc('cronLock').set({ lockedAt: new Date().toISOString() });

      // 1. Always pop the oldest system prompt and replace with a new one
      const rotated = await rotateOldestSystemPrompt();

      // 2. Expire any prompts (system or user) past their expiresAt
      const expired = await expirePrompts();

      // 4. Ensure we always have at least 24 system prompts
      await fillActivePrompts();

      // 5. Keep on deck stocked
      await replenishOnDeck();

      // 6. Clean up stale games (older than 1 hour)
      await cleanupStaleGames();

      // Clear lock
      await db.collection('system').doc('cronLock').delete().catch(() => {});

      console.log(`[Cron] Done. Rotated: ${rotated}, Expired: ${expired}`);
      return null;
    } catch (error) {
      console.error('[Cron] Error:', error);
      throw error;
    }
  });

// ══════════════════════════════════════════════
// PROMPT LIFECYCLE
// ══════════════════════════════════════════════


// Always rotate the oldest system prompt out and add a fresh one
async function rotateOldestSystemPrompt() {
  // Find the oldest active system prompt
  const oldestQuery = await db.collection('activePrompts')
    .orderBy('createdAt', 'asc')
    .limit(10)
    .get();

  // Filter to system prompts client-side to avoid composite index
  const systemDocs = oldestQuery.docs.filter(d => d.data().isSystem === true);
  if (systemDocs.length === 0) return 0;

  // Use first system doc as oldest
  const oldestDoc = systemDocs[0];
  const oldestPrompt = oldestDoc.data();

  // Promote/cleanup its snapples
  await promoteAndCleanupSnapples(oldestDoc.id, oldestPrompt);

  // Recycle or discard based on quality
  await recycleOrDiscardPrompt(oldestDoc.id, oldestPrompt);

  console.log(`[Rotate] Popped oldest system prompt: "${oldestPrompt.text}"`);
  return 1;
}

// Expire all prompts past their expiresAt (system + user)
async function expirePrompts() {
  const now = new Date().toISOString();

  const expiredQuery = await db.collection('activePrompts')
    .where('expiresAt', '<=', now)
    .get();

  if (expiredQuery.empty) return 0;

  let count = 0;
  for (const doc of expiredQuery.docs) {
    const prompt = doc.data();
    await promoteAndCleanupSnapples(doc.id, prompt);

    // Accrue this instance's stats to the pool's lifetime totals before
    // deleting the active doc.
    try { await accrueLifetimeStats(prompt); } catch (e) { console.error('[Expire] accrue err:', e); }

    if (prompt.isSystem) {
      // System prompt — recycle if popular
      await recycleOrDiscardPrompt(doc.id, prompt);
    } else {
      // User prompt — recycle into system pool if popular
      const totalVotes = (prompt.likeCount || 0) + (prompt.dislikeCount || 0);
      const likeRatio = totalVotes > 0 ? (prompt.likeCount || 0) / totalVotes : 0;

      if (totalVotes === 0 || likeRatio >= APPROVAL_THRESHOLD) {
        await db.collection('recycledPrompts').doc(doc.id).set({
          text: prompt.text,
          category: prompt.category || 'user',
          createdBy: prompt.createdBy || null,
          creatorUsername: prompt.creatorUsername || null,
          lastUsed: new Date().toISOString(),
          timesUsed: 1,
          lastLikeRatio: likeRatio,
          source: 'user_created',
        });
        console.log(`[Recycle] User prompt "${prompt.text}" recycled (${totalVotes === 0 ? 'no votes' : 'popular'})`);
      }

      await db.collection('activePrompts').doc(doc.id).delete();
    }

    count++;
  }

  return count;
}

// Quality-based prompt recycling (ported from legacy topicHandler)
async function recycleOrDiscardPrompt(promptId, prompt) {
  const totalVotes = (prompt.likeCount || 0) + (prompt.dislikeCount || 0);
  const likeRatio = totalVotes > 0 ? (prompt.likeCount || 0) / totalVotes : 0;

  if (totalVotes === 0 || likeRatio >= APPROVAL_THRESHOLD) {
    // Recycle — no votes yet or liked enough
    await db.collection('recycledPrompts').doc(promptId).set({
      text: prompt.text,
      category: prompt.category || 'general',
      lastUsed: new Date().toISOString(),
      timesUsed: (prompt.timesUsed || 0) + 1,
      lastLikeRatio: likeRatio,
    });
    console.log(`[Recycle] Prompt "${prompt.text}" recycled (${totalVotes === 0 ? 'no votes' : (likeRatio * 100).toFixed(0) + '% liked'})`);
  } else {
    console.log(`[Discard] Prompt "${prompt.text}" discarded (${(likeRatio * 100).toFixed(0)}% liked)`);
  }

  // Delete from active
  await db.collection('activePrompts').doc(promptId).delete();
}

// ══════════════════════════════════════════════
// SNAPPLE PROMOTION (ported from legacy presnappleHandler)
// ══════════════════════════════════════════════

// When a prompt expires, snapples that nobody saved get fully deleted
// (doc + video file + video metadata doc). Snapples with at least one
// owner stay active and remain in the community pool — they're the
// "kept" cards. Replaces the old promote/archive flow.
async function promoteAndCleanupSnapples(promptId, prompt) {
  const snappleQuery = await db.collection('snapples')
    .where('promptId', '==', promptId)
    .get();

  if (snappleQuery.empty) return;

  const bucket = admin.storage().bucket();
  let kept = 0;
  let deleted = 0;
  const rewardedAuthors = new Set();

  for (const docSnap of snappleQuery.docs) {
    const data = docSnap.data();
    const owners = data.owners || [];
    const wishlistedBy = data.wishlistedBy || [];

    // Keep the snapple if anyone claimed it in ANY way — owning
    // (saved/bought) OR wishlisting. Only the creator gets a ticket
    // reward, and only when someone actually owns it (a wishlist alone
    // doesn't earn the ticket — it just spares the snapple).
    if (owners.length > 0 || wishlistedBy.length > 0) {
      kept++;

      if (owners.length > 0 && data.creatorId && !rewardedAuthors.has(data.creatorId)) {
        rewardedAuthors.add(data.creatorId);
        const userRef = db.collection('users').doc(data.creatorId);
        await userRef.update({
          'resources.tokens': admin.firestore.FieldValue.increment(TICKET_REWARD),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }).catch(() => {});
      }
      continue;
    }

    // No owners — delete doc, video file, and video metadata doc.
    if (data.videoId && data.creatorId) {
      const videoPath = `videos/${data.creatorId}/${data.videoId}.mp4`;
      await bucket.file(videoPath).delete().catch(() => {});
    }
    if (data.videoId) {
      await db.collection('videos').doc(data.videoId).delete().catch(() => {});
    }
    await docSnap.ref.delete().catch(() => {});
    deleted++;
  }

  console.log(`[Cleanup] Prompt ${promptId}: kept ${kept}, deleted ${deleted}, rewarded ${rewardedAuthors.size} creators`);
}

// Find best snapples using dual criteria (from legacy presnappleHandler)
function findBestSnapples(snapples) {
  let maxLikes = 0;
  let maxPercentage = 0;
  const mostLiked = [];
  const highestPercentage = [];

  // First pass: find the max values
  for (const s of snapples) {
    const likes = s.likes || 0;
    const totalVotes = likes + (s.dislikes || 0);
    const percentage = totalVotes > 0 ? likes / totalVotes : 0;

    if (likes > maxLikes && likes > 0) maxLikes = likes;
    if (percentage > maxPercentage && totalVotes > 0) maxPercentage = percentage;
  }

  // Second pass: collect all snapples matching the max (handles ties)
  for (const s of snapples) {
    const likes = s.likes || 0;
    const totalVotes = likes + (s.dislikes || 0);
    const percentage = totalVotes > 0 ? likes / totalVotes : 0;

    if (likes === maxLikes && likes > 0) mostLiked.push(s.id);
    if (percentage === maxPercentage && totalVotes > 0) highestPercentage.push(s.id);
  }

  return { mostLiked, highestPercentage };
}

// ══════════════════════════════════════════════
// PROMPT POOL MANAGEMENT
// ══════════════════════════════════════════════

// Three-tier fill: promptPool → recycledPrompts → (wait for more)
async function fillActivePrompts() {
  const now = new Date().toISOString();

  const activeQuery = await db.collection('activePrompts')
    .where('expiresAt', '>', now)
    .get();

  // Only count system prompts against the 24 cap — user prompts are extra
  let systemCount = 0;
  activeQuery.forEach(doc => {
    if (doc.data().isSystem === true) systemCount++;
  });

  let needed = MAX_ACTIVE_PROMPTS - systemCount;

  if (needed <= 0) {
    console.log(`[Fill] Already have ${systemCount} system prompts`);
    return;
  }

  console.log(`[Fill] Need ${needed} more system prompts (have ${systemCount})`);

  // Tier 1: On deck prompts (admin curated)
  needed = await fillFromOnDeck(needed);

  // Tier 2: Fresh prompts from pool
  if (needed > 0) {
    needed = await fillFromPool(needed);
  }

  // Tier 3: Recycled popular prompts (if pool ran dry)
  if (needed > 0) {
    needed = await fillFromRecycled(needed);
  }

  // Tier 3: Reset pool if both exhausted
  if (needed > 0) {
    console.log('[Fill] Both sources exhausted, resetting pool...');
    await resetPool();
    await fillFromPool(needed);
  }
}

// Clean up stale/abandoned games older than 1 hour
async function cleanupStaleGames() {
  const cutoff = new Date(Date.now() - 60 * 60 * 1000).toISOString();

  const staleQuery = await db.collection('games').get();
  let cleaned = 0;

  for (const doc of staleQuery.docs) {
    const data = doc.data();
    const updatedAt = data.updatedAt?.toDate?.()?.toISOString() || data.updatedAt || '';

    if (updatedAt < cutoff) {
      // Archive if it had real players and got past lobby
      const hasBots = data.players?.some(p => p.uid?.startsWith('bot_'));
      if (!hasBots && data.phase !== 'lobby') {
        await db.collection('gameHistory').doc(doc.id).set({
          ...data,
          finishedAt: new Date().toISOString(),
          archiveReason: 'stale_cleanup',
        });
      }
      await doc.ref.delete();
      cleaned++;
    }
  }

  if (cleaned > 0) console.log(`[Cleanup] Removed ${cleaned} stale games`);
}

const ON_DECK_TARGET = 30;
const ON_DECK_DOC = 'system/onDeckQueue';

async function getOnDeck() {
  const doc = await db.doc(ON_DECK_DOC).get();
  return doc.exists ? (doc.data().prompts || []) : [];
}

async function saveOnDeck(prompts) {
  await db.doc(ON_DECK_DOC).set({ prompts, updatedAt: new Date().toISOString() });
}

async function fillFromOnDeck(needed) {
  if (needed <= 0) return 0;

  const queue = await getOnDeck();
  if (queue.length === 0) return needed;

  const toActivate = queue.splice(0, needed);
  const batch = db.batch();
  const expiresAt = new Date(Date.now() + PROMPT_DURATION_HOURS * 60 * 60 * 1000).toISOString();
  const lockoutAt = new Date(Date.now() + (PROMPT_DURATION_HOURS * 60 - LOCKOUT_MINUTES) * 60 * 1000).toISOString();

  for (const text of toActivate) {
    const activeRef = db.collection('activePrompts').doc();
    batch.set(activeRef, {
      text,
      category: 'general',
      expiresAt,
      lockoutAt,
      createdAt: new Date().toISOString(),
      likeCount: 0, dislikeCount: 0,
      likes: [], dislikes: [],
      participantCount: 0, totalViews: 0,
      timesUsed: 0, isSystem: true,
    });
  }

  await batch.commit();
  await saveOnDeck(queue);
  console.log(`[Fill] Activated ${toActivate.length} from on deck (${queue.length} remaining)`);

  await replenishOnDeck();
  return needed - toActivate.length;
}

async function replenishOnDeck() {
  const queue = await getOnDeck();
  const needed = ON_DECK_TARGET - queue.length;
  if (needed <= 0) return;

  const poolQuery = await db.collection('promptPool')
    .where('used', '==', false)
    .orderBy('timesUsed', 'asc')
    .limit(needed)
    .get();

  if (poolQuery.empty) return;

  const batch = db.batch();
  const newPrompts = [];
  poolQuery.forEach(doc => {
    newPrompts.push(doc.data().text);
    batch.update(doc.ref, {
      used: true,
      timesUsed: (doc.data().timesUsed || 0) + 1,
    });
  });

  await batch.commit();
  await saveOnDeck([...queue, ...newPrompts]);
  console.log(`[OnDeck] Replenished ${newPrompts.length} prompts`);
}

async function fillFromPool(needed) {
  if (needed <= 0) return 0;

  const batch = db.batch();
  const expiresAt = new Date(Date.now() + PROMPT_DURATION_HOURS * 60 * 60 * 1000).toISOString();
  const lockoutAt = new Date(Date.now() + (PROMPT_DURATION_HOURS * 60 - LOCKOUT_MINUTES) * 60 * 1000).toISOString();

  let filled = 0;
  for (let i = 0; i < needed; i++) {
    // Weighted random: grab 10 least-used, pick one randomly
    const poolQuery = await db.collection('promptPool')
      .where('used', '==', false)
      .orderBy('timesUsed', 'asc')
      .limit(10)
      .get();

    if (poolQuery.empty) break;

    const pick = poolQuery.docs[Math.floor(Math.random() * poolQuery.size)];
    const prompt = pick.data();

    const activeRef = db.collection('activePrompts').doc();
    batch.set(activeRef, {
      text: prompt.text,
      category: prompt.category || 'general',
      poolId: pick.id,
      expiresAt,
      lockoutAt,
      createdAt: new Date().toISOString(),
      likeCount: 0,
      dislikeCount: 0,
      likes: [],
      dislikes: [],
      participantCount: 0,
      totalViews: 0,
      timesUsed: (prompt.timesUsed || 0) + 1,
      isSystem: true,
    });
    batch.update(pick.ref, {
      used: true,
      timesUsed: (prompt.timesUsed || 0) + 1,
    });
    filled++;
  }

  if (filled > 0) {
    await batch.commit();
    console.log(`[Fill] Activated ${filled} from pool (weighted random)`);
  }
  return needed - filled;
}

async function fillFromRecycled(needed) {
  if (needed <= 0) return 0;

  // Get least-recently-used recycled prompts
  const recycledQuery = await db.collection('recycledPrompts')
    .orderBy('lastUsed', 'asc')
    .limit(needed)
    .get();

  if (recycledQuery.empty) return needed;

  const batch = db.batch();
  const expiresAt = new Date(Date.now() + PROMPT_DURATION_HOURS * 60 * 60 * 1000).toISOString();
  const lockoutAt = new Date(Date.now() + (PROMPT_DURATION_HOURS * 60 - LOCKOUT_MINUTES) * 60 * 1000).toISOString();

  recycledQuery.forEach(doc => {
    const prompt = doc.data();
    const activeRef = db.collection('activePrompts').doc();
    batch.set(activeRef, {
      text: prompt.text,
      category: prompt.category || 'general',
      recycledId: doc.id,
      expiresAt,
      lockoutAt,
      createdAt: new Date().toISOString(),
      likeCount: 0,
      dislikeCount: 0,
      likes: [],
      dislikes: [],
      participantCount: 0,
      totalViews: 0,
      timesUsed: (prompt.timesUsed || 0) + 1,
      isSystem: true,
    });
    // Remove from recycled pool
    batch.delete(doc.ref);
  });

  await batch.commit();
  console.log(`[Fill] Activated ${recycledQuery.size} from recycled`);
  return needed - recycledQuery.size;
}

async function resetPool() {
  const usedQuery = await db.collection('promptPool')
    .where('used', '==', true)
    .get();

  if (usedQuery.empty) return;

  const batch = db.batch();
  usedQuery.forEach(doc => {
    batch.update(doc.ref, { used: false });
  });

  await batch.commit();
  console.log(`[Pool] Reset ${usedQuery.size} prompts`);
}

// (Removed onSnappleOwnersEmpty trigger — it insta-deleted snapples the
// moment `owners` hit zero, which broke discard: a snapple with the
// creator's video would vanish before anyone else had a chance to save,
// wishlist, or buy it. Cleanup now happens only at prompt-expire time
// via cleanupOrphanSnapples, which keeps every snapple that has ≥1
// owner OR ≥1 wishlister so no discarded-but-loved snapple gets swept.)

exports.onPromptDeleted = functions.firestore
  .document('activePrompts/{promptId}')
  .onDelete(async (snapshot, context) => {
    // Check if cron is currently running (set a lock doc)
    const lockRef = db.collection('system').doc('cronLock');
    const lockDoc = await lockRef.get();
    if (lockDoc.exists()) {
      const lockTime = lockDoc.data().lockedAt;
      // If locked within last 60 seconds, cron is handling it
      if (lockTime && (Date.now() - new Date(lockTime).getTime()) < 60000) {
        console.log('[Trigger] Skipping — cron is active');
        return;
      }
    }

    console.log('[Trigger] Active prompt deleted, refilling...');
    try {
      await fillActivePrompts();
    } catch (error) {
      console.error('[Trigger] Error refilling:', error);
    }
  });

// ══════════════════════════════════════════════
// CALLABLE FUNCTIONS
// ══════════════════════════════════════════════

// Manual trigger for testing
exports.manualPromptRotation = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  try {
    const rotated = await rotateOldestSystemPrompt();
    const expired = await expirePrompts();
    await fillActivePrompts();
    await replenishOnDeck();
    return { success: true, rotated, expired };
  } catch (error) {
    throw new functions.https.HttpsError('internal', error.message);
  }
});

// Check if a prompt is locked (last 10 min)
exports.isPromptLocked = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { promptId } = data;
  const promptDoc = await db.collection('activePrompts').doc(promptId).get();

  if (!promptDoc.exists) {
    return { locked: true, reason: 'Prompt not found' };
  }

  const prompt = promptDoc.data();
  const now = new Date().toISOString();

  if (now >= prompt.lockoutAt) {
    return { locked: true, reason: 'Prompt closing soon — no new snapples' };
  }

  return { locked: false };
});

// ══════════════════════════════════════════════
// PURCHASE HANDLER
// ══════════════════════════════════════════════

// Atomic purchase: deduct coins, add to owned, update snapple price
exports.purchaseSnapple = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  const { snappleId } = data;
  const userId = context.auth.uid;

  // Use a transaction for atomicity (from legacy BuyButton pattern)
  return db.runTransaction(async (transaction) => {
    const snappleRef = db.collection('snapples').doc(snappleId);
    const userRef = db.collection('users').doc(userId);

    const [snappleDoc, userDoc] = await Promise.all([
      transaction.get(snappleRef),
      transaction.get(userRef),
    ]);

    if (!snappleDoc.exists) {
      throw new functions.https.HttpsError('not-found', 'Snapple not found');
    }

    const snapple = snappleDoc.data();
    const userData = userDoc.data();
    const currentPrice = snapple.currentPrice || 10;

    // Private snapples are off-market — only the creator's own copy,
    // grandfathered owners from before it went private, and gameplay
    // (which uses ownedSnapples directly, not purchase) get them. Hard
    // server-side block in case a stale client tries to call this.
    if (snapple.isPrivate === true) {
      throw new functions.https.HttpsError('failed-precondition', 'This snapple is private');
    }

    // Check coins
    const userCoins = userData?.resources?.coins || userData?.coins || 0;
    if (userCoins < currentPrice) {
      throw new functions.https.HttpsError('failed-precondition', 'Not enough coins');
    }

    // Check if already owned
    const ownedSnapples = userData?.ownedSnapples || [];
    if (ownedSnapples.includes(snappleId)) {
      throw new functions.https.HttpsError('already-exists', 'Already owned');
    }

    // Tier-based pricing by buy count
    const newBuyCount = (snapple.buyCount || 0) + 1;
    function getTierPrice(buys) {
      if (buys <= 10) return 100;          // T1: $1
      if (buys <= 100) return 300;         // T2: $3
      if (buys <= 1000) return 500;        // T3: $5
      if (buys <= 5000) return 1000;       // T4: $10
      if (buys <= 10000) return 2000;      // T5: $20
      if (buys <= 50000) return 4000;      // T6: $40
      if (buys <= 100000) return 6000;     // T7: $60
      if (buys <= 500000) return 8000;     // T8: $80
      if (buys <= 1000000) return 10000;   // T9: $100
      return 10000;                        // T10+: capped at $100
    }
    const newPrice = getTierPrice(newBuyCount);

    // Deduct coins from buyer
    transaction.update(userRef, {
      'resources.coins': admin.firestore.FieldValue.increment(-currentPrice),
      ownedSnapples: admin.firestore.FieldValue.arrayUnion(snappleId),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Update snapple + track owner
    transaction.update(snappleRef, {
      buyCount: admin.firestore.FieldValue.increment(1),
      currentPrice: newPrice,
      owners: admin.firestore.FieldValue.arrayUnion(userId),
      priceHistory: admin.firestore.FieldValue.arrayUnion({
        price: currentPrice,
        buyCount: newBuyCount,
        buyer: userId,
        timestamp: new Date().toISOString(),
      }),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    });

    // Track creator sales stats + milestone payouts
    if (snapple.creatorId && snapple.creatorId !== userId) {
      const creatorRef = db.collection('users').doc(snapple.creatorId);
      transaction.update(creatorRef, {
        'stats.snapplesSold': admin.firestore.FieldValue.increment(1),
        'stats.totalRevenue': admin.firestore.FieldValue.increment(currentPrice),
      });
      const milestones = {
        1:       { coins: 0,      xp: 25 },
        10:      { coins: 1000,   xp: 50 },
        100:     { coins: 2000,   xp: 100 },
        1000:    { coins: 5000,   xp: 250 },
        10000:   { coins: 10000,  xp: 500 },
        100000:  { coins: 50000,  xp: 1000 },
        250000:  { coins: 75000,  xp: 1500 },
        500000:  { coins: 85000,  xp: 2000 },
        1000000: { coins: 100000, xp: 5000 },
      };

      // Don't count creator buying their own snapple
      // (already blocked above with 'Already owned' check, but just in case)
      const milestone = milestones[newBuyCount];
      if (milestone) {
        const updates = {
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        };
        if (milestone.coins > 0) {
          updates['resources.coins'] = admin.firestore.FieldValue.increment(milestone.coins);
          updates['stats.coinsEarned'] = admin.firestore.FieldValue.increment(milestone.coins);
        }
        if (milestone.xp > 0) {
          updates['profile.experience'] = admin.firestore.FieldValue.increment(milestone.xp);
        }
        transaction.update(creatorRef, updates);
      }
    }

    return {
      success: true,
      purchasePrice: currentPrice,
      newPrice,
      creatorEarned: Math.floor(currentPrice * 0.7),
    };
  });
});

// ══════════════════════════════════════════════
// GAME DECK SHUFFLER (from legacy gameTopicHandler)
// ══════════════════════════════════════════════

// Pre-shuffle game prompt decks using Fisher-Yates
exports.shuffleGameDecks = functions.https.onCall(async (data, context) => {
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'Must be logged in');
  }

  // Get all game prompts
  const promptsQuery = await db.collection('gamePrompts').get();
  const prompts = [];
  promptsQuery.forEach(doc => prompts.push(doc.data().text));

  if (prompts.length < 5) {
    throw new functions.https.HttpsError('failed-precondition', 'Not enough game prompts');
  }

  // Generate 5 shuffled decks (Fisher-Yates)
  const batch = db.batch();
  for (let d = 0; d < 5; d++) {
    const deck = [...prompts];
    for (let i = deck.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [deck[i], deck[j]] = [deck[j], deck[i]];
    }
    const deckRef = db.collection('gameDecks').doc(`deck_${d}`);
    batch.set(deckRef, {
      prompts: deck,
      shuffledAt: new Date().toISOString(),
    });
  }

  await batch.commit();
  return { success: true, decks: 5, promptsPerDeck: prompts.length };
});

// ══════════════════════════════════════════════════════════════════════
// PUSH NOTIFICATIONS (FCM via @react-native-firebase/messaging on client)
// ══════════════════════════════════════════════════════════════════════
//
// Rules (mirrored in src/services/CLAUDE.md from bvs-app):
//   - FCM only. No expo-notifications, ever.
//   - Every fan-out checks: block, mute, type-toggle, isPrivate.
//   - Every notification writes to users/{uid}/notifications AND sends
//     FCM push, from the SAME cloud function, so foreground clients
//     don't have to double-write.

const messagingAdmin = admin.messaging();

// deliverNotification — the one place that sends FCM + writes the
// in-app notification doc. Every fan-out below calls this. Skips if
// the target has no FCM token, has blocked/muted the actor, or has
// the relevant push type toggled off.
//
// Params:
//   targetUserId    — recipient
//   actorUserId     — user whose action triggered this (skipped if blocked/muted)
//   settingsKey     — key under settings.notifications.push.* to check
//   type            — string used by client navigation switch
//   title, body     — user-facing notification copy
//   data            — extra fields for client navigation (userId, snappleId, etc.)
//   priority        — 'normal' | 'high' | 'urgent' — drives in-app color
async function deliverNotification({
  targetUserId, actorUserId, settingsKey, type, title, body, data = {}, priority = 'normal',
}) {
  if (!targetUserId || !type) return { sent: false, reason: 'missing-params' };

  // Skip self-notifications entirely.
  if (actorUserId && actorUserId === targetUserId) {
    return { sent: false, reason: 'self' };
  }

  const targetSnap = await db.collection('users').doc(targetUserId).get();
  if (!targetSnap.exists) return { sent: false, reason: 'no-target-doc' };
  const target = targetSnap.data() || {};

  // Block check — either side blocking kills the notification.
  const blockedByTarget = (target.social?.blockedUsers || []).includes(actorUserId);
  const blockedActor = (target.social?.blockedBy || []).includes(actorUserId);
  if (blockedByTarget || blockedActor) {
    return { sent: false, reason: 'blocked' };
  }

  // Mute check — one-way, only the target's mute matters.
  const muted = (target.social?.mutedNotifications || []).includes(actorUserId);
  if (muted) return { sent: false, reason: 'muted' };

  // Per-type toggle check. Missing settings doc = every type ON,
  // including newPrompts. Only an explicit `false` silences a type,
  // so legacy users with no settings doc get the full set.
  const pushPrefs = target.settings?.notifications?.push || {};
  const enabled = pushPrefs[settingsKey] !== undefined ? pushPrefs[settingsKey] : true;
  if (!enabled) return { sent: false, reason: 'toggled-off' };

  // Write in-app notification (owned by Cloud Functions per the CLAUDE.md
  // pattern — no client-side write on foreground receive).
  const notifId = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
  const notifRef = db.collection('users').doc(targetUserId).collection('notifications').doc(notifId);
  await notifRef.set({
    id: notifId,
    type,
    title,
    message: body,
    data: { ...data, actorUserId: actorUserId || null },
    priority,
    read: false,
    createdAt: admin.firestore.Timestamp.now(),
    expiresAt: admin.firestore.Timestamp.fromDate(new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)),
  });

  // Send FCM if the target has a token.
  const token = target.deviceInfo?.fcmToken;
  if (!token) return { sent: false, reason: 'no-token', notifId };

  try {
    await messagingAdmin.send({
      token,
      notification: { title, body },
      data: {
        // FCM data fields must be strings.
        type: String(type),
        ...Object.fromEntries(
          Object.entries({ ...data, actorUserId: actorUserId || '' })
            .filter(([, v]) => v !== undefined && v !== null)
            .map(([k, v]) => [k, String(v)]),
        ),
      },
      android: { priority: priority === 'urgent' ? 'high' : 'normal' },
      apns: { payload: { aps: { sound: 'default' } } },
    });
    return { sent: true, notifId };
  } catch (err) {
    console.error(`[deliverNotification] FCM send failed for ${targetUserId}:`, err.message);
    // Clean up the token if it's no longer valid — prevents repeated
    // fan-out failures against a dead device.
    if (err.code === 'messaging/registration-token-not-registered'
        || err.code === 'messaging/invalid-registration-token') {
      await db.collection('users').doc(targetUserId).update({
        'deviceInfo.fcmToken': null,
        'deviceInfo.notificationsEnabled': false,
        'deviceInfo.lastTokenUpdate': admin.firestore.FieldValue.serverTimestamp(),
      }).catch(() => {});
    }
    return { sent: false, reason: 'fcm-error', error: err.message, notifId };
  }
}

// resolveUsername — cheap helper for building notification copy. Falls
// back to a short uid slice so a stale user doc never blocks a send.
async function resolveUsername(uid) {
  if (!uid) return 'Someone';
  try {
    const snap = await db.collection('users').doc(uid).get();
    if (!snap.exists) return 'Someone';
    const d = snap.data();
    return d.username || d.displayName || 'Someone';
  } catch (e) {
    return 'Someone';
  }
}

// ── Follow / mutual-follow ──
// Trigger fires whenever a user doc updates. We detect the followers-
// array growing to catch new follows without needing a separate follow
// doc. Handles both regular new-follower and mutual-follow flavors —
// mutual is when the newly-added follower is ALREADY in this user's
// following list (i.e. they follow each other now).
exports.onFollowerAdded = functions.firestore
  .document('users/{userId}')
  .onUpdate(async (change, context) => {
    const before = change.before.data() || {};
    const after = change.after.data() || {};
    const beforeFollowers = new Set(before.social?.followers || []);
    const afterFollowers = new Set(after.social?.followers || []);

    const newFollowerIds = [...afterFollowers].filter((id) => !beforeFollowers.has(id));
    if (newFollowerIds.length === 0) return;

    const followeeId = context.params.userId;
    const followeeFollowing = new Set(after.social?.following || []);

    for (const followerId of newFollowerIds) {
      const isMutual = followeeFollowing.has(followerId);
      const followerName = await resolveUsername(followerId);
      await deliverNotification({
        targetUserId: followeeId,
        actorUserId: followerId,
        settingsKey: isMutual ? 'followBack' : 'newFollower',
        type: isMutual ? 'mutual_follow' : 'new_follower',
        title: isMutual ? "You've got a mutual!" : 'New follower',
        body: isMutual
          ? `You and @${followerName} follow each other now.`
          : `@${followerName} just followed you.`,
        data: { userId: followerId },
        priority: 'normal',
      });
    }
  });

// ── New snapple from someone I follow ──
// Trigger fires on snapple doc create. Skips private snapples,
// blocked/muted actors, and toggle-off followers. Debounces bursts:
// if a follower already has an unread notification of this type from
// this creator, we UPDATE that notification's copy instead of firing
// a new push, so "5 uploads in 10 minutes" = 1 ping, not 5.
exports.onNewSnapple = functions.firestore
  .document('snapples/{snappleId}')
  .onCreate(async (snap, context) => {
    const snapple = snap.data() || {};
    const snappleId = context.params.snappleId;

    if (snapple.isPrivate === true) return;
    if (snapple.isActive === false || snapple.isBanned === true) return;
    if (!snapple.creatorId) return;

    // Look up creator's followers from their user doc.
    const creatorSnap = await db.collection('users').doc(snapple.creatorId).get();
    if (!creatorSnap.exists) return;
    const followers = creatorSnap.data()?.social?.followers || [];
    if (followers.length === 0) return;

    const creatorName = await resolveUsername(snapple.creatorId);

    for (const followerId of followers) {
      // Debounce check: is there already an unread new-snapple
      // notification from this creator to this follower? If yes,
      // update the existing one instead of firing a fresh push.
      const debounceQuery = await db.collection('users')
        .doc(followerId).collection('notifications')
        .where('type', '==', 'followed_user_snapple')
        .where('data.actorUserId', '==', snapple.creatorId)
        .where('read', '==', false)
        .limit(1)
        .get();

      if (!debounceQuery.empty) {
        // Bump the existing notification's count + latest snappleId.
        const existing = debounceQuery.docs[0];
        const existingCount = existing.data().data?.snappleCount || 1;
        const nextCount = existingCount + 1;
        await existing.ref.update({
          title: `@${creatorName}`,
          message: `Made ${nextCount} new snapples`,
          'data.snappleCount': nextCount,
          'data.snappleId': snappleId, // latest one for navigation
          createdAt: admin.firestore.Timestamp.now(),
        });
        // No push — the debounce IS the "don't buzz the phone again"
        // guarantee. The updated in-app notification is enough.
        continue;
      }

      // Fresh notification — full send.
      await deliverNotification({
        targetUserId: followerId,
        actorUserId: snapple.creatorId,
        settingsKey: 'followedUserSnapple',
        type: 'followed_user_snapple',
        title: `@${creatorName}`,
        body: 'Just made a new snapple.',
        data: { userId: snapple.creatorId, snappleId, snappleCount: 1 },
        priority: 'normal',
      });
    }
  });

// ── Prompt response-rate tracking ──
// Every new snapple bumps its prompt's lifetime response counter in
// promptPool. Response rate = responses / impressions, tracked so the
// digest notification below only fires for proven high-engagement
// prompts (not every hourly rotation — that would spam).
exports.trackPromptResponse = functions.firestore
  .document('snapples/{snappleId}')
  .onCreate(async (snap) => {
    const snapple = snap.data() || {};
    if (!snapple.promptId) return;

    // Look up the active prompt to get its textKey → promptPool link.
    const promptSnap = await db.collection('activePrompts').doc(snapple.promptId).get();
    if (!promptSnap.exists) return;
    const prompt = promptSnap.data();
    const textKey = prompt.textKey || normalizePromptText(prompt.text || '');
    if (!textKey) return;

    const poolQuery = await db.collection('promptPool')
      .where('textKey', '==', textKey)
      .limit(1)
      .get();
    if (poolQuery.empty) return;

    await poolQuery.docs[0].ref.update({
      responseCount: admin.firestore.FieldValue.increment(1),
      lastResponseAt: admin.firestore.FieldValue.serverTimestamp(),
    });
  });

// ── Prompt digest notification ──
// Fires when a new prompt enters the active pool. Only sends if the
// prompt has proven itself (response rate ≥ threshold and has been
// seen at least a few times) AND we haven't notified for this prompt
// text before (dedup via promptPool.lastNotifiedAt).
//
// deliverNotification's settings check gates every send on
// user.settings.notifications.push.newPrompts, which defaults ON —
// the frequency caps below are what keep this from being spam.
const DIGEST_MIN_IMPRESSIONS = 20;
const DIGEST_MIN_RESPONSE_RATE = 0.30;
const DIGEST_RENOTIFY_DAYS = 30;

exports.onActivePromptCreated = functions.firestore
  .document('activePrompts/{promptId}')
  .onCreate(async (snap, context) => {
    const prompt = snap.data() || {};
    const textKey = prompt.textKey || normalizePromptText(prompt.text || '');
    if (!textKey) return;

    const poolQuery = await db.collection('promptPool')
      .where('textKey', '==', textKey)
      .limit(1)
      .get();
    if (poolQuery.empty) return;

    const poolDoc = poolQuery.docs[0];
    const pool = poolDoc.data();
    const impressions = pool.impressionCount || pool.timesShown || 0;
    const responses = pool.responseCount || 0;
    const responseRate = impressions > 0 ? responses / impressions : 0;

    // Quality gate.
    if (impressions < DIGEST_MIN_IMPRESSIONS) return;
    if (responseRate < DIGEST_MIN_RESPONSE_RATE) return;

    // Dedup: skip if we notified for this prompt in the last 30 days.
    const lastNotified = pool.lastNotifiedAt?.toMillis?.() || 0;
    const ageMs = Date.now() - lastNotified;
    if (lastNotified && ageMs < DIGEST_RENOTIFY_DAYS * 24 * 60 * 60 * 1000) return;

    await poolDoc.ref.update({
      lastNotifiedAt: admin.firestore.Timestamp.now(),
    });

    // Fan-out to all users. In a large-user world this needs
    // pagination / a topic subscription pattern, but the per-user
    // settings check (deliverNotification) keeps sends cheap: users
    // who haven't opted in are dropped before any FCM cost.
    const usersQuery = await db.collection('users').get();
    const promptText = prompt.text || 'A new prompt';

    for (const userDoc of usersQuery.docs) {
      await deliverNotification({
        targetUserId: userDoc.id,
        actorUserId: null, // system-originated
        settingsKey: 'newPrompts',
        type: 'new_prompt_digest',
        title: '🔥 Hot prompt is live',
        body: promptText,
        data: { promptId: context.params.promptId },
        priority: 'normal',
      });
    }
  });
exports.renderShareVideo = require('./shareRender').renderShareVideo;
exports.getShareCard = require('./shareRender').getShareCard;
