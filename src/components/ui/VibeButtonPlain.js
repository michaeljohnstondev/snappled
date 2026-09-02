import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

export default function VibeButtonPlain({
  label,
  onPress,
  style,
  textStyle,
  numberOfLines = 0,
}) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable onPress={onPress} style={[styles.button, style]}>
      <Text
        style={[styles.text, textStyle]}
        numberOfLines={numberOfLines || undefined}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const makeStyles = (t) => ({
  button: {
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
    borderRadius: theme.sizes.borderRadius,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  text: {
    color: t.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.main,
  },
});
