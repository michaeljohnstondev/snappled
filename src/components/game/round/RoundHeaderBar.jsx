// RoundHeaderBar — top chrome for the picking/voting screens. Phase
// chips on the left, a small "0:24" pill timer with a red dot on the
// right. Compact enough to leave the whole rest of the screen for
// the prompt banner + hand grid.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
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
// `onHelp` (optional) surfaces a "?" button next to the timer that
// works press-and-hold: `onHelp()` fires on press-in, `onHelpEnd()`
// on press-out so the help text appears while the finger's down
// and disappears when it lifts.
export default function RoundHeaderBar({ phase, timerSec, onHelp, onHelpEnd, caption }) {
  const showTimer = typeof timerSec === 'number' && timerSec > 0;
  // Real safe-area inset so chips clear the status bar / notch on
  // every device without a fat hardcoded padding. Fallback to 8 for
  // rare cases where insets aren't ready (e.g. inside a portal).
  const insets = useSafeAreaInsets();
  const topPad = Math.max(insets.top, 8);
  return (
    <View style={[styles.bar, { paddingTop: topPad + 2 }]}>
      <View style={styles.chipsWrap}>
        <PhaseChips phase={phase} />
        {caption ? <Text style={styles.caption}>{caption}</Text> : null}
      </View>
      <View style={styles.rightGroup}>
        {showTimer ? (
          <View style={styles.timerPill}>
            <View style={styles.timerDot} />
            <Text style={styles.timerText}>{formatTimer(timerSec)}</Text>
          </View>
        ) : null}
        {onHelp ? (
          <Pressable
            style={styles.helpBtn}
            onPressIn={onHelp}
            onPressOut={onHelpEnd}
            hitSlop={6}
          >
            <Text style={styles.helpText}>?</Text>
          </Pressable>
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
    // paddingTop applied inline from safe-area insets
    paddingBottom: 6,
    paddingHorizontal: 10,
    gap: 6,
  },
  chipsWrap: {
    flexShrink: 1,
    minWidth: 0,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  caption: {
    color: 'rgba(255,255,255,0.65)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 0.4,
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
