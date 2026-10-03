// playerColors.js — who is what colour, in one place.
//
// Lived in GameScreen, which was fine while only the game drew players.
// The lobby now lets you pick a colour and the television draws the
// same roster, so the palette and the rule for reading it have to be
// reachable from more than one screen.
//
// IMPORTANT: PLAYER_COLORS in public/tv.html is this same list, written
// out as literals because that page loads no bundle. Change one, change
// the other.

import theme from '../theme/themes';

// Distinct hues only. vibeCyan/Aqua/Teal used to be in here and were
// near-duplicates of vibeBlue, which made adjacent players hard to tell
// apart at a glance - the entire job of this list.
//
// APPEND ONLY. colorIndex is stored on every player document, so this is
// not a list you can reorder or insert into: moving an entry repaints
// everyone who had picked that slot, including in games already running.
// New colours go on the end.
//
// Sixteen, so the picker reads as a 4x4 block rather than a ragged row.
// Sixteen is also about where genuinely separable hues run out - the
// second eight lean on lightness as much as hue (pale violet against
// deep purple, pale pink against magenta), because "tell two players
// apart at a glance" is the only thing this list has to do and twenty-
// five near-identical neons would do it worse than sixteen honest ones.
export const PLAYER_PALETTE = [
  // The original eight. Their positions are load-bearing.
  theme.colors.vibeBlue,          //  0  sky blue
  theme.colors.vibePurple,        //  1  deep purple
  theme.colors.vibePink,          //  2  magenta
  theme.colors.vibeYellow,        //  3  gold
  theme.colors.vibeElectricBlue,  //  4  electric blue
  theme.colors.vibeRed,           //  5  red
  theme.colors.vibeTurquoise,     //  6  turquoise
  theme.colors.vibeRoyalBlue,     //  7  royal blue
  // Added for the 4x4 picker. Literals rather than theme references
  // where the theme has no matching accent - a player colour is its own
  // concern and does not need a token the rest of the app never reads.
  theme.colors.vibeGreen,         //  8  neon green
  '#FF7A00',                      //  9  orange
  '#C2FF00',                      // 10  lime
  '#FF0080',                      // 11  rose
  '#B388FF',                      // 12  pale violet
  '#FF9EB5',                      // 13  pale pink
  '#8D99AE',                      // 14  slate
  '#FFFFFF',                      // 15  white
];

/**
 * Map of uid → colour for a game's players.
 *
 * Read from the colorIndex stored on each player, so it is identical on
 * every phone in the room and on the television, and it does not move
 * when somebody leaves.
 *
 * Two earlier rules this replaced, both wrong:
 *  - self in green, palette for everyone else: each phone painted a
 *    DIFFERENT player green, so no two screens agreed.
 *  - straight array position: leaveGame splices the array, so every
 *    player after the leaver changed colour mid-game.
 *
 * Position survives only as a fallback for games that were already in
 * flight when colorIndex shipped; without it those players would all
 * collapse onto one colour.
 */
export function buildPlayerColors(players) {
  const map = new Map();
  (players || []).forEach((p, i) => {
    const slot = Number.isInteger(p.colorIndex) ? p.colorIndex : i;
    map.set(p.uid, PLAYER_PALETTE[slot % PLAYER_PALETTE.length]);
  });
  return map;
}

/** Colour slots already claimed in this lobby, as a Set of indexes. */
export function takenColorSlots(players) {
  return new Set(
    (players || [])
      .map(p => p.colorIndex)
      .filter(i => Number.isInteger(i)),
  );
}
