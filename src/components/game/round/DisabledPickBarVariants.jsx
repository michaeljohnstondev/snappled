// DisabledPickBarVariants — TEMP demo component. Renders 4 stacked
// candidate designs for the disabled "PICK A CARD" bar so we can
// visually A/B/C/D-test them live on-device. Once the user picks a
// winner, the losing three get deleted and the winner replaces the
// styles.submitBarDisabled in PickingPhase.jsx.

import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet, Easing } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../../../theme/themes';

// ── Variant A ─ Marching ants top border + drift chevron ─────────
// Row of little cyan dashes sits along the top edge and translates
// horizontally in a loop, like graffiti spray-outline waiting to be
// filled in. A chevron in front of the label fades in low, drifts
// up, fades out — physically pointing "look up at the cards."
function VariantA() {
  // Ants strip: total width of dashes exceeds the bar, we translate
  // by one dash-cycle worth to hide the seam.
  const antsX = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(antsX, {
        toValue: -20, // one full dash cycle (10 dash + 10 gap)
        duration: 900,
        easing: Easing.linear,
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const chevY = useRef(new Animated.Value(0)).current;
  const chevOpacity = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.parallel([
        Animated.sequence([
          Animated.timing(chevY, { toValue: -10, duration: 1200, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
          Animated.timing(chevY, { toValue: 0, duration: 0, useNativeDriver: true }),
        ]),
        Animated.sequence([
          Animated.timing(chevOpacity, { toValue: 1, duration: 400, useNativeDriver: true }),
          Animated.timing(chevOpacity, { toValue: 0, duration: 800, useNativeDriver: true }),
        ]),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={variantAStyles.bar}>
      <View style={variantAStyles.antsClip}>
        <Animated.View style={[variantAStyles.antsRow, { transform: [{ translateX: antsX }] }]}>
          {Array.from({ length: 40 }).map((_, i) => (
            <View key={i} style={variantAStyles.ant} />
          ))}
        </Animated.View>
      </View>
      <View style={variantAStyles.row}>
        <Animated.View style={{ opacity: chevOpacity, transform: [{ translateY: chevY }] }}>
          <Ionicons name="chevron-up" size={20} color={theme.colors.vibeBlue} />
        </Animated.View>
        <Text style={variantAStyles.label}>A · PICK A CARD</Text>
      </View>
    </View>
  );
}

// ── Variant B ─ Diagonal shimmer sweep ────────────────────────────
// Rich cyan→purple gradient fill, and a soft diagonal light band
// sweeps across every ~3s like the sheen on a satin ribbon. Reads
// as premium/alive without shouting.
function VariantB() {
  const shimmerX = useRef(new Animated.Value(-1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(shimmerX, { toValue: 1, duration: 1800, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.delay(1400),
        Animated.timing(shimmerX, { toValue: -1, duration: 0, useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <LinearGradient
      colors={[theme.colors.vibeBlue, '#7B2CBF']}
      start={{ x: 0, y: 0 }}
      end={{ x: 1, y: 1 }}
      style={variantBStyles.bar}
    >
      <Animated.View style={[
        variantBStyles.shimmer,
        {
          transform: [{
            translateX: shimmerX.interpolate({
              inputRange: [-1, 1],
              outputRange: [-260, 260],
            }),
          }, { rotate: '15deg' }],
        },
      ]}>
        <LinearGradient
          colors={['rgba(255,255,255,0)', 'rgba(255,255,255,0.35)', 'rgba(255,255,255,0)']}
          start={{ x: 0, y: 0.5 }}
          end={{ x: 1, y: 0.5 }}
          style={variantBStyles.shimmerInner}
        />
      </Animated.View>
      <Text style={variantBStyles.label}>B · PICK A CARD</Text>
    </LinearGradient>
  );
}

// ── Variant C ─ Neon underglow + slow border pulse ───────────────
// Static bar with a cyan glow radiating behind (iOS shadow /
// Android elevation) and the top border color animates in and out
// of full brightness. No motion inside the bar — just perimeter
// energy. Cheapest to build, still reads as "live."
function VariantC() {
  const pulse = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 0.4, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
        Animated.timing(pulse, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: false }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <View style={variantCStyles.glowWrap}>
      <Animated.View style={[
        variantCStyles.bar,
        {
          borderTopColor: pulse.interpolate({
            inputRange: [0.4, 1],
            outputRange: ['rgba(0,198,255,0.4)', 'rgba(0,198,255,1)'],
          }),
        },
      ]}>
        <Text style={variantCStyles.label}>C · PICK A CARD</Text>
      </Animated.View>
    </View>
  );
}

// ── Variant D ─ Gradient fill + upward text pulse ────────────────
// Full palette gradient (cyan → purple → magenta) across the bar.
// The text itself pulses in opacity so the CTA breathes. Boldest,
// most saturated — leans hardest into the punk palette.
function VariantD() {
  const textOpacity = useRef(new Animated.Value(1)).current;
  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(textOpacity, { toValue: 0.55, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
        Animated.timing(textOpacity, { toValue: 1, duration: 1000, easing: Easing.inOut(Easing.quad), useNativeDriver: true }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  return (
    <LinearGradient
      colors={[theme.colors.vibeBlue, '#7B2CBF', theme.colors.vibePink || '#FF2D95']}
      start={{ x: 0, y: 0.5 }}
      end={{ x: 1, y: 0.5 }}
      style={variantDStyles.bar}
    >
      <Animated.Text style={[variantDStyles.label, { opacity: textOpacity }]}>
        D · PICK A CARD
      </Animated.Text>
    </LinearGradient>
  );
}

// Public stack — renders all four variants top-to-bottom so the
// user can eyeball them side by side.
export default function DisabledPickBarVariants() {
  return (
    <View style={styles.stack}>
      <VariantA />
      <VariantB />
      <VariantC />
      <VariantD />
    </View>
  );
}

const BAR_HEIGHT = 62;

const styles = StyleSheet.create({
  stack: {
    borderTopWidth: 3,
    borderTopColor: '#000',
  },
});

const sharedLabel = {
  color: '#fff',
  fontSize: 16,
  fontWeight: '900',
  letterSpacing: 2.5,
  textTransform: 'uppercase',
};

// Variant A — marching ants
const variantAStyles = StyleSheet.create({
  bar: {
    height: BAR_HEIGHT,
    backgroundColor: 'rgba(0, 198, 255, 0.10)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.35)',
  },
  antsClip: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 4,
    overflow: 'hidden',
  },
  antsRow: {
    flexDirection: 'row',
  },
  ant: {
    width: 10,
    height: 4,
    marginRight: 10,
    backgroundColor: theme.colors.vibeBlue,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  label: {
    ...sharedLabel,
    color: theme.colors.vibeBlue,
  },
});

// Variant B — shimmer sweep
const variantBStyles = StyleSheet.create({
  bar: {
    height: BAR_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.35)',
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
    ...sharedLabel,
  },
});

// Variant C — underglow + border pulse
const variantCStyles = StyleSheet.create({
  glowWrap: {
    // Fake outer glow: platform shadow (iOS) / elevation (Android).
    shadowColor: theme.colors.vibeBlue,
    shadowOpacity: 0.55,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  bar: {
    height: BAR_HEIGHT,
    backgroundColor: 'rgba(0, 198, 255, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
    borderTopWidth: 3,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.35)',
  },
  label: {
    ...sharedLabel,
  },
});

// Variant D — full gradient + text pulse
const variantDStyles = StyleSheet.create({
  bar: {
    height: BAR_HEIGHT,
    justifyContent: 'center',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(0,0,0,0.35)',
  },
  label: {
    ...sharedLabel,
  },
});
