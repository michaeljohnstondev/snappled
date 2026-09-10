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
 * `scale` is OPTICAL TASTE ONLY. It used to be doing a second job -
 * compensating for transparent padding baked into the assets - and that
 * is why the coin looked undersized everywhere it appeared. The three
 * canvases were 512x512 while the art inside measured 342x344, 427x251
 * and 461x384, so resizeMode "contain" fitted the CANVAS to the
 * requested box and drew the artwork smaller than asked. The coin was
 * the worst offender at 67% and, being the `scale: 1` baseline, it
 * pulled the whole set down with it: a coin requested at 24pt drew
 * about 16pt of coin beside a 22pt Ionicons glyph.
 *
 * The assets are now cropped to their own artwork (tools/trimicon.js),
 * so 1.0 means "fills the box", the same as a glyph. Padding is not
 * something these numbers have to think about any more.
 */
export const CURRENCY = {
  coins: {
    key: 'coins',
    label: 'Coins',
    one: 'coin',
    source: coin,
    // Square and fills its box, so it now matches an icon of the same
    // nominal size instead of landing a third smaller.
    scale: 1,
  },
  tickets: {
    key: 'tickets',
    label: 'Tickets',
    one: 'ticket',
    source: ticket,
    // Wide and short, so `contain` fits it by WIDTH and it sits shorter
    // than the others by nature. Left at full width rather than lifted
    // to match their height, which would make it wider than the row can
    // take - the same compromise as before, minus the padding math.
    scale: 1,
  },
  trophies: {
    key: 'trophies',
    label: 'Trophies',
    one: 'trophy',
    source: trophy,
    // The chunkiest silhouette of the three; pulled back a little so it
    // doesn't dominate the resource bar next to a round coin.
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
