// TutorialOverlay — full-screen tap-anywhere-to-dismiss tip surface.
// Used by the tutorial-mode practice game to explain each phase the
// first time it's entered. Deliberately buttonless: the whole surface
// is the tap target, matching the "tap to remove" flow the user asked
// for.
//
// Punk-styled: TUTORIAL label pill, graffiti-thick title, legible body,
// small "tap anywhere to continue" nudge at the bottom.

import React from 'react';
import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

// Render the tip. Renders nothing if `tip` is falsy (idle state).
// title / body come from useTutorial's TUTORIAL_TIPS content dictionary.
export default function TutorialOverlay({ tip, onDismiss }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (!tip) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onDismiss}>
      <Pressable style={styles.backdrop} onPress={onDismiss}>
        <View style={styles.card}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>TUTORIAL</Text>
          </View>
          <Text style={styles.title}>{tip.title}</Text>
          <Text style={styles.body}>{tip.body}</Text>
        </View>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (t) => ({
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
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderRadius: 20,
    borderWidth: 4,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(10, 26, 42, 0.95)',
  },
  badge: {
    paddingVertical: 5,
    paddingHorizontal: 12,
    borderRadius: 12,
    backgroundColor: theme.colors.vibeBlue,
    marginBottom: 16,
  },
  badgeText: {
    color: '#000',
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  title: {
    color: t.colors.textPrimary,
    fontSize: 28,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  body: {
    color: t.colors.textPrimary,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
    marginBottom: 22,
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
