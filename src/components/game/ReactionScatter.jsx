// Reactions scattered around the edge of a snapple.
//
// Replaces the counted chip strip on the grids. One glyph per PERSON
// rather than one chip per emoji with a number beside it: three people
// laughing is three faces, which reads as a crowd instead of as a
// statistic. No counts, no chip, no background - just emoji sitting on
// the clip.
//
// Positions are scattered but NOT random per render. They come from a
// hash of the snapple, the emoji and the reactor, so a given reaction
// always lands in the same spot: it holds still while the round plays,
// and every phone in the room draws it identically, which matters once
// a television is showing the same grid.
//
// Tapping one names who sent it.

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { REACTIONS } from './ReactionBar';

// Small, stable string hash (djb2). Only needs to be well-spread, not
// cryptographic.
function hash(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++) {
    h = ((h << 5) + h + str.charCodeAt(i)) >>> 0;
  }
  return h;
}

const GLYPH = 19;

// Fixed landing spots around the border, three to a side. Every glyph
// takes a DIFFERENT one, which is what stops them stacking on top of
// each other - a hash picked freely will happily hand two reactions the
// same coordinates. Corners are skipped: they are where two sides meet
// and glyphs bunch up there.
//
// Three a side keeps neighbours 25% apart. Even on the vote-wait grid's
// 100pt cards that is ~25px between centres against a 19px glyph, so
// they sit close but clear.
const SLOTS = (() => {
  const out = [];
  [25, 50, 75].forEach((t) => {
    out.push({ left: t, top: 0 });    // top
    out.push({ left: 100, top: t });  // right
    out.push({ left: t, top: 100 });  // bottom
    out.push({ left: 0, top: t });    // left
  });
  return out;
})();

/**
 * Deterministic shuffle of the slot list, seeded per snapple.
 *
 * Fixed slots alone would put the first reaction in the same corner on
 * every card in the grid. Seeding by the snapple scatters them
 * differently card to card while staying identical on every phone -
 * which is what matters once a television shows the same grid.
 */
function slotOrder(seed, count) {
  const order = Array.from({ length: count }, (_, i) => i);
  let r = seed || 1;
  for (let i = order.length - 1; i > 0; i--) {
    // Park-Miller LCG: enough for shuffling, and it needs no imports.
    r = (r * 48271) % 2147483647;
    const j = r % (i + 1);
    const tmp = order[i];
    order[i] = order[j];
    order[j] = tmp;
  }
  return order;
}

/**
 * @param {Object} counts   { [key]: number } — used only to know which
 *   emoji were given; the number itself is never drawn.
 * @param {Function} reactors (key) => [{uid, name, color, isMe}]
 * @param {string} subUid   seeds the scatter so two cards holding the
 *   same emoji don't land identically.
 * @param {boolean} reserveCorner keep the bottom corners clear. The add
 *   toggle sits bottom-right and the points chip bottom-left, and a
 *   glyph in the slots nearest either one reads as a second, slightly
 *   different button stacked on it.
 */
export default function ReactionScatter({
  counts = {}, reactors, subUid = '', reserveCorner = false,
}) {
  const [named, setNamed] = useState(null);

  // One entry per reactor, not per emoji.
  const items = [];
  REACTIONS.forEach(({ key, glyph }) => {
    if (!(counts[key] > 0)) return;
    const who = reactors ? reactors(key) : [];
    // Fall back to the tally when there's no attribution to expand, so
    // a reaction never silently fails to appear.
    const n = who.length || counts[key];
    for (let i = 0; i < n; i++) {
      items.push({ id: `${key}-${i}`, glyph, person: who[i] || null });
    }
  });

  if (items.length === 0) return null;

  // More reactors than slots would force two into one spot. Beyond a
  // dozen the card is a wall of emoji anyway, so the extras are simply
  // not drawn rather than piled on top of what is already there.
  // Drop the two slots flanking the bottom-right corner when the add
  // toggle is down there, so nothing lands on top of it.
  const usable = reserveCorner
    ? SLOTS.filter((p) => !(
      // bottom-right: the add toggle
      (p.top === 100 && p.left === 75) || (p.left === 100 && p.top === 75)
      // bottom-left: the points chip
      || (p.top === 100 && p.left === 25) || (p.left === 0 && p.top === 75)
    ))
    : SLOTS;
  const order = slotOrder(hash(subUid), usable.length);
  const shown = items.slice(0, usable.length);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {shown.map((item, i) => {
        // One slot each, in a per-snapple order. Centred ON the border
        // line so the glyph half hangs off the clip; frameOuter doesn't
        // clip, since the vote rings already draw outside it.
        const { left, top } = usable[order[i]];

        return (
          <Pressable
            key={item.id}
            onPress={() => setNamed(named === item.id ? null : item.id)}
            hitSlop={6}
            style={[
              styles.slot,
              {
                left: `${left}%`,
                top: `${top}%`,
                // Nudged by half a glyph so the POINT is centred, since
                // percentage offsets can't be combined with a percentage
                // translate here.
                marginLeft: -GLYPH / 2,
                marginTop: -GLYPH / 2,
                // Later reactions sit above earlier ones where they
                // happen to overlap.
                zIndex: 5 + i,
              },
            ]}
          >
            <Text style={styles.glyph}>{item.glyph}</Text>
            {named === item.id && item.person ? (
              <View style={styles.nameTag} pointerEvents="none">
                <Text style={[styles.nameText, { color: item.person.color }]}>
                  {item.person.isMe ? 'you' : item.person.name}
                </Text>
              </View>
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: 'absolute',
    alignItems: 'center',
  },
  glyph: {
    fontSize: GLYPH,
    // A drop shadow instead of a chip: it keeps the emoji legible over
    // any frame without putting a plate around it.
    textShadowColor: 'rgba(0,0,0,0.85)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  nameTag: {
    position: 'absolute',
    top: GLYPH + 1,
    paddingHorizontal: 5,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(0,0,0,0.85)',
  },
  nameText: {
    fontSize: 9,
    fontWeight: '900',
  },
});
