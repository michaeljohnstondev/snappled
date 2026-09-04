// ReactionBar — the emoji strip under a snapple on the scoring grid.
//
// Clash-Royale-style emotes, attached to a specific snapple rather than
// to the room, so a reaction is feedback on someone's clip.
//
// Dumb UI: it renders the fixed set, shows counts, and calls back. Every
// decision about who may react, how often, and what gets written lives
// in GameScreen and gameService.
//
// The set is deliberately tiny and fixed. A closed set has essentially no
// moderation surface — which is the whole reason this exists instead of
// free text or voice — and five choices fit under a card without
// crowding the vote auras already drawn around it.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import theme from '../../theme/themes';

// key = what's stored in Firestore, glyph = what's drawn. Keeping them
// separate means the art can change without migrating any game docs.
export const REACTIONS = [
  { key: 'laugh', glyph: '😂' },
  { key: 'fire', glyph: '🔥' },
  { key: 'thumbsup', glyph: '👍' },
  { key: 'shock', glyph: '😱' },
  { key: 'skull', glyph: '💀' },
];

/**
 * @param {Object} counts     { [key]: number } — tallies to display
 * @param {Object} mine       { [key]: boolean } — which ones this user sent
 * @param {Function} onReact  (key) => void
 * @param {boolean} disabled  true while the cooldown is running
 */
export default function ReactionBar({ counts = {}, mine = {}, onReact, disabled }) {
  return (
    <View style={styles.row}>
      {REACTIONS.map(({ key, glyph }) => {
        const count = counts[key] || 0;
        return (
          <Pressable
            key={key}
            onPress={() => onReact?.(key)}
            // Not `disabled` — the button stays pressable and just dims,
            // because a dead control reads as broken while a dimmed one
            // reads as "not yet". The tap is dropped in GameScreen.
            style={({ pressed }) => [
              styles.chip,
              mine[key] && styles.chipMine,
              (pressed || disabled) && styles.chipDim,
            ]}
            hitSlop={4}
          >
            <Text style={styles.glyph}>{glyph}</Text>
            {count > 0 && <Text style={styles.count}>{count}</Text>}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 4,
    marginTop: 6,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    paddingHorizontal: 6,
    paddingVertical: 4,
    borderRadius: 10,
    borderWidth: 1,
    // Always dark: this sits on the scoring grid's card chrome, which
    // stays dark in both themes.
    borderColor: 'rgba(255,255,255,0.15)',
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  chipMine: {
    borderColor: theme.colors.vibeGreen,
    backgroundColor: 'rgba(0,255,65,0.12)',
  },
  chipDim: { opacity: 0.45 },
  glyph: { fontSize: 14 },
  count: {
    color: 'white',
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
