// CreatePromptCard.jsx — the "create" card at the top of a prompt list.
//
// Lifted out of PromptsScreen so the Snapple and Game tabs open on the
// same card instead of each inventing a create button. The game tab's
// first attempt was a small outlined pill in a row beside the season
// title, which ran off the side of the screen and looked like a
// different product from the card directly beside it in the other tab.
//
// The gradient sweeps across once, rests, and resets - enough movement
// to say "this is the action" without the list underneath competing.

import React, { useEffect, useRef } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../../theme/themes';
import { useThemedStyles } from '../../theme/ThemeContext';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

/**
 * @param {string} label
 * @param {Function} onPress
 * @param {number} height
 * @param {node} accessory  optional, shown under the label (a price, say)
 */
export default function CreatePromptCard({ label, onPress, height = 140, accessory }) {
  const styles = useThemedStyles(makeStyles);
  const sweep = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(sweep, { toValue: 1, duration: 3000, useNativeDriver: false }),
      Animated.delay(5000),
      Animated.timing(sweep, { toValue: 0, duration: 0, useNativeDriver: false }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [sweep]);

  const start = {
    x: sweep.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 1, 0] }),
    y: sweep.interpolate({ inputRange: [0, 0.5, 1], outputRange: [0, 0.5, 0] }),
  };
  const end = {
    x: sweep.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0, 1] }),
    y: sweep.interpolate({ inputRange: [0, 0.5, 1], outputRange: [1, 0.5, 1] }),
  };

  return (
    <Pressable style={[styles.card, { height }]} onPress={onPress} delayPressIn={0} delayPressOut={0}>
      {({ pressed }) => (
        <AnimatedLinearGradient
          colors={[theme.colors.vibeRoyalBlue, theme.colors.vibeCyan, theme.colors.vibeRoyalBlue]}
          start={start}
          end={end}
          style={[styles.gradient, { opacity: pressed ? 0.8 : 1 }]}
        >
          <View style={styles.content}>
            <Text style={styles.label}>{label}</Text>
            {accessory}
          </View>
        </AnimatedLinearGradient>
      )}
    </Pressable>
  );
}

const makeStyles = (t) => ({
  card: { borderRadius: 16, overflow: 'hidden' },
  gradient: { flex: 1, padding: 20, justifyContent: 'center' },
  content: { alignItems: 'center', justifyContent: 'center', gap: 6 },
  label: {
    color: t.colors.textPrimary,
    fontSize: 16,
    fontWeight: theme.fontWeights.bold,
  },
});
