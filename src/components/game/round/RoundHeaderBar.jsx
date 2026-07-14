// RoundHeaderBar — top chrome for the picking/voting screens. Phase
// chips on the left, a small "0:24" pill timer with a red dot on the
// right. Compact enough to leave the whole rest of the screen for
// the prompt banner + hand grid.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
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
// `onHelp` optionally shows a "?" button between the chips and the
// timer that fires when tapped — used to surface phase help text
// on demand instead of shoving it on-screen every round.
export default function RoundHeaderBar({ phase, timerSec, onHelp }) {
  const showTimer = typeof timerSec === 'number' && timerSec > 0;
  return (
    <View style={styles.bar}>
      <View style={styles.chipsWrap}>
        <PhaseChips phase={phase} />
      </View>
      <View style={styles.rightGroup}>
        {onHelp ? (
          <Pressable style={styles.helpBtn} onPress={onHelp} hitSlop={6}>
            <Text style={styles.helpText}>?</Text>
          </Pressable>
        ) : null}
        {showTimer ? (
          <View style={styles.timerPill}>
            <View style={styles.timerDot} />
            <Text style={styles.timerText}>{formatTimer(timerSec)}</Text>
          </View>
        ) : null}
      </View>
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
  rightGroup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  helpBtn: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.35)',
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  helpText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '900',
    lineHeight: 15,
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
