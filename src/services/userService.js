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
} from "firebase/firestore";
import { createUserWithEmailAndPassword, updateProfile } from "firebase/auth";
import { auth, db } from "./firebase";

const USERS_COLLECTION = "users";
const SNAPPLE_PROMPTS_COLLECTION = "snapplePrompts";
const STARTING_COINS = 100;
const STARTING_TROPHIES = 50; // Player rating system - trophies earned through gameplay
const STARTING_TOPIC_TOKENS = 3; // Keep for backwards compatibility

export const userService = {
  async createUser(userData) {
    try {
      const { email, password, username } = userData;

      if (!email || !password || !username) {
        throw new Error("Email, password, and username are required");
      }

      await this.validateUsername(username);

      const userCredential = await createUserWithEmailAndPassword(
        auth,
        email,
        password
      );
      const user = userCredential.user;

      await updateProfile(user, {
        displayName: username,
      });

      const userDoc = {
        uid: user.uid,
        username: username.toLowerCase(),
        displayName: username,
        email: email.toLowerCase(),
        coins: STARTING_COINS,
        receivedCoins: 0, // Gifted/earned coins separate from purchased
        topicTokens: STARTING_TOPIC_TOKENS, // New system
        tickets: STARTING_TROPHIES, // Player rating system (trophies)
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
          trophies: 0, // Legacy trophy count
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

      await setDoc(doc(db, USERS_COLLECTION, user.uid), userDoc);

      return {
        success: true,
        user: {
          uid: user.uid,
          ...userDoc,
        },
      };
    } catch (error) {
      console.error("Error creating user:", error);

      let errorMessage = "Failed to create account";
      if (error.code === "auth/email-already-in-use") {
        errorMessage = "Email is already registered";
      } else if (error.code === "auth/weak-password") {
        errorMessage = "Password is too weak";
      } else if (error.code === "auth/invalid-email") {
        errorMessage = "Invalid email address";
      } else if (error.message.includes("Username")) {
        errorMessage = error.message;
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
        coins: increment(amount),
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
        topicTokens: increment(amount),
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("Error updating topic tokens:", error);
      return { success: false, error: "Failed to update topic tokens" };
    }
  },

  async updateTickets(userId, amount) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      await updateDoc(userRef, {
        tickets: increment(amount),
        "stats.totalTicketsSpent":
          amount < 0 ? increment(Math.abs(amount)) : increment(0),
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error("Error updating tickets:", error);
      return { success: false, error: "Failed to update tickets" };
    }
  },

  async updateReceivedCoins(userId, amount) {
    try {
      const userRef = doc(db, USERS_COLLECTION, userId);
      await updateDoc(userRef, {
        receivedCoins: increment(amount),
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
        const currentTokens = userData.topicTokens || 0;
        
        if (currentTokens < 1) {
          throw new Error('Insufficient topic tokens');
        }
        
        // Update user: spend 1 token
        transaction.update(userRef, {
          topicTokens: increment(-1),
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
};

export default userService;
