// snappleService.js
// Firestore CRUD + community queries for the `snapples` collection.
// Owns snapple lifecycle: create, fetch (per-creator / per-prompt /
// trending / active pool), engagement (likes, dislikes, wishlist,
// reports), and visibility (public vs. private). Public-feed queries
// filter out `isPrivate === true` so private snapples only surface on
// the creator's own profile and in their own owned-snapples hand.

import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  increment,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase';

const SNAPPLES_COLLECTION = 'snapples';
const REPORTS_COLLECTION = 'reports';
const USERS_COLLECTION = 'users';

export const snappleService = {
  async createSnapple(snappleData) {
    try {
      const { promptId, videoUrl, videoId, creatorId, filename, fileSize, mimeType } = snappleData;
      let { creatorUsername, prompt, category } = snappleData;

      if (!promptId || !videoUrl || !videoId || !creatorId) {
        throw new Error('Missing required snapple data');
      }

      // Auto-lookup username from the creator's user doc if the
      // caller didn't provide one (or fell back to the "anonymous"
      // placeholder because their in-memory user object was stale).
      // Prevents snapples from displaying as @anon forever.
      if (!creatorUsername || creatorUsername === 'anonymous') {
        try {
          const userDoc = await getDoc(doc(db, 'users', creatorId));
          if (userDoc.exists()) {
            const data = userDoc.data();
            creatorUsername = data.username || data.displayName || creatorUsername || 'anonymous';
          }
        } catch (e) {
          console.warn('[createSnapple] user lookup for creatorUsername failed:', e);
        }
      }

      // Backfill prompt text from the prompt doc if missing or default
      if (!prompt || prompt === 'Snapple video' || prompt === 'Snapple Video') {
        try {
          const promptDoc = await getDoc(doc(db, 'activePrompts', promptId));
          if (promptDoc.exists()) {
            const data = promptDoc.data();
            prompt = data.text || prompt;
            if (!category || category === 'general') category = data.category || category;
          }
        } catch (e) {
          console.warn('[createSnapple] failed to backfill prompt text:', e);
        }
      }

      if (!prompt) {
        throw new Error('Missing prompt text');
      }

      const snappleDoc = {
        // Core data
        creatorId,
        creatorUsername: creatorUsername || 'anonymous',
        promptId,
        videoId,
        videoUrl,
        // Video file metadata — used by admin cleanup to locate the
        // Storage object without a separate `videos` collection lookup.
        filename: filename || null,
        fileSize: fileSize || 0,
        mimeType: mimeType || 'video/mp4',
        prompt,
        category: category || 'general',

        // Ownership + interaction inverse indexes. Every relationship
        // is denormalized 2-way (mirror array on user doc):
        //   snapple.owners        ⇄ user.ownedSnapples
        //   snapple.wishlistedBy  ⇄ user.wishlistedSnapples
        //   snapple.likedBy       ⇄ user.likedSnapples
        //   snapple.dislikedBy    ⇄ user.dislikedSnapples
        // Reads become free in both directions; the inverse index also
        // lets `deleteSnapple` cascade cleanup to every touched user
        // doc so wishlisters / likers don't end up with ghost ids.
        owners: [creatorId],
        wishlistedBy: [],
        likedBy: [],
        dislikedBy: [],

        // Engagement counters — kept alongside the inverse arrays so
        // display code can read a number without loading the array's
        // full length. Mutations write both atomically via WriteBatch.
        likes: 0,
        dislikes: 0,
        totalVotes: 0,
        buyCount: 0,
        reports: 0,
        gamesPlayed: 0,
        gamesWon: 0,

        // Reviver perk: floats this snapple to the top of its prompt's grid
        // until this timestamp, then sorts normally. Null if no boost.
        boostedUntil: snappleData.boostedUntil || null,

        // Creator preference: when true, players hear silence on this
        // snapple. Useful for visual-only content (graffiti, art, etc.).
        muted: !!snappleData.muted,

        // Visibility: when true, the snapple is hidden from public
        // feeds (prompt grid, trending, marketplace, community game
        // pool) and not purchasable. Only the creator sees it on their
        // profile and can play it from their own owned hand. Toggleable
        // post-create via setSnapplePrivacy().
        isPrivate: !!snappleData.isPrivate,

        // Admin quality gate. When true, the snapple is excluded from
        // the automatic community pool used for BOT picks and for
        // padding the hands of players whose own deck is too small
        // (practice mode / no-deck players). It is STILL browsable,
        // buyable, ownable, and playable from anyone's own deck — the
        // creator and owners never lose access. Used by admins to keep
        // low-quality cards out of the default-game experience until
        // a strong "champion" pool exists. Toggleable via
        // setSnappleExcludeFromPool() (admin-only check).
        excludeFromPool: !!snappleData.excludeFromPool,

        // Pricing
        // Starting price = tier 1 price so the first buy doesn't
        // jump 10 → 100. Snapples list at 100 and stay at 100 until
        // buy 11 (tier 2). Cloud Function's getTierPrice takes over
        // from there.
        basePrice: 100,
        currentPrice: 100,
        priceHistory: [{ price: 10, timestamp: new Date().toISOString() }],
        
        // Status
        isActive: true,
        isReported: false,
        isBanned: false,
        moderationStatus: 'approved', // approved, pending, rejected
        
        // Timestamps
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        expiresAt: null // Will be set based on prompt expiration
      };

      const snappleRef = doc(collection(db, SNAPPLES_COLLECTION));
      await setDoc(snappleRef, snappleDoc);
      
      return {
        success: true,
        snappleId: snappleRef.id,
        snapple: { id: snappleRef.id, ...snappleDoc }
      };
    } catch (error) {
      console.error('Error creating snapple:', error);
      return {
        success: false,
        error: error.message || 'Failed to create snapple'
      };
    }
  },

  async getSnapple(snappleId) {
    try {
      const snappleDoc = await getDoc(doc(db, SNAPPLES_COLLECTION, snappleId));
      
      if (!snappleDoc.exists()) {
        return { success: false, error: 'Snapple not found' };
      }
      
      return {
        success: true,
        snapple: { id: snappleDoc.id, ...snappleDoc.data() }
      };
    } catch (error) {
      console.error('Error fetching snapple:', error);
      return { success: false, error: 'Failed to fetch snapple' };
    }
  },

  async getSnapplesByCreator(creatorId, limitCount = 200) {
    try {
      if (!creatorId) return { success: true, snapples: [] };
      const q = query(
        collection(db, SNAPPLES_COLLECTION),
        where('creatorId', '==', creatorId),
        limit(limitCount)
      );
      const snap = await getDocs(q);
      const snapples = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.isActive !== false && data.isBanned !== true) {
          snapples.push({ id: d.id, ...data });
        }
      });
      // Sort newest first, tolerant of both ISO strings (current)
      // and legacy Firestore Timestamp objects (older docs). Calling
      // localeCompare on a Timestamp throws — that used to silently
      // wipe the whole result via the outer try/catch.
      const toKey = (v) => {
        if (typeof v === 'string') return v;
        if (v && typeof v.toDate === 'function') {
          try { return v.toDate().toISOString(); } catch (e) { return ''; }
        }
        if (typeof v === 'number') return new Date(v).toISOString();
        return '';
      };
      snapples.sort((a, b) => toKey(b.createdAt).localeCompare(toKey(a.createdAt)));
      return { success: true, snapples };
    } catch (error) {
      console.error('[SnappleService] getSnapplesByCreator error:', error);
      return { success: false, error: error.message || 'Failed to fetch creator snapples' };
    }
  },

  async getSnapplesByPrompt(promptId, promptText, limitCount = 100) {
    try {
      if (!promptId && !promptText) return { success: true, snapples: [] };

      // Query by promptId AND promptText so snapples persist across prompt
      // recycles. When a prompt expires and a new one with the same text comes
      // back, the new prompt has a fresh doc id but the existing snapples'
      // prompt field still matches the text — they show up on the new prompt.
      const queries = [];
      if (promptId) {
        queries.push(getDocs(query(
          collection(db, SNAPPLES_COLLECTION),
          where('promptId', '==', promptId),
          limit(limitCount * 2),
        )));
      }
      if (promptText) {
        queries.push(getDocs(query(
          collection(db, SNAPPLES_COLLECTION),
          where('prompt', '==', promptText),
          limit(limitCount * 2),
        )));
      }

      const results = await Promise.all(queries);
      const byId = new Map();
      results.forEach(snap => snap.forEach(d => {
        const data = d.data();
        // Private snapples never appear in public prompt grids.
        // (excludeFromPool is NOT checked here — that flag only gates
        // the bot/practice pool in getActiveSnapples; cards stay
        // browsable, ownable, and buyable from the prompt grid.)
        if (data.isActive !== false && data.isBanned !== true && data.isPrivate !== true) {
          byId.set(d.id, { id: d.id, ...data });
        }
      }));
      const snapples = Array.from(byId.values());
      // Sort: still-boosted first (newest boost wins among them), then by
      // createdAt desc. The reviver's perk floats their snapple to the top
      // until boostedUntil expires.
      const nowISO = new Date().toISOString();
      const isBoosted = (s) => !!s.boostedUntil && s.boostedUntil > nowISO;
      snapples.sort((a, b) => {
        const ab = isBoosted(a);
        const bb = isBoosted(b);
        if (ab !== bb) return ab ? -1 : 1;
        return (b.createdAt || '').localeCompare(a.createdAt || '');
      });
      return { success: true, snapples: snapples.slice(0, limitCount) };
    } catch (error) {
      console.error('[SnappleService] getSnapplesByPrompt error:', error);
      return { success: false, error: 'Failed to fetch prompt snapples' };
    }
  },

  // Returns active community-pool snapples for the game hand and bot
  // picks. Pulls a wide net (no server-side orderBy, generous limit) so
  // legacy docs missing createdAt and older docs alike are eligible —
  // we want every active snapple in the collection, not just the most
  // recent. Sorted by totalVotes desc so practice/bot picks lean toward
  // crowd-favorite cards. Unpopular cards still get in until we exceed
  // the limit budget.
  async getActiveSnapples(limitCount = 200) {
    try {
      const q = query(
        collection(db, SNAPPLES_COLLECTION),
        limit(2000),
      );

      const querySnapshot = await getDocs(q);
      const snapples = [];

      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Pool filters: private snapples (creator opted out of public
        // visibility), and excludeFromPool snapples (admin quality gate
        // — see schema comment in createSnapple). Both stay playable
        // from the creator's / owner's own deck via drawHand-from-
        // ownedSnapples; this filter only governs what BOTS draw and
        // what pads the hands of players whose own deck is too small.
        if (
          data.isActive !== false &&
          data.isBanned !== true &&
          data.isPrivate !== true &&
          data.excludeFromPool !== true
        ) {
          snapples.push({ id: doc.id, ...data });
        }
      });

      snapples.sort((a, b) => (b.totalVotes || 0) - (a.totalVotes || 0));

      return { success: true, snapples: snapples.slice(0, limitCount) };
    } catch (error) {
      console.error('Error fetching active snapples:', error);
      return { success: false, error: 'Failed to fetch snapples' };
    }
  },

  async getTrendingSnapples(limitCount = 10) {
    try {
      // Simplified query to avoid composite index requirement
      const q = query(
        collection(db, SNAPPLES_COLLECTION),
        orderBy('totalVotes', 'desc'),
        limit(limitCount * 2) // Get more to filter client-side
      );
      
      const querySnapshot = await getDocs(q);
      const snapples = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Filter client-side to avoid index requirement. Private
        // snapples are not eligible for the trending / marketplace
        // surface since they can't be bought.
        if (data.isActive !== false && data.isBanned !== true && data.isPrivate !== true) {
          snapples.push({ id: doc.id, ...data });
        }
      });

      // Sort by engagement metrics and limit results
      snapples.sort((a, b) => {
        const aScore = (a.totalVotes || 0) + (a.buyCount || 0) * 2;
        const bScore = (b.totalVotes || 0) + (b.buyCount || 0) * 2;
        return bScore - aScore;
      });
      
      return { success: true, snapples: snapples.slice(0, limitCount) };
    } catch (error) {
      console.error('Error fetching trending snapples:', error);
      return { success: false, error: 'Failed to fetch trending snapples' };
    }
  },

  // setSnappleReaction — single entry point for like / dislike /
  // clear. Batched write updates BOTH sides of the 2-way index
  // atomically (snapple.likedBy + snapple.likes counter +
  // user.likedSnapples, same for dislikes). Caller passes
  // `currentType` so we know what to undo — read it from
  // snapple.likedBy?.includes(myUid) / snapple.dislikedBy?.includes(myUid)
  // on the client, no extra Firestore read needed.
  //
  //   targetType  'like' | 'dislike' | null   what the user wants now
  //   currentType 'like' | 'dislike' | null   what they had before
  async setSnappleReaction(snappleId, userId, targetType, currentType) {
    try {
      if (!snappleId || !userId) {
        return { success: false, error: 'Missing snappleId or userId' };
      }
      if (targetType === currentType) return { success: true };

      const batch = writeBatch(db);
      const snappleRef = doc(db, SNAPPLES_COLLECTION, snappleId);
      const userRef = doc(db, USERS_COLLECTION, userId);
      const snappleUpdates = { updatedAt: serverTimestamp() };
      const userUpdates = { updatedAt: serverTimestamp() };

      // Undo the old reaction (if any).
      if (currentType === 'like') {
        snappleUpdates.likedBy = arrayRemove(userId);
        snappleUpdates.likes = increment(-1);
        userUpdates.likedSnapples = arrayRemove(snappleId);
      } else if (currentType === 'dislike') {
        snappleUpdates.dislikedBy = arrayRemove(userId);
        snappleUpdates.dislikes = increment(-1);
        userUpdates.dislikedSnapples = arrayRemove(snappleId);
      }
      // Apply the new reaction (if any). Different array from the
      // undo above so field-level conflicts can't happen.
      if (targetType === 'like') {
        snappleUpdates.likedBy = arrayUnion(userId);
        snappleUpdates.likes = increment(1);
        userUpdates.likedSnapples = arrayUnion(snappleId);
      } else if (targetType === 'dislike') {
        snappleUpdates.dislikedBy = arrayUnion(userId);
        snappleUpdates.dislikes = increment(1);
        userUpdates.dislikedSnapples = arrayUnion(snappleId);
      }
      // totalVotes: +1 null→reaction, -1 reaction→null, 0 switching
      if (!currentType && targetType) snappleUpdates.totalVotes = increment(1);
      if (currentType && !targetType) snappleUpdates.totalVotes = increment(-1);

      batch.update(snappleRef, snappleUpdates);
      batch.update(userRef, userUpdates);
      await batch.commit();
      return { success: true };
    } catch (error) {
      console.error('[SnappleService] setSnappleReaction error:', error);
      return { success: false, error: error.message || 'Failed to set reaction' };
    }
  },

  // Convenience wrappers so SnappleOverlay reads clean.
  async likeSnapple(snappleId, userId, currentType = null) {
    return this.setSnappleReaction(snappleId, userId, 'like', currentType);
  },
  async dislikeSnapple(snappleId, userId, currentType = null) {
    return this.setSnappleReaction(snappleId, userId, 'dislike', currentType);
  },
  async unlikeSnapple(snappleId, userId, currentType = null) {
    return this.setSnappleReaction(snappleId, userId, null, currentType);
  },

  // setSnappleWishlist — batched 2-way write. Wanted true = save,
  // false = unsave. Caller passes `currentlyWanted` derived from
  // user.wishlistedSnapples?.includes(id) on the client so no extra
  // read is needed to figure out which direction to write.
  async setSnappleWishlist(snappleId, userId, wanted, currentlyWanted) {
    try {
      if (!snappleId || !userId) {
        return { success: false, error: 'Missing snappleId or userId' };
      }
      if (!!wanted === !!currentlyWanted) return { success: true };

      const batch = writeBatch(db);
      const snappleRef = doc(db, SNAPPLES_COLLECTION, snappleId);
      const userRef = doc(db, USERS_COLLECTION, userId);
      if (wanted) {
        batch.update(snappleRef, {
          wishlistedBy: arrayUnion(userId),
          updatedAt: serverTimestamp(),
        });
        batch.update(userRef, {
          wishlistedSnapples: arrayUnion(snappleId),
          updatedAt: serverTimestamp(),
        });
      } else {
        batch.update(snappleRef, {
          wishlistedBy: arrayRemove(userId),
          updatedAt: serverTimestamp(),
        });
        batch.update(userRef, {
          wishlistedSnapples: arrayRemove(snappleId),
          updatedAt: serverTimestamp(),
        });
      }
      await batch.commit();
      return { success: true };
    } catch (error) {
      console.error('[SnappleService] setSnappleWishlist error:', error);
      return { success: false, error: error.message || 'Failed to save' };
    }
  },

  async reportSnapple(snappleId, userId, reason, description = '') {
    try {
      const reportDoc = {
        snappleId,
        reporterId: userId,
        reason, // 'inappropriate', 'spam', 'copyright', 'other'
        description,
        status: 'pending', // pending, reviewed, resolved
        createdAt: serverTimestamp()
      };
      
      const reportRef = doc(collection(db, REPORTS_COLLECTION));
      await setDoc(reportRef, reportDoc);
      
      // Update snapple report count
      const snappleRef = doc(db, SNAPPLES_COLLECTION, snappleId);
      await updateDoc(snappleRef, {
        reports: increment(1),
        isReported: true,
        updatedAt: serverTimestamp()
      });
      
      return { success: true, reportId: reportRef.id };
    } catch (error) {
      console.error('Error reporting snapple:', error);
      return { success: false, error: 'Failed to report snapple' };
    }
  },

  async purchaseSnapple(snappleId, userId) {
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('./firebase');
      const purchaseFn = httpsCallable(functions, 'purchaseSnapple');
      const result = await purchaseFn({ snappleId });
      return result.data;
    } catch (error) {
      console.error('Error purchasing snapple:', error);
      const message = error?.message || 'Failed to purchase snapple';
      if (message.includes('Not enough coins')) {
        return { success: false, error: 'Not enough coins' };
      }
      if (message.includes('Already owned')) {
        return { success: false, error: 'You already own this snapple' };
      }
      return { success: false, error: message };
    }
  },

  // Admin-only: toggle whether this snapple is allowed in the
  // bot/practice community pool (getActiveSnapples). Does not affect
  // visibility on prompt grids, ownership, marketplace, or any other
  // surface — purely a curation lever on the automatic-pool source.
  // ADMIN_UIDS is hardcoded across screens for now (see AdminScreen,
  // GameScreen, UserMenu) — keep this list in sync if it ever moves
  // into a shared constants file.
  async setSnappleExcludeFromPool(snappleId, userId, excludeFromPool) {
    try {
      const ADMIN_UIDS = ['SrB8T1TmftQzu90H7phQkRJXkRn2'];
      if (!ADMIN_UIDS.includes(userId)) {
        return { success: false, error: 'Admin only' };
      }
      const snappleRef = doc(db, SNAPPLES_COLLECTION, snappleId);
      const snappleDoc = await getDoc(snappleRef);
      if (!snappleDoc.exists()) {
        return { success: false, error: 'Snapple not found' };
      }
      await updateDoc(snappleRef, {
        excludeFromPool: !!excludeFromPool,
        updatedAt: serverTimestamp(),
      });
      return { success: true, excludeFromPool: !!excludeFromPool };
    } catch (error) {
      console.error('Error toggling excludeFromPool:', error);
      return { success: false, error: 'Failed to update pool exclusion' };
    }
  },

  // Toggle a snapple's muted state. Only the creator can change it.
  // Mute is a creator-side artistic call — applies to ALL playbacks
  // (home, game, voting, owners' decks) since the muted field is read
  // directly by players. No per-owner override. Doesn't affect any
  // other state (visibility, ownership, stats).
  async setSnappleMuted(snappleId, userId, muted) {
    try {
      const snappleRef = doc(db, SNAPPLES_COLLECTION, snappleId);
      const snappleDoc = await getDoc(snappleRef);

      if (!snappleDoc.exists()) {
        return { success: false, error: 'Snapple not found' };
      }
      if (snappleDoc.data().creatorId !== userId) {
        return { success: false, error: 'Only the creator can change mute' };
      }

      await updateDoc(snappleRef, {
        muted: !!muted,
        updatedAt: serverTimestamp(),
      });
      return { success: true, muted: !!muted };
    } catch (error) {
      console.error('Error toggling snapple muted:', error);
      return { success: false, error: 'Failed to update mute' };
    }
  },

  // Toggle a snapple's public/private visibility. Only the creator can
  // change it. Switching to private hides it from prompt feeds,
  // trending, and the community game pool; switching to public exposes
  // it again. Does NOT affect engagement stats or ownership.
  async setSnapplePrivacy(snappleId, userId, isPrivate) {
    try {
      const snappleRef = doc(db, SNAPPLES_COLLECTION, snappleId);
      const snappleDoc = await getDoc(snappleRef);

      if (!snappleDoc.exists()) {
        return { success: false, error: 'Snapple not found' };
      }
      if (snappleDoc.data().creatorId !== userId) {
        return { success: false, error: 'Only the creator can change privacy' };
      }

      await updateDoc(snappleRef, {
        isPrivate: !!isPrivate,
        updatedAt: serverTimestamp(),
      });
      return { success: true, isPrivate: !!isPrivate };
    } catch (error) {
      console.error('Error toggling snapple privacy:', error);
      return { success: false, error: 'Failed to update privacy' };
    }
  },

  // cleanupSnappleReferences — before deleting a snapple, iterate
  // its inverse-index arrays (wishlistedBy, likedBy, dislikedBy,
  // owners) and arrayRemove the snappleId from each touched user's
  // corresponding forward-index array. Prevents ghost ids surviving
  // on user docs after a snapple deletion. Batched per user to keep
  // writes atomic per doc.
  async cleanupSnappleReferences(snappleId, snappleData) {
    try {
      const wishlisters = snappleData.wishlistedBy || [];
      const likers = snappleData.likedBy || [];
      const dislikers = snappleData.dislikedBy || [];
      const owners = snappleData.owners || [];
      const touched = new Set([...wishlisters, ...likers, ...dislikers, ...owners]);

      for (const uid of touched) {
        const updates = { updatedAt: serverTimestamp() };
        if (wishlisters.includes(uid)) updates.wishlistedSnapples = arrayRemove(snappleId);
        if (likers.includes(uid)) updates.likedSnapples = arrayRemove(snappleId);
        if (dislikers.includes(uid)) updates.dislikedSnapples = arrayRemove(snappleId);
        if (owners.includes(uid)) updates.ownedSnapples = arrayRemove(snappleId);
        await updateDoc(doc(db, USERS_COLLECTION, uid), updates).catch(() => {});
      }
    } catch (error) {
      console.error('[SnappleService] cleanupSnappleReferences error:', error);
    }
  },

  async deleteSnapple(snappleId, userId) {
    try {
      const snappleRef = doc(db, SNAPPLES_COLLECTION, snappleId);
      const snappleDoc = await getDoc(snappleRef);

      if (!snappleDoc.exists()) {
        return { success: false, error: 'Snapple not found' };
      }

      const data = snappleDoc.data();
      if (data.creatorId !== userId) {
        return { success: false, error: 'Only the creator can delete this snapple' };
      }

      // Cascade: clear this snappleId out of every user's forward
      // indexes (owned / wishlisted / liked / disliked) BEFORE deleting
      // the doc so users don't end up with ghost ids. Runs regardless
      // of whether there are other owners — refunded buyers still need
      // their ownedSnapples arrays cleaned.
      await this.cleanupSnappleReferences(snappleId, data);

      // Refund any other buyers first so their coins are back before
      // the source doc disappears.
      const otherOwners = (data.owners || []).filter(id => id !== userId);
      if (otherOwners.length > 0) {
        await this.refundBuyers(snappleId, data);
      }

      // Full nuke — doc + Storage file. Runs in both branches so the
      // .mp4 never orphans in the bucket (used to only delete the file
      // when nobody else owned it, which left buyer-owned videos as
      // paid-for storage nobody could ever play).
      await deleteDoc(snappleRef);
      try {
        const { ref: storageRef, deleteObject } = await import('firebase/storage');
        const { storage } = await import('./firebase');
        const path = data.filename || (data.videoId ? `videos/${userId}/${data.videoId}.mp4` : null);
        if (path) {
          await deleteObject(storageRef(storage, path)).catch(() => {});
        }
      } catch (e) {
        console.error('[SnappleService] Error deleting video file:', e);
      }

      return otherOwners.length > 0
        ? { success: true, note: 'Snapple deleted, buyers refunded' }
        : { success: true };
    } catch (error) {
      console.error('Error deleting snapple:', error);
      return { success: false, error: 'Failed to delete snapple' };
    }
  },

  async refundBuyers(snappleId, snappleData) {
    try {
      const purchases = (snappleData.priceHistory || []).filter(p => p.buyer);

      for (const purchase of purchases) {
        if (!purchase.buyer || purchase.buyer === snappleData.creatorId) continue;

        const buyerRef = doc(db, 'users', purchase.buyer);
        await updateDoc(buyerRef, {
          'resources.coins': increment(purchase.price || 0),
          ownedSnapples: arrayRemove(snappleId),
          updatedAt: serverTimestamp(),
        }).catch(() => {});

        // Log the refund
        await setDoc(doc(collection(db, 'refunds')), {
          snappleId,
          buyerId: purchase.buyer,
          amount: purchase.price || 0,
          reason: 'creator_deleted',
          createdAt: serverTimestamp(),
        }).catch(() => {});
      }

      console.log(`[SnappleService] Refunded ${purchases.length} buyers for snapple ${snappleId}`);
    } catch (error) {
      console.error('[SnappleService] Error refunding buyers:', error);
    }
  },

  async incrementViews(snappleId) {
    try {
      const snappleRef = doc(db, SNAPPLES_COLLECTION, snappleId);
      await updateDoc(snappleRef, {
        views: increment(1),
        updatedAt: serverTimestamp()
      });
      return { success: true };
    } catch (error) {
      console.error('Error incrementing views:', error);
      return { success: false };
    }
  }
};

export default snappleService;