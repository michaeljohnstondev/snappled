import { 
  doc, 
  setDoc, 
  getDoc, 
  getDocs, 
  updateDoc, 
  query, 
  where, 
  orderBy, 
  collection, 
  serverTimestamp,
  limit 
} from "firebase/firestore";
import { db } from "./firebase";
import { promptDatabaseService } from "./promptDatabaseService";

const HOURLY_PROMPTS_COLLECTION = "hourlyPrompts";

export const hourlyPromptService = {
  async createHourlyPrompt() {
    try {
      const now = new Date();
      const hour = now.getHours();
      const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format
      const promptId = `${dateStr}-${hour}`;

      // Check if prompt already exists for this hour
      const existingPromptRef = doc(db, HOURLY_PROMPTS_COLLECTION, promptId);
      const existingPrompt = await getDoc(existingPromptRef);

      if (existingPrompt.exists()) {
        return {
          success: true,
          prompt: { id: existingPrompt.id, ...existingPrompt.data() },
          message: "Prompt already exists for this hour"
        };
      }

      // Get random prompt from database
      const randomPromptResult = await promptDatabaseService.getRandomPrompt();
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

      console.log(`Created hourly prompt for ${dateStr} hour ${hour}`);
      return {
        success: true,
        prompt: { id: promptId, ...hourlyPromptData }
      };
    } catch (error) {
      console.error("Error creating hourly prompt:", error);
      return { success: false, error: "Failed to create hourly prompt" };
    }
  },

  async getCurrentHourPrompt() {
    try {
      const now = new Date();
      const hour = now.getHours();
      const dateStr = now.toISOString().split('T')[0];
      const promptId = `${dateStr}-${hour}`;

      const promptRef = doc(db, HOURLY_PROMPTS_COLLECTION, promptId);
      const promptDoc = await getDoc(promptRef);

      if (promptDoc.exists()) {
        return {
          success: true,
          prompt: { id: promptDoc.id, ...promptDoc.data() }
        };
      }

      // If no prompt exists for current hour, create one
      return await this.createHourlyPrompt();
    } catch (error) {
      console.error("Error getting current hour prompt:", error);
      return { success: false, error: "Failed to get current hour prompt" };
    }
  },

  async getActivePrompts() {
    try {
      const now = new Date();
      const hourlyPromptsRef = collection(db, HOURLY_PROMPTS_COLLECTION);
      const activeQuery = query(
        hourlyPromptsRef,
        where('isActive', '==', true),
        where('expiresAt', '>', now),
        orderBy('expiresAt', 'asc')
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

  async getRecentPrompts(limitCount = 20) {
    try {
      const hourlyPromptsRef = collection(db, HOURLY_PROMPTS_COLLECTION);
      const recentQuery = query(
        hourlyPromptsRef,
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );

      const recentSnapshot = await getDocs(recentQuery);
      const prompts = [];

      recentSnapshot.forEach(doc => {
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
      console.error("Error getting recent prompts:", error);
      return { success: false, error: "Failed to get recent prompts" };
    }
  },

  async cleanupExpiredPrompts() {
    try {
      const now = new Date();
      const hourlyPromptsRef = collection(db, HOURLY_PROMPTS_COLLECTION);
      const expiredQuery = query(
        hourlyPromptsRef,
        where('expiresAt', '<=', now),
        where('isActive', '==', true)
      );

      const expiredSnapshot = await getDocs(expiredQuery);
      const updatePromises = [];

      expiredSnapshot.forEach(doc => {
        updatePromises.push(
          updateDoc(doc.ref, {
            isActive: false,
            deactivatedAt: serverTimestamp()
          })
        );
      });

      await Promise.all(updatePromises);

      console.log(`Cleaned up ${expiredSnapshot.size} expired prompts`);
      return {
        success: true,
        cleanedCount: expiredSnapshot.size
      };
    } catch (error) {
      console.error("Error cleaning up expired prompts:", error);
      return { success: false, error: "Failed to cleanup expired prompts" };
    }
  },

  async getPromptById(promptId) {
    try {
      const promptRef = doc(db, HOURLY_PROMPTS_COLLECTION, promptId);
      const promptDoc = await getDoc(promptRef);

      if (!promptDoc.exists()) {
        return { success: false, error: "Prompt not found" };
      }

      return {
        success: true,
        prompt: { id: promptDoc.id, ...promptDoc.data() }
      };
    } catch (error) {
      console.error("Error getting prompt by ID:", error);
      return { success: false, error: "Failed to get prompt" };
    }
  },

  // This would be called by a cron job every hour
  async hourlyMaintenance() {
    try {
      console.log('Running hourly maintenance...');
      
      // Clean up expired prompts
      const cleanupResult = await this.cleanupExpiredPrompts();
      
      // Create new prompt for current hour if doesn't exist
      const newPromptResult = await this.getCurrentHourPrompt();
      
      return {
        success: true,
        cleanup: cleanupResult,
        newPrompt: newPromptResult
      };
    } catch (error) {
      console.error("Error in hourly maintenance:", error);
      return { success: false, error: "Failed hourly maintenance" };
    }
  }
};