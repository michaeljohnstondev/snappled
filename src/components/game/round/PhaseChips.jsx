// PhaseChips — top-of-screen strip showing the round's flow. The
// current phase gets the filled cyan pill; the rest are dim outlines.
// WARMUP is only included in the strip while we're actually in the
// warmup phase (round 1); it drops off once picking starts so the
// leftmost chip isn't a dim reminder of a phase you can't go back to.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import theme from '../../../theme/themes';

// Static base — PICK / VOTE / SCORE always render. WARMUP is prepended
// conditionally in the render below.
const BASE_STEPS = [
  { key: 'picking', label: 'PICK' },
  { key: 'voting', label: 'VOTE' },
  { key: 'scoring', label: 'SCORE' },
];

// Which chip should be highlighted for a given game.phase.
// SCORING + ROUND_RESULTS both light up the SCORE chip since they're
// the same conceptual step from the player's view.
function activeKeyForPhase(phase) {
  if (phase === 'review') return 'warmup';
  if (phase === 'picking') return 'picking';
  if (phase === 'voting') return 'voting';
  if (phase === 'scoring' || phase === 'roundResults') return 'scoring';
  return null;
}

// Render the strip. Compact by design — the timer sits to its right
// in RoundHeaderBar, so the whole row stays under ~40pt tall.
export default function PhaseChips({ phase }) {
  const activeKey = activeKeyForPhase(phase);
  const steps = phase === 'review'
    ? [{ key: 'warmup', label: 'WARMUP' }, ...BASE_STEPS]
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
  },
  chip: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'transparent',
  },
  chipActive: {
    borderColor: theme.colors.vibeBlue,
    backgroundColor: theme.colors.vibeBlue,
  },
  label: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  labelActive: {
    color: '#000',
  },
  divider: {
    width: 8,
    height: 1.5,
    backgroundColor: 'rgba(255,255,255,0.25)',
    marginHorizontal: 2,
  },
});
