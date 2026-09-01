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
// A sliver of the third card stays visible so the rail reads as
// scrollable without needing a scrollbar or a hint arrow.
const PEEK = 16;

// 9:16 — what the camera records, so a big card is mostly video
// instead of letterbox.
export const CARD_ASPECT = 9 / 16;

// Two constraints, take the tighter one:
//   - width: two cards plus the peek have to fit across the screen
//   - height: a 9:16 card is tall, and on a short phone the full
//     width-derived height would run past the submit bar and clip
// Tall screens hit the width limit and get the intended 2-up. Short
// ones shrink a little and show slightly more than two, which is a far
// better failure than a card with its bottom cut off.
const WIDTH_LIMITED = Math.floor((screenWidth - RAIL_PAD * 2 - GAP - PEEK) / 2);
const HEIGHT_LIMITED = Math.floor(screenHeight * 0.42 * CARD_ASPECT);

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
