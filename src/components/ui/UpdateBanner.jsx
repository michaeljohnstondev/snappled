// UpdateBanner.jsx
// A persistent top-of-screen banner that appears once an OTA update
// has been downloaded and is ready to apply. The only action is a
// "Restart" button — there's no dismiss, since the whole point is to
// stop users from continuing to run the old JS bundle. Stays out of
// the way (doesn't block the screen) but is loud enough that users
// will tap it within their session.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

// Props:
//   visible:  show/hide the banner (driven by useAppUpdate's isUpdateReady)
//   onRestart: called when the user taps Restart (Updates.reloadAsync)
export default function UpdateBanner({ visible, onRestart }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (!visible) return null;
  return (
    <View style={styles.banner} pointerEvents="box-none">
      <View style={styles.inner}>
        <Ionicons name="sparkles" size={16} color={theme.colors.vibeYellow} />
        <Text style={styles.text} numberOfLines={1}>
          New version ready
        </Text>
        <Pressable onPress={onRestart} style={styles.button}>
          <Text style={styles.buttonText}>Restart</Text>
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (t) => ({
  banner: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 1000,
  },
  inner: {
    marginHorizontal: 12,
    marginTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: '#000',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.colors.vibeYellow,
    paddingVertical: 8,
    paddingLeft: 12,
    paddingRight: 6,
  },
  text: {
    flex: 1,
    color: t.colors.textPrimary,
    fontSize: 13,
    fontWeight: '600',
  },
  button: {
    backgroundColor: theme.colors.vibeYellow,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 10,
  },
  buttonText: {
    color: '#000',
    fontSize: 13,
    fontWeight: 'bold',
  },
});
