// products.js — the in-app purchase catalogue.
//
// These IDs are the contract between three places that cannot rename
// them independently: App Store Connect, Google Play Console, and this
// app. Apple in particular will NOT let a product ID be reused or
// renamed once created — a typo here becomes permanent — so they live
// in one file rather than being typed into a screen.
//
// Format is lowercase letters, digits and underscores only. Both stores
// accept that; Google additionally requires the ID to start with a
// letter or digit, and Apple treats IDs as globally unique across the
// whole developer account, which is why each carries a `snappled_`
// prefix rather than a bare `coins_100` that a future app might want.
//
// All are CONSUMABLE products: coins and tickets are spent, so a player
// can buy the same pack repeatedly. Getting this wrong at creation time
// is not fixable later - a non-consumable can only ever be bought once
// and then restores for free.

export const PRODUCT_TYPE = 'consumable';

// Deck size a new account starts with. Mirrors DECK_SIZE_START in
// functions/store.js, which is the copy that actually prices an
// upgrade. Lives here because three screens need to know the default:
// the store to price the next rung, DeckBuilder to cap the list, and
// the create flow to ask whether there is room for one more.
export const DECK_SIZE_START = 50;

/**
 * Everything purchasable for real money.
 *
 * `grants` is what the server awards on a validated receipt. It is the
 * single source for that too - the client never decides what a purchase
 * is worth, or a modified app could mint currency by claiming a $1.99
 * pack was the $49.99 one.
 */
export const PRODUCTS = {
  // Coin packs
  snappled_coins_100: { coins: 100, price: '$0.99' },
  snappled_coins_500: { coins: 500, price: '$3.99' },
  snappled_coins_1000: { coins: 1000, price: '$6.99' },
  snappled_coins_5000: { coins: 5000, price: '$29.99' },

  // Ticket packs. The amounts are set from the 100-ticket game topic:
  // the middle pack is exactly one topic, the small one is a top-up,
  // and the large one is two and a half with the best rate. The old
  // 5/10/25 packs were priced as if tickets were scarce when the game
  // handed out 25 a day - the largest sold for $5.99 what you earned by
  // lunchtime.
  snappled_tickets_30: { tickets: 30, price: '$1.99' },
  snappled_tickets_100: { tickets: 100, price: '$4.99' },
  snappled_tickets_250: { tickets: 250, price: '$9.99' },

  // Bundles. Ticket counts scaled with everything else; these ids carry
  // no amount in them, so they were free to rebalance.
  snappled_bundle_taster: { coins: 100, tickets: 25, price: '$1.99' },
  snappled_bundle_starter: { coins: 500, tickets: 50, price: '$4.99' },
  snappled_bundle_creator: { coins: 2000, tickets: 125, price: '$14.99' },
  snappled_bundle_mega: { coins: 10000, tickets: 300, price: '$49.99' },
};

/** What a product awards, or null if the id is unknown. */
export function grantsFor(productId) {
  const p = PRODUCTS[productId];
  if (!p) return null;
  return { coins: p.coins || 0, tickets: p.tickets || 0 };
}

/**
 * The list to paste into App Store Connect and Play Console.
 *
 * Prices here are the TIERS to pick, not values sent anywhere - both
 * stores set the real price per territory and hand it back at runtime,
 * which is what the UI should display rather than these strings. They
 * are kept so the catalogue reads as a plan rather than a list of ids.
 */
export function catalogue() {
  return Object.entries(PRODUCTS).map(([id, p]) => ({
    id,
    type: PRODUCT_TYPE,
    price: p.price,
    grants: grantsFor(id),
  }));
}
