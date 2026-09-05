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
// free text or voice — and four choices fit under a card without
// crowding the vote auras already drawn around it.
//
// Dropped the thumbs-up and the screaming face; added a bin. Reactions
// live only for the round and are cleared alongside submissions and
// votes, so retiring a key needs no migration — nothing outlives the
// game that used it.

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import theme from '../../theme/themes';

// key = what's stored in Firestore, glyph = what's drawn. Keeping them
// separate means the art can change without migrating any game docs.
export const REACTIONS = [
  { key: 'laugh', glyph: '😂' },
  { key: 'fire', glyph: '🔥' },
  { key: 'skull', glyph: '💀' },
  { key: 'trash', glyph: '🗑️' },
];

/**
 * Two modes, and the split is deliberate.
 *
 * 'picker' (voting) — all five, NO counts. You react to a snapple while
 *   you're judging it, without seeing what everyone else thought first.
 *   Showing tallies here would let the room's opinion lead the vote.
 * 'summary' (scoring) — only what was actually given, with counts. The
 *   tally is part of the result, and dropping the unused emoji is what
 *   makes it fit under a card in a two-column grid.
 *
 * @param {Object} counts     { [key]: number } — tallies
 * @param {Object} mine       { [key]: boolean } — which ones this user sent
 * @param {Function} onReact  (key) => void; omitted in summary mode
 * @param {boolean} disabled  true while the cooldown is running
 * @param {'picker'|'summary'} mode
 * @param {boolean} collapsible picker only — render a single toggle that
 *   opens the set, instead of a permanent row. Used in the two-column
 *   voting grid, where five chips under every card crowded the vote auras
 *   already drawn around them.
 * @param {Function} reactors (key) => [{uid, name, color, isMe}] — who sent
 *   that emoji. Summary mode only; tapping a chip reveals the names.
 */
export default function ReactionBar({
  counts = {}, mine = {}, onReact, disabled, mode = 'picker', reactors,
  collapsible = false,
}) {
  const isSummary = mode === 'summary';
  const [open, setOpen] = useState(false);
  // Summary is never collapsed: on the results screen the tallies ARE
  // the content, so hiding them behind a tap would bury the result.
  const collapsed = collapsible && !isSummary && !open;
  // Which chip is expanded. Attribution is on demand rather than always
  // on: colouring the chips themselves would collide with the vote auras
  // already drawn around this card in the same player colours, and a
  // chip holding three reactors can only carry one colour anyway.
  const [openKey, setOpenKey] = useState(null);
  const openList = openKey && reactors ? reactors(openKey) : null;
  const shown = isSummary
    ? REACTIONS.filter(({ key }) => (counts[key] || 0) > 0)
    : REACTIONS;

  // Nothing given yet — render nothing rather than an empty strip holding
  // vertical space under every card.
  if (isSummary && shown.length === 0) return null;

  if (collapsed) {
    const anyMine = REACTIONS.some(({ key }) => mine[key]);
    return (
      <View style={styles.row}>
        <Pressable
          onPress={() => setOpen(true)}
          style={[styles.chip, anyMine && styles.chipMine]}
          hitSlop={6}
        >
          <Text style={styles.glyph}>{anyMine ? '✓' : '☺'}</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View>
      <View style={styles.row}>
      {shown.map(({ key, glyph }) => {
        const count = counts[key] || 0;
        if (isSummary) {
          // One reactor = the colour is unambiguous, so show it for free.
          // Several = fall back to neutral rather than picking a winner.
          const who = reactors ? reactors(key) : [];
          const solo = who.length === 1 ? who[0] : null;
          return (
            <Pressable
              key={key}
              onPress={() => setOpenKey(openKey === key ? null : key)}
              style={[
                styles.chip,
                mine[key] && styles.chipMine,
                solo && { borderColor: solo.color },
                openKey === key && styles.chipOpen,
              ]}
              hitSlop={4}
            >
              <Text style={styles.glyph}>{glyph}</Text>
              <Text style={styles.count}>{count}</Text>
            </Pressable>
          );
        }
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
          </Pressable>
        );
      })}
      </View>
      {openList && openList.length > 0 && (
        <View style={styles.whoRow}>
          {openList.map((r, i) => (
            <Text key={r.uid || i} style={[styles.whoName, { color: r.color }]}>
              {r.isMe ? 'you' : r.name}
            </Text>
          ))}
        </View>
      )}
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
  chipOpen: { backgroundColor: 'rgba(0,0,0,0.8)' },
  whoRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginTop: 4,
    paddingHorizontal: 4,
  },
  whoName: {
    fontSize: 10,
    fontWeight: '800',
  },
  glyph: { fontSize: 14 },
  count: {
    color: 'white',
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
