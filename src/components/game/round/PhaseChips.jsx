// PhaseChips — top-of-screen strip showing the round's flow. The
// current phase gets the filled cyan pill; the rest are dim outlines.
// WARMUP is only included in the strip while we're actually in the
// warmup phase (round 1); it drops off once picking starts so the
// leftmost chip isn't a dim reminder of a phase you can't go back to.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import theme from '../../../theme/themes';

// Static base — PICK / VOTE / RESULT / SCORE always render. WARMUP
// is prepended conditionally in the render below.
// Labels vs phase keys: `scoring` is when THIS round's vote result
// is revealed → RESULT. `roundResults` is the running scoreboard
// between rounds → SCORE. Older names, kept for wire compat.
const BASE_STEPS = [
  { key: 'picking', label: 'PICK' },
  { key: 'voting', label: 'VOTE' },
  { key: 'scoring', label: 'RESULT' },
  { key: 'roundResults', label: 'SCORE' },
];

// Which chip should be highlighted for a given game.phase. Scoring
// and Round Results are now separate chips.
function activeKeyForPhase(phase) {
  if (phase === 'review') return 'warmup';
  if (phase === 'picking') return 'picking';
  if (phase === 'voting') return 'voting';
  if (phase === 'scoring') return 'scoring';
  if (phase === 'roundResults') return 'roundResults';
  return null;
}

// Render the strip. Compact by design — the timer sits to its right
// in RoundHeaderBar, so the whole row stays under ~40pt tall.
// During WARMUP we render just the single WARMUP chip so the strip
// isn't three dim upcoming labels; the three-step strip reappears
// once picking starts.
export default function PhaseChips({ phase }) {
  const activeKey = activeKeyForPhase(phase);
  const steps = phase === 'review'
    ? [{ key: 'warmup', label: 'WARMUP' }]
    : BASE_STEPS;
  return (
    <View style={styles.row}>
      {steps.map((step, i) => (
        <React.Fragment key={step.key}>
          {i > 0 && <View style={styles.divider} />}
          <View style={[
            styles.chip,
            step.key === activeKey && styles.chipActive,
          ]}>
            <Text style={[
              styles.label,
              step.key === activeKey && styles.labelActive,
            ]}>
              {step.label}
            </Text>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexShrink: 1,
  },
  // Base chip = VibeButton-style outline: cyan border on transparent
  // bg, white text. Active = filled cyan, still white text so it
  // reads like the CTA bars across the game.
  chip: {
    paddingVertical: 4,
    paddingHorizontal: 7,
    borderRadius: 10,
    borderWidth: 1.5,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'transparent',
  },
  chipActive: {
    backgroundColor: theme.colors.vibeBlue,
  },
  label: {
    color: 'white',
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.4,
  },
  labelActive: {
    color: 'white',
  },
  divider: {
    width: 4,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: 1,
  },
});
