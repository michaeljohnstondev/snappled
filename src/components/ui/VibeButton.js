import React, { useMemo } from 'react';
import { Pressable, Text, StyleSheet } from 'react-native';
import theme from '../../theme/themes';

/**
 * VibeButton: Clean button with subtle border accent
 * Usage: <VibeButton label="Click Me" onPress={...} />
 */
export default function VibeButton({ label, onPress, style, textStyle }) {
  const accentColor = useMemo(() => {
    const accents = [
      theme.colors.vibeBlue,    // Cyan
      theme.colors.vibePurple,  // Purple  
      theme.colors.shadowGlow,  // Teal
    ];
    return accents[Math.floor(Math.random() * accents.length)];
  }, []);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        { 
          borderColor: accentColor,
          backgroundColor: pressed ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.05)',
          opacity: pressed ? 0.8 : 1 
        },
        style
      ]}
    >
      <Text style={[styles.text, { color: accentColor }, textStyle]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    borderRadius: theme.sizes.buttonRadius,
    borderWidth: 2,
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    marginVertical: 10,
  },
  text: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: theme.fonts.main,
  },
});
