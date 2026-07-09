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
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    marginBottom: 12,
    padding: 20,
    borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
  },
  instruction: {
    color: theme.colors.vibeBlue,
    fontSize: 11,
    fontWeight: theme.fontWeights.bold,
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  prompt: {
    color: 'white',
    fontSize: 20,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
    lineHeight: 26,
  },
});
