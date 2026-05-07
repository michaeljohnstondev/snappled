import {
  doc,
  setDoc,
  getDoc,
  updateDoc,
  collection,
  query,
  where,
  getDocs,
  onSnapshot,
  serverTimestamp,
  arrayUnion,
  deleteDoc,
  orderBy,
  limit,
  increment,
} from 'firebase/firestore';
import { db } from './firebase';

const SNAPPLES_COLLECTION = 'snapples';

const GAMES_COLLECTION = 'games';

const DEFAULT_PROMPTS = [
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
const ROUNDS_PER_GAME = 5;
const HAND_SIZE = 6;
const PICK_TIME = 15000; // 15 seconds to pick
const FIRST_ROUND_REVIEW_BONUS = 60000; // Extra minute on round 1 so players can review their hand
const VOTE_TIME = 15000; // 15 seconds per submission to vote
const MAX_PLAYERS = 6;

export const GAME_PHASES = {
  LOBBY: 'lobby',
  PICKING: 'picking',
  VOTING: 'voting',
  ROUND_RESULTS: 'roundResults',
  FINAL_RESULTS: 'finalResults',
};

export const gameService = {
  // Create a new game lobby
  async createGame(hostId, hostUsername) {
    try {
      const gameRef = doc(collection(db, GAMES_COLLECTION));
      const gameDoc = {
        hostId,
        phase: GAME_PHASES.LOBBY,
        currentRound: 0,
        totalRounds: ROUNDS_PER_GAME,
        players: [{
          uid: hostId,
          username: hostUsername,
          points: 0,
          connected: true,
        }],
        prompts: [],
        submissions: [],
        votes: {},
        roundResults: [],
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };

      await setDoc(gameRef, gameDoc);
      return { success: true, gameId: gameRef.id };
    } catch (error) {
      console.error('[GameService] Error creating game:', error);
      return { success: false, error: error.message };
    }
  },

  // Join an existing game
  async joinGame(gameId, userId, username) {
    try {
      const gameRef = doc(db, GAMES_COLLECTION, gameId);
      const gameDoc = await getDoc(gameRef);

      if (!gameDoc.exists()) {
        return { success: false, error: 'Game not found' };
      }

      const data = gameDoc.data();
      if (data.phase !== GAME_PHASES.LOBBY) {
        return { success: false, error: 'Game already in progress' };
      }

      if (data.players.length >= MAX_PLAYERS) {
        return { success: false, error: 'Game is full' };
      }

      if (data.players.some(p => p.uid === userId)) {
        return { success: true, gameId }; // Already in game
      }

      await updateDoc(gameRef, {
        players: arrayUnion({
          uid: userId,
          username,
          points: 0,
          connected: true,
        }),
        updatedAt: serverTimestamp(),
      });

      return { success: true, gameId };
    } catch (error) {
      console.error('[GameService] Error joining game:', error);
      return { success: false, error: error.message };
    }
  },

  // Find an open game to join
  async findOpenGame(userId) {
    try {
      const q = query(
        collection(db, GAMES_COLLECTION),
        where('phase', '==', GAME_PHASES.LOBBY),
        orderBy('createdAt', 'desc'),
        limit(10)
      );

      const snapshot = await getDocs(q);
      for (const doc of snapshot.docs) {
        const data = doc.data();
        if (data.players.length < MAX_PLAYERS && !data.players.some(p => p.uid === userId)) {
          return { success: true, gameId: doc.id, game: data };
        }
      }

      return { success: false, error: 'No open games found' };
    } catch (error) {
      console.error('[GameService] Error finding game:', error);
      return { success: false, error: error.message };
    }
  },

  // Start the game (host only)
  async startGame(gameId, hostId, prompts) {
    try {
      const gameRef = doc(db, GAMES_COLLECTION, gameId);
      const gameDoc = await getDoc(gameRef);

      if (!gameDoc.exists()) return { success: false, error: 'Game not found' };

      const data = gameDoc.data();
      if (data.hostId !== hostId) return { success: false, error: 'Only host can start' };
      if (data.players.length < 2) return { success: false, error: 'Need at least 2 players' };

      await updateDoc(gameRef, {
        phase: GAME_PHASES.PICKING,
        currentRound: 1,
        prompts: prompts.slice(0, ROUNDS_PER_GAME),
        submissions: [],
        votes: {},
        // Round 1 gets an extra minute so players can scout their hand.
        pickDeadline: new Date(Date.now() + PICK_TIME + FIRST_ROUND_REVIEW_BONUS).toISOString(),
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error('[GameService] Error starting game:', error);
      return { success: false, error: error.message };
    }
  },

  // Submit a card pick for the current round
  async submitPick(gameId, userId, snapple) {
    try {
      const gameRef = doc(db, GAMES_COLLECTION, gameId);

      await updateDoc(gameRef, {
        submissions: arrayUnion({
          uid: userId,
          snappleId: snapple.id,
          videoUrl: snapple.videoUrl,
          prompt: snapple.prompt,
          creatorUsername: snapple.creatorUsername || 'anonymous',
        }),
        updatedAt: serverTimestamp(),
      });

      // Track that this snapple was played in a game. Best-effort — don't fail
      // the pick if the snapple doc happens to be missing.
      if (snapple?.id) {
        updateDoc(doc(db, SNAPPLES_COLLECTION, snapple.id), {
          gamesPlayed: increment(1),
        }).catch(() => {});
      }

      return { success: true };
    } catch (error) {
      console.error('[GameService] Error submitting pick:', error);
      return { success: false, error: error.message };
    }
  },

  // Move to voting phase
  async startVoting(gameId) {
    try {
      const gameRef = doc(db, GAMES_COLLECTION, gameId);

      await updateDoc(gameRef, {
        phase: GAME_PHASES.VOTING,
        votes: {},
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error('[GameService] Error starting voting:', error);
      return { success: false, error: error.message };
    }
  },

  // Cast a vote (swipe right)
  async castVote(gameId, voterId, submissionUid) {
    try {
      const gameRef = doc(db, GAMES_COLLECTION, gameId);
      const gameDoc = await getDoc(gameRef);
      const data = gameDoc.data();

      const votes = data.votes || {};
      if (!votes[submissionUid]) {
        votes[submissionUid] = [];
      }
      if (!votes[submissionUid].includes(voterId)) {
        votes[submissionUid].push(voterId);
      }

      await updateDoc(gameRef, {
        votes,
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error('[GameService] Error casting vote:', error);
      return { success: false, error: error.message };
    }
  },

  // Calculate round results and advance
  async finishRound(gameId) {
    try {
      const gameRef = doc(db, GAMES_COLLECTION, gameId);
      const gameDoc = await getDoc(gameRef);
      const data = gameDoc.data();

      // Tally votes
      const votes = data.votes || {};
      const rankings = data.submissions
        .map(sub => ({
          uid: sub.uid,
          votes: (votes[sub.uid] || []).length,
        }))
        .sort((a, b) => b.votes - a.votes);

      // Award points: 1st=5, 2nd=3, 3rd=1
      const pointValues = [5, 3, 1, 0, 0, 0];
      const roundResult = rankings.map((r, i) => ({
        ...r,
        pointsEarned: pointValues[i] || 0,
        placement: i + 1,
      }));

      // Update player totals
      const updatedPlayers = data.players.map(p => {
        const result = roundResult.find(r => r.uid === p.uid);
        return {
          ...p,
          points: p.points + (result?.pointsEarned || 0),
        };
      });

      const isLastRound = data.currentRound >= data.totalRounds;

      await updateDoc(gameRef, {
        phase: isLastRound ? GAME_PHASES.FINAL_RESULTS : GAME_PHASES.ROUND_RESULTS,
        players: updatedPlayers,
        roundResults: arrayUnion({
          round: data.currentRound,
          rankings: roundResult,
        }),
        updatedAt: serverTimestamp(),
      });

      // Track wins on the snapple itself. A "win" = the snapple submitted by
      // the player at placement 1 for this round. Tie-breaks fall to whichever
      // submission sort put first — we don't double-count.
      const winnerUid = roundResult.find(r => r.placement === 1)?.uid;
      if (winnerUid) {
        const winningSubmission = (data.submissions || []).find(s => s.uid === winnerUid);
        if (winningSubmission?.snappleId) {
          updateDoc(doc(db, SNAPPLES_COLLECTION, winningSubmission.snappleId), {
            gamesWon: increment(1),
          }).catch(() => {});
        }
      }

      return { success: true, roundResult, isLastRound };
    } catch (error) {
      console.error('[GameService] Error finishing round:', error);
      return { success: false, error: error.message };
    }
  },

  // Advance to next round
  async nextRound(gameId) {
    try {
      const gameRef = doc(db, GAMES_COLLECTION, gameId);
      const gameDoc = await getDoc(gameRef);
      const data = gameDoc.data();

      await updateDoc(gameRef, {
        phase: GAME_PHASES.PICKING,
        currentRound: data.currentRound + 1,
        submissions: [],
        votes: {},
        pickDeadline: new Date(Date.now() + PICK_TIME).toISOString(),
        updatedAt: serverTimestamp(),
      });

      return { success: true };
    } catch (error) {
      console.error('[GameService] Error advancing round:', error);
      return { success: false, error: error.message };
    }
  },

  // Fetch random game prompts — seeds if empty
  async getGamePrompts(count = 5) {
    try {
      const q = query(collection(db, 'gamePrompts'), limit(50));
      let snapshot = await getDocs(q);

      // Seed if empty
      if (snapshot.empty) {
        console.log('[GameService] Seeding game prompts...');
        await this.seedGamePrompts();
        snapshot = await getDocs(q);
      }

      const prompts = [];
      snapshot.forEach(d => prompts.push(d.data().text));
      return prompts.sort(() => Math.random() - 0.5).slice(0, count);
    } catch (error) {
      console.error('[GameService] Error fetching game prompts:', error);
      return DEFAULT_PROMPTS.slice(0, count);
    }
  },

  async seedGamePrompts() {
    for (const text of DEFAULT_PROMPTS) {
      await setDoc(doc(collection(db, 'gamePrompts')), {
        text,
        usageCount: 0,
        createdAt: new Date().toISOString(),
      });
    }
    console.log('[GameService] Seeded', DEFAULT_PROMPTS.length, 'prompts');
  },

  // Draw a hand from deck
  drawHand(ownedSnapples, allSnapples = [], handSize = HAND_SIZE) {
    const shuffled = [...ownedSnapples].sort(() => Math.random() - 0.5);
    const hand = shuffled.slice(0, handSize);

    // Pad with random community snapples if not enough
    if (hand.length < handSize && allSnapples.length > 0) {
      const handIds = new Set(hand.map(s => s.id));
      const extras = allSnapples
        .filter(s => !handIds.has(s.id))
        .sort(() => Math.random() - 0.5);
      while (hand.length < handSize && extras.length > 0) {
        hand.push(extras.pop());
      }
    }

    return hand;
  },

  // Calculate final coin rewards
  calculateRewards(players) {
    const sorted = [...players].sort((a, b) => b.points - a.points);
    const rewards = [50, 30, 15, 5, 0, 0];
    return sorted.map((p, i) => ({
      ...p,
      placement: i + 1,
      coinsEarned: rewards[i] || 0,
    }));
  },

  // Listen to game changes in real-time
  subscribeToGame(gameId, callback) {
    const gameRef = doc(db, GAMES_COLLECTION, gameId);
    return onSnapshot(gameRef, (doc) => {
      if (doc.exists()) {
        callback({ id: doc.id, ...doc.data() });
      }
    });
  },

  // Find active games to spectate
  async findActiveGames(limitCount = 10) {
    try {
      const q = query(
        collection(db, GAMES_COLLECTION),
        where('phase', 'in', ['picking', 'voting', 'roundResults']),
        orderBy('createdAt', 'desc'),
        limit(limitCount)
      );
      const snapshot = await getDocs(q);
      const games = [];
      snapshot.forEach(d => {
        const data = d.data();
        if (data.players?.length >= 2) {
          games.push({ id: d.id, ...data });
        }
      });
      return { success: true, games };
    } catch (error) {
      console.error('[GameService] Error finding active games:', error);
      return { success: false, games: [] };
    }
  },

  // Leave a game
  async leaveGame(gameId, userId) {
    try {
      const gameRef = doc(db, GAMES_COLLECTION, gameId);
      const gameDoc = await getDoc(gameRef);
      if (!gameDoc.exists()) return;

      const data = gameDoc.data();
      const updatedPlayers = data.players.filter(p => p.uid !== userId);

      if (updatedPlayers.length === 0) {
        await deleteDoc(gameRef);
      } else {
        await updateDoc(gameRef, {
          players: updatedPlayers,
          hostId: updatedPlayers[0].uid, // Transfer host
          updatedAt: serverTimestamp(),
        });
      }
    } catch (error) {
      console.error('[GameService] Error leaving game:', error);
    }
  },

  ROUNDS_PER_GAME,
  HAND_SIZE,
  MAX_PLAYERS,
  PICK_TIME,
  VOTE_TIME,
};

export default gameService;
