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
  limit as firestoreLimit,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  onSnapshot,
  runTransaction
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { notificationService } from './notificationService';

const FOLLOWS_COLLECTION = 'follows';
const ACTIVITY_COLLECTION = 'activity';
const USER_PROFILES_COLLECTION = 'user_profiles';

export const socialService = {
  async followUser(targetUserId) {
    try {
      if (!auth.currentUser) {
        throw new Error('Must be logged in to follow users');
      }

      if (auth.currentUser.uid === targetUserId) {
        throw new Error('Cannot follow yourself');
      }

      return await runTransaction(db, async (transaction) => {
        const followId = `${auth.currentUser.uid}_${targetUserId}`;
        const followRef = doc(db, FOLLOWS_COLLECTION, followId);
        const followDoc = await transaction.get(followRef);

        if (followDoc.exists()) {
          throw new Error('Already following this user');
        }

        // Create follow relationship
        transaction.set(followRef, {
          followerId: auth.currentUser.uid,
          followerUsername: auth.currentUser.displayName || 'Anonymous',
          followedId: targetUserId,
          createdAt: serverTimestamp()
        });

        // Update follower count for target user
        const targetUserRef = doc(db, 'users', targetUserId);
        transaction.update(targetUserRef, {
          'social.followerCount': increment(1),
          updatedAt: serverTimestamp()
        });

        // Update following count for current user
        const currentUserRef = doc(db, 'users', auth.currentUser.uid);
        transaction.update(currentUserRef, {
          'social.followingCount': increment(1),
          updatedAt: serverTimestamp()
        });

        // Create activity entry
        const activityRef = doc(collection(db, ACTIVITY_COLLECTION));
        transaction.set(activityRef, {
          userId: auth.currentUser.uid,
          username: auth.currentUser.displayName || 'Anonymous',
          type: 'follow',
          targetId: targetUserId,
          createdAt: serverTimestamp()
        });

        return { success: true };
      });
    } catch (error) {
      console.error('Error following user:', error);
      
      // Create notification for the followed user
      if (error.message !== 'Already following this user' && error.message !== 'Cannot follow yourself') {
        await notificationService.notifyFollow(
          auth.currentUser.uid,
          auth.currentUser.displayName || 'Anonymous',
          targetUserId
        );
      }
      
      return {
        success: false,
        error: error.message || 'Failed to follow user'
      };
    }
  },

  async unfollowUser(targetUserId) {
    try {
      if (!auth.currentUser) {
        throw new Error('Must be logged in to unfollow users');
      }

      return await runTransaction(db, async (transaction) => {
        const followId = `${auth.currentUser.uid}_${targetUserId}`;
        const followRef = doc(db, FOLLOWS_COLLECTION, followId);
        const followDoc = await transaction.get(followRef);

        if (!followDoc.exists()) {
          throw new Error('Not following this user');
        }

        // Delete follow relationship
        transaction.delete(followRef);

        // Update follower count for target user
        const targetUserRef = doc(db, 'users', targetUserId);
        transaction.update(targetUserRef, {
          'social.followerCount': increment(-1),
          updatedAt: serverTimestamp()
        });

        // Update following count for current user
        const currentUserRef = doc(db, 'users', auth.currentUser.uid);
        transaction.update(currentUserRef, {
          'social.followingCount': increment(-1),
          updatedAt: serverTimestamp()
        });

        return { success: true };
      });
    } catch (error) {
      console.error('Error unfollowing user:', error);
      return {
        success: false,
        error: error.message || 'Failed to unfollow user'
      };
    }
  },

  async isFollowing(targetUserId) {
    try {
      if (!auth.currentUser) return { success: true, isFollowing: false };

      const followId = `${auth.currentUser.uid}_${targetUserId}`;
      const followRef = doc(db, FOLLOWS_COLLECTION, followId);
      const followDoc = await getDoc(followRef);

      return { 
        success: true, 
        isFollowing: followDoc.exists() 
      };
    } catch (error) {
      console.error('Error checking follow status:', error);
      return { success: false, isFollowing: false };
    }
  },

  async getUserFollowers(userId, limitCount = 50) {
    try {
      const q = query(
        collection(db, FOLLOWS_COLLECTION),
        where('followedId', '==', userId),
        orderBy('createdAt', 'desc'),
        firestoreLimit(limitCount)
      );

      const querySnapshot = await getDocs(q);
      const followers = [];

      for (const doc of querySnapshot.docs) {
        const followData = doc.data();
        // Get follower user data
        const userResult = await this.getUserProfile(followData.followerId);
        if (userResult.success) {
          followers.push({
            ...followData,
            userProfile: userResult.profile
          });
        }
      }

      return { success: true, followers };
    } catch (error) {
      console.error('Error fetching followers:', error);
      return { success: false, error: 'Failed to fetch followers' };
    }
  },

  async getUserFollowing(userId, limitCount = 50) {
    try {
      const q = query(
        collection(db, FOLLOWS_COLLECTION),
        where('followerId', '==', userId),
        orderBy('createdAt', 'desc'),
        firestoreLimit(limitCount)
      );

      const querySnapshot = await getDocs(q);
      const following = [];

      for (const doc of querySnapshot.docs) {
        const followData = doc.data();
        // Get followed user data
        const userResult = await this.getUserProfile(followData.followedId);
        if (userResult.success) {
          following.push({
            ...followData,
            userProfile: userResult.profile
          });
        }
      }

      return { success: true, following };
    } catch (error) {
      console.error('Error fetching following:', error);
      return { success: false, error: 'Failed to fetch following' };
    }
  },

  async getUserProfile(userId) {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        return { success: false, error: 'User not found' };
      }

      const userData = userDoc.data();
      const profile = {
        id: userId,
        username: userData.username,
        displayName: userData.displayName,
        email: userData.email,
        profile: userData.profile || {},
        stats: userData.stats || {},
        social: userData.social || {},
        createdAt: userData.createdAt,
        lastLoginAt: userData.lastLoginAt
      };

      return { success: true, profile };
    } catch (error) {
      console.error('Error fetching user profile:', error);
      return { success: false, error: 'Failed to fetch profile' };
    }
  },

  async updateUserProfile(userId, profileUpdates) {
    try {
      if (!auth.currentUser || auth.currentUser.uid !== userId) {
        throw new Error('Can only update your own profile');
      }

      const userRef = doc(db, 'users', userId);
      const updates = {};

      // Only allow certain profile fields to be updated
      const allowedFields = ['bio', 'avatarUrl', 'publicProfile'];
      
      Object.keys(profileUpdates).forEach(key => {
        if (allowedFields.includes(key)) {
          updates[`profile.${key}`] = profileUpdates[key];
        }
      });

      updates.updatedAt = serverTimestamp();

      await updateDoc(userRef, updates);

      return { success: true };
    } catch (error) {
      console.error('Error updating profile:', error);
      return { success: false, error: error.message || 'Failed to update profile' };
    }
  },

  async blockUser(targetUserId) {
    try {
      if (!auth.currentUser) {
        throw new Error('Must be logged in to block users');
      }

      if (auth.currentUser.uid === targetUserId) {
        throw new Error('Cannot block yourself');
      }

      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, {
        'social.blockedUsers': arrayUnion(targetUserId),
        updatedAt: serverTimestamp()
      });

      // Also unfollow if following
      await this.unfollowUser(targetUserId);

      return { success: true };
    } catch (error) {
      console.error('Error blocking user:', error);
      return { success: false, error: error.message || 'Failed to block user' };
    }
  },

  async unblockUser(targetUserId) {
    try {
      if (!auth.currentUser) {
        throw new Error('Must be logged in to unblock users');
      }

      const userRef = doc(db, 'users', auth.currentUser.uid);
      await updateDoc(userRef, {
        'social.blockedUsers': arrayRemove(targetUserId),
        updatedAt: serverTimestamp()
      });

      return { success: true };
    } catch (error) {
      console.error('Error unblocking user:', error);
      return { success: false, error: error.message || 'Failed to unblock user' };
    }
  },

  async getBlockedUsers(userId) {
    try {
      const userRef = doc(db, 'users', userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        return { success: false, error: 'User not found' };
      }

      const blockedUserIds = userDoc.data().social?.blockedUsers || [];
      const blockedUsers = [];

      for (const blockedId of blockedUserIds) {
        const profileResult = await this.getUserProfile(blockedId);
        if (profileResult.success) {
          blockedUsers.push(profileResult.profile);
        }
      }

      return { success: true, blockedUsers };
    } catch (error) {
      console.error('Error fetching blocked users:', error);
      return { success: false, error: 'Failed to fetch blocked users' };
    }
  },

  async getUserActivity(userId, limitCount = 50) {
    try {
      const q = query(
        collection(db, ACTIVITY_COLLECTION),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        firestoreLimit(limitCount)
      );

      const querySnapshot = await getDocs(q);
      const activities = [];

      querySnapshot.forEach((doc) => {
        activities.push({ id: doc.id, ...doc.data() });
      });

      return { success: true, activities };
    } catch (error) {
      console.error('Error fetching user activity:', error);
      return { success: false, error: 'Failed to fetch activity' };
    }
  },

  async getFollowingActivity(userId, limitCount = 50) {
    try {
      // Get list of users that the current user follows
      const followingResult = await this.getUserFollowing(userId);
      if (!followingResult.success) {
        return followingResult;
      }

      const followingIds = followingResult.following.map(f => f.followedId);
      
      if (followingIds.length === 0) {
        return { success: true, activities: [] };
      }

      // Get activities from followed users
      const q = query(
        collection(db, ACTIVITY_COLLECTION),
        where('userId', 'in', followingIds),
        orderBy('createdAt', 'desc'),
        firestoreLimit(limitCount)
      );

      const querySnapshot = await getDocs(q);
      const activities = [];

      querySnapshot.forEach((doc) => {
        activities.push({ id: doc.id, ...doc.data() });
      });

      return { success: true, activities };
    } catch (error) {
      console.error('Error fetching following activity:', error);
      return { success: false, error: 'Failed to fetch activity feed' };
    }
  },

  async createActivity(type, targetId = null, metadata = {}) {
    try {
      if (!auth.currentUser) return;

      const activityDoc = {
        userId: auth.currentUser.uid,
        username: auth.currentUser.displayName || 'Anonymous',
        type, // 'follow', 'like', 'comment', 'purchase', 'create_snapple'
        targetId,
        metadata,
        createdAt: serverTimestamp()
      };

      const activityRef = doc(collection(db, ACTIVITY_COLLECTION));
      await setDoc(activityRef, activityDoc);

      return { success: true, activityId: activityRef.id };
    } catch (error) {
      console.error('Error creating activity:', error);
      return { success: false, error: 'Failed to create activity' };
    }
  },

  async searchUsers(searchQuery, limitCount = 20) {
    try {
      if (!searchQuery.trim()) {
        return { success: true, users: [] };
      }

      // Note: Firestore doesn't support full-text search natively
      // This is a basic implementation - for production, consider using Algolia or similar
      const q = query(
        collection(db, 'users'),
        where('username', '>=', searchQuery.toLowerCase()),
        where('username', '<=', searchQuery.toLowerCase() + '\uf8ff'),
        firestoreLimit(limitCount)
      );

      const querySnapshot = await getDocs(q);
      const users = [];

      for (const doc of querySnapshot.docs) {
        const userData = doc.data();
        if (userData.preferences?.publicProfile !== false) {
          users.push({
            id: doc.id,
            username: userData.username,
            displayName: userData.displayName,
            profile: userData.profile || {},
            stats: userData.stats || {},
            social: userData.social || {}
          });
        }
      }

      return { success: true, users };
    } catch (error) {
      console.error('Error searching users:', error);
      return { success: false, error: 'Failed to search users' };
    }
  },

  // Real-time subscriptions
  subscribeToUserFollowers(userId, callback) {
    try {
      const q = query(
        collection(db, FOLLOWS_COLLECTION),
        where('followedId', '==', userId),
        orderBy('createdAt', 'desc')
      );

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const followers = [];
        querySnapshot.forEach((doc) => {
          followers.push({ id: doc.id, ...doc.data() });
        });
        callback(followers);
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error subscribing to followers:', error);
      return () => {};
    }
  },

  subscribeToUserActivity(userId, callback) {
    try {
      const q = query(
        collection(db, ACTIVITY_COLLECTION),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        firestoreLimit(50)
      );

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const activities = [];
        querySnapshot.forEach((doc) => {
          activities.push({ id: doc.id, ...doc.data() });
        });
        callback(activities);
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error subscribing to activity:', error);
      return () => {};
    }
  }
};

export default socialService;