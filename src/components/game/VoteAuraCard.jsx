// Vote-aura card for the voting wait screen. Renders a snapple thumbnail
// wrapped in a segmented multi-color border — one stripe per voter, in
// each voter's assigned color. Chips below show voter names with matching
// colored borders. A one-shot pulse fires on each new vote so the energy
// ramps up as more people pile on.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import SnappleThumbnailImg from '../ui/SnappleThumbnail';
import theme from '../../theme/themes';

// voters: [{ uid, name, color, isMe }, ...] in vote-arrival order
// picker (optional): { name, color, isMe, opacity? } — when present,
//   renders the picker's name below the card. Pass an Animated.Value
//   as opacity to fade it in (e.g. when all-voted lands).
// isWinner (optional): when true, overlays a 👑 badge on the card.
//   Used by the SCORING phase to spotlight round-winning submissions
//   (placement === 1). Ties show a crown on each tied card.
// pointsEarned (optional): when set, shows a small "+N" chip on the
//   card. Used during SCORING to make each card's contribution legible
//   at a glance.
const VoteAuraCard = React.memo(function VoteAuraCard({ submission, voters, picker, onPress, isWinner, pointsEarned }) {
  const pulse = useRef(new Animated.Value(0)).current;
  const prevCountRef = useRef(voters?.length || 0);

  useEffect(() => {
    const current = voters?.length || 0;
    if (current > prevCountRef.current) {
      pulse.setValue(0);
      Animated.timing(pulse, {
        toValue: 1,
        duration: 700,
        useNativeDriver: true,
      }).start();
    }
    prevCountRef.current = current;
  }, [voters?.length]);

  const ringScale = pulse.interpolate({ inputRange: [0, 1], outputRange: [1, 1.35] });
  const ringOpacity = pulse.interpolate({ inputRange: [0, 0.15, 1], outputRange: [0, 0.9, 0] });

  const colors = (voters || []).map(v => v.color);
  const hasVoters = colors.length > 0;
  // Per-voter ring thickness. Kept thin so 4+ votes can stack
  // outward without swamping the neighbor cards' margins.
  const ringThickness = 2;
  const videoRadius = 10;

  // Crown pop-in on winners (SCORING phase). Starts hidden, springs to
  // full scale after a short delay so the reveal feels staged rather
  // than instant. One-shot per mount.
  const crownScale = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (!isWinner) return;
    crownScale.setValue(0);
    Animated.spring(crownScale, {
      toValue: 1,
      delay: 250,
      useNativeDriver: true,
      friction: 4,
      tension: 120,
    }).start();
  }, [isWinner]);

  // Points "+N" tick-up. Counts from 0 → pointsEarned over ~700ms so
  // the chip feels like a tally landing, not a static number. Skipped
  // when pointsEarned is 0/undefined (the chip won't render anyway).
  const [displayedPoints, setDisplayedPoints] = useState(0);
  useEffect(() => {
    if (typeof pointsEarned !== 'number' || pointsEarned <= 0) {
      setDisplayedPoints(0);
      return;
    }
    setDisplayedPoints(0);
    const driver = new Animated.Value(0);
    const sub = driver.addListener(({ value }) => {
      setDisplayedPoints(Math.round(value));
    });
    Animated.timing(driver, {
      toValue: pointsEarned,
      duration: 700,
      delay: 350,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => driver.removeListener(sub);
  }, [pointsEarned]);

  return (
    <Pressable onPress={onPress} style={styles.wrap}>
      {/* One-shot expanding pulse ring on each new vote. Uses the latest
          voter's color so the burst feels personal. */}
      {hasVoters && (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.pulseRing,
            {
              borderColor: colors[colors.length - 1],
              opacity: ringOpacity,
              transform: [{ scale: ringScale }],
            },
          ]}
        />
      )}

      {/* Nested vote rings + video. Each voter adds one solid border
          farther OUT than the last — first voter is the innermost
          ring (hugging the video), most-recent voter is the
          outermost. Rings sit as absolute siblings so the video's
          overflow: hidden doesn't clip them. */}
      <View style={styles.frameOuter}>
        <View style={styles.videoFrame}>
          <View style={styles.video}>
            {submission?.videoUrl ? <SnappleThumbnailImg videoUrl={submission.videoUrl} /> : null}
          </View>

          {/* Scoring-phase badges live INSIDE the videoFrame so the
              overflow: hidden clips them to the card's rounded
              corners. Rings live outside (below). */}
          {isWinner && (
            <Animated.View
              style={[
                styles.winnerBadge,
                { transform: [{ scale: crownScale }] },
              ]}
            >
              <Text style={styles.winnerBadgeText}>👑</Text>
            </Animated.View>
          )}
          {typeof pointsEarned === 'number' && pointsEarned > 0 && (
            <View style={styles.pointsChip}>
              <Text style={styles.pointsChipText}>+{displayedPoints}</Text>
            </View>
          )}
        </View>

        {colors.map((c, i) => {
          const inset = -(i + 1) * ringThickness;
          return (
            <View
              key={`ring-${i}`}
              pointerEvents="none"
              style={{
                position: 'absolute',
                top: inset,
                left: inset,
                right: inset,
                bottom: inset,
                borderWidth: ringThickness,
                borderColor: c,
                borderRadius: videoRadius + (i + 1) * ringThickness,
              }}
            />
          );
        })}
      </View>

      {picker && (
        <Animated.Text
          style={[
            styles.pickerName,
            { color: picker.color, opacity: picker.opacity ?? 1 },
            picker.isMe && styles.pickerNameMe,
          ]}
          numberOfLines={1}
        >
          {picker.name}
        </Animated.Text>
      )}
    </Pressable>
  );
});

export default VoteAuraCard;

const styles = StyleSheet.create({
  wrap: {
    width: 100,
    // Extra margin so the nested vote rings can extend outward
    // (up to ~4 rings * 2pt = 8pt on each side) without slamming
    // into the neighbor card.
    margin: 10,
    alignItems: 'center',
  },
  // Positioning parent for the nested rings — rings absolute-
  // position around it. Matches videoFrame's footprint.
  frameOuter: {
    width: 100,
    aspectRatio: 9 / 16,
    position: 'relative',
  },
  videoFrame: {
    width: 100,
    aspectRatio: 9 / 16,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
  },
  pulseRing: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    height: 178,
    borderRadius: 16,
    borderWidth: 2,
  },
  pickerName: {
    fontSize: 11,
    marginTop: 4,
    textAlign: 'center',
    fontWeight: '600',
    width: 100,
  },
  pickerNameMe: {
    fontWeight: 'bold',
  },
  winnerBadge: {
    position: 'absolute',
    top: 4,
    left: 4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  winnerBadgeText: {
    fontSize: 14,
  },
  pointsChip: {
    position: 'absolute',
    bottom: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.8)',
    borderWidth: 1,
    borderColor: '#FFD700',
  },
  pointsChipText: {
    color: '#FFD700',
    fontSize: 11,
    fontWeight: 'bold',
  },
});
