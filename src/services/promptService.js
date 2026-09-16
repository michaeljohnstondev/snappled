import { db } from './firebase';
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit, updateDoc, arrayUnion, arrayRemove, increment, addDoc, setDoc, deleteDoc } from 'firebase/firestore';
import { hourlyPromptService } from './hourlyPromptService';
import { promptDatabaseService } from './promptDatabaseService';
import { normalizePromptText } from '../utils/promptKey';

class PromptService {
  // Get today's prompt
  async getTodaysPrompt() {
    try {
      const today = new Date();
      const dateStr = today.toISOString().split('T')[0]; // YYYY-MM-DD format
      
      const promptRef = doc(db, 'dailyPrompts', dateStr);
      const promptDoc = await getDoc(promptRef);
      
      if (promptDoc.exists()) {
        return {
          success: true,
          prompt: {
            id: promptDoc.id,
            ...promptDoc.data()
          }
        };
      } else {
        // If no prompt for today, create a fallback
        return {
          success: true,
          prompt: {
            id: dateStr,
            text: "Create something amazing!",
            theme: "creativity",
            date: dateStr,
            isActive: true
          }
        };
      }
    } catch (error) {
      console.error('Error getting today\'s prompt:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Get recent prompts (for history/deck view)
  async getRecentPrompts(limitCount = 10) {
    try {
      // Use the new hourly prompt service
      const result = await hourlyPromptService.getRecentPrompts(limitCount);
      return result;
    } catch (error) {
      console.error('Error getting recent prompts:', error);
      return {
        success: false,
        error: error.message,
        prompts: []
      };
    }
  }

  // Get active hourly prompts
  async getTodaysHourlyPrompts() {
    try {
      // Use the new hourly prompt service to get active prompts
      const result = await hourlyPromptService.getActivePrompts();
      return result;
    } catch (error) {
      console.error('Error getting hourly prompts:', error);
      return {
        success: false,
        error: error.message,
        prompts: []
      };
    }
  }

  // Get current active prompt (uses new hourly system)
  async getCurrentPrompt() {
    try {
      // Use the new hourly prompt service
      const result = await hourlyPromptService.getCurrentHourPrompt();
      return result;
    } catch (error) {
      console.error('Error getting current prompt:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Like a prompt (works for both hourly and snapple prompts)
  async likePrompt(promptId, userId, collection = 'hourlyPrompts') {
    try {
      const promptRef = doc(db, collection, promptId);
      
      // First check if the document exists and get current data
      const promptDoc = await getDoc(promptRef);
      
      if (!promptDoc.exists()) {
        console.error('[PromptService] Prompt document does not exist:', promptId);
        return {
          success: false,
          error: 'Prompt not found'
        };
      }

      const currentData = promptDoc.data();
      const currentLikes = currentData.likes || [];
      const currentDislikes = currentData.dislikes || [];
      
      // Check if user already liked this prompt
      if (currentLikes.includes(userId)) {
        return { success: true, message: 'Already liked' };
      }

      // Check if user previously disliked (need to decrement dislike count)
      const wasDisliked = currentDislikes.includes(userId);

      // Update the document
      const updates = {
        likes: arrayUnion(userId),
        dislikes: arrayRemove(userId),
        likeCount: increment(1),
        // Initialize arrays if they don't exist
        ...(currentData.likes === undefined && { likes: [userId] }),
        ...(currentData.dislikes === undefined && { dislikes: [] })
      };

      // If user was previously disliking, decrement dislike count
      if (wasDisliked) {
        updates.dislikeCount = increment(-1);
      }

      await updateDoc(promptRef, updates);

      return { success: true };
    } catch (error) {
      console.error('[PromptService] Error liking prompt:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Dislike a prompt (works for both hourly and snapple prompts)
  async dislikePrompt(promptId, userId, collection = 'hourlyPrompts') {
    try {
      const promptRef = doc(db, collection, promptId);
      
      // First check if the document exists and get current data
      const promptDoc = await getDoc(promptRef);
      
      if (!promptDoc.exists()) {
        console.error('[PromptService] Prompt document does not exist:', promptId);
        return {
          success: false,
          error: 'Prompt not found'
        };
      }

      const currentData = promptDoc.data();
      const currentLikes = currentData.likes || [];
      const currentDislikes = currentData.dislikes || [];
      
      // Check if user already disliked this prompt
      if (currentDislikes.includes(userId)) {
        return { success: true, message: 'Already disliked' };
      }

      // Check if user previously liked (need to decrement like count)
      const wasLiked = currentLikes.includes(userId);

      // Update the document
      const updates = {
        dislikes: arrayUnion(userId),
        likes: arrayRemove(userId),
        dislikeCount: increment(1),
        // Initialize arrays if they don't exist
        ...(currentData.likes === undefined && { likes: [] }),
        ...(currentData.dislikes === undefined && { dislikes: [userId] })
      };

      // If user was previously liking, decrement like count
      if (wasLiked) {
        updates.likeCount = increment(-1);
      }

      await updateDoc(promptRef, updates);

      return { success: true };
    } catch (error) {
      console.error('[PromptService] Error disliking prompt:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Report a prompt — writes to the `promptReports` collection for moderation review.
  async reportPrompt(promptId, userId, reason) {
    try {
      const reportData = {
        promptId,
        userId,
        reason,
        timestamp: new Date(),
        status: 'pending',
      };

      // Keyed <promptId>_<uid> rather than addDoc'd with a random id.
      // Reports now auto-ban a prompt once enough DISTINCT people file
      // one, and with random ids a single person could tap report three
      // times and delete any prompt in the game. Reporting twice now
      // overwrites one row instead of filing two.
      await setDoc(doc(db, 'promptReports', `${promptId}_${userId}`), reportData);

      return { success: true };
    } catch (error) {
      console.error('[PromptService] Error reporting prompt:', error);
      return {
        success: false,
        error: error.message,
      };
    }
  }

  // Summon a prompt — handles the full revive/promote/create flow.
  // Looks up the normalized text in: bannedPromptTexts → activePrompts →
  // onDeckPrompts → promptPool, taking the first match. Returns one of:
  //   { status: 'banned' }
  //   { status: 'already_active', promptId, prompt }
  //   { status: 'promoted', promptId, prompt }   (was on deck, now active)
  //   { status: 'revived',  promptId, prompt }   (was in pool, now active)
  //   { status: 'created',  promptId, prompt }   (new in pool + active)
  // The caller is responsible for charging the user (we don't touch tickets here).
  /**
   * summonPrompt - put a prompt into rotation.
   *
   * All of this used to happen here: ban check, searching the four
   * prompt collections, writing the prompt, then debiting a ticket as a
   * separate write afterwards. A client that skipped that last step got
   * prompts for free, which is not a thing a ticket bought with real
   * money can allow. It all lives in functions/summonPrompt.js now, in
   * one transaction.
   *
   * `userId` and `username` stay in the signature because every caller
   * passes them; the server trusts neither. The uid comes from the auth
   * token, and the username is only ever a display string.
   */
  async summonPrompt({ text, userId, username }) {
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('./firebase');
      const fn = httpsCallable(functions, 'summonPrompt');
      const res = await fn({ text, username });
      return res.data;
    } catch (error) {
      console.error('[PromptService] summonPrompt error:', error);
      // HttpsError messages are written to be shown to the player.
      return { success: false, error: error?.message || 'Could not create that prompt.' };
    }
  }

  // Legacy create — kept for backwards compat. New callers should use summonPrompt.
  async createPrompt(promptData) {
    return this.summonPrompt({
      text: promptData.text,
      userId: promptData.createdBy,
      username: promptData.creatorUsername,
    });
  }

  // Get recent snapple prompts (user-generated prompts)
  async getRecentSnapplePrompts(limitCount = 10) {
    try {
      const promptsRef = collection(db, 'snapplePrompts');
      const q = query(
        promptsRef,
        orderBy('timestamp', 'desc'),
        limit(limitCount)
      );
      
      const querySnapshot = await getDocs(q);
      const prompts = [];
      
      querySnapshot.forEach((doc) => {
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
      console.error('[PromptService] Error getting snapple prompts:', error);
      return {
        success: false,
        error: error.message,
        prompts: []
      };
    }
  }

  // Increment view count for a prompt
  async incrementViews(promptId, collectionName = 'hourlyPrompts') {
    try {
      const promptRef = doc(db, collectionName, promptId);
      const promptDoc = await getDoc(promptRef);
      if (!promptDoc.exists()) return { success: false };
      await updateDoc(promptRef, {
        totalViews: increment(1)
      });
      
      return { success: true };
    } catch (error) {
      console.error('[PromptService] Error incrementing views:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

export const promptService = new PromptService();