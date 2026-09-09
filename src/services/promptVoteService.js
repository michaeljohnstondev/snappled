// promptVoteService.js — casting and reading prompt votes.
//
// Every vote is its own document in `promptVotes`, keyed
// `<target>_<promptId>_<uid>`. That key is the whole design: it makes a
// vote idempotent (swiping twice overwrites one row instead of adding a
// second), it lets any number of people vote at once because no two
// voters touch the same document, and it replaces the old `likes[]`
// array that would have hit Firestore's 1 MiB document ceiling at
// roughly 31,000 voters on a single prompt.
//
// Nothing here writes a count. The onPromptVoteWritten Cloud Function
// owns the counters, so a modified client cannot inflate one.

import { db } from './firebase';
import {
  collection, doc, getDocs, setDoc, deleteDoc,
  query, where, orderBy, limit, documentId,
} from 'firebase/firestore';
// The same key the summon flow de-dups on, so "What's your worst
// haircut?" and "whats your worst haircut" are recognised as one prompt.
import { normalizePromptText as normalize } from '../utils/promptKey';

// How many pool prompts to pull before filtering. Bigger than what gets
// shown, because the ones this user has already voted on come out
// afterwards and we still want a full stack left over.
const POOL_WINDOW = 60;

/** The document id for one person's vote on one prompt. */
function voteId(target, promptId, userId) {
  return `${target}_${promptId}_${userId}`;
}

class PromptVoteService {
  /**
   * Record a vote. `value` is 1 for good, -1 for weak.
   *
   * Blind write — no read first. The trigger works off the delta between
   * the old row and the new one, so flipping a vote or repeating it both
   * land correctly without the client knowing what it voted last time.
   * That also removes the lost-update race the old read-then-write had.
   */
  async vote(promptId, userId, value, target = 'activePrompts') {
    try {
      if (!promptId || !userId) return { success: false, error: 'missing id' };
      if (value !== 1 && value !== -1) return { success: false, error: 'bad value' };

      await setDoc(doc(db, 'promptVotes', voteId(target, promptId, userId)), {
        promptId,
        userId,
        target,
        value,
        createdAt: new Date().toISOString(),
      });
      return { success: true };
    } catch (error) {
      console.error('[PromptVoteService] vote failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Take a vote back.
   *
   * The trigger reads the deletion as a delta to zero and decrements
   * whichever counter the vote had incremented, so an undo is exact
   * rather than approximate.
   */
  async clearVote(promptId, userId, target = 'activePrompts') {
    try {
      await deleteDoc(doc(db, 'promptVotes', voteId(target, promptId, userId)));
      return { success: true };
    } catch (error) {
      console.error('[PromptVoteService] clear failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * This user's own votes, as a { [promptId]: 1 | -1 } map.
   *
   * Pass `promptIds` whenever you know which prompts you care about.
   * Without it this reads EVERY vote the user has ever cast, so someone
   * who has sorted three hundred prompts pays three hundred document
   * reads each time the screen opens — a bill that grows with how
   * helpful they have been, which is exactly backwards.
   *
   * With it, the votes are fetched by document id instead. Firestore
   * only charges for ids that exist, so the cost is bounded by the size
   * of the window being shown and is usually far smaller.
   */
  async getMyVotes(userId, target = null, promptIds = null) {
    try {
      if (!userId) return {};
      const map = {};

      if (promptIds && promptIds.length) {
        const ids = promptIds.map(id => voteId(target || 'activePrompts', id, userId));
        // `in` caps at 30 values per query, so the window is chunked.
        for (let i = 0; i < ids.length; i += 30) {
          const snap = await getDocs(query(
            collection(db, 'promptVotes'),
            where(documentId(), 'in', ids.slice(i, i + 30)),
          ));
          snap.forEach(d => { const v = d.data(); map[v.promptId] = v.value; });
        }
        return map;
      }

      let q = query(collection(db, 'promptVotes'), where('userId', '==', userId));
      if (target) q = query(q, where('target', '==', target));
      const snap = await getDocs(q);
      snap.forEach(d => { const v = d.data(); map[v.promptId] = v.value; });
      return map;
    } catch (error) {
      // A failed read must not stop the screen rendering — it just means
      // nothing shows as already-voted, and re-voting is harmless.
      console.error('[PromptVoteService] getMyVotes failed:', error);
      return {};
    }
  }

  /**
   * Pool prompts waiting to be sorted.
   *
   * These are the ones the app has never shown anywhere: 348 sitting in
   * `promptPool` with, until now, no surface that could rate them. That
   * is the actual reason the pool has zero votes — not apathy.
   *
   * Worst-scoring first so the untested surface ahead of the proven,
   * then shuffled, so a hundred thousand people don't all get handed
   * the identical stack in the identical order.
   */
  async getUnsortedPool(userId, count = 10, liveTexts = []) {
    try {
      // Ordered by score ascending so the untested (-1) come first, and
      // NOT filtered on `used`. That flag looked like the obvious filter
      // and is the wrong one: 323 of the 348 prompts are still marked
      // used from past rotations that never reset, so it hides almost
      // the whole pool. What is genuinely live is excluded below
      // instead, by text, using the prompts the screen already has.
      let snap = await getDocs(query(
        collection(db, 'promptPool'),
        orderBy('score', 'asc'),
        limit(POOL_WINDOW),
      ));

      // Prompts written before scoring existed have no `score` field at
      // all, and an orderBy excludes those rather than sorting them
      // last — so before the backfill runs this would return nothing.
      if (snap.empty) {
        snap = await getDocs(query(collection(db, 'promptPool'), limit(POOL_WINDOW)));
      }

      // Narrow before asking what this user already voted on, so the
      // vote lookup only covers cards that could actually be shown.
      const live = new Set(liveTexts.map(normalize));
      const candidates = [];
      snap.forEach(d => {
        const p = d.data();
        if (!p.text) return;
        // Don't ask someone to pre-judge a prompt that is running right
        // now — it already has its own rating buttons further up the
        // same screen, and calling it "not live yet" would be a lie.
        if (live.has(normalize(p.text))) return;
        candidates.push({ id: d.id, text: p.text, category: p.category || 'general' });
      });

      const mine = await this.getMyVotes(
        userId, 'promptPool', candidates.map(c => c.id),
      );
      const rows = candidates.filter(c => mine[c.id] === undefined);

      // Fisher-Yates. Shuffling the window rather than the whole pool
      // keeps this to one query no matter how large the pool grows.
      for (let i = rows.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [rows[i], rows[j]] = [rows[j], rows[i]];
      }
      return { success: true, prompts: rows.slice(0, count), remaining: rows.length };
    } catch (error) {
      console.error('[PromptVoteService] getUnsortedPool failed:', error);
      return { success: false, prompts: [], remaining: 0 };
    }
  }
}

export const promptVoteService = new PromptVoteService();
