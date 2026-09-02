// HandCardRail — the hand as a horizontal rail instead of a grid.
//
// The 2-col grid fit 4-6 cards on screen, which made every card small
// enough that you had to open a preview to tell them apart. The rail
// shows two at a time at roughly 40% more height, and the rest are one
// swipe away. Cards use the 9:16 shape snapples are recorded in, so a
// big card is mostly video rather than letterbox.
//
// Dumb layout only. It owns sizing and snapping; the caller renders
// the card itself through `renderCard`, so picking and warmup keep
// their own tap handlers and selection logic.

import React from 'react';
import { View, FlatList, Dimensions, StyleSheet } from 'react-native';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

const RAIL_PAD = 12;
const GAP = 10;

// 9:16 — what the camera records, so a big card is mostly video
// instead of letterbox. Never varied: the ratio is what makes the
// card read as a phone video rather than a tile.
export const CARD_ASPECT = 9 / 16;

// How many cards span the screen. 1.5 rather than 2 — the half card
// hanging off the right edge is also the scroll affordance, so the
// bigger card and the "there's more" signal come from the same thing.
const CARDS_ACROSS = 1.5;

// Two constraints, take the tighter one:
//   - width: CARDS_ACROSS cards have to span the screen
//   - height: a 9:16 card is tall, and on a short phone the full
//     width-derived height would run past the submit bar and clip
// Budget for the TIGHTEST phase — picking, which carries chrome warmup
// doesn't (prompt banner, mulligan row, submit bar). Warmup has room to
// spare but uses the same number on purpose: the hand must not resize
// under you when warmup hands off to picking.
//
// 0.45 was a conservative first guess from estimated chrome heights;
// checked on device there was room left over, hence 0.50. The case to
// re-check if a card ever looks cut off is the worst one: picking, on a
// short phone, with the mulligan row showing.
const WIDTH_LIMITED = Math.floor((screenWidth - RAIL_PAD * 2 - GAP) / CARDS_ACROSS);
const HEIGHT_LIMITED = Math.floor(screenHeight * 0.50 * CARD_ASPECT);

export const CARD_WIDTH = Math.min(WIDTH_LIMITED, HEIGHT_LIMITED);
// Exported so phases can reserve vertical space around the rail.
export const CARD_HEIGHT = Math.round(CARD_WIDTH / CARD_ASPECT);

/**
 * @param {Array} cards        the hand
 * @param {Function} renderCard (card, index) => node, rendered at CARD_WIDTH
 * @param {Function} keyExtractor optional; defaults to card.id
 */
export default function HandCardRail({ cards = [], renderCard, keyExtractor }) {
  return (
    <FlatList
      data={cards}
      horizontal
      showsHorizontalScrollIndicator={false}
      // Snap so a swipe always lands on a card boundary — a rail that
      // stops mid-card reads as broken on a screen with a timer on it.
      snapToInterval={CARD_WIDTH + GAP}
      snapToAlignment="start"
      decelerationRate="fast"
      contentContainerStyle={styles.content}
      keyExtractor={keyExtractor || ((item, i) => item?.id || `hand-${i}`)}
      renderItem={({ item, index }) => (
        <View style={[styles.cell, index > 0 && styles.cellGap]}>
          {renderCard(item, index)}
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  content: {
    paddingHorizontal: RAIL_PAD,
    // Vertical room for the selected card's glow shadow, which draws
    // outside the card bounds and would otherwise be clipped.
    paddingVertical: 8,
  },
  cell: { width: CARD_WIDTH },
  cellGap: { marginLeft: GAP },
});
