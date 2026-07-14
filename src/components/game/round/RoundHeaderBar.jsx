// RoundHeaderBar — top chrome for the picking/voting screens. Phase
// chips on the left, a small "0:24" pill timer with a red dot on the
// right. Compact enough to leave the whole rest of the screen for
// the prompt banner + hand grid.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import PhaseChips from './PhaseChips';
import theme from '../../../theme/themes';

// Format seconds as m:ss so the timer reads like a real clock even
// on 60s+ phases without wrapping past 60.
function formatTimer(sec) {
  const s = Math.max(0, Math.floor(sec || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

// Render the header row. `phase` matches gameService.GAME_PHASES
// values. `timerSec` is the remaining seconds for the current phase;
// pass 0 or null to hide the timer entirely (e.g. during LOADING).
export default function RoundHeaderBar({ phase, timerSec }) {
  const showTimer = typeof timerSec === 'number' && timerSec > 0;
  return (
    <View style={styles.bar}>
      <View style={styles.chipsWrap}>
        <PhaseChips phase={phase} />
      </View>
      {showTimer ? (
        <View style={styles.timerPill}>
          <View style={styles.timerDot} />
          <Text style={styles.timerText}>{formatTimer(timerSec)}</Text>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 10,
    paddingHorizontal: 12,
    gap: 8,
  },
  chipsWrap: {
    flexShrink: 1,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  timerDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.vibeRed,
  },
  timerText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.5,
    fontVariant: ['tabular-nums'],
  },
});
