// ReactionBar — the emoji strip under a snapple on the scoring grid.
//
// Clash-Royale-style emotes, attached to a specific snapple rather than
// to the room, so a reaction is feedback on someone's clip.
//
// Dumb UI: it renders the fixed set, shows counts, and calls back. Every
// decision about who may react, how often, and what gets written lives
// in GameScreen and gameService.
//
// The set is CLOSED, which is the whole reason this exists instead of
// free text or voice: a fixed list has essentially no moderation
// surface. It is no longer tiny, though - four was a constraint of the
// counted chip strip that had to fit under a card. Reactions now
// scatter across the clip itself, which has room, so the thumbs are
// back along with a few more.
//
// Reactions live only for the round and are cleared alongside
// submissions and votes, so adding or retiring a key needs no
// migration - nothing outlives the game that used it.

import React, { useState, useRef } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../theme/themes';

// key = what's stored in Firestore, glyph = what's drawn. Keeping them
// separate means the art can change without migrating any game docs.
// Picker sheet geometry. Fixed rather than measured because the sheet
// has to be POSITIONED before it is laid out - it opens anchored to the
// toggle, and you cannot anchor to something whose size you don't know
// yet. Five to a row across ten emoji is two rows.
const SHEET_COLS = 5;
const SHEET_CELL = 40;
const SHEET_GAP = 6;
const SHEET_PAD = 10;
const SHEET_W = SHEET_COLS * SHEET_CELL + (SHEET_COLS - 1) * SHEET_GAP + SHEET_PAD * 2;

export const REACTIONS = [
  { key: 'laugh', glyph: '😂' },
  { key: 'fire', glyph: '🔥' },
  { key: 'skull', glyph: '💀' },
  { key: 'trash', glyph: '🗑️' },
  { key: 'up', glyph: '👍' },
  { key: 'down', glyph: '👎' },
  { key: 'love', glyph: '😍' },
  { key: 'mind', glyph: '🤯' },
  { key: 'eyes', glyph: '👀' },
  { key: 'clown', glyph: '🤡' },
];

/**
 * Absolute position for the picker sheet, beside the toggle that
 * opened it.
 *
 * Centred on screen it sat a long way from the thumb that summoned it
 * and read as a page-level dialog rather than as something belonging
 * to one card. This puts it against the toggle, preferring above -
 * the toggles sit low on a card, so there is usually room up there -
 * and dropping below only when there is not.
 *
 * Clamped to the screen either way, or a toggle near an edge would
 * push half the sheet off it. Returns null when the measurement is
 * unavailable, leaving the sheet wherever the backdrop puts it.
 */
function sheetPosition(anchor) {
  if (!anchor) return null;
  const win = Dimensions.get('window');
  const height = 2 * SHEET_CELL + SHEET_GAP + SHEET_PAD * 2;

  const left = Math.max(8, Math.min(
    win.width - SHEET_W - 8,
    anchor.x + anchor.w / 2 - SHEET_W / 2,
  ));
  const above = anchor.y - height - 8;
  const top = above >= 8 ? above : anchor.y + anchor.h + 8;

  return {
    position: 'absolute',
    left,
    top: Math.min(top, win.height - height - 8),
  };
}

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
 * @param {boolean} vertical stack the chips instead of laying them in a
 *   row — used in the big player, where the actions live on a rail down
 *   the right edge and a horizontal strip would cut across the video.
 * @param {boolean} compact smaller chips, for the vote-wait grid whose
 *   cards are only 100pt wide - full-size chips overflowed them.
 * @param {boolean} collapsible picker only — render a single toggle that
 *   opens the set, instead of a permanent row. Used in the two-column
 *   voting grid, where five chips under every card crowded the vote auras
 *   already drawn around them.
 * @param {Function} reactors (key) => [{uid, name, color, isMe}] — who sent
 *   that emoji. Summary mode only; tapping a chip reveals the names.
 */
export default function ReactionBar({
  counts = {}, mine = {}, onReact, disabled, mode = 'picker', reactors,
  collapsible = false, vertical = false, compact = false,
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

  // Where the toggle is on screen, captured on press. measureInWindow
  // is async, so the sheet opens in the callback rather than
  // immediately - otherwise the first frame renders in the wrong
  // place and visibly jumps.
  const toggleRef = useRef(null);
  const [anchor, setAnchor] = useState(null);
  const openAtToggle = () => {
    if (!toggleRef.current?.measureInWindow) { setOpen(true); return; }
    toggleRef.current.measureInWindow((x, y, w, h) => {
      setAnchor({ x, y, w, h });
      setOpen(true);
    });
  };

  const openList = openKey && reactors ? reactors(openKey) : null;
  const shown = isSummary
    ? REACTIONS.filter(({ key }) => (counts[key] || 0) > 0)
    : REACTIONS;

  // Summary can take new reactions too, when handed an onReact. The
  // round is still on screen and people keep reacting to what they just
  // watched - there was no reason the tally was read-only.
  //
  // It gets its own toggle rather than making the chips send: a tap on a
  // summary chip already means "who reacted", and overloading that would
  // make every attempt to read the tally fire an emoji.
  const canAdd = isSummary && !!onReact;

  // Nothing given yet - normally render nothing rather than an empty
  // strip holding vertical space under every card. But when adding is
  // allowed the toggle has to survive, or a card nobody has reacted to
  // yet would be the one card you cannot react to.
  if (isSummary && shown.length === 0 && !canAdd) return null;

  const addToggle = (
    <Pressable
      ref={toggleRef}
      onPress={openAtToggle}
      style={styles.chip}
      hitSlop={6}
    >
      <Ionicons name="happy-outline" size={15} color="rgba(255,255,255,0.65)" />
      <Text style={styles.plus}>+</Text>
    </Pressable>
  );

  if (collapsed || (collapsible && !isSummary)) {
    // A grey outlined face with a +, not one of the emoji. Showing a
    // real emoji made the toggle look like a fifth choice you were
    // picking - greyscale reads as chrome, and the + says it opens
    // something. It stays grey once you've reacted: what you sent is
    // shown on the clip itself, so tinting this would say it twice.
    //
    // The set opens in a MODAL rather than expanding in place. Inline,
    // ten chips added a row to one cell and shoved every card below it
    // down the screen - the grid rearranging itself under your thumb
    // while you reach for an emoji. Floating over the top leaves the
    // layout alone.
    return (
      <View style={styles.row}>
        {addToggle}
        <Modal
          visible={!!open}
          transparent
          animationType="fade"
          onRequestClose={() => setOpen(false)}
        >
          <Pressable style={styles.pickerBackdrop} onPress={() => setOpen(false)}>
            <Pressable style={[styles.pickerSheet, sheetPosition(anchor)]} onPress={() => {}}>
              {REACTIONS.map(({ key, glyph }) => (
                <Pressable
                  key={key}
                  onPress={() => {
                    onReact?.(key);
                    // Not while dimmed: GameScreen drops that tap, and
                    // closing on a reaction that never landed reads as
                    // a success.
                    if (!disabled) setOpen(false);
                  }}
                  style={({ pressed }) => [
                    styles.pickerCell,
                    mine[key] && styles.pickerCellMine,
                    (pressed || disabled) && styles.chipDim,
                  ]}
                  hitSlop={4}
                >
                  <Text style={styles.pickerGlyph}>{glyph}</Text>
                </Pressable>
              ))}
            </Pressable>
          </Pressable>
        </Modal>
      </View>
    );
  }

  return (
    <View>
      <View style={[styles.row, vertical && styles.rowVertical, compact && styles.rowCompact]}>
      {shown.map(({ key, glyph }) => {
        const count = counts[key] || 0;
        if (isSummary) {
          return (
            <Pressable
              key={key}
              onPress={() => setOpenKey(openKey === key ? null : key)}
              // No outline here, not even for a single reactor. These
              // sit among the vote auras, which are drawn in the same
              // player colours — a bordered chip competed with them and
              // read as another piece of scoring. Who reacted is still
              // a tap away, and the names come up in their colours.
              style={[
                styles.chip,
                styles.chipBare,
                compact && styles.chipCompact,
                openKey === key && styles.chipOpen,
              ]}
              hitSlop={4}
            >
              <Text style={[styles.glyph, compact && styles.glyphCompact]}>{glyph}</Text>
              <Text style={[styles.count, compact && styles.countCompact]}>{count}</Text>
            </Pressable>
          );
        }
        return (
          <Pressable
            key={key}
            onPress={() => {
              onReact?.(key);
              // Not while dimmed: GameScreen drops that tap, and closing
              // on a reaction that never landed reads as a success.
              if (collapsible && !disabled) setOpen(false);
            }}
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
      {/* Trailing, so the tally still reads left to right and the way
          to add sits after what's already there. */}
      {canAdd && !open && addToggle}
      </View>
      {/* The picker opens as its own row BELOW the tally rather than
          replacing it - the counts are the results screen's content and
          shouldn't vanish because you reached for an emoji. */}
      {canAdd && open && (
        <View style={styles.row}>
          {REACTIONS.map(({ key, glyph }) => (
            <Pressable
              key={key}
              onPress={() => {
                onReact?.(key);
                if (!disabled) setOpen(false);
              }}
              style={({ pressed }) => [
                styles.chip,
                mine[key] && styles.chipMine,
                (pressed || disabled) && styles.chipDim,
              ]}
              hitSlop={4}
            >
              <Text style={styles.glyph}>{glyph}</Text>
            </Pressable>
          ))}
        </View>
      )}
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
  rowVertical: { flexDirection: 'column' },
  // Wraps rather than overflowing. All four emoji on one narrow card is
  // rare but not impossible, and a chip sticking out past the video
  // looks broken in a way a second row does not.
  rowCompact: { flexWrap: 'wrap', gap: 2, marginTop: 0 },
  chipCompact: {
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 8,
    gap: 2,
  },
  glyphCompact: { fontSize: 11 },
  countCompact: { fontSize: 9 },
  row: {
    flexDirection: 'row',
    // The set grew from four to ten, which is wider than a grid cell.
    flexWrap: 'wrap',
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
  // Summary chips keep the dark pill — the count is white and would
  // vanish on the light theme without it — but lose the outline.
  chipBare: { borderWidth: 0 },
  chipDim: { opacity: 0.45 },
  pickerBackdrop: {
    flex: 1,
    // Barely there. The sheet is a small thing attached to one
    // card, not a page-level dialog, so blacking out the screen
    // behind it overstated it - but it still has to catch a tap
    // to dismiss.
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  pickerSheet: {
    width: SHEET_W,
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: SHEET_GAP,
    padding: SHEET_PAD,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: '#0A1A2A',
  },
  pickerCell: {
    width: SHEET_CELL,
    height: SHEET_CELL,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: 'transparent',
  },
  pickerCellMine: {
    borderColor: theme.colors.vibeGreen,
    backgroundColor: 'rgba(0,255,65,0.12)',
  },
  pickerGlyph: { fontSize: 22 },
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
  plus: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 12,
    fontWeight: '900',
    marginLeft: -1,
  },
  count: {
    color: 'white',
    fontSize: 11,
    fontWeight: '800',
    fontVariant: ['tabular-nums'],
  },
});
