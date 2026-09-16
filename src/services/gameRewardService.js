// gameRewardService.js — claiming what a finished game paid.
//
// Thin by design. The placement, the payout table and the boost
// multiplier all live in functions/gameRewards.js, because a client
// that works out its own winnings is a client that can win anything.

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

const gameRewardService = {
  /**
   * claim — collect one player's reward for one finished game.
   *
   * Must be called while the game document still exists: the server
   * recomputes placement from the scores stored on it, so archiving the
   * game first would leave nothing to verify against.
   *
   * Safe to call twice. The server records each claim under
   * <gameId>_<uid> and a repeat returns the original numbers without
   * paying again, so a retry after a dropped connection is free.
   */
  async claim(gameId) {
    try {
      const fn = httpsCallable(functions, 'claimGameReward');
      const res = await fn({ gameId });
      return { success: true, ...res.data };
    } catch (error) {
      console.error('[GameRewardService] claim failed:', error);
      return { success: false, error: error?.message || 'Could not claim rewards.' };
    }
  },
};

export default gameRewardService;
