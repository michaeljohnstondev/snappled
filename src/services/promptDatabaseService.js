import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { db } from "./firebase";

const SNAPPLE_PROMPTS_COLLECTION = "snapplePrompts";

// Full database of 200 prompts
const PROMPTS_DATABASE = [
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
  },
  {
    "id": 6,
    "text": "Create art using only items from your kitchen",
    "theme": "creativity",
    "difficulty": "medium",
    "tags": ["art", "kitchen", "cooking"]
  },
  {
    "id": 7,
    "text": "Show your best superhero landing pose",
    "theme": "adventure",
    "difficulty": "easy",
    "tags": ["superhero", "pose", "action"]
  },
  {
    "id": 8,
    "text": "Teach us something new in 10 seconds",
    "theme": "educational",
    "difficulty": "medium",
    "tags": ["teaching", "learning", "knowledge"]
  },
  {
    "id": 9,
    "text": "Create a tiny world in a cup or bowl",
    "theme": "creativity",
    "difficulty": "hard",
    "tags": ["miniature", "world", "imagination"]
  },
  {
    "id": 10,
    "text": "Show your reaction to finding $100",
    "theme": "emotion",
    "difficulty": "easy",
    "tags": ["reaction", "money", "surprise"]
  },
  {
    "id": 11,
    "text": "Demonstrate the worst possible way to eat cereal",
    "theme": "humor",
    "difficulty": "medium",
    "tags": ["eating", "cereal", "comedy"]
  },
  {
    "id": 12,
    "text": "Create a fashion look using only towels",
    "theme": "fashion",
    "difficulty": "medium",
    "tags": ["fashion", "towels", "style"]
  },
  {
    "id": 13,
    "text": "Show how gravity works using household items",
    "theme": "educational",
    "difficulty": "medium",
    "tags": ["science", "gravity", "physics"]
  },
  {
    "id": 14,
    "text": "Act out your favorite emoji without using your face",
    "theme": "challenge",
    "difficulty": "hard",
    "tags": ["emoji", "acting", "body"]
  },
  {
    "id": 15,
    "text": "Create a stop-motion scene with snacks",
    "theme": "creativity",
    "difficulty": "hard",
    "tags": ["stop-motion", "snacks", "animation"]
  },
  {
    "id": 16,
    "text": "Show your pet's personality in 10 seconds",
    "theme": "pets",
    "difficulty": "easy",
    "tags": ["pets", "personality", "animals"]
  },
  {
    "id": 17,
    "text": "Demonstrate how to fold a fitted sheet properly",
    "theme": "lifestyle",
    "difficulty": "hard",
    "tags": ["folding", "sheet", "household"]
  },
  {
    "id": 18,
    "text": "Create a beat using only things in your room",
    "theme": "music",
    "difficulty": "medium",
    "tags": ["music", "beat", "percussion"]
  },
  {
    "id": 19,
    "text": "Show your best 'trying to be quiet at 3am' walk",
    "theme": "humor",
    "difficulty": "easy",
    "tags": ["quiet", "walking", "night"]
  },
  {
    "id": 20,
    "text": "Create a commercial for something useless",
    "theme": "humor",
    "difficulty": "hard",
    "tags": ["commercial", "advertisement", "comedy"]
  }
  // Note: This is a shortened version. In production, include all 200 prompts
];

export const promptDatabaseService = {
  async initializePromptsDatabase() {
    try {
      const promptsRef = doc(db, SNAPPLE_PROMPTS_COLLECTION, 'promptsDatabase');
      const existingDoc = await getDoc(promptsRef);
      
      if (existingDoc.exists()) {
        console.log('Prompts database already exists');
        return { success: true, message: 'Database already initialized' };
      }

      await setDoc(promptsRef, {
        prompts: PROMPTS_DATABASE,
        totalPrompts: PROMPTS_DATABASE.length,
        lastUpdated: serverTimestamp(),
        createdAt: serverTimestamp(),
        version: '1.0'
      });

      console.log('Prompts database initialized successfully');
      return { success: true };
    } catch (error) {
      console.error("Error initializing prompts database:", error);
      return { success: false, error: "Failed to initialize prompts database" };
    }
  },

  async getRandomPrompt() {
    try {
      const promptsRef = doc(db, SNAPPLE_PROMPTS_COLLECTION, 'promptsDatabase');
      const promptsDoc = await getDoc(promptsRef);
      
      if (!promptsDoc.exists()) {
        // Initialize if not exists
        const initResult = await this.initializePromptsDatabase();
        if (!initResult.success) {
          return initResult;
        }
        return await this.getRandomPrompt();
      }

      const promptsData = promptsDoc.data();
      const prompts = promptsData.prompts || [];
      
      if (prompts.length === 0) {
        return { success: false, error: "No prompts available" };
      }

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

  async getAllPrompts() {
    try {
      const promptsRef = doc(db, SNAPPLE_PROMPTS_COLLECTION, 'promptsDatabase');
      const promptsDoc = await getDoc(promptsRef);
      
      if (!promptsDoc.exists()) {
        return { success: false, error: "Prompts database not found" };
      }

      const promptsData = promptsDoc.data();
      return {
        success: true,
        prompts: promptsData.prompts || [],
        totalPrompts: promptsData.totalPrompts || 0
      };
    } catch (error) {
      console.error("Error getting all prompts:", error);
      return { success: false, error: "Failed to get prompts" };
    }
  }
};