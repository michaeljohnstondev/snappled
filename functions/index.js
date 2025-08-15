const functions = require('firebase-functions');
const admin = require('firebase-admin');

admin.initializeApp();
const db = admin.firestore();

// Your 200 prompts database
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
  }
  // Add all 200 prompts here
];

// Scheduled function that runs every hour
// Note: Requires Firebase Blaze plan
// exports.hourlyPromptMaintenance = functions.pubsub
//   .schedule('0 * * * *') // Every hour at minute 0
//   .timeZone('UTC') // Adjust to your timezone
//   .onRun(async (context) => {
//     console.log('Running hourly prompt maintenance...');
    
//     try {
//       // 1. Clean up expired prompts
//       await cleanupExpiredPrompts();
      
//       // 2. Create new prompt for current hour
//       await createHourlyPrompt();
      
//       console.log('Hourly maintenance completed successfully');
//       return null;
//     } catch (error) {
//       console.error('Error in hourly maintenance:', error);
//       throw error;
//     }
//   });

// Function to create a new hourly prompt
async function createHourlyPrompt() {
  const now = new Date();
  const hour = now.getHours();
  const dateStr = now.toISOString().split('T')[0]; // YYYY-MM-DD format
  const promptId = `${dateStr}-${hour}`;

  try {
    // Check if prompt already exists for this hour
    const existingPrompt = await db.collection('hourlyPrompts').doc(promptId).get();
    
    if (existingPrompt.exists) {
      console.log(`Prompt already exists for ${promptId}`);
      return;
    }

    // Select random prompt from database
    const randomIndex = Math.floor(Math.random() * PROMPTS_DATABASE.length);
    const selectedPrompt = PROMPTS_DATABASE[randomIndex];
    
    // Create hourly prompt document
    const hourlyPromptData = {
      ...selectedPrompt,
      date: dateStr,
      hour: hour,
      type: 'hourly',
      isActive: true,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      expiresAt: new Date(now.getTime() + (24 * 60 * 60 * 1000)), // 24 hours from now
      snappleCount: 0
    };

    await db.collection('hourlyPrompts').doc(promptId).set(hourlyPromptData);
    console.log(`Created hourly prompt: ${promptId} - "${selectedPrompt.text}"`);
    
  } catch (error) {
    console.error('Error creating hourly prompt:', error);
    throw error;
  }
}

// Function to cleanup expired prompts
async function cleanupExpiredPrompts() {
  const now = new Date();
  
  try {
    const expiredQuery = await db.collection('hourlyPrompts')
      .where('isActive', '==', true)
      .where('expiresAt', '<=', now)
      .get();
    
    const batch = db.batch();
    let count = 0;
    
    expiredQuery.forEach(doc => {
      batch.update(doc.ref, {
        isActive: false,
        deactivatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      count++;
    });
    
    if (count > 0) {
      await batch.commit();
      console.log(`Deactivated ${count} expired prompts`);
    } else {
      console.log('No expired prompts found');
    }
    
  } catch (error) {
    console.error('Error cleaning up expired prompts:', error);
    throw error;
  }
}

// Manual trigger function for testing
exports.manualPromptMaintenance = functions.https.onCall(async (data, context) => {
  // Verify user is authenticated (optional)
  if (!context.auth) {
    throw new functions.https.HttpsError('unauthenticated', 'User must be authenticated');
  }
  
  try {
    await cleanupExpiredPrompts();
    await createHourlyPrompt();
    
    return { success: true, message: 'Manual maintenance completed' };
  } catch (error) {
    console.error('Error in manual maintenance:', error);
    throw new functions.https.HttpsError('internal', 'Maintenance failed');
  }
});

// Initialize prompts database (run once)
exports.initializePromptsDatabase = functions.https.onCall(async (data, context) => {
  try {
    const promptsRef = db.collection('snapplePrompts').doc('promptsDatabase');
    const existingDoc = await promptsRef.get();
    
    if (existingDoc.exists) {
      return { success: true, message: 'Database already initialized' };
    }

    await promptsRef.set({
      prompts: PROMPTS_DATABASE,
      totalPrompts: PROMPTS_DATABASE.length,
      lastUpdated: admin.firestore.FieldValue.serverTimestamp(),
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
      version: '1.0'
    });

    return { success: true, message: 'Database initialized successfully' };
  } catch (error) {
    console.error('Error initializing database:', error);
    throw new functions.https.HttpsError('internal', 'Failed to initialize database');
  }
});