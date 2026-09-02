// CountdownOverlay — big number in the middle of the screen for the
// final seconds of a phase. Non-interactive: passes taps through
// so the video grid underneath keeps working. Parent controls when
// to render (only pass a number in the 1..COUNTDOWN_SECONDS range).

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import theme from '../../theme/themes';

// How long a countdown runs. Single source of truth — the tick SFX in
// GameScreen reads this too, so the sound and the number can't drift
// apart. Was 5; five ticks read as nagging rather than as a countdown.
export const COUNTDOWN_SECONDS = 3;

// Render the number. Nothing renders when `seconds` is falsy or
// outside the countdown window — cheap noop for the rest of the
// round. Absolutely positioned and pointerEvents="none" so the
// picking / voting grid underneath still receives taps.
export default function CountdownOverlay({ seconds }) {
  if (!seconds || seconds < 1 || seconds > COUNTDOWN_SECONDS) return null;
  return (
    <View pointerEvents="none" style={styles.wrap}>
      <View style={styles.badge}>
        <Text style={styles.number}>{seconds}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 50,
  },
  badge: {
    width: 160,
    height: 160,
    borderRadius: 80,
    borderWidth: 6,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  number: {
    color: '#fff',
    fontSize: 96,
    fontWeight: '900',
    letterSpacing: 2,
    lineHeight: 108,
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 2, height: 2 },
    textShadowRadius: 6,
  },
});
