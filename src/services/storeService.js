// storeService.js — buying coin-priced items.
//
// One method, and deliberately thin: the store's rules live in
// functions/store.js, because a price the client can name is a price
// the client can change. This is the wire, not the shop.

import { httpsCallable } from 'firebase/functions';
import { functions } from './firebase';

const storeService = {
  /**
   * purchase — spend coins on one catalogue item.
   *
   * Takes an id and nothing else. The server looks up what it costs,
   * checks the balance and grants the item in one transaction, so the
   * price cannot be argued with and a double-tap cannot buy twice on
   * one balance.
   *
   * Failures come back as a message meant for the player, since the
   * expected ones ("you need 5,000 coins and have 300") are answers,
   * not errors.
   */
  async purchase(itemId) {
    try {
      const fn = httpsCallable(functions, 'purchaseStoreItem');
      const res = await fn({ itemId });
      return { success: true, ...res.data };
    } catch (error) {
      return {
        success: false,
        error: error?.message || 'Purchase failed. Try again.',
      };
    }
  },

  /**
   * spendSwap — consume one purchased swap.
   *
   * The free one each game never gets here; it lives in GameScreen's
   * state so it cannot be banked. Fails rather than going negative, so
   * the caller must swap the card only once this succeeds.
   *
   * ONE WORD: it is a Swap everywhere a person can read it. The
   * callable is still named spendMulligan and the balance still lives
   * at inventory.mulligans - renaming a deployed function means
   * deleting and recreating it, and renaming a live field means
   * migrating every user document, neither of which buys anything a
   * comment does not. Same call as resources.tokens being the field
   * behind the word "tickets".
   */
  async spendSwap() {
    try {
      const fn = httpsCallable(functions, 'spendMulligan');
      const res = await fn({});
      return { success: true, ...res.data };
    } catch (error) {
      return {
        success: false,
        error: error?.message || 'You have no swaps left.',
      };
    }
  },

  /**
   * buyExtraSlot — pay to answer a prompt you have already answered.
   *
   * The price depends on how many answers you already have, and the
   * server counts them — the client used to do both the counting and
   * the charging, which made the price a suggestion.
   */
  async buyExtraSlot(promptId) {
    try {
      const fn = httpsCallable(functions, 'purchaseExtraSlot');
      const res = await fn({ promptId });
      return { success: true, ...res.data };
    } catch (error) {
      return {
        success: false,
        error: error?.message || 'Could not buy that slot. Try again.',
      };
    }
  },
};

export default storeService;
