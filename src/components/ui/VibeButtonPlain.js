import React from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import theme from '../../theme/themes';

export default function VibeButtonPlain({ label, onPress, style, textStyle }) {
  return (
    <Pressable onPress={onPress} style={[styles.button, style]}>
      <Text style={[styles.text, textStyle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    borderRadius: theme.sizes.borderRadius,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
  },
  text: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.main,
  },
});
