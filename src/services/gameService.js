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
const REVIEW_TIME = 60000; // 1 minute to review your hand before each round's picking starts
const PICK_TIME = 45000; // 45 seconds to pick — bots stagger 10-25s
const VOTE_TIME = 15000; // 15 seconds per submission to vote
const MAX_PLAYERS = 8;

export const GAME_PHASES = {
  LOBBY: 'lobby',
  REVIEW: 'review',
  PICKING: 'picking',
  VOTING: 'voting',
  ROUND_RESULTS: 'roundResults',
  FINAL_RESULTS: 'finalResults',
};

export const gameService = {
  // Create a new game lobby
  async createGame(hostId, hostUsername, targetPoints = 25) {
    try {
      const gameRef = doc(collection(db, GAMES_COLLECTION));
      // Stored as totalRounds for backward compat — semantically it's now
      // the play-to TARGET POINTS. 0 = infinite (host ends manually),
      // 1-200 = fixed target.
      const raw = Number(targetPoints);
      const safeRounds = raw === 0 ? 0 : Math.max(1, Math.min(200, raw || 25));
      const gameDoc = {
        hostId,
        phase: GAME_PHASES.LOBBY,
        currentRound: 0,
        totalRounds: safeRounds,
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

      // Game length is now driven by play-to TARGET POINTS, not round
      // count, so we can't pre-slice. Just store the full buffer the
      // caller fetched — nextRound refills when it runs low.
      await updateDoc(gameRef, {
        phase: GAME_PHASES.REVIEW,
        currentRound: 1,
        prompts: prompts,
        submissions: [],
        votes: {},
        ready: {}, // fresh ready map for the warmup screen
        reviewDeadline: new Date(Date.now() + REVIEW_TIME).toISOString(),
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
          creatorId: snapple.creatorId || null,
          creatorUsername: snapple.creatorUsername || 'anonymous',
          muted: !!snapple.muted,
          // Snapshot so CreatorActionRow can hide Buy/Wishlist on
          // private snapples without an extra fetch per submission.
          isPrivate: !!snapple.isPrivate,
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

  // Cast a vote — uses arrayUnion so concurrent vote casts (host + bots in
  // practice mode all firing in the same tick) don't lose each other's
  // writes. The previous read-modify-write pattern raced and dropped votes,
  // which left allVoted detection stuck in the wait screen.
  async castVote(gameId, voterId, submissionUid) {
    try {
      const gameRef = doc(db, GAMES_COLLECTION, gameId);
      await updateDoc(gameRef, {
        [`votes.${submissionUid}`]: arrayUnion(voterId),
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
      const sorted = data.submissions
        .map(sub => ({
          uid: sub.uid,
          votes: (votes[sub.uid] || []).length,
        }))
        .sort((a, b) => b.votes - a.votes);

      // Olympic-style tie placement — tied players share the higher placement,
      // next placement skips the tied count. Tied at 1st with 2 players →
      // both get placement 1, next player gets placement 3.
      let currentPlacement = 1;
      const withPlacement = sorted.map((r, i, arr) => {
        if (i > 0 && arr[i - 1].votes !== r.votes) {
          currentPlacement = i + 1;
        }
        return { ...r, placement: currentPlacement };
      });

      // Vote-based scoring: 1 vote = 1 point. Best card always wins by
      // exactly the margin people voted by. Placement is still computed
      // for round-winner highlighting.
      const roundResult = withPlacement.map(r => ({
        ...r,
        pointsEarned: r.votes,
      }));

      // Update player totals
      const updatedPlayers = data.players.map(p => {
        const result = roundResult.find(r => r.uid === p.uid);
        return {
          ...p,
          points: p.points + (result?.pointsEarned || 0),
        };
      });

      // Field reused: data.totalRounds is now the play-to TARGET POINTS.
      // 0 = infinite (host ends manually). Otherwise the game ends as
      // soon as any player crosses the target this round.
      const target = data.totalRounds;
      const topScore = updatedPlayers.reduce((m, p) => Math.max(m, p.points || 0), 0);
      const isLastRound = target > 0 && topScore >= target;

      await updateDoc(gameRef, {
        phase: isLastRound ? GAME_PHASES.FINAL_RESULTS : GAME_PHASES.ROUND_RESULTS,
        players: updatedPlayers,
        roundResults: arrayUnion({
          round: data.currentRound,
          rankings: roundResult,
        }),
        updatedAt: serverTimestamp(),
      });

      // Track wins on every snapple at placement 1 — ties get gamesWon
      // credit for all tied snapples.
      const winnerUids = roundResult.filter(r => r.placement === 1).map(r => r.uid);
      winnerUids.forEach(uid => {
        const winningSubmission = (data.submissions || []).find(s => s.uid === uid);
        if (winningSubmission?.snappleId) {
          updateDoc(doc(db, SNAPPLES_COLLECTION, winningSubmission.snappleId), {
            gamesWon: increment(1),
          }).catch(() => {});
        }
      });

      return { success: true, roundResult, isLastRound };
    } catch (error) {
      console.error('[GameService] Error finishing round:', error);
      return { success: false, error: error.message };
    }
  },

  // Advance to next round — goes straight to PICKING. Review only happens
  // once at game start; subsequent rounds keep the user's hand minus the
  // card they played, with one fresh replacement drawn on the client.
  async nextRound(gameId) {
    try {
      const gameRef = doc(db, GAMES_COLLECTION, gameId);
      const gameDoc = await getDoc(gameRef);
      const data = gameDoc.data();

      // Refill the prompt buffer when we're within 3 rounds of running
      // out. Vote-based scoring means game length is variable in any
      // mode (could blow past the original buffer), so we always check.
      // Best-effort — if the fetch fails the round still advances and
      // the prompt-text falls back to the placeholder.
      let nextPrompts = data.prompts || [];
      const used = data.currentRound; // about-to-become next round
      const remaining = nextPrompts.length - used;
      if (remaining < 3) {
        try {
          const fresh = await this.getGamePrompts(10);
          nextPrompts = [...nextPrompts, ...(fresh || [])];
        } catch (e) {}
      }

      await updateDoc(gameRef, {
        phase: GAME_PHASES.PICKING,
        currentRound: data.currentRound + 1,
        prompts: nextPrompts,
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

  // Host-only: end an infinite game early. Snaps phase to FINAL_RESULTS.
  async endGameEarly(gameId) {
    try {
      const gameRef = doc(db, GAMES_COLLECTION, gameId);
      await updateDoc(gameRef, {
        phase: GAME_PHASES.FINAL_RESULTS,
        updatedAt: serverTimestamp(),
      });
      return { success: true };
    } catch (error) {
      console.error('[GameService] Error ending game early:', error);
      return { success: false, error: error.message };
    }
  },

  // Transition from REVIEW to PICKING — host calls this when reviewDeadline
  // elapses (or when host taps "Start Round" early).
  // Admin-only: edit the active round's prompt text in place. All clients see
  // the new text immediately via onSnapshot. Doesn't reset submissions or
  // votes — the user just retypes the prompt for whatever's already happening.
  async editRoundPrompt(gameId, roundIndex, newText) {
    try {
      const gameRef = doc(db, GAMES_COLLECTION, gameId);
      const gameDoc = await getDoc(gameRef);
      if (!gameDoc.exists()) return { success: false, error: 'Game not found' };
      const data = gameDoc.data();
      const newPrompts = [...(data.prompts || [])];
      newPrompts[roundIndex] = newText;
      await updateDoc(gameRef, { prompts: newPrompts, updatedAt: serverTimestamp() });
      return { success: true };
    } catch (error) {
      console.error('[GameService] editRoundPrompt error:', error);
      return { success: false, error: error.message };
    }
  },

  // Admin-only: throw out the current round's prompt, pull a fresh one from
  // the pool, and restart the round (clears submissions + votes, snaps phase
  // back to PICKING with a new pickDeadline). Useful when an inappropriate
  // or busted prompt makes it live mid-game.
  async replaceAndRestartRound(gameId, roundIndex) {
    try {
      const gameRef = doc(db, GAMES_COLLECTION, gameId);
      const gameDoc = await getDoc(gameRef);
      if (!gameDoc.exists()) return { success: false, error: 'Game not found' };
      const data = gameDoc.data();

      // Pull one fresh prompt — same source as game start (least-used random).
      const fresh = await this.getGamePrompts(1);
      const newPrompt = (fresh && fresh[0]) || 'Make something cool';

      const newPrompts = [...(data.prompts || [])];
      newPrompts[roundIndex] = newPrompt;

      await updateDoc(gameRef, {
        prompts: newPrompts,
        phase: GAME_PHASES.PICKING,
        submissions: [],
        votes: {},
        pickDeadline: new Date(Date.now() + PICK_TIME).toISOString(),
        updatedAt: serverTimestamp(),
      });
      return { success: true, newPrompt };
    } catch (error) {
      console.error('[GameService] replaceAndRestartRound error:', error);
      return { success: false, error: error.message };
    }
  },

  // Host-only: change the play-to target from the lobby. Field stored
  // as `totalRounds` for backward compat but semantically targetPoints.
  // 0 = infinite, 1-200 = fixed target.
  async setTotalRounds(gameId, targetPoints) {
    try {
      const raw = Number(targetPoints);
      const safe = raw === 0 ? 0 : Math.max(1, Math.min(200, raw || 25));
      const gameRef = doc(db, GAMES_COLLECTION, gameId);
      await updateDoc(gameRef, {
        totalRounds: safe,
        updatedAt: serverTimestamp(),
      });
      return { success: true };
    } catch (error) {
      console.error('[GameService] Error setting totalRounds:', error);
      return { success: false, error: error.message };
    }
  },

  // Mark a single player as ready/not-ready on the warmup screen.
  // Stored as game.ready = { [uid]: true } so we can set/clear individual
  // entries via the dot-path syntax. Used by WarmupPhase + bot scheduler
  // to gate the REVIEW → PICKING transition.
  async setPlayerReady(gameId, uid, isReady) {
    try {
      const gameRef = doc(db, GAMES_COLLECTION, gameId);
      await updateDoc(gameRef, {
        [`ready.${uid}`]: !!isReady,
        updatedAt: serverTimestamp(),
      });
      return { success: true };
    } catch (error) {
      console.error('[GameService] Error setting player ready:', error);
      return { success: false, error: error.message };
    }
  },

  async startPicking(gameId) {
    try {
      const gameRef = doc(db, GAMES_COLLECTION, gameId);
      await updateDoc(gameRef, {
        phase: GAME_PHASES.PICKING,
        pickDeadline: new Date(Date.now() + PICK_TIME).toISOString(),
        updatedAt: serverTimestamp(),
      });
      return { success: true };
    } catch (error) {
      console.error('[GameService] Error starting picking:', error);
      return { success: false, error: error.message };
    }
  },

  // Fetch random game prompts — seeds if empty. Prefers least-used prompts
  // so games actually cycle through the full pool instead of replaying the
  // same handful every match.
  async getGamePrompts(count = 5) {
    try {
      // Order by usageCount ascending so least-used bubble up; pull a window
      // of 30 then shuffle to add randomness without going stale.
      const q = query(
        collection(db, 'gamePrompts'),
        orderBy('usageCount', 'asc'),
        limit(30),
      );
      let snapshot = await getDocs(q);

      if (snapshot.empty) {
        console.log('[GameService] Seeding game prompts...');
        await this.seedGamePrompts();
        snapshot = await getDocs(q);
      }

      const candidates = [];
      snapshot.forEach(d => candidates.push({ id: d.id, text: d.data().text }));
      const shuffled = this._shuffle(candidates).slice(0, count);

      // Increment usageCount for the selected prompts so next game prefers
      // others. Fire-and-forget — don't block on it.
      shuffled.forEach(p => {
        updateDoc(doc(db, 'gamePrompts', p.id), { usageCount: increment(1) }).catch(() => {});
      });

      return shuffled.map(p => p.text);
    } catch (error) {
      console.error('[GameService] Error fetching game prompts:', error);
      return DEFAULT_PROMPTS.slice(0, count);
    }
  },

  // Seed any DEFAULT_PROMPTS that aren't already in the gamePrompts collection.
  // Safe to call repeatedly — existing prompts are skipped (matched by text,
  // case-insensitive trim).
  async seedGamePrompts() {
    const existingSnap = await getDocs(query(collection(db, 'gamePrompts'), limit(500)));
    const existing = new Set();
    existingSnap.forEach(d => {
      const t = d.data().text?.toLowerCase().trim();
      if (t) existing.add(t);
    });
    let added = 0;
    for (const text of DEFAULT_PROMPTS) {
      const key = text.toLowerCase().trim();
      if (existing.has(key)) continue;
      await setDoc(doc(collection(db, 'gamePrompts')), {
        text,
        usageCount: 0,
        createdAt: new Date().toISOString(),
      });
      added++;
    }
    console.log('[GameService] Seeded', added, 'new prompts (skipped', existing.size, 'existing)');
    return { added, total: existing.size + added };
  },

  // Fisher-Yates shuffle — uniform random. The previous
  // Array.sort(() => Math.random() - 0.5) is biased (V8's TimSort keeps
  // elements close to their original index), which made the first 6 of
  // the merged pool [...mySnapples, ...community] win the slot lottery
  // way too often — the user kept seeing the same 6 every game.
  _shuffle(arr) {
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  },

  // Draw a hand of `handSize` cards from the player's deck, padded with
  // community snapples if their deck is too small.
  drawHand(ownedSnapples, allSnapples = [], handSize = HAND_SIZE) {
    const shuffled = this._shuffle(ownedSnapples);
    const hand = shuffled.slice(0, handSize);

    if (hand.length < handSize && allSnapples.length > 0) {
      const handIds = new Set(hand.map(s => s.id));
      const extras = this._shuffle(allSnapples.filter(s => !handIds.has(s.id)));
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
    let currentPlacement = 1;
    return sorted.map((p, i, arr) => {
      if (i > 0 && arr[i - 1].points !== p.points) {
        currentPlacement = i + 1;
      }
      return {
        ...p,
        placement: currentPlacement,
        coinsEarned: rewards[currentPlacement - 1] || 0,
      };
    });
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
  REVIEW_TIME,
  PICK_TIME,
  VOTE_TIME,
};

export default gameService;
