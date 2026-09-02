// ResourceInfoPopup — press-and-hold tooltip for a resource in the
// top HomeHeader bar. Uses a Modal so it renders above every layer
// regardless of what parent tree clips it (the previous
// absolutely-positioned overlay got clipped by the header's
// natural bounds and rendered off-screen).
//
// Touch-responder note: React Native tracks in-progress touches on
// the responder that started the gesture. A Modal appearing mid-hold
// does NOT hijack the existing touch — the Pressable that fired
// onPressIn keeps ownership and fires onPressOut cleanly when the
// finger lifts. The Modal only captures NEW touches on its own
// surface, and we set pointerEvents:'none' on the backdrop so the
// popup can never accidentally intercept anything.

import React from 'react';
import { View, Text, Modal, StyleSheet } from 'react-native';
import theme from '../../../theme/themes';
import { useTheme, useThemedStyles } from '../../../theme/ThemeContext';

export default function ResourceInfoPopup({ visible, title, bullets }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      // No-op — press-out on the underlying Pressable is what
      // closes the popup, not a modal action.
      onRequestClose={() => {}}
    >
      <View style={styles.backdrop} pointerEvents="none">
        <View style={styles.card}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.bulletList}>
            {(bullets || []).map((line, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{line}</Text>
              </View>
            ))}
          </View>
          <Text style={styles.hint}>RELEASE TO CLOSE</Text>
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (t) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    paddingVertical: 22,
    paddingHorizontal: 22,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(10, 26, 42, 0.96)',
  },
  title: {
    color: t.colors.textPrimary,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  bulletList: {
    alignSelf: 'stretch',
    gap: 8,
    marginBottom: 14,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 4,
  },
  bulletDot: {
    color: theme.colors.vibeBlue,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
  },
  bulletText: {
    color: t.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  hint: {
    color: theme.colors.vibeBlue,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 2,
    textAlign: 'center',
    textTransform: 'uppercase',
    opacity: 0.55,
  },
});
