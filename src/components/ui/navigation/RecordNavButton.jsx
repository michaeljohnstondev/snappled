import React from 'react';
import { Pressable, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../../../theme/themes';
import { useTheme, useThemedStyles } from '../../../theme/ThemeContext';

export default function RecordNavButton({ onPress }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.wrapper}>
      <Pressable onPress={onPress} style={({ pressed }) => [styles.button, { opacity: pressed ? 0.85 : 1 }]}>
        <LinearGradient
          colors={[theme.colors.vibeBlue, theme.colors.vibePurple]}
          style={styles.gradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
        >
          <Ionicons name="videocam" size={28} color="white" />
        </LinearGradient>
      </Pressable>
    </View>
  );
}

const makeStyles = (t) => ({
  wrapper: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginTop: -24,
    shadowColor: theme.colors.vibeBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 12,
  },
  gradient: {
    flex: 1,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: t.colors.background,
  },
});
