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

      const reportsRef = collection(db, 'promptReports');
      await addDoc(reportsRef, reportData);

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
  async summonPrompt({ text, userId, username }) {
    try {
      const cleanText = String(text || '').trim();
      if (!cleanText) return { success: false, error: 'Empty prompt text' };
      const textKey = normalizePromptText(cleanText);
      if (!textKey) return { success: false, error: 'Empty prompt text after normalization' };

      // 1. Permaban check (doc id = textKey).
      const banDoc = await getDoc(doc(db, 'bannedPromptTexts', textKey));
      if (banDoc.exists()) {
        return { success: true, status: 'banned' };
      }

      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      const lockoutAt = new Date(Date.now() + (24 * 60 - 10) * 60 * 1000).toISOString();
      const nowISO = new Date().toISOString();

      // 2. Already in active?
      const activeMatch = await getDocs(query(
        collection(db, 'activePrompts'),
        where('textKey', '==', textKey),
        limit(1),
      ));
      if (!activeMatch.empty) {
        const d = activeMatch.docs[0];
        return { success: true, status: 'already_active', promptId: d.id, prompt: { id: d.id, ...d.data() } };
      }

      // 3. On deck? Promote.
      const onDeckMatch = await getDocs(query(
        collection(db, 'onDeckPrompts'),
        where('textKey', '==', textKey),
        limit(1),
      ));
      if (!onDeckMatch.empty) {
        const d = onDeckMatch.docs[0];
        const data = d.data();
        const promoted = {
          ...data,
          textKey,
          createdAt: nowISO,
          expiresAt,
          lockoutAt,
          isSystem: data.isSystem ?? false,
          likeCount: 0,
          dislikeCount: 0,
          likes: [],
          dislikes: [],
          reports: [],
          reportCount: 0,
          participantCount: 0,
          totalViews: 0,
          summonedBy: userId,
          summonedFrom: 'onDeck',
        };
        const newRef = await addDoc(collection(db, 'activePrompts'), promoted);
        await deleteDoc(doc(db, 'onDeckPrompts', d.id)).catch(() => {});
        return { success: true, status: 'promoted', promptId: newRef.id, prompt: { id: newRef.id, ...promoted } };
      }

      // 4. In pool? Revive (lifetime stats stay on the pool doc).
      const poolMatch = await getDocs(query(
        collection(db, 'promptPool'),
        where('textKey', '==', textKey),
        limit(1),
      ));
      if (!poolMatch.empty) {
        const d = poolMatch.docs[0];
        const data = d.data();
        const revived = {
          text: data.text || cleanText,
          textKey,
          category: data.category || 'user',
          createdBy: data.createdBy || userId,
          creatorUsername: data.creatorUsername || username || 'anonymous',
          createdAt: nowISO,
          expiresAt,
          lockoutAt,
          isSystem: data.isSystem ?? false,
          likeCount: 0,
          dislikeCount: 0,
          likes: [],
          dislikes: [],
          reports: [],
          reportCount: 0,
          participantCount: 0,
          totalViews: 0,
          revivedBy: userId,
          poolDocId: d.id,
        };
        const newRef = await addDoc(collection(db, 'activePrompts'), revived);
        await updateDoc(doc(db, 'promptPool', d.id), {
          instanceCount: increment(1),
          lastRevivedAt: nowISO,
        }).catch(() => {});
        return { success: true, status: 'revived', promptId: newRef.id, prompt: { id: newRef.id, ...revived } };
      }

      // 5. Fresh create — write to pool AND active so future summons revive
      // instead of duplicating.
      const baseFields = {
        text: cleanText,
        textKey,
        createdBy: userId,
        creatorUsername: username || 'anonymous',
        category: 'user',
        createdAt: nowISO,
        isSystem: false,
      };
      const poolRef = await addDoc(collection(db, 'promptPool'), {
        ...baseFields,
        likeCountLifetime: 0,
        dislikeCountLifetime: 0,
        participantCountLifetime: 0,
        totalViewsLifetime: 0,
        instanceCount: 1,
        lastRevivedAt: nowISO,
      });
      const activeFields = {
        ...baseFields,
        expiresAt,
        lockoutAt,
        likeCount: 0,
        dislikeCount: 0,
        likes: [],
        dislikes: [],
        reports: [],
        reportCount: 0,
        participantCount: 0,
        totalViews: 0,
        poolDocId: poolRef.id,
      };
      const activeRef = await addDoc(collection(db, 'activePrompts'), activeFields);
      return { success: true, status: 'created', promptId: activeRef.id, prompt: { id: activeRef.id, ...activeFields } };
    } catch (error) {
      console.error('[PromptService] summonPrompt error:', error);
      return { success: false, error: error.message };
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