// Aura-decorated card for the post-vote wait screen. Sustained ring
// thickens / brightens with vote count, and an outward pulse ring fires
// whenever a new vote lands. Pure vibe — no number visible.

import React, { useState, useEffect, useRef } from 'react';
import { View, Pressable, Animated, StyleSheet } from 'react-native';
import SnappleThumbnailImg from '../ui/SnappleThumbnail';
import theme from '../../theme/themes';

// Displays a snapple thumbnail wrapped in two rings: a sustained border
// whose color/width scales with voteCount (caps at 4 votes for max
// intensity), and a one-shot outward pulse ring that fires whenever
// voteCount increments.
const VoteAuraCard = React.memo(function VoteAuraCard({ submission, voteCount, onPress }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const prevCountRef = useRef(voteCount);

  useEffect(() => {
    if (voteCount > prevCountRef.current) {
      pulse.setValue(0);
      Animated.timing(pulse, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }).start();
    }
    prevCountRef.current = voteCount;
  }, [voteCount]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.45] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 1, 0] });

  const intensity = Math.min(voteCount, 4) / 4;
  const sustainedBorderColor = `rgba(0, 198, 255, ${0.2 + intensity * 0.7})`;
  const sustainedBorderWidth = 1 + intensity * 3;

  return (
    <Pressable onPress={onPress} style={styles.wrap}>
      <Animated.View
        pointerEvents="none"
        style={[
          styles.pulseRing,
          { opacity: ringOpacity, transform: [{ scale: ringScale }] },
        ]}
      />
      <View
        style={[
          styles.inner,
          { borderColor: sustainedBorderColor, borderWidth: sustainedBorderWidth },
        ]}
      >
        {submission?.videoUrl ? <SnappleThumbnailImg videoUrl={submission.videoUrl} /> : null}
      </View>
    </Pressable>
  );
});

export default VoteAuraCard;

const styles = StyleSheet.create({
  wrap: {
    width: 80,
    height: 110,
    margin: 4,
  },
  inner: {
    flex: 1,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pulseRing: {
    position: 'absolute',
    top: -6,
    left: -6,
    right: -6,
    bottom: -6,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
  },
});
