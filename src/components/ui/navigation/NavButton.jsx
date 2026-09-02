import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import theme from '../../../theme/themes';
import { useTheme, useThemedStyles } from '../../../theme/ThemeContext';

export default function NavButton({ title = "test", onPress, style, active = false }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      delayPressIn={0}
      delayPressOut={0}
      style={({ pressed }) => [
        styles.button,
        active && styles.activeButton,
        { opacity: pressed && !active ? 0.7 : 1 },
        style,
      ]}
    >
      <Text style={[styles.buttonText, active && styles.activeText]}>
        {title}
      </Text>
    </Pressable>
  );
}

const makeStyles = (t) => ({
  button: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'transparent',
  },
  activeButton: {
    backgroundColor: 'rgba(0, 198, 255, 0.15)',
    borderTopWidth: 3,
    borderTopColor: theme.colors.vibeBlue,
  },
  buttonText: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 13,
    fontWeight: 'bold',
    fontFamily: theme.fonts.main,
    textAlign: 'center',
  },
  activeText: {
    color: theme.colors.vibeBlue,
  },
});
