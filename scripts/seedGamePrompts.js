// Run from project root: node scripts/seedGamePrompts.js
// Uses Application Default Credentials from gcloud/firebase CLI

process.env.GOOGLE_APPLICATION_CREDENTIALS = '';

const { initializeApp, cert, applicationDefault } = require('../functions/node_modules/firebase-admin/lib/app');
const { getFirestore } = require('../functions/node_modules/firebase-admin/lib/firestore');

// Use the firebase CLI credentials
const { execSync } = require('child_process');

// Get access token from firebase CLI
let accessToken;
try {
  const tokenJson = execSync('firebase login:ci --no-localhost 2>/dev/null || echo ""', { encoding: 'utf8' });
} catch(e) {}

// Initialize with project ID only - will use ADC
const admin = require('../functions/node_modules/firebase-admin');

// Try to get credentials from gcloud
try {
  const credPath = process.env.APPDATA + '\\gcloud\\application_default_credentials.json';
  const fs = require('fs');
  if (fs.existsSync(credPath)) {
    process.env.GOOGLE_APPLICATION_CREDENTIALS = credPath;
    console.log('Using gcloud credentials');
  }
} catch(e) {}

admin.initializeApp({ projectId: 'snapplepark' });
const db = admin.firestore();

const PROMPTS = [
  "Most likely to go viral", "Best excuse for being late", "This one hits different at 3am",
  "POV: you just got ghosted", "The villain origin story", "Main character energy",
  "When the beat drops", "This gives NPC energy", "Caught in 4K",
  "No thoughts, just vibes", "When you lie on your resume", "The face you make when your food arrives",
  "When the teacher picks you and you weren't listening", "How it started vs how it's going",
  "When someone says 'we need to talk'", "The audacity", "Living rent free in my head",
  "Tell me you're gen Z without telling me", "When the WiFi goes out", "Monday morning energy",
  "Best reaction to good news", "Worst poker face", "When your crush walks by",
  "Finding money in your pocket", "When the song you hate comes on", "Plot twist energy",
  "The betrayal", "When you realize you were wrong", "Unexpected wholesome moment",
  "That one friend at every party", "Most impressive in 10 seconds", "Best hidden talent",
  "Smoothest move", "Most dramatic entrance", "Best impression of a celebrity",
  "The glow up", "Peak performance", "Art in motion", "Making it look easy", "Built different",
  "Most unhinged energy", "Confidence level: 1000", "No shame whatsoever",
  "The cringiest thing you've seen", "Chaotic good", "Chaotic evil", "Lawful chaos",
  "Zero filter", "This should be illegal", "Why are you like this",
  "Friday at 5pm energy", "Sunday scaries", "Before coffee vs after coffee",
  "Introvert at a party", "When you're hangry", "Post-workout delusion",
  "Retail therapy", "That 2am motivation", "Payday vs day before payday", "Senioritis",
  "Surviving a zombie apocalypse", "First day at a new job", "Explaining your search history",
  "When the squad links up", "Last person on earth", "If animals could talk",
  "Time traveler from 2050", "Alien's first day on earth", "If your pet had a job",
  "Parallel universe you", "Most rewatchable", "Would definitely win a staring contest",
  "Best under pressure", "Clutch moment", "The comeback kid", "Underdog energy",
  "Final boss vibes", "Speed run champion", "The GOAT", "MVP of the group chat",
  "Best wingman material", "The friend everyone needs", "Group project carry",
  "Most likely to steal your fries", "Would survive a road trip together", "Best hype person",
  "The glue that holds the group together", "Most likely to start a cult (positive)",
  "Would trust with my phone unlocked", "The designated driver energy",
  "Just trust the process", "It's giving...", "The energy we need in 2026",
  "Slay or be slayed", "Rent is due but make it fashion",
  "If this snapple was a spice it would be...", "The snapple that keeps on giving",
  "Peak internet right here", "Screenshot worthy", "Send this to someone with no context",
];

function getCategory(i) {
  if (i < 20) return 'funny';
  if (i < 30) return 'reactions';
  if (i < 40) return 'creative';
  if (i < 50) return 'cringe';
  if (i < 60) return 'moods';
  if (i < 70) return 'scenarios';
  if (i < 80) return 'competition';
  if (i < 90) return 'social';
  return 'wildcard';
}

async function seed() {
  console.log(`Seeding ${PROMPTS.length} game prompts...`);
  const batch = db.batch();
  PROMPTS.forEach((text, i) => {
    const ref = db.collection('gamePrompts').doc();
    batch.set(ref, { text, category: getCategory(i), usageCount: 0, createdAt: new Date().toISOString() });
  });
  await batch.commit();
  console.log('Done!');
  process.exit(0);
}

seed().catch(err => { console.error('Failed:', err.message); process.exit(1); });
