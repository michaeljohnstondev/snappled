// gamePromptService.js — player-facing game prompts and seasons.
//
// Game prompts are what a round asks the room. Players can browse and
// rank them, and submit their own for a ticket fee; the best become next
// season's deck.
//
// Creation never writes Firestore directly. It calls createGamePrompt,
// which charges the fee and checks the ban list in one server
// transaction - the rules refuse a client-side create outright, so there
// is no way to skip the price.

import { db, functions } from './firebase';
import {
  collection, doc, getDoc, getDocs, setDoc, query, where, limit,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { promptVoteService } from './promptVoteService';

// Mirrors functions/gamePrompts.js. Display only - the server decides
// what is actually charged, so a stale number here costs a wrong label,
// never a wrong charge.
const BETA_GAME_PROMPT_COST = 0;
const GAME_PROMPT_COST = 25;
export const GAME_PROMPT_MAX_LEN = 80;

/** What a submission costs in a given season. Free during the beta. */
export function costForSeason(season) {
  return season === 0 ? BETA_GAME_PROMPT_COST : GAME_PROMPT_COST;
}

// Enough to cover a season's deck plus its candidates. Game prompts are
// a curated, seasonal set measured in hundreds, not an open feed.
const LIST_LIMIT = 400;

/** Normalise a Firestore timestamp or ISO string to ms. */
function toMs(v) {
  if (!v) return 0;
  if (typeof v === 'string') return Date.parse(v) || 0;
  if (typeof v.toMillis === 'function') return v.toMillis();
  return (v.seconds || v._seconds || 0) * 1000;
}

/**
 * Wilson lower bound, for ranking the list.
 *
 * Same idea as the server's promptScore: 3 likes and 0 dislikes should
 * not outrank 90 likes and 10 dislikes just because its ratio is higher.
 */
function wilson(likes, dislikes) {
  const n = likes + dislikes;
  if (!n) return 0;
  const z = 1.96;
  const p = likes / n;
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p) + z2 / (4 * n)) / n))
    / (1 + z2 / n);
}

class GamePromptService {
  /**
   * The current season. 0 is the beta pre-season, before public launch.
   *
   * Checked by type rather than `|| 1`, which read season 0 as 1.
   */
  async getSeason() {
    try {
      const snap = await getDoc(doc(db, 'config', 'season'));
      const current = snap.exists() ? snap.data().current : undefined;
      return typeof current === 'number' ? current : 0;
    } catch (error) {
      console.warn('[GamePromptService] getSeason failed:', error?.message);
      return 0;
    }
  }

  /**
   * Live and candidate prompts, sorted for a filter.
   *
   * filter: 'top' | 'new' | 'mine'. Banned and retired prompts never
   * appear - they are out of circulation, and listing a banned prompt
   * would put the thing moderation just removed back in front of people.
   */
  async list({ filter = 'top', userId } = {}) {
    try {
      const snap = await getDocs(query(
        collection(db, 'gamePrompts'),
        where('status', 'in', ['live', 'candidate']),
        limit(LIST_LIMIT),
      ));
      let rows = [];
      snap.forEach(d => rows.push({ id: d.id, ...d.data() }));

      if (filter === 'mine') rows = rows.filter(r => r.createdBy === userId);

      if (filter === 'new') {
        rows.sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));
      } else {
        rows.sort((a, b) => wilson(b.likeCount || 0, b.dislikeCount || 0)
          - wilson(a.likeCount || 0, a.dislikeCount || 0));
      }
      return { success: true, prompts: rows };
    } catch (error) {
      console.error('[GamePromptService] list failed:', error);
      return { success: false, prompts: [] };
    }
  }

  /**
   * Prompts this user has not voted on yet, for the swipe deck.
   *
   * Candidates first: they are the ones competing for next season and
   * the ones with no votes yet, so they are where a vote does the most.
   */
  async getUnsorted(userId, count = 10) {
    try {
      const { prompts } = await this.list({ filter: 'new', userId });
      const mine = await promptVoteService.getMyVotes(
        userId, 'gamePrompts', prompts.map(p => p.id),
      );
      const rows = prompts
        .filter(p => mine[p.id] === undefined && p.createdBy !== userId)
        .sort((a, b) => (a.status === 'candidate' ? -1 : 0) - (b.status === 'candidate' ? -1 : 0))
        .slice(0, count)
        .map(p => ({
          id: p.id,
          text: p.text,
          category: p.status === 'candidate' ? 'candidate' : 'live this season',
        }));
      return { success: true, prompts: rows };
    } catch (error) {
      console.error('[GamePromptService] getUnsorted failed:', error);
      return { success: false, prompts: [] };
    }
  }

  /** Submit a prompt. The server charges the fee. */
  async create(text) {
    try {
      const fn = httpsCallable(functions, 'createGamePrompt');
      const res = await fn({ text });
      return { success: true, ...res.data };
    } catch (error) {
      // HttpsError messages are written to be shown to the player.
      return { success: false, error: error?.message || 'Could not create that prompt.' };
    }
  }

  /**
   * Report a game prompt.
   *
   * Keyed <promptId>_<uid>, the same one-report-per-person rule the live
   * prompts use - it is what makes auto-banning on a count safe.
   */
  async report(promptId, userId, reason) {
    try {
      await setDoc(doc(db, 'promptReports', `${promptId}_${userId}`), {
        promptId,
        userId,
        target: 'gamePrompts',
        reason: reason || 'inappropriate',
        timestamp: new Date(),
        status: 'pending',
      });
      return { success: true };
    } catch (error) {
      console.error('[GamePromptService] report failed:', error);
      return { success: false, error: error?.message };
    }
  }

  vote(promptId, userId, value) {
    return promptVoteService.vote(promptId, userId, value, 'gamePrompts');
  }
}

export const gamePromptService = new GamePromptService();
