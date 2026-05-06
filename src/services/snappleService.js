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
  arrayRemove
} from 'firebase/firestore';
import { auth, db } from './firebase';

const SNAPPLES_COLLECTION = 'snapples';
const REPORTS_COLLECTION = 'reports';
const WISHLISTS_COLLECTION = 'wishlists';

export const snappleService = {
  async createSnapple(snappleData) {
    try {
      const { promptId, videoUrl, videoId, creatorId, creatorUsername } = snappleData;
      let { prompt, category } = snappleData;

      if (!promptId || !videoUrl || !videoId || !creatorId) {
        throw new Error('Missing required snapple data');
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
        prompt,
        category: category || 'general',

        // Ownership
        owners: [],

        // Engagement metrics
        likes: 0,
        dislikes: 0,
        totalVotes: 0,
        buyCount: 0,
        wishlistCount: 0,
        reports: 0,
        
        // Pricing
        basePrice: 10, // Starting price in coins
        currentPrice: 10,
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

  async getSnapplesByPrompt(promptId, limitCount = 100) {
    try {
      if (!promptId) return { success: true, snapples: [] };

      // No orderBy on the server side — keeps us off composite-index land.
      const q = query(
        collection(db, SNAPPLES_COLLECTION),
        where('promptId', '==', promptId),
        limit(limitCount * 2)
      );

      const snap = await getDocs(q);
      const snapples = [];
      snap.forEach((d) => {
        const data = d.data();
        if (data.isActive === true && data.isBanned !== true) {
          snapples.push({ id: d.id, ...data });
        }
      });

      snapples.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
      return { success: true, snapples: snapples.slice(0, limitCount) };
    } catch (error) {
      console.error('[SnappleService] getSnapplesByPrompt error:', error);
      return { success: false, error: 'Failed to fetch prompt snapples' };
    }
  },

  async getActiveSnapples(limitCount = 20) {
    try {
      // Simplified query to avoid composite index requirement
      const q = query(
        collection(db, SNAPPLES_COLLECTION),
        orderBy('createdAt', 'desc'),
        limit(limitCount * 2) // Get more to filter client-side
      );
      
      const querySnapshot = await getDocs(q);
      const snapples = [];
      
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Filter client-side to avoid index requirement
        if (data.isActive === true && data.isBanned !== true) {
          snapples.push({ id: doc.id, ...data });
        }
      });
      
      // Limit results after filtering
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
        // Filter client-side to avoid index requirement
        if (data.isActive === true && data.isBanned !== true) {
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

  async likeSnapple(snappleId, userId) {
    try {
      const snappleRef = doc(db, SNAPPLES_COLLECTION, snappleId);
      
      // Check if user already interacted
      const userInteraction = await this.getUserInteraction(snappleId, userId);
      if (userInteraction.hasLiked) {
        return { success: false, error: 'Already liked this snapple' };
      }
      
      const updates = {
        likes: increment(1),
        totalVotes: increment(1),
        updatedAt: serverTimestamp()
      };
      
      // If user previously disliked, remove dislike
      if (userInteraction.hasDisliked) {
        updates.dislikes = increment(-1);
        updates.totalVotes = increment(0); // Net zero since we're switching
      }
      
      await updateDoc(snappleRef, updates);
      await this.setUserInteraction(snappleId, userId, 'like');

      return { success: true };
    } catch (error) {
      console.error('Error liking snapple:', error);
      return { success: false, error: 'Failed to like snapple' };
    }
  },

  async dislikeSnapple(snappleId, userId) {
    try {
      const snappleRef = doc(db, SNAPPLES_COLLECTION, snappleId);
      
      // Check if user already interacted
      const userInteraction = await this.getUserInteraction(snappleId, userId);
      if (userInteraction.hasDisliked) {
        return { success: false, error: 'Already disliked this snapple' };
      }
      
      const updates = {
        dislikes: increment(1),
        totalVotes: increment(1),
        updatedAt: serverTimestamp()
      };
      
      // If user previously liked, remove like
      if (userInteraction.hasLiked) {
        updates.likes = increment(-1);
        updates.totalVotes = increment(0); // Net zero since we're switching
      }
      
      await updateDoc(snappleRef, updates);
      await this.setUserInteraction(snappleId, userId, 'dislike');
      
      return { success: true };
    } catch (error) {
      console.error('Error disliking snapple:', error);
      return { success: false, error: 'Failed to dislike snapple' };
    }
  },

  async addToWishlist(snappleId, userId) {
    try {
      const wishlistRef = doc(db, WISHLISTS_COLLECTION, `${userId}_${snappleId}`);
      await setDoc(wishlistRef, {
        userId,
        snappleId,
        addedAt: serverTimestamp()
      });
      
      // Update snapple wishlist count
      const snappleRef = doc(db, SNAPPLES_COLLECTION, snappleId);
      await updateDoc(snappleRef, {
        wishlistCount: increment(1),
        updatedAt: serverTimestamp()
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error adding to wishlist:', error);
      return { success: false, error: 'Failed to add to wishlist' };
    }
  },

  async removeFromWishlist(snappleId, userId) {
    try {
      const wishlistRef = doc(db, WISHLISTS_COLLECTION, `${userId}_${snappleId}`);
      await deleteDoc(wishlistRef);
      
      // Update snapple wishlist count
      const snappleRef = doc(db, SNAPPLES_COLLECTION, snappleId);
      await updateDoc(snappleRef, {
        wishlistCount: increment(-1),
        updatedAt: serverTimestamp()
      });
      
      return { success: true };
    } catch (error) {
      console.error('Error removing from wishlist:', error);
      return { success: false, error: 'Failed to remove from wishlist' };
    }
  },

  async getUserWishlist(userId) {
    try {
      const q = query(
        collection(db, WISHLISTS_COLLECTION),
        where('userId', '==', userId),
        orderBy('addedAt', 'desc')
      );
      
      const querySnapshot = await getDocs(q);
      const wishlistItems = [];
      
      for (const doc of querySnapshot.docs) {
        const wishlistData = doc.data();
        const snappleResult = await this.getSnapple(wishlistData.snappleId);
        
        if (snappleResult.success) {
          wishlistItems.push({
            ...wishlistData,
            snapple: snappleResult.snapple
          });
        }
      }
      
      return { success: true, wishlist: wishlistItems };
    } catch (error) {
      console.error('Error fetching user wishlist:', error);
      return { success: false, error: 'Failed to fetch wishlist' };
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

  // Helper methods for user interactions
  async getUserInteraction(snappleId, userId) {
    try {
      // Check user's like/dislike status (stored in a separate collection)
      const interactionRef = doc(db, 'user_interactions', `${userId}_${snappleId}`);
      const interactionDoc = await getDoc(interactionRef);
      
      if (interactionDoc.exists()) {
        const data = interactionDoc.data();
        return {
          hasLiked: data.type === 'like',
          hasDisliked: data.type === 'dislike',
          interaction: data
        };
      }
      
      return { hasLiked: false, hasDisliked: false, interaction: null };
    } catch (error) {
      console.error('Error checking user interaction:', error);
      return { hasLiked: false, hasDisliked: false, interaction: null };
    }
  },

  async setUserInteraction(snappleId, userId, type) {
    try {
      const interactionRef = doc(db, 'user_interactions', `${userId}_${snappleId}`);
      await setDoc(interactionRef, {
        userId,
        snappleId,
        type, // 'like' or 'dislike'
        timestamp: serverTimestamp()
      });
    } catch (error) {
      console.error('Error setting user interaction:', error);
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

      // Check if anyone else owns it
      const owners = (data.owners || []).filter(id => id !== userId);
      if (owners.length > 0) {
        // Others own it — refund all buyers and then delete
        await this.refundBuyers(snappleId, data);
        await deleteDoc(snappleRef);
        return { success: true, note: 'Snapple deleted, buyers refunded' };
      }

      // Nobody else owns it — fully delete
      await deleteDoc(snappleRef);

      // Also delete video from storage
      try {
        const { ref: storageRef, deleteObject } = await import('firebase/storage');
        const { storage } = await import('./firebase');
        if (data.videoUrl) {
          const videoRef = storageRef(storage, `videos/${userId}/${data.videoId || ''}.mp4`);
          await deleteObject(videoRef).catch(() => {});
        }
      } catch (e) {
        console.error('[SnappleService] Error deleting video file:', e);
      }

      return { success: true };
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

  async unlikeSnapple(snappleId, userId) {
    try {
      const interactionRef = doc(db, 'user_interactions', `${userId}_${snappleId}`);
      const interactionDoc = await getDoc(interactionRef);

      if (interactionDoc.exists()) {
        const type = interactionDoc.data().type;
        const snappleRef = doc(db, SNAPPLES_COLLECTION, snappleId);

        await updateDoc(snappleRef, {
          [type === 'like' ? 'likes' : 'dislikes']: increment(-1),
          totalVotes: increment(-1),
          updatedAt: serverTimestamp()
        });
        await deleteDoc(interactionRef);
      }

      return { success: true };
    } catch (error) {
      console.error('Error unliking snapple:', error);
      return { success: false, error: 'Failed to remove interaction' };
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