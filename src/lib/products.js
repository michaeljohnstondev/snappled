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

  // Ticket packs
  snappled_tickets_5: { tickets: 5, price: '$1.99' },
  snappled_tickets_10: { tickets: 10, price: '$2.99' },
  snappled_tickets_25: { tickets: 25, price: '$5.99' },

  // Bundles
  snappled_bundle_taster: { coins: 100, tickets: 5, price: '$1.99' },
  snappled_bundle_starter: { coins: 500, tickets: 10, price: '$4.99' },
  snappled_bundle_creator: { coins: 2000, tickets: 25, price: '$14.99' },
  snappled_bundle_mega: { coins: 10000, tickets: 50, price: '$49.99' },
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
