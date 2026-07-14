// RoundStartOverlay — full-screen tap-to-dismiss info card that
// announces the current phase's time budget at the start of each
// picking/voting round. Same "tap anywhere to continue" pattern as
// the tutorial tips but always on, once per phase per round, so
// players always know what they're doing and how long they have.

import React from 'react';
import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import theme from '../../theme/themes';

// Render the overlay. `title` is the big graffiti-thick headline
// (e.g. "60 SECONDS TO PICK"), `sub` is the one-line hint below.
// Renders nothing when `visible` is false so the game plays through
// underneath without a flicker.
export default function RoundStartOverlay({ visible, title, sub, onDismiss }) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          {sub ? <Text style={styles.sub}>{sub}</Text> : null}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.88)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 380,
    alignItems: 'center',
    paddingVertical: 32,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(10, 26, 42, 0.95)',
  },
  title: {
    color: 'white',
    fontSize: 30,
    fontWeight: '900',
    letterSpacing: 3,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 12,
  },
  sub: {
    color: theme.colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 20,
  },
  hint: {
    color: theme.colors.vibeBlue,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 2,
    textTransform: 'uppercase',
    opacity: 0.7,
  },
});
