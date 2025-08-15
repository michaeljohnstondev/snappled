import { db } from './firebase';
import { collection, doc, getDoc, getDocs, query, where, orderBy, limit } from 'firebase/firestore';
import { hourlyPromptService } from './hourlyPromptService';
import { promptDatabaseService } from './promptDatabaseService';

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
}

export const promptService = new PromptService();