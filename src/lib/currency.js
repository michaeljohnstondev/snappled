// currency.js — the single answer to "what does a coin look like".
//
// There wasn't one. A coin was a money bag in the resource bar, a coin
// emoji in CurrencyDisplay, a blue GEM on the Buy button, and the word
// "coins" in the store — four call sites that each picked their own
// glyph and drifted apart. The gem was the worst of it: in games a gem
// and a coin are conventionally different currencies, so the Buy button
// was telling people they were spending something they don't have.
//
// Everything that draws a currency reads from here. Changing the art is
// now one edit rather than a hunt, and it cannot drift again.

const coin = require('../../assets/images/coin.png');
const ticket = require('../../assets/images/ticket.png');
const trophy = require('../../assets/images/trophy.png');

/**
 * Per-currency art and naming.
 *
 * `scale` is an OPTICAL correction, not a measurement. The three assets
 * fill their canvases very differently — measured content boxes are
 * 342x344 for the coin, 427x251 for the ticket and 461x384 for the
 * trophy — so rendering them all into the same square box makes the
 * ticket look tiny and the trophy look oversized. These multipliers
 * even out the apparent weight; they were derived from those boxes and
 * then nudged, which is why they aren't round numbers.
 */
export const CURRENCY = {
  coins: {
    key: 'coins',
    label: 'Coins',
    one: 'coin',
    source: coin,
    scale: 1,
  },
  tickets: {
    key: 'tickets',
    label: 'Tickets',
    one: 'ticket',
    source: ticket,
    // Short and wide, so it needs a lift to sit level with the others.
    // Not lifted all the way to matching height - that would make it
    // wider than the row can take.
    scale: 1.18,
  },
  trophies: {
    key: 'trophies',
    label: 'Trophies',
    one: 'trophy',
    source: trophy,
    // The largest of the three on canvas; pulled back so it doesn't
    // dominate the row.
    scale: 0.92,
  },
};

// The resource bar and the reward overlay both call the ticket currency
// `tokens` in their data. Aliased rather than renamed: the field is on
// every user document and a migration is not worth it for a label.
export const CURRENCY_ALIASES = {
  tokens: 'tickets',
};

/** Resolve any of the names used across the app to one currency. */
export function currencyFor(name) {
  return CURRENCY[CURRENCY_ALIASES[name] || name] || null;
}
