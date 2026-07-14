// ShimmerBar — full-width flush action bar with a diagonal gradient
// fill and a soft white diagonal shimmer that sweeps across every
// ~3s. Started as the "picking-phase disabled bar" B variant that
// won the design shootout; extracted so the selected-state bar can
// wear the same vibe with a different color palette.
//
// Props:
//  - colors       — gradient stops, [start, end] or [start, mid, end]
//  - label        — button text (uppercase-styled)
//  - onPress      — tap handler; when omitted the bar is non-interactive
//  - disabled     — pointer-events off but bar still renders + animates
//  - variant      — 'default' | 'compact' (compact = shorter bar)
//
// Style prop lands on the outer gradient so callers can override
// padding (e.g. bump paddingBottom for the home-bar safe area).

import React, { useEffect, useRef } from 'react';
import { Text, Pressable, Animated, StyleSheet, Easing } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';

const PADDING_DEFAULT = { paddingTop: 20, paddingBottom: 30 };
const PADDING_COMPACT = { paddingTop: 14, paddingBottom: 16 };

// Wraps LinearGradient in Animated so the shimmer overlay can
// translate across it without repainting the fill.
const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export default function ShimmerBar({
  colors,
  label,
  onPress,
  disabled = false,
  variant = 'default',
  style,
  textStyle,
}) {
  // Diagonal light-band that sweeps left → right, pauses, then jumps
  // back to the left invisibly. Duration + delay tuned so the sweep
  // reads as satin sheen instead of a loading placeholder.
  const shimmerX = useRef(new Animated.Value(-1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerX, {
          toValue: 1,
          duration: 1800,
          easing: Easing.inOut(Easing.quad),
          useNativeDriver: true,
        }),
        Animated.delay(1400),
        Animated.timing(shimmerX, { toValue: -1, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const padding = variant === 'compact' ? PADDING_COMPACT : PADDING_DEFAULT;

  const inner = (
    <LinearGradient
      colors={colors}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={[styles.bar, padding, style]}
    >
      <Animated.View
        style={[
          styles.shimmer,
          {
            transform: [
              {
                translateX: shimmerX.interpolate({
                  inputRange: [-1, 1],
                  outputRange: [-260, 260],
                }),
              },
              { rotate: '15deg' },
            ],
          },
        ]}
      >
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={styles.shimmerInner}
        />
      </Animated.View>
      <Text style={[styles.label, textStyle]}>{label}</Text>
    </LinearGradient>
  );

  if (!onPress || disabled) {
    // Render as a plain View when non-interactive so it doesn't
    // steal touches from underlying content (e.g., the disabled bar
    // should still let the user scroll the hand above it).
    return inner;
  }
  return (
    <Pressable onPress={onPress} style={styles.pressWrap}>
      {inner}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressWrap: {
    // No self-styling; the inner gradient owns the height + fill.
  },
  bar: {
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderTopWidth: 3,
    borderTopColor: '#000',
  },
  shimmer: {
    position: 'absolute',
    top: -30,
    bottom: -30,
    width: 100,
  },
  shimmerInner: {
    flex: 1,
  },
  label: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
});
