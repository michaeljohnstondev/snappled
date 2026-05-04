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
  runTransaction,
  orderBy,
  arrayUnion,
  arrayRemove,
} from "firebase/firestore";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db } from "./firebase";

const USERS_COLLECTION = "users";
const SNAPPLE_PROMPTS_COLLECTION = "snapplePrompts";
const STARTING_COINS = 100;
const STARTING_TROPHIES = 0;
const STARTING_TOPIC_TOKENS = 10;

export const userService = {
  async createUser(userData) {
    try {
      const { email, password, username } = userData;

      console.log('[UserService] Starting user creation for:', { email, username });

      if (!email || !password || !username) {
        throw new Error("Email, password, and username are required");
      }

      // Basic username validation (without database check)
      if (!username || username.length < 3) {
        throw new Error("Username must be at least 3 characters long");
      }
      if (username.length > 20) {
        throw new Error("Username must be 20 characters or less");
      }
      if (!/^[a-zA-Z0-9_]+$/.test(username)) {
        throw new Error("Username can only contain letters, numbers, and underscores");
      }

      console.log('[UserService] Creating Firebase Auth user...');
      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;
      console.log('[UserService] Firebase Auth user created successfully:', user.uid);

      console.log('[UserService] Validating username availability...');
      try {
        await this.validateUsername(username);
      } catch (usernameError) {
        // If username validation fails, delete the Firebase Auth user we just created
        console.log('[UserService] Username validation failed, cleaning up auth user...');
        await user.delete();
        throw usernameError;
      }

      console.log('[UserService] Updating user profile...');
      await updateProfile(user, {
        displayName: username,
      });
      console.log('[UserService] User profile updated successfully');

      const userDoc = {
        uid: user.uid,
        username: username.toLowerCase(),
        displayName: username,
        email: email.toLowerCase(),
        resources: {
          coins: STARTING_COINS,
          tokens: STARTING_TOPIC_TOKENS,
          trophies: STARTING_TROPHIES,
          receivedCoins: 0, // Gifted/earned coins separate from purchased
        },
        ownedSnapples: [],
        wishlistedSnapples: [],
        activeDeck: null,
        profile: {
          avatarUrl: null,
          photoURL: null, // Legacy field for social login photos
          bio: "",
          level: 1,
          xp: 0, // Legacy experience points
          experience: 0, // New experience system
          achievements: [],
        },
        stats: {
          totalVideosCreated: 0,
          totalSnapplesPurchased: 0,
          totalCoinsSpent: 0,
          totalTokensSpent: 0,
          totalTicketsSpent: 0, // Legacy system
          totalLikesGiven: 0,
          totalLikesReceived: 0,
          totalWishlistItems: 0,
          topicsSubmitted: 0, // Legacy: custom prompts submitted
          favoritePrompts: [],
        },
        preferences: {
          notifications: true,
          emailUpdates: false,
          publicProfile: true,
        },
        moderation: {
          strikes: 0, // Rule violations count
          isBanned: false,
          banRelease: null, // Timestamp when ban expires
          reports: [], // Reports filed against this user
          warnings: [],
        },
        social: {
          snappleOpinion: {}, // User's ratings/reviews on snapples
          following: [],
          followers: [],
          blockedUsers: [],
        },
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
        lastLoginAt: serverTimestamp(),
      };

      console.log('[UserService] Creating user document with data:', {
        uid: userDoc.uid,
        username: userDoc.username,
        email: userDoc.email,
        hasResources: !!userDoc.resources,
        resourcesKeys: userDoc.resources ? Object.keys(userDoc.resources) : []
      });
      
      console.log('[UserService] Writing to Firestore...');
      await setDoc(doc(db, USERS_COLLECTION, user.uid), userDoc);
      console.log('[UserService] Firestore document created successfully');

      return {
        success: true,
        user: {
          uid: user.uid,
          ...userDoc,
        },
      };
    } catch (error) {
      console.error("Error creating user:", error);
      console.error("Error code:", error.code);
      console.error("Error message:", error.message);

      let errorMessage = "Failed to create account";
      if (error.code === "auth/email-already-in-use") {
        errorMessage = "Email is already registered";
      } else if (error.code === "auth/weak-password") {
        errorMessage = "Password is too weak";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Invalid email address";
      } else if (error.message.includes("Username")) {
        errorMessage = error.message;
      } else if (error.code === "permission-denied" || error.message.includes("permissions")) {
        errorMessage = "Database permission error - please contact support";
        console.error("Firestore permission error details:", error);
      }

      return {
        success: false,
        error: errorMessage,
      };
    }
  },

  async validateUsername(username) {
    if (!username || username.length < 3) {
      throw new Error("Username must be at least 3 characters long");
    }

    if (username.length > 20) {
      throw new Error("Username must be 20 characters or less");
    }

    if (!/^[a-zA-Z0-9_]+$/.test(username)) {
      throw new Error(
        "Username can only contain letters, numbers, and underscores"
      );
    }

    const usersRef = collection(db, USERS_COLLECTION);
    const q = query(usersRef, where("username", "==", username.toLowerCase()));
    const querySnapshot = await getDocs(q);

    if (!querySnapshot.empty) {
      throw new Error("Username is already taken");
    }
  },

  async createUserDocument(userId, userData) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      await setDoc(userRef, {
        ...userData,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      return {
        success: true,
        message: "User document created successfully",
      };
    } catch (error) {
      console.error("Error creating user document:", error);
      return {
        success: false,
        error: error.message,
      };
    }
  },

  async getUserData(userId) {
    try {
      const userDoc = await getDoc(doc(db, USERS_COLLECTION, userId));

      if (!userDoc.exists()) {
        return null;
      }

      const userData = userDoc.data();
      return { id: userDoc.id, ...userData };
    } catch (error) {
      console.error("Error fetching user data:", error);
      return null;
    }
  },

  async updateUserData(userId, updates) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      const updateData = {
        ...updates,
        updatedAt: serverTimestamp(),
      };

      await updateDoc(userRef, updateData);

      return { success: true };
    } catch (error) {
      console.error("Error updating user data:", error);
      return { success: false, error: "Failed to update user data" };
    }
  },

  async updateLastLogin(userId) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      await updateDoc(userRef, {
        lastLoginAt: serverTimestamp(),
      });
    } catch (error) {
      console.error("Error updating last login:", error);
    }
  },

  async updateCoins(userId, amount) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      await updateDoc(userRef, {
        "resources.coins": increment(amount),
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("Error updating coins:", error);
      return { success: false, error: "Failed to update coins" };
    }
  },

  async updateTopicTokens(userId, amount) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      await updateDoc(userRef, {
        "resources.tokens": increment(amount),
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("Error updating topic tokens:", error);
      return { success: false, error: "Failed to update topic tokens" };
    }
  },

  async updateTrophies(userId, amount) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      if (amount < 0) {
        const userData = await this.getUserData(userId);
        const current = userData?.resources?.trophies || 0;
        if (current + amount < 0) amount = -current; // clamp to 0
        if (amount === 0) return { success: true };
      }
      await updateDoc(userRef, {
        "resources.trophies": increment(amount),
        "stats.totalTrophiesSpent":
          amount < 0 ? increment(Math.abs(amount)) : increment(0),
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("Error updating trophies:", error);
      return { success: false, error: "Failed to update trophies" };
    }
  },

  // Legacy method for backwards compatibility
  async updateTickets(userId, amount) {
    return this.updateTrophies(userId, amount);
  },

  async updateReceivedCoins(userId, amount) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      await updateDoc(userRef, {
        "resources.receivedCoins": increment(amount),
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("Error updating received coins:", error);
      return { success: false, error: "Failed to update received coins" };
    }
  },

  async updateXP(userId, amount) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      await updateDoc(userRef, {
        "profile.xp": increment(amount),
        "profile.experience": increment(amount),
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("Error updating XP:", error);
      return { success: false, error: "Failed to update XP" };
    }
  },

  async addStrike(userId, reason) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        return { success: false, error: "User not found" };
      }

      const currentStrikes = userDoc.data().moderation?.strikes || 0;
      const newStrikes = currentStrikes + 1;

      const updates = {
        "moderation.strikes": newStrikes,
        "moderation.warnings": arrayUnion({
          reason,
          timestamp: serverTimestamp(),
          strikeNumber: newStrikes,
        }),
        updatedAt: serverTimestamp(),
      };

      // Auto-ban after 3 strikes
      if (newStrikes >= 3) {
        const banDuration = 7 * 24 * 60 * 60 * 1000; // 7 days in milliseconds
        updates["moderation.isBanned"] = true;
        updates["moderation.banRelease"] = new Date(Date.now() + banDuration);
      }

      await updateDoc(userRef, updates);

      return {
        success: true,
        strikes: newStrikes,
        isBanned: newStrikes >= 3,
      };
    } catch (error) {
      console.error("Error adding strike:", error);
      return { success: false, error: "Failed to add strike" };
    }
  },

  async setSnappleOpinion(userId, snappleId, opinion) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      await updateDoc(userRef, {
        [`social.snappleOpinion.${snappleId}`]: {
          rating: opinion.rating, // 1-5 stars
          review: opinion.review || "",
          timestamp: serverTimestamp(),
        },
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("Error setting snapple opinion:", error);
      return { success: false, error: "Failed to set opinion" };
    }
  },

  async addOwnedSnapple(userId, snappleId) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        return { success: false, error: "User not found" };
      }

      const currentSnapples = userDoc.data().ownedSnapples || [];
      if (currentSnapples.includes(snappleId)) {
        return { success: false, error: "Snapple already owned" };
      }

      await updateDoc(userRef, {
        ownedSnapples: [...currentSnapples, snappleId],
        "stats.totalSnapplesPurchased": increment(1),
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("Error adding owned snapple:", error);
      return { success: false, error: "Failed to add snapple to collection" };
    }
  },

  async updateProfile(userId, profileData) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      const updates = {};

      Object.keys(profileData).forEach((key) => {
        updates[`profile.${key}`] = profileData[key];
      });

      updates.updatedAt = serverTimestamp();

      await updateDoc(userRef, updates);

      return { success: true };
    } catch (error) {
      console.error("Error updating profile:", error);
      return { success: false, error: "Failed to update profile" };
    }
  },

  async updateStats(userId, statUpdates) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      const updates = {};

      Object.keys(statUpdates).forEach((key) => {
        if (typeof statUpdates[key] === "number") {
          updates[`stats.${key}`] = increment(statUpdates[key]);
        } else {
          updates[`stats.${key}`] = statUpdates[key];
        }
      });

      updates.updatedAt = serverTimestamp();

      await updateDoc(userRef, updates);

      return { success: true };
    } catch (error) {
      console.error("Error updating stats:", error);
      return { success: false, error: "Failed to update stats" };
    }
  },

  async getUserByUsername(username) {
    try {
      const usersRef = collection(db, USERS_COLLECTION);
      const q = query(
        usersRef,
        where("username", "==", username.toLowerCase())
      );
      const querySnapshot = await getDocs(q);

      if (querySnapshot.empty) {
        return { success: false, error: "User not found" };
      }

      const userDoc = querySnapshot.docs[0];
      return {
        success: true,
        user: { id: userDoc.id, ...userDoc.data() },
      };
    } catch (error) {
      console.error("Error fetching user by username:", error);
      return { success: false, error: "Failed to fetch user" };
    }
  },

  async addToUserWishlist(userId, snappleId) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        return { success: false, error: "User not found" };
      }

      const currentWishlist = userDoc.data().wishlistedSnapples || [];
      if (currentWishlist.includes(snappleId)) {
        return { success: false, error: "Snapple already in wishlist" };
      }

      await updateDoc(userRef, {
        wishlistedSnapples: [...currentWishlist, snappleId],
        "stats.totalWishlistItems": increment(1),
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("Error adding to user wishlist:", error);
      return { success: false, error: "Failed to add to wishlist" };
    }
  },

  async removeFromUserWishlist(userId, snappleId) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      const userDoc = await getDoc(userRef);

      if (!userDoc.exists()) {
        return { success: false, error: "User not found" };
      }

      const currentWishlist = userDoc.data().wishlistedSnapples || [];
      const updatedWishlist = currentWishlist.filter((id) => id !== snappleId);

      await updateDoc(userRef, {
        wishlistedSnapples: updatedWishlist,
        "stats.totalWishlistItems": increment(-1),
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("Error removing from user wishlist:", error);
      return { success: false, error: "Failed to remove from wishlist" };
    }
  },

  async updateUserEngagementStats(userId, statType, amount = 1) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      const updates = {
        [`stats.${statType}`]: increment(amount),
        updatedAt: serverTimestamp(),
      };

      await updateDoc(userRef, updates);
      return { success: true };
    } catch (error) {
      console.error("Error updating engagement stats:", error);
      return { success: false, error: "Failed to update stats" };
    }
  },

  // Snapple Prompts Management
  async initializeSnapplePrompts() {
    try {
      // Add all 200 prompts to the database if not already present
      const promptsData = {
        "prompts": [
          {
            "id": 1,
            "text": "Show us your morning routine in 10 seconds",
            "theme": "lifestyle",
            "difficulty": "easy",
            "tags": ["morning", "routine", "daily"]
          },
          {
            "id": 2,
            "text": "Create a dance using only hand movements",
            "theme": "creativity",
            "difficulty": "medium",
            "tags": ["dance", "hands", "movement"]
          },
          {
            "id": 3,
            "text": "Recreate a famous movie scene with objects around you",
            "theme": "humor",
            "difficulty": "hard",
            "tags": ["movies", "recreation", "objects"]
          },
          {
            "id": 4,
            "text": "Show the fastest way to make your bed",
            "theme": "challenge",
            "difficulty": "easy",
            "tags": ["speed", "bed", "household"]
          },
          {
            "id": 5,
            "text": "Demonstrate how to pet an invisible cat",
            "theme": "humor",
            "difficulty": "medium",
            "tags": ["invisible", "cat", "acting"]
          }
          // Note: Add remaining prompts when initializing
        ]
      };

      const promptsRef = doc(db, SNAPPLE_PROMPTS_COLLECTION, 'promptsDatabase');
      await setDoc(promptsRef, {
        prompts: promptsData.prompts,
        totalPrompts: 200,
        lastUpdated: serverTimestamp(),
        createdAt: serverTimestamp()
      });

      return { success: true };
    } catch (error) {
      console.error("Error initializing snapple prompts:", error);
      return { success: false, error: "Failed to initialize prompts" };
    }
  },

  async getRandomPromptFromDatabase() {
    try {
      const promptsRef = doc(db, SNAPPLE_PROMPTS_COLLECTION, 'promptsDatabase');
      const promptsDoc = await getDoc(promptsRef);
      
      if (!promptsDoc.exists()) {
        // Initialize prompts if they don't exist
        await this.initializeSnapplePrompts();
        return await this.getRandomPromptFromDatabase();
      }

      const promptsData = promptsDoc.data();
      const prompts = promptsData.prompts || [];
      
      if (prompts.length === 0) {
        return { success: false, error: "No prompts available" };
      }

      // Select random prompt
      const randomIndex = Math.floor(Math.random() * prompts.length);
      const selectedPrompt = prompts[randomIndex];

      return {
        success: true,
        prompt: selectedPrompt
      };
    } catch (error) {
      console.error("Error getting random prompt:", error);
      return { success: false, error: "Failed to get random prompt" };
    }
  },

  async createHourlyPrompt() {
    try {
      const now = new Date();
      const hour = now.getHours();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format
      const promptId = `${dateStr}-${hour}`;

      // Check if prompt already exists for this hour
      const existingPromptRef = doc(db, 'hourlyPrompts', promptId);
      const existingPrompt = await getDoc(existingPromptRef);

      if (existingPrompt.exists()) {
        return {
          success: true,
          prompt: { id: existingPrompt.id, ...existingPrompt.data() },
          message: "Prompt already exists for this hour"
        };
      }

      // Get random prompt from database
      const randomPromptResult = await this.getRandomPromptFromDatabase();
      if (!randomPromptResult.success) {
        return randomPromptResult;
      }

      const selectedPrompt = randomPromptResult.prompt;
      
      // Create hourly prompt document
      const hourlyPromptData = {
        ...selectedPrompt,
        date: dateStr,
        hour: hour,
        type: 'hourly',
        isActive: true,
        createdAt: serverTimestamp(),
        expiresAt: new Date(now.getTime() + (24 * 60 * 60 * 1000)), // 24 hours from now
        snappleCount: 0
      };

      await setDoc(existingPromptRef, hourlyPromptData);

      return {
        success: true,
        prompt: { id: promptId, ...hourlyPromptData }
      };
    } catch (error) {
      console.error("Error creating hourly prompt:", error);
      return { success: false, error: "Failed to create hourly prompt" };
    }
  },

  async cleanupExpiredPrompts() {
    try {
      const now = new Date();
      const hourlyPromptsRef = collection(db, 'hourlyPrompts');
      const expiredQuery = query(
        hourlyPromptsRef,
        where('expiresAt', '<=', now),
        where('isActive', '==', true)
      );

      const expiredSnapshot = await getDocs(expiredQuery);
      const deletionPromises = [];

      expiredSnapshot.forEach(doc => {
        deletionPromises.push(
          updateDoc(doc.ref, {
            isActive: false,
            deactivatedAt: serverTimestamp()
          })
        );
      });

      await Promise.all(deletionPromises);

      return {
        success: true,
        deletedCount: expiredSnapshot.size
      };
    } catch (error) {
      console.error("Error cleaning up expired prompts:", error);
      return { success: false, error: "Failed to cleanup expired prompts" };
    }
  },

  async getCurrentActivePrompts() {
    try {
      const hourlyPromptsRef = collection(db, 'hourlyPrompts');
      const activeQuery = query(
        hourlyPromptsRef,
        where('isActive', '==', true),
        orderBy('createdAt', 'desc')
      );

      const activeSnapshot = await getDocs(activeQuery);
      const prompts = [];

      activeSnapshot.forEach(doc => {
        prompts.push({
          id: doc.id,
          ...doc.data()
        });
      });

      return {
        success: true,
        prompts
      };
    } catch (error) {
      console.error("Error getting active prompts:", error);
      return { success: false, error: "Failed to get active prompts" };
    }
  },

  async spendTopicToken(userId, promptText) {
    try {
      return await runTransaction(db, async (transaction) => {
        const userRef = doc(db, USERS_COLLECTION, userId);
        const userDoc = await transaction.get(userRef);
        
        if (!userDoc.exists()) {
          throw new Error('User not found');
        }
        
        const userData = userDoc.data();
        const currentTokens = userData.resources?.tokens || userData.topicTokens || 0;
        
        if (currentTokens < 1) {
          throw new Error('Insufficient topic tokens');
        }
        
        // Update user: spend 1 token
        transaction.update(userRef, {
          "resources.tokens": increment(-1),
          updatedAt: serverTimestamp()
        });
        
        // Create the user-generated prompt in a collection
        const promptRef = doc(collection(db, 'userPrompts'));
        transaction.set(promptRef, {
          userId,
          text: promptText,
          createdAt: serverTimestamp(),
          isActive: true,
          type: 'user_generated',
          snappleCount: 0
        });
        
        return {
          success: true,
          promptId: promptRef.id,
          tokensRemaining: currentTokens - 1
        };
      });
    } catch (error) {
      console.error('Error spending topic token:', error);
      return {
        success: false,
        error: error.message || 'Failed to spend topic token'
      };
    }
  },

  async getUserPrompts(userId) {
    try {
      if (!userId) {
        return { success: true, prompts: [] };
      }

      const userPromptsRef = collection(db, 'userPrompts');
      const userQuery = query(
        userPromptsRef,
        where('userId', '==', userId)
      );

      const querySnapshot = await getDocs(userQuery);
      const prompts = [];

      querySnapshot.forEach((doc) => {
        prompts.push({
          id: doc.id,
          ...doc.data()
        });
      });

      // Sort in JavaScript instead of Firestore to avoid index requirement
      prompts.sort((a, b) => {
        const aTime = a.createdAt?.seconds || 0;
        const bTime = b.createdAt?.seconds || 0;
        return bTime - aTime; // newest first
      });

      return {
        success: true,
        prompts
      };
    } catch (error) {
      console.error('Error getting user prompts:', error);
      return { success: false, error: 'Failed to get user prompts' };
    }
  },

  async updateUserResources(userId, updates) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      const userDoc = await getDoc(userRef);
      
      if (!userDoc.exists()) {
        return { success: false, error: "User not found" };
      }

      // Build the update object
      const resourceUpdates = {};
      if (updates.coins !== undefined) {
        resourceUpdates['resources.coins'] = updates.coins;
      }
      if (updates.tokens !== undefined) {
        resourceUpdates['resources.tokens'] = updates.tokens;
      }
      if (updates.trophies !== undefined) {
        resourceUpdates['resources.trophies'] = updates.trophies;
      }
      // Top-level fields (collections, wishlist, etc)
      if (updates.ownedSnapples !== undefined) {
        resourceUpdates.ownedSnapples = updates.ownedSnapples;
      }
      if (updates.wishlistedSnapples !== undefined) {
        resourceUpdates.wishlistedSnapples = updates.wishlistedSnapples;
      }
      if (updates.ownedCards !== undefined) {
        resourceUpdates.ownedCards = updates.ownedCards;
      }
      if (updates.discardedSnapples !== undefined) {
        resourceUpdates.discardedSnapples = updates.discardedSnapples;
      }

      await updateDoc(userRef, resourceUpdates);
      return { success: true };
    } catch (error) {
      console.error('Error updating user resources:', error);
      return { success: false, error: 'Failed to update user resources' };
    }
  },

  // Follow/Unfollow functionality
  async followUser(followerId, followeeId) {
    try {
      if (followerId === followeeId) {
        return {
          success: false,
          error: 'Cannot follow yourself'
        };
      }

      // Update follower's following list
      const followerRef = doc(db, USERS_COLLECTION, followerId);
      await updateDoc(followerRef, {
        'social.following': arrayUnion(followeeId),
        updatedAt: serverTimestamp(),
      });

      // Update followee's followers list
      const followeeRef = doc(db, USERS_COLLECTION, followeeId);
      await updateDoc(followeeRef, {
        'social.followers': arrayUnion(followerId),
        updatedAt: serverTimestamp(),
      });

      console.log(`[UserService] User ${followerId} followed ${followeeId}`);
      return { success: true };
    } catch (error) {
      console.error('[UserService] Error following user:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  async unfollowUser(followerId, followeeId) {
    try {
      if (followerId === followeeId) {
        return {
          success: false,
          error: 'Cannot unfollow yourself'
        };
      }

      // Update follower's following list
      const followerRef = doc(db, USERS_COLLECTION, followerId);
      await updateDoc(followerRef, {
        'social.following': arrayRemove(followeeId),
        updatedAt: serverTimestamp(),
      });

      // Update followee's followers list
      const followeeRef = doc(db, USERS_COLLECTION, followeeId);
      await updateDoc(followeeRef, {
        'social.followers': arrayRemove(followerId),
        updatedAt: serverTimestamp(),
      });

      console.log(`[UserService] User ${followerId} unfollowed ${followeeId}`);
      return { success: true };
    } catch (error) {
      console.error('[UserService] Error unfollowing user:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  async toggleFollow(followerId, followeeId) {
    try {
      // Check current follow status
      const isFollowing = await this.isFollowing(followerId, followeeId);
      
      if (isFollowing) {
        const result = await this.unfollowUser(followerId, followeeId);
        return {
          ...result,
          isFollowing: false
        };
      } else {
        const result = await this.followUser(followerId, followeeId);
        return {
          ...result,
          isFollowing: true
        };
      }
    } catch (error) {
      console.error('[UserService] Error toggling follow:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },

  async isFollowing(followerId, followeeId) {
    try {
      const followerDoc = await getDoc(doc(db, USERS_COLLECTION, followerId));
      if (followerDoc.exists()) {
        const following = followerDoc.data().social?.following || [];
        return following.includes(followeeId);
      }
      return false;
    } catch (error) {
      console.error('[UserService] Error checking follow status:', error);
      return false;
    }
  },

  async getFollowData(userId) {
    try {
      const userDoc = await getDoc(doc(db, USERS_COLLECTION, userId));
      if (userDoc.exists()) {
        const userData = userDoc.data();
        const social = userData.social || {};
        return {
          success: true,
          followers: social.followers || [],
          following: social.following || [],
          followerCount: (social.followers || []).length,
          followingCount: (social.following || []).length
        };
      }
      return {
        success: false,
        error: 'User not found'
      };
    } catch (error) {
      console.error('[UserService] Error getting follow data:', error);
      return {
        success: false,
        error: error.message
      };
    }
  },
};

export default userService;
