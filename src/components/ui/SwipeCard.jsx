// SwipeCard.jsx — a card you throw left or right.
//
// The gesture, the tilt, and the two stamp badges were written once for
// the admin prompt curator and are now needed again for community
// prompt sorting. Rather than keep two copies that drift apart, the
// mechanics live here and the caller supplies the content and what the
// two directions MEAN — delete/keep for an admin, weak/good for a
// player.
//
// Dumb on purpose: it holds gesture state and nothing else. No network,
// no knowledge of prompts.

import React from 'react';
import { View, Text, Pressable, StyleSheet, Dimensions } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';
import theme from '../../theme/themes';

const { width: screenWidth } = Dimensions.get('window');
const SWIPE_THRESHOLD = screenWidth * 0.3;
const SWIPE_OFF_SCREEN = screenWidth * 1.2;

/**
 * @param {node} children      what the card shows
 * @param {Function} onSwipeLeft, onSwipeRight  fired AFTER the card
 *   finishes flying off, so the deck advances on a card that has
 *   already left rather than one that visibly pops
 * @param {Function} onTap     optional
 * @param {string} leftLabel, rightLabel  stamp text; omit to hide
 * @param {string} leftColor, rightColor
 * @param {string} borderColor
 */
export default function SwipeCard({
  children, onSwipeLeft, onSwipeRight, onTap,
  leftLabel = 'NOPE', rightLabel = 'YES',
  leftColor = theme.colors.vibeRed,
  rightColor = theme.colors.vibeGreen,
  borderColor = theme.colors.vibeBlue,
}) {
  const tx = useSharedValue(0);

  // Reanimated 4 dropped useAnimatedGestureHandler — this is the newer
  // gesture-handler API. Pan runs on the UI thread; the shared value
  // updates each frame and the end callback hops back to JS via runOnJS.
  const gesture = Gesture.Pan()
    // Only claim the touch once it is clearly sideways, and give it up
    // entirely if it turns vertical. Without this a card living inside a
    // scrolling page swallows the scroll: every attempt to move down the
    // screen would start dragging the card instead.
    .activeOffsetX([-12, 12])
    .failOffsetY([-18, 18])
    .onChange((e) => { tx.value = e.translationX; })
    .onEnd(() => {
      if (tx.value < -SWIPE_THRESHOLD) {
        tx.value = withTiming(-SWIPE_OFF_SCREEN, { duration: 200 }, (done) => {
          if (done && onSwipeLeft) runOnJS(onSwipeLeft)();
        });
      } else if (tx.value > SWIPE_THRESHOLD) {
        tx.value = withTiming(SWIPE_OFF_SCREEN, { duration: 200 }, (done) => {
          if (done && onSwipeRight) runOnJS(onSwipeRight)();
        });
      } else {
        tx.value = withSpring(0);
      }
    });

  // Tilts as it travels — purely feedback. ~15deg at the threshold,
  // capped at 25 so a long drag doesn't spin the card over.
  const cardStyle = useAnimatedStyle(() => {
    const rotate = (tx.value / screenWidth) * 25;
    return {
      transform: [
        { translateX: tx.value },
        { rotate: `${Math.max(-25, Math.min(25, rotate))}deg` },
      ],
    };
  });

  // Badges fade in with the pull, so the choice is visible before the
  // finger lifts and can still be taken back by dragging home.
  const leftBadge = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, -tx.value / SWIPE_THRESHOLD)),
  }));
  const rightBadge = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, tx.value / SWIPE_THRESHOLD)),
  }));

  return (
    <GestureDetector gesture={gesture}>
      <Animated.View style={[styles.card, { borderColor }, cardStyle]}>
        {!!leftLabel && (
          <Animated.View style={[styles.badge, styles.badgeLeft, { borderColor: leftColor }, leftBadge]}>
            <Text style={[styles.badgeText, { color: leftColor }]}>{leftLabel}</Text>
          </Animated.View>
        )}
        {!!rightLabel && (
          <Animated.View style={[styles.badge, styles.badgeRight, { borderColor: rightColor }, rightBadge]}>
            <Text style={[styles.badgeText, { color: rightColor }]}>{rightLabel}</Text>
          </Animated.View>
        )}

        {onTap
          ? <Pressable style={styles.inner} onPress={onTap}>{children}</Pressable>
          : <View style={styles.inner}>{children}</View>}
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  card: {
    width: screenWidth - 32,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 18,
    borderWidth: 3,
    padding: 24,
    minHeight: 320,
  },
  inner: { flex: 1, justifyContent: 'center', alignItems: 'center' },

  // Stamps sit in the top corners on the side they belong to, angled
  // like the rubber-stamp look the pattern is known for.
  badge: {
    position: 'absolute',
    top: 18,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 3,
    zIndex: 2,
  },
  badgeLeft: { right: 18, transform: [{ rotate: '12deg' }] },
  badgeRight: { left: 18, transform: [{ rotate: '-12deg' }] },
  badgeText: { fontSize: 16, fontWeight: 'bold', letterSpacing: 1 },
});
