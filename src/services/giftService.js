// giftService.js — gifts sent to everybody at once.
//
// Thin, like the other purchase-adjacent services: the amounts, the
// limits and the once-per-player rule all live in functions/gifts.js,
// because a client that can name what it received can name any number.

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

const giftService = {
  /**
   * claim — collect anything this player has not collected yet.
   *
   * Called once on sign-in. Returns an empty list almost every time,
   * which costs one query; the rest of the time it returns what was
   * granted so the app can say so.
   *
   * Safe to call repeatedly. Each gift is claimed under
   * <giftId>_<uid> on the server, so a second call finds the claim
   * already there and grants nothing.
   */
  async claim() {
    try {
      const fn = httpsCallable(functions, 'claimGifts');
      const res = await fn({});
      return res.data?.claimed || [];
    } catch (error) {
      // Never surfaced. A gift that fails to claim is collected on the
      // next open, and an error toast about it would be noise about
      // something the player did not ask for and does not know exists.
      console.warn('[GiftService] claim failed:', error?.message);
      return [];
    }
  },

  /**
   * send — admin only. One document, granted to players as they arrive.
   *
   * The server refuses anything but a positive gift within its ceilings,
   * and refuses it outright from a non-admin uid.
   */
  async send({ coins = 0, tickets = 0, message = '' }) {
    try {
      const fn = httpsCallable(functions, 'createGlobalGift');
      const res = await fn({ coins, tickets, message });
      return { success: true, ...res.data };
    } catch (error) {
      return { success: false, error: error?.message || 'Could not send that gift.' };
    }
  },
};

export default giftService;
