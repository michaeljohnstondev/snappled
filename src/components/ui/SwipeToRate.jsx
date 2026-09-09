// SwipeToRate.jsx — drag a card sideways to rate it, in place.
//
// Deliberately NOT the same gesture as SwipeCard. That one throws a card
// away, which is right for a stack you are working through. This wraps a
// row that has to stay exactly where it is: the prompt is still live,
// still tappable, still the thing you might go shoot a snapple for.
// So the card slides, commits the rating, and springs back.
//
// It exists because rating was buried in an overlay you had to open
// first, which is most of the reason prompts had no ratings at all. A
// verdict you can give with your thumb, without leaving the list, is a
// verdict people will actually give.
//
// Dumb: holds gesture state, reports a rating, renders whatever it wraps.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, runOnJS,
} from 'react-native-reanimated';
import theme from '../../theme/themes';

// How far the card must travel to count as a decision. Short enough to
// be a flick, long enough that brushing the list sideways is not a vote.
const COMMIT = 70;
// Past this the card stops following the finger, so a long drag reads as
// committed rather than as a card being torn off the screen.
const MAX_PULL = 110;

/**
 * @param {node} children     the card being rated
 * @param {number|null} value current rating: 1, -1, or null
 * @param {Function} onRate   called with 1 or -1 when a swipe commits
 * @param {number} radius     match the wrapped card's corner radius so
 *   the reveal behind it doesn't square off the corners
 */
export default function SwipeToRate({ children, value, onRate, radius = 16 }) {
  const tx = useSharedValue(0);

  const commit = (v) => { if (onRate) onRate(v); };

  const gesture = Gesture.Pan()
    // Claim the touch only once it is clearly sideways, and drop it if it
    // turns vertical — otherwise this swallows the page scroll and taps
    // stop reaching the card underneath.
    .activeOffsetX([-12, 12])
    .failOffsetY([-18, 18])
    .onChange((e) => {
      const t = e.translationX;
      // Resist past the cap rather than stopping dead, which would feel
      // like the gesture had broken.
      tx.value = Math.abs(t) <= MAX_PULL
        ? t
        : Math.sign(t) * (MAX_PULL + (Math.abs(t) - MAX_PULL) * 0.15);
    })
    .onEnd(() => {
      if (tx.value <= -COMMIT) runOnJS(commit)(-1);
      else if (tx.value >= COMMIT) runOnJS(commit)(1);
      // Always returns home. The card is still live and still belongs in
      // the list, so it must not look like it was dismissed.
      tx.value = withSpring(0, { damping: 18, stiffness: 180 });
    });

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: tx.value }],
  }));

  // The verdicts sit behind the card and are uncovered by the drag, so
  // what you are about to say is legible before you let go.
  const weakStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, -tx.value / COMMIT)),
  }));
  const funStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, tx.value / COMMIT)),
  }));

  return (
    <View style={[styles.wrap, { borderRadius: radius }]}>
      <View style={[styles.behind, { borderRadius: radius }]}>
        <Animated.View style={[styles.side, styles.left, funStyle]}>
          <Text style={[styles.verdict, { color: theme.colors.vibeGreen }]}>FUN</Text>
        </Animated.View>
        <Animated.View style={[styles.side, styles.right, weakStyle]}>
          <Text style={[styles.verdict, { color: theme.colors.vibeRed }]}>WEAK</Text>
        </Animated.View>
      </View>

      <GestureDetector gesture={gesture}>
        <Animated.View style={cardStyle}>
          {children}
          {/* Stays after the card springs home, so the list remembers
              what you said. Without it a rating would vanish the moment
              you let go and feel like it hadn't registered. */}
          {value === 1 || value === -1 ? (
            <View
              style={[
                styles.stamp,
                value === 1 ? styles.stampFun : styles.stampWeak,
              ]}
            >
              <Text
                style={[
                  styles.stampText,
                  { color: value === 1 ? theme.colors.vibeGreen : theme.colors.vibeRed },
                ]}
              >
                {value === 1 ? 'FUN' : 'WEAK'}
              </Text>
            </View>
          ) : null}
        </Animated.View>
      </GestureDetector>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { overflow: 'hidden' },
  behind: {
    ...StyleSheet.absoluteFillObject,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  side: { paddingHorizontal: 22 },
  left: { alignItems: 'flex-start' },
  right: { alignItems: 'flex-end' },
  verdict: { fontSize: 18, fontWeight: 'bold', letterSpacing: 2 },

  stamp: {
    position: 'absolute',
    left: 10, bottom: 10,
    paddingHorizontal: 8, paddingVertical: 3,
    borderRadius: 6,
    borderWidth: 2,
    backgroundColor: 'rgba(0,0,0,0.45)',
  },
  stampFun: { borderColor: theme.colors.vibeGreen },
  stampWeak: { borderColor: theme.colors.vibeRed },
  stampText: { fontSize: 10, fontWeight: 'bold', letterSpacing: 1 },
});
