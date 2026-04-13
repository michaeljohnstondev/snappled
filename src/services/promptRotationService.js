import {
  collection,
  query,
  where,
  getDocs,
  addDoc,
  orderBy,
  limit,
  onSnapshot,
} from 'firebase/firestore';
import { db } from './firebase';

const ACTIVE_PROMPTS = 'activePrompts';
const PROMPT_POOL = 'promptPool';

export const promptRotationService = {
  // Get all currently active prompts
  async getActivePrompts() {
    try {
      const now = new Date().toISOString();
      const q = query(
        collection(db, ACTIVE_PROMPTS),
        orderBy('createdAt', 'desc'),
        limit(50)
      );

      const snapshot = await getDocs(q);
      const prompts = [];
      snapshot.forEach(d => {
        const data = d.data();
        if (data.expiresAt > now) {
          prompts.push({ id: d.id, ...data });
        }
      });

      return { success: true, prompts };
    } catch (error) {
      console.error('[PromptRotation] Error getting active prompts:', error);
      return { success: false, prompts: [] };
    }
  },

  // Real-time listener for active prompts
  subscribeToActivePrompts(callback) {
    const q = query(
      collection(db, ACTIVE_PROMPTS),
      orderBy('createdAt', 'desc'),
      limit(50)
    );

    return onSnapshot(q, (snapshot) => {
      const prompts = [];
      const currentTime = new Date().toISOString();
      snapshot.forEach(d => {
        const data = d.data();
        if (data.expiresAt > currentTime) {
          prompts.push({ id: d.id, ...data });
        }
      });
      callback(prompts);
    });
  },

  // Check if a prompt is in lockout (last 10 min)
  isLocked(prompt) {
    if (!prompt?.lockoutAt) return false;
    return new Date().toISOString() >= prompt.lockoutAt;
  },

  // Add new prompts to pool (skips duplicates)
  async addPromptsToPool(prompts) {
    try {
      // Get all existing prompt texts to check for dupes
      const existing = await getDocs(query(collection(db, PROMPT_POOL), limit(500)));
      const existingTexts = new Set();
      existing.forEach(d => existingTexts.add(d.data().text?.toLowerCase()));

      let added = 0;
      for (const prompt of prompts) {
        if (!existingTexts.has(prompt.text.toLowerCase())) {
          await addDoc(collection(db, PROMPT_POOL), {
            text: prompt.text,
            category: prompt.category || 'general',
            used: false,
            timesUsed: 0,
            createdAt: new Date().toISOString(),
          });
          added++;
        }
      }
      console.log(`[PromptRotation] Added ${added} new prompts (${prompts.length - added} dupes skipped)`);
      return added;
    } catch (e) {
      console.error('[PromptRotation] Error adding prompts:', e);
      return 0;
    }
  },

  // Seed the prompt pool (run once from app if pool is empty)
  async seedPromptPool() {
    try {
      const existing = await getDocs(query(collection(db, PROMPT_POOL), limit(1)));
      if (!existing.empty) return;

      console.log('[PromptRotation] Seeding prompt pool...');
      for (const prompt of SEED_PROMPTS) {
        await addDoc(collection(db, PROMPT_POOL), {
          text: prompt.text,
          category: prompt.category,
          used: false,
          createdAt: new Date().toISOString(),
        });
      }
      console.log('[PromptRotation] Seeded', SEED_PROMPTS.length, 'prompts');
    } catch (error) {
      console.error('[PromptRotation] Seed error:', error);
    }
  },

  // Seed wave 2 — prompts about recording others/surroundings
  async seedWave2() {
    return await this.addPromptsToPool(WAVE2_PROMPTS);
  },
};

const WAVE2_PROMPTS = [
  { text: "Film someone doing something they're amazing at", category: "others" },
  { text: "Catch your friend's genuine laugh", category: "others" },
  { text: "Record someone telling their best story", category: "others" },
  { text: "Film a stranger's act of kindness", category: "others" },
  { text: "Capture someone in their element — work, hobby, anything", category: "others" },
  { text: "Record your friend's reaction to a surprise", category: "others" },
  { text: "Film someone doing their signature move", category: "others" },
  { text: "Catch someone singing when they think nobody's listening", category: "others" },
  { text: "Record your crew's pre-game ritual", category: "others" },
  { text: "Film someone explaining their passion", category: "others" },
  { text: "Capture the energy of a crowd around you", category: "others" },
  { text: "Record your parent or grandparent sharing wisdom", category: "others" },
  { text: "Film someone's victory moment — big or small", category: "others" },
  { text: "Catch your friend being dramatic about something minor", category: "others" },
  { text: "Record someone's honest first reaction to tasting something", category: "others" },
  { text: "Film the chaos happening around you right now", category: "environment" },
  { text: "Record the most interesting thing within 10 feet of you", category: "environment" },
  { text: "Capture the vibe of wherever you are — no words", category: "environment" },
  { text: "Film what's outside your front door right now", category: "environment" },
  { text: "Record the sounds around you for 10 seconds", category: "environment" },
  { text: "Film something beautiful that most people walk past", category: "environment" },
  { text: "Capture a moment of pure chaos", category: "environment" },
  { text: "Record your neighborhood's personality", category: "environment" },
  { text: "Film something that's about to happen", category: "environment" },
  { text: "Capture a perfect moment — you'll know it when you see it", category: "environment" },
  { text: "Ask someone what they'd do with a million dollars", category: "interaction" },
  { text: "Get someone to teach you something in 10 seconds", category: "interaction" },
  { text: "Film a debate between two friends", category: "interaction" },
  { text: "Ask a stranger their hot take on anything", category: "interaction" },
  { text: "Record someone's answer to: what's your biggest flex?", category: "interaction" },
  { text: "Get someone to do their best impression of you", category: "interaction" },
  { text: "Ask the nearest person to tell you a secret", category: "interaction" },
  { text: "Film two people competing at something random", category: "interaction" },
  { text: "Get someone to rap about their day", category: "interaction" },
  { text: "Ask someone: what's the dumbest thing you've ever done?", category: "interaction" },
  { text: "Film something falling in slow motion", category: "action" },
  { text: "Record the fastest thing near you", category: "action" },
  { text: "Capture something being built or created", category: "action" },
  { text: "Film a chain reaction — dominos, bumps, anything", category: "action" },
  { text: "Record something spinning", category: "action" },
  { text: "Film your city at night", category: "mood" },
  { text: "Capture the energy of a party or gathering", category: "mood" },
  { text: "Record the calm before the storm — literal or figurative", category: "mood" },
  { text: "Film the transition from day to night or night to day", category: "mood" },
  { text: "Capture a moment of silence in a loud world", category: "mood" },
];

const SEED_PROMPTS = [
  { text: "Show us your morning routine in 10 seconds", category: "lifestyle" },
  { text: "Your workspace right now — no cleaning allowed", category: "lifestyle" },
  { text: "What's in your fridge? Be honest", category: "lifestyle" },
  { text: "Your outfit of the day — spin for us", category: "lifestyle" },
  { text: "Show us your hidden talent", category: "lifestyle" },
  { text: "The view from your window right now", category: "lifestyle" },
  { text: "Your most prized possession", category: "lifestyle" },
  { text: "10 seconds of your commute", category: "lifestyle" },
  { text: "Your pet doing something funny", category: "lifestyle" },
  { text: "Cook something in 10 seconds — GO", category: "lifestyle" },
  { text: "Your best impression of your parents", category: "comedy" },
  { text: "React to finding out school is cancelled", category: "comedy" },
  { text: "Pretend you just won the lottery", category: "comedy" },
  { text: "Your worst dance move", category: "comedy" },
  { text: "Tell us a joke in 10 seconds", category: "comedy" },
  { text: "Act out your last text message", category: "comedy" },
  { text: "Your best celebrity impression", category: "comedy" },
  { text: "Reenact the last thing that made you laugh", category: "comedy" },
  { text: "Pretend you're a news anchor reporting on your day", category: "comedy" },
  { text: "Your face when you check your bank account", category: "comedy" },
  { text: "Act out ordering food when you can't decide", category: "comedy" },
  { text: "Pretend you just saw a ghost", category: "comedy" },
  { text: "Draw something blindfolded", category: "creative" },
  { text: "Make art with whatever's in front of you", category: "creative" },
  { text: "Beatbox for 10 seconds", category: "creative" },
  { text: "Sing your name like an opera singer", category: "creative" },
  { text: "Create a 10-second short film with no words", category: "creative" },
  { text: "Make the most satisfying video you can", category: "creative" },
  { text: "Show us your best camera trick", category: "creative" },
  { text: "Make music with household items", category: "creative" },
  { text: "Speed draw your self portrait", category: "creative" },
  { text: "Create a transition without editing", category: "creative" },
  { text: "Don't blink for 10 seconds", category: "challenge" },
  { text: "Say the alphabet backwards as fast as you can", category: "challenge" },
  { text: "Stack as many things as you can in 10 seconds", category: "challenge" },
  { text: "How many pushups in 10 seconds?", category: "challenge" },
  { text: "Speed solve something — anything", category: "challenge" },
  { text: "Catch something behind your back", category: "challenge" },
  { text: "Touch your nose with your tongue", category: "challenge" },
  { text: "Spin 5 times and walk straight", category: "challenge" },
  { text: "Balance something on your head for 10 seconds", category: "challenge" },
  { text: "Do your best trick shot", category: "challenge" },
  { text: "Hot take: pineapple on pizza — yes or no?", category: "opinion" },
  { text: "What's the most overrated movie?", category: "opinion" },
  { text: "One thing you'd change about your city", category: "opinion" },
  { text: "The best food that exists — argue your case", category: "opinion" },
  { text: "Is cereal a soup? Defend your answer", category: "opinion" },
  { text: "What song is stuck in your head?", category: "opinion" },
  { text: "Your most unpopular opinion", category: "opinion" },
  { text: "The best decade for music — GO", category: "opinion" },
  { text: "Cats or dogs? You have 10 seconds to convince us", category: "opinion" },
  { text: "What would you rename your state/country?", category: "opinion" },
  { text: "Tell us about your most embarrassing moment", category: "story" },
  { text: "Your worst date story in 10 seconds", category: "story" },
  { text: "The craziest thing that happened to you this week", category: "story" },
  { text: "A childhood memory in 10 seconds", category: "story" },
  { text: "Your biggest flex — brag about it", category: "story" },
  { text: "Tell us a secret nobody knows", category: "story" },
  { text: "Your worst cooking disaster", category: "story" },
  { text: "A time you got caught doing something", category: "story" },
  { text: "Your most irrational fear — explain it", category: "story" },
  { text: "The weirdest dream you've ever had", category: "story" },
  { text: "Duet this with your best friend", category: "social" },
  { text: "Show us your friend group's inside joke", category: "social" },
  { text: "Show us what your friend does that annoys you", category: "social" },
  { text: "Get a stranger to say hi to the camera", category: "social" },
  { text: "Ask someone near you to tell a joke", category: "social" },
  { text: "Show us your group chat energy IRL", category: "social" },
  { text: "Your best handshake with someone", category: "social" },
  { text: "Your best sports move in 10 seconds", category: "skills" },
  { text: "Play an instrument — any instrument", category: "skills" },
  { text: "Show off a skill you've been working on", category: "skills" },
  { text: "Your best pen spin or card trick", category: "skills" },
  { text: "Make something disappear", category: "skills" },
  { text: "Your most impressive catch", category: "skills" },
  { text: "Speed run tying your shoes", category: "skills" },
  { text: "Your aesthetic in 10 seconds", category: "vibes" },
  { text: "The most beautiful thing near you right now", category: "vibes" },
  { text: "Golden hour selfie — make it cinematic", category: "vibes" },
  { text: "Walk in slow motion with your best fit", category: "vibes" },
  { text: "Your room tour in 10 seconds — GO", category: "vibes" },
  { text: "Show us your vibe without words", category: "vibes" },
  { text: "The sunset/sunrise from where you are", category: "vibes" },
  { text: "Your playlist energy as a video", category: "vibes" },
  { text: "The best thing you ate today", category: "food" },
  { text: "Make a snack in 10 seconds", category: "food" },
  { text: "Rate your fridge out of 10", category: "food" },
  { text: "Your signature dish — show it off", category: "food" },
  { text: "The weirdest food combo that actually slaps", category: "food" },
  { text: "Your coffee/drink order — make it", category: "food" },
  { text: "React to your camera roll's first photo", category: "reactions" },
  { text: "Your reaction to your old photos", category: "reactions" },
  { text: "Open your screen time and react", category: "reactions" },
  { text: "Check your bank balance and react", category: "reactions" },
  { text: "Read your last DM out loud and react", category: "reactions" },
  { text: "Your face when your alarm goes off", category: "reactions" },
];

export default promptRotationService;
