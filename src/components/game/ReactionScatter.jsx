// Reactions scattered around the edge of a snapple.
//
// Replaces the counted chip strip on the grids. One glyph per PERSON
// rather than one chip per emoji with a number beside it: three people
// laughing is three faces, which reads as a crowd instead of as a
// statistic. No counts, no chip, no background - just emoji sitting on
// the clip.
//
// Placement is by POSITION IN ARRIVAL ORDER, counting around the border
// and lapping when it runs out. That is the whole design: an emoji does
// not move once it is placed, because an arriving reaction can only
// take the next free spot. Earlier versions hashed an identity to a
// position and probed on collisions, which looked scattered but let a
// new reaction shove an existing one aside.
//
// The order comes from the game doc, so every phone in the room - and a
// television showing the same grid - draws the same arrangement.
//
// Tapping one names who sent it.

import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { REACTIONS } from './ReactionBar';

const GLYPH = 19;

// How much of a glyph hangs off the edge, as a fraction.
//
// Split by axis on purpose. The cards sit in a two-column grid, so a
// glyph off the LEFT or RIGHT crosses toward the neighbouring card or
// the screen edge, where it reads as spilling out of the card. Off the
// TOP or BOTTOM it drops into row gap and the name area below, which is
// empty space and looks deliberate. Sides get tucked in hard; top and
// bottom keep most of the overhang that made the effect work.
const OUT_SIDE = 0.12;
const OUT_VERT = 0.4;

// Fixed landing spots around the border, three to a side. Every glyph
// takes a DIFFERENT one, which is what stops them stacking on top of
// each other - a hash picked freely will happily hand two reactions the
// same coordinates. Corners are skipped: they are where two sides meet
// and glyphs bunch up there.
//
// Three a side keeps neighbours 25% apart. Even on the vote-wait grid's
// 100pt cards that is ~25px between centres against a 19px glyph, so
// they sit close but clear.
// Landing spots around the border, in the order they get used.
//
// Two interleaved laps. The first lap takes four well-spread points -
// one per side at 30% - then the second fills the gaps at 70%, then the
// remaining passes tighten in between. So the first few reactions on a
// card are as far apart as possible, and only a heavily-reacted card
// starts packing them in.
const SLOTS = (() => {
  const out = [];
  // Each pass walks all four sides before the next pass starts, so
  // consecutive reactions never land on the same side twice running.
  [30, 70, 50, 15, 85].forEach((t) => {
    out.push({ left: t, top: 0 });    // top
    out.push({ left: 100, top: t });  // right
    out.push({ left: t, top: 100 });  // bottom
    out.push({ left: 0, top: t });    // left
  });
  return out;
})();

/**
 * Slot index for a reaction, from its position in the arrival order.
 *
 * Deliberately just an index. Anything cleverer - hashing an identity,
 * shuffling, probing for a free spot - means an arriving reaction can
 * displace one already on screen. Counting up the list cannot: an
 * append only ever takes the next position, and every position before
 * it keeps the slot it had.
 *
 * Past the end of the list it wraps, so a very busy card laps the
 * border and fills the gaps rather than refusing to draw. Reactions
 * cannot currently be removed; if they ever can, a hole in the order
 * array should be LEFT in place so the reactions after it do not
 * shuffle up, and reused by whatever arrives next.
 */
function slotFor(index, slotCount) {
  return index % slotCount;
}

/**
 * @param {Object} counts   { [key]: number } — used only to know which
 *   emoji were given; the number itself is never drawn.
 * @param {Function} reactors (key) => [{uid, name, color, isMe}]
 * @param {string[]} order arrival order as "emojiKey:uid", straight
 *   from the game doc. Position in it IS the slot, which is what keeps
 *   an emoji still once it is placed.
 * @param {boolean} reserveCorner keep the bottom corners clear. The add
 *   toggle sits bottom-right and the points chip bottom-left, and a
 *   glyph in the slots nearest either one reads as a second, slightly
 *   different button stacked on it.
 */
export default function ReactionScatter({
  counts = {}, reactors, reserveCorner = false, order,
}) {
  const [named, setNamed] = useState(null);
  const orderList = order || [];

  // One entry per reactor, not per emoji.
  const items = [];
  REACTIONS.forEach(({ key, glyph }) => {
    if (!(counts[key] > 0)) return;
    const who = reactors ? reactors(key) : [];
    // Fall back to the tally when there's no attribution to expand, so
    // a reaction never silently fails to appear.
    const n = who.length || counts[key];
    for (let i = 0; i < n; i++) {
      const person = who[i] || null;
      // Identity is the PERSON and the emoji, not the position in the
      // list. Position changes whenever anyone else reacts; who sent
      // what does not.
      // Must match the reactionOrder entry exactly - that string is
      // what pins this emoji to its slot. The token carries the #n that
      // distinguishes one person's repeats from each other.
      const id = `${key}:${person?.token || person?.uid || i}`;
      items.push({ id, glyph, person, fallback: items.length });
    }
  });

  if (items.length === 0) return null;

  // Past the last slot the placement laps and emoji land on each other.
  // That is allowed: a card buried in reactions is funny, and refusing
  // to draw someone's emoji to keep the layout tidy is the wrong trade.
  //
  // The two BOTTOM corners still get skipped when the add toggle is
  // down there - those hold real controls, and a glyph on the toggle
  // reads as a broken button rather than as a joke.
  const usable = reserveCorner
    ? SLOTS.filter((p) => !(
      (p.top === 100 && (p.left >= 70 || p.left <= 30))
      || (p.left === 100 && p.top >= 70)
      || (p.left === 0 && p.top >= 70)
    ))
    : SLOTS;
  // Position in the game doc's arrival order. Anything not in that list
  // - a reaction written before this ordering existed - falls back to
  // the end, where it cannot push anything else around.
  const shown = items.map((item) => {
    const at = orderList.indexOf(item.id);
    return { ...item, at: at === -1 ? orderList.length + item.fallback : at };
  })
    .sort((a, b) => a.at - b.at)
    .map((item, i) => ({ ...item, slot: slotFor(i, usable.length) }));

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {shown.map((item, i) => {
        // One slot each, in a per-snapple order. Centred ON the border
        // line so the glyph half hangs off the clip; frameOuter doesn't
        // clip, since the vote rings already draw outside it.
        const { left, top } = usable[item.slot];

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
                // Biased INWARD rather than centred on the border.
                // Dead-centre put half of every glyph outside the clip,
                // which read as falling off it; a quarter out is enough
                // to break the edge without leaving the snapple.
                // Percentage offsets can't be combined with a
                // percentage translate here, so this is done in points.
                marginLeft: left === 100
                  ? -GLYPH * OUT_SIDE
                  : left === 0 ? -GLYPH * (1 - OUT_SIDE) : -GLYPH / 2,
                marginTop: top === 100
                  ? -GLYPH * OUT_VERT
                  : top === 0 ? -GLYPH * (1 - OUT_VERT) : -GLYPH / 2,
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
