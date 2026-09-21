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
  collection, doc, getDoc, getDocs, setDoc, updateDoc, deleteDoc,
  query, where, limit,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { promptVoteService } from './promptVoteService';
import { normalizePromptText } from '../utils/promptKey';

// Mirrors functions/gamePrompts.js. Display only - the server decides
// what is actually charged, so a stale number here costs a wrong label,
// never a wrong charge.
const BETA_GAME_PROMPT_COST = 0;
const GAME_PROMPT_COST = 100;
export const GAME_PROMPT_MAX_LEN = 80;

/** What a submission costs in a given season. Free during the beta. */
export function costForSeason(season) {
  return season === 0 ? BETA_GAME_PROMPT_COST : GAME_PROMPT_COST;
}

// Enough to cover a season's deck plus its candidates. Game prompts are
// a curated, seasonal set measured in hundreds, not an open feed.
const LIST_LIMIT = 400;

// The Game Prompts tab unmounts when you switch tabs, so every visit was
// re-reading the whole collection to show ten cards: 138 prompt reads
// plus the season plus the vote lookup, about 151 reads a visit, and a
// visible pause each time you came back.
//
// The prompts are cached and the VOTES deliberately are not. The list
// changes when somebody submits (rare, and create() clears this); which
// prompts you have already ranked changes every time you swipe, and
// getting that wrong would hand you a card you just voted on. The votes
// are also the cheap half - a handful of id lookups against the
// expensive full-collection read.
const CACHE_MS = 5 * 60 * 1000;
let promptCache = null;   // { at, rows }
let seasonCache = null;   // { at, season }

/** Drop the cached list, so the next read sees a just-added prompt. */
function invalidate() {
  promptCache = null;
}

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
    if (seasonCache && Date.now() - seasonCache.at < CACHE_MS) return seasonCache.season;
    try {
      const snap = await getDoc(doc(db, 'config', 'season'));
      const current = snap.exists() ? snap.data().current : undefined;
      const season = typeof current === 'number' ? current : 0;
      seasonCache = { at: Date.now(), season };
      return season;
    } catch (error) {
      console.warn('[GamePromptService] getSeason failed:', error?.message);
      return seasonCache ? seasonCache.season : 0;
    }
  }

  /**
   * Live and candidate prompts, sorted for a filter.
   *
   * filter: 'top' | 'new' | 'mine'. Banned and retired prompts never
   * appear - they are out of circulation, and listing a banned prompt
   * would put the thing moderation just removed back in front of people.
   */
  async list({ filter = 'top', userId, fresh = false } = {}) {
    try {
      let rows;
      if (!fresh && promptCache && Date.now() - promptCache.at < CACHE_MS) {
        rows = promptCache.rows.slice();
      } else {
        const snap = await getDocs(query(
          collection(db, 'gamePrompts'),
          where('status', 'in', ['live', 'candidate']),
          limit(LIST_LIMIT),
        ));
        rows = [];
        snap.forEach(d => rows.push({ id: d.id, ...d.data() }));
        promptCache = { at: Date.now(), rows: rows.slice() };
      }

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
  async getUnsorted(userId) {
    try {
      const { prompts } = await this.list({ filter: 'new', userId });
      const mine = await promptVoteService.getMyVotes(
        userId, 'gamePrompts', prompts.map(p => p.id),
      );
      // Everything they have not voted on, not a fixed ten. The deck
      // used to hand out a short stack and stop; if someone wants to
      // rank the whole season there is no reason to make them reload
      // for each batch.
      //
      // No category either. It said "candidate" or "live this season",
      // which is a fact about the prompt's standing, not about whether
      // it is funny - and putting it on the card invites people to rank
      // what is already winning rather than what they actually like.
      // The pool deck dropped its categories too: nobody is going to
      // file their own prompt under a heading, so the field was always
      // going to read "general" on everything a user ever wrote.
      const rows = prompts
        .filter(p => mine[p.id] === undefined && p.createdBy !== userId)
        .sort((a, b) => (a.status === 'candidate' ? -1 : 0) - (b.status === 'candidate' ? -1 : 0))
        .map(p => ({ id: p.id, text: p.text }));
      return { success: true, prompts: rows };
    } catch (error) {
      console.error('[GamePromptService] getUnsorted failed:', error);
      return { success: false, prompts: [] };
    }
  }

  /**
   * Admin: rewrite a prompt's text.
   *
   * Direct client write, unlike create - the rules allow isAdmin() to
   * update gamePrompts, so this is enforced by Firestore rather than by
   * the button being hidden. create goes through a callable because it
   * CHARGES, and a price cannot be set by the buyer.
   *
   * textKey moves with the text: it is what de-dupes submissions, so
   * leaving it stale would let somebody re-submit the old wording as
   * new.
   */
  async adminUpdateText(promptId, text) {
    try {
      const clean = String(text || '').trim();
      if (!clean) return { success: false, error: 'Empty prompt' };
      await updateDoc(doc(db, 'gamePrompts', promptId), {
        text: clean,
        textKey: normalizePromptText(clean),
        editedAt: new Date().toISOString(),
      });
      invalidate();
      return { success: true };
    } catch (error) {
      console.error('[GamePromptService] adminUpdateText failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Admin: move a prompt between live, candidate and retired.
   *
   * Retiring is the soft delete - list() only reads live and candidate,
   * so a retired prompt leaves circulation without taking its vote
   * history with it. Reach for remove() only when the text itself
   * should not exist.
   */
  async adminSetStatus(promptId, status) {
    try {
      if (!['live', 'candidate', 'retired'].includes(status)) {
        return { success: false, error: 'Unknown status' };
      }
      await updateDoc(doc(db, 'gamePrompts', promptId), {
        status,
        statusChangedAt: new Date().toISOString(),
      });
      invalidate();
      return { success: true };
    } catch (error) {
      console.error('[GamePromptService] adminSetStatus failed:', error);
      return { success: false, error: error.message };
    }
  }

  /** Admin: delete outright. Votes cast on it are orphaned, not undone. */
  async adminDelete(promptId) {
    try {
      await deleteDoc(doc(db, 'gamePrompts', promptId));
      invalidate();
      return { success: true };
    } catch (error) {
      console.error('[GamePromptService] adminDelete failed:', error);
      return { success: false, error: error.message };
    }
  }

  /** Submit a prompt. The server charges the fee. */
  async create(text) {
    try {
      const fn = httpsCallable(functions, 'createGamePrompt');
      const res = await fn({ text });
      // The new prompt has to be visible on the next read.
      invalidate();
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
