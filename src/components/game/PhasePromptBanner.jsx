// PhasePromptBanner — shared banner shown during PICKING and VOTING.
// Purpose: give new players an unambiguous verb-instruction so they
// know WHAT they're doing this phase, not just that a phase is active.
// Renders a small uppercase instruction ("PICK YOUR BEST MATCH FOR:")
// stacked above the round's prompt, styled like the existing banner.
// Optional children slot lets callers pack admin controls beneath.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import theme from '../../theme/themes';

// Render the shared banner. `instruction` is the verb-line shown
// above the prompt in punchy uppercase. `prompt` is the round's
// prompt text itself. Children render below and are used by admins
// for the Edit/Delete row on the picking phase.
export default function PhasePromptBanner({ instruction, prompt, children }) {
  return (
    <View style={styles.banner}>
      {instruction ? (
        <Text style={styles.instruction}>{instruction}</Text>
      ) : null}
      <Text style={styles.prompt}>{prompt}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  // Edge-to-edge banner — tightened to eat the least vertical space
  // possible while still clearing the status bar and staying legible.
  // Top inset is a status-bar allowance; bottom is intentionally
  // razor-thin so the grid butts right up against the bottom border.
  banner: {
    paddingTop: 44,
    paddingBottom: 4,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.vibeBlue,
  },
  instruction: {
    color: theme.colors.vibeBlue,
    fontSize: 11,
    fontWeight: theme.fontWeights.bold,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 6,
    textTransform: 'uppercase',
  },
  prompt: {
    color: 'white',
    fontSize: 16,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
    lineHeight: 20,
  },
});
