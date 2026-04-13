import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import theme from '../../theme/themes';

export default function VibeButtonPlain({
  label,
  onPress,
  style,
  textStyle,
  numberOfLines = 0,
}) {
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

const styles = StyleSheet.create({
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
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.main,
  },
});
