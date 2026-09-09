// SpinningCoin — the coin, flipping.
//
// For moments, not decoration: coins landing in the reward overlay, a
// purchase completing. A permanently spinning coin in the resource bar
// would be a distraction that costs battery to say nothing.
//
// No second asset needed, which is the point. Rotating a flat image on
// Y shows its BACK for half the turn, and the back of an image is the
// image mirrored - so the S would read backwards for 180 degrees of
// every spin. Counter-mirroring past the halfway point cancels that
// exactly, and the result is a coin whose two faces are identical,
// which is what most game coins are anyway.

import React, { useEffect, useRef } from 'react';
import { Animated, Easing, Image, View, StyleSheet } from 'react-native';
import { currencyFor } from '../../lib/currency';

/**
 * @param {number} size    box size in points
 * @param {number} spins   how many full turns to make
 * @param {number} duration ms for the whole animation
 * @param {boolean} loop   keep going; off by default, deliberately
 * @param {Function} onDone fired when a non-looping spin finishes
 */
export default function SpinningCoin({
  size = 64,
  spins = 2,
  duration = 900,
  loop = false,
  onDone,
  style,
}) {
  const coin = currencyFor('coins');
  const turn = useRef(new Animated.Value(0)).current;
  // Which half of the current turn we're in. Driven off the same value
  // so the flip of the mirror lands exactly on the edge-on frame, where
  // the coin is a sliver and the swap is invisible.
  const facing = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    turn.setValue(0);
    const run = Animated.timing(turn, {
      toValue: 1,
      duration,
      // Linear: a coin already in flight spins at a constant rate, and
      // easing makes it read as a card flip instead.
      easing: Easing.linear,
      useNativeDriver: true,
    });
    const anim = loop ? Animated.loop(run) : run;
    anim.start(({ finished }) => { if (finished && !loop) onDone?.(); });
    return () => anim.stop();
  }, [duration, loop, spins]);

  if (!coin) return null;

  const rotateY = turn.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', `${spins * 360}deg`],
  });

  // Flip the horizontal scale every half turn. Built as a step function
  // out of the same driver rather than a listener, so it stays on the
  // native thread with the rotation and cannot drift out of sync.
  const steps = spins * 2;
  const inputRange = [];
  const outputRange = [];
  for (let i = 0; i <= steps; i++) {
    const at = i / steps;
    inputRange.push(at, Math.min(1, at + 0.0001));
    outputRange.push(i % 2 === 0 ? 1 : -1, i % 2 === 0 ? -1 : 1);
  }
  const scaleX = turn.interpolate({
    inputRange: inputRange.slice(0, -1),
    outputRange: outputRange.slice(0, -1),
    extrapolate: 'clamp',
  });

  return (
    <View style={[{ width: size, height: size }, styles.box, style]} pointerEvents="none">
      <Animated.Image
        source={coin.source}
        resizeMode="contain"
        style={{
          width: size,
          height: size,
          transform: [
            // Perspective first, or the rotation is an orthographic
            // squash and the coin reads as a shrinking oval rather
            // than something turning in space.
            { perspective: 800 },
            { rotateY },
            { scaleX },
          ],
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: { alignItems: 'center', justifyContent: 'center' },
});
