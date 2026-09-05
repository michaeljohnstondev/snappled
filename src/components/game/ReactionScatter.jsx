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

/**
 * @param {Object} counts   { [key]: number } — used only to know which
 *   emoji were given; the number itself is never drawn.
 * @param {Function} reactors (key) => [{uid, name, color, isMe}]
 * @param {string} subUid   seeds the scatter so two cards holding the
 *   same emoji don't land identically.
 */
export default function ReactionScatter({ counts = {}, reactors, subUid = '' }) {
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

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {items.map((item, i) => {
        const h = hash(`${subUid}:${item.id}`);
        // An angle around the card, and a radius that varies a little so
        // they don't sit on a perfect circle. Kept near the edge: the
        // middle is the video, and covering someone's face with an
        // emoji is the one place this stops being fun.
        const angle = (h % 360) * (Math.PI / 180);
        const radius = 38 + ((h >> 9) % 12); // 38-50% of the card
        const left = 50 + radius * Math.cos(angle);
        const top = 50 + radius * Math.sin(angle) * 0.92;

        return (
          <Pressable
            key={item.id}
            onPress={() => setNamed(named === item.id ? null : item.id)}
            hitSlop={6}
            style={[
              styles.slot,
              {
                left: `${Math.max(2, Math.min(98, left))}%`,
                top: `${Math.max(2, Math.min(98, top))}%`,
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
