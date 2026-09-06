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
export const PLAYER_PALETTE = [
  theme.colors.vibeBlue,
  theme.colors.vibePurple,
  theme.colors.vibePink,
  theme.colors.vibeYellow,
  theme.colors.vibeElectricBlue,
  theme.colors.vibeRed,
  theme.colors.vibeTurquoise,
  theme.colors.vibeRoyalBlue,
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
