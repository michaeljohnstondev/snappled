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
      const { promptId, videoUrl, videoId, creatorId, prompt } = snappleData;
      
      if (!promptId || !videoUrl || !videoId || !creatorId || !prompt) {
        throw new Error('Missing required snapple data');
      }

      const snappleDoc = {
        // Core data
        creatorId,
        promptId,
        videoId,
        videoUrl,
        prompt,
        
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
        priceHistory: [{ price: 10, timestamp: serverTimestamp() }],
        
        // Status
        isActive: true,
        isReported: false,
        isBanned: false,
        moderationStatus: 'approved', // approved, pending, rejected
        
        // Timestamps
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
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

  async getActiveSnapples(limitCount = 20) {
    try {
      const q = query(
        collection(db, SNAPPLES_COLLECTION),
        where('isActive', '==', true),
        where('isBanned', '==', false),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      
      const querySnapshot = await getDocs(q);
      const snapples = [];
      
      querySnapshot.forEach((doc) => {
        snapples.push({ id: doc.id, ...doc.data() });
      });
      
      return { success: true, snapples };
    } catch (error) {
      console.error('Error fetching active snapples:', error);
      return { success: false, error: 'Failed to fetch snapples' };
    }
  },

  async getTrendingSnapples(limitCount = 10) {
    try {
      const q = query(
        collection(db, SNAPPLES_COLLECTION),
        where('isActive', '==', true),
        where('isBanned', '==', false),
        orderBy('totalVotes', 'desc'),
        orderBy('buyCount', 'desc'),
        limit(limitCount)
      );
      
      const querySnapshot = await getDocs(q);
      const snapples = [];
      
      querySnapshot.forEach((doc) => {
        snapples.push({ id: doc.id, ...doc.data() });
      });
      
      return { success: true, snapples };
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

  async purchaseSnapple(snappleId, userId, priceMultiplier = 1.15) {
    try {
      const snappleRef = doc(db, SNAPPLES_COLLECTION, snappleId);
      const snappleDoc = await getDoc(snappleRef);
      
      if (!snappleDoc.exists()) {
        return { success: false, error: 'Snapple not found' };
      }
      
      const snappleData = snappleDoc.data();
      const newBuyCount = snappleData.buyCount + 1;
      const newPrice = Math.ceil(snappleData.basePrice * Math.pow(priceMultiplier, newBuyCount));
      
      // Update snapple with new stats and price
      await updateDoc(snappleRef, {
        buyCount: increment(1),
        currentPrice: newPrice,
        priceHistory: arrayUnion({
          price: snappleData.currentPrice,
          buyCount: newBuyCount,
          timestamp: serverTimestamp()
        }),
        updatedAt: serverTimestamp()
      });
      
      return {
        success: true,
        purchasePrice: snappleData.currentPrice,
        newPrice: newPrice
      };
    } catch (error) {
      console.error('Error purchasing snapple:', error);
      return { success: false, error: 'Failed to purchase snapple' };
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
  }
};

export default snappleService;