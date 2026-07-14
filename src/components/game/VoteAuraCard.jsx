// Vote-aura card for the voting wait screen. Renders a snapple thumbnail
// wrapped in a segmented multi-color border — one stripe per voter, in
// each voter's assigned color. Chips below show voter names with matching
// colored borders. A one-shot pulse fires on each new vote so the energy
// ramps up as more people pile on.

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated, Easing, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SnappleThumbnailImg from '../ui/SnappleThumbnail';
import PreviewPlayer from './PreviewPlayer';
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
const VoteAuraCard = React.memo(function VoteAuraCard({
  submission, voters, picker, onPress, isWinner, pointsEarned,
  // Inline playback — matches the picking/voting/warmup hand cards.
  // When isPlaying is true the thumbnail swaps to a mini-player;
  // playToken bumps to force a remount so re-taps replay.
  isPlaying, playToken = 0, onTogglePlay, onFullscreen,
  // Max ring count across the whole grid — used to reserve a
  // consistent gap between the card and its picker name so every
  // card in the grid lines up regardless of individual vote count.
  maxRingCount = 0,
}) {
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
    <Pressable
      onPress={onTogglePlay || onPress}
      style={styles.wrap}
    >
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
            {/* Thumbnail always renders underneath; the inline
                player overlays on top when playing so the video's
                first-frame gap doesn't flash black. */}
            {submission?.videoUrl ? (
              <SnappleThumbnailImg videoUrl={submission.videoUrl} />
            ) : null}
            {submission?.videoUrl && isPlaying ? (
              <View style={StyleSheet.absoluteFill}>
                <PreviewPlayer
                  key={`aura-inline-${submission.uid || submission.snappleId || 'x'}-${playToken}`}
                  videoUrl={submission.videoUrl}
                  muted={!!submission.muted}
                  loop={false}
                />
              </View>
            ) : null}
          </View>

          {/* Fullscreen expand chip — nested Pressable so tapping it
              doesn't fire the card body's onTogglePlay. Absent
              onFullscreen = chip hidden. */}
          {onFullscreen ? (
            <Pressable
              style={styles.fullscreenBtn}
              onPress={onFullscreen}
              hitSlop={6}
            >
              <Ionicons name="expand" size={11} color="white" />
            </Pressable>
          ) : null}

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
            // Fixed gap based on the grid's max ring count so every
            // card in the row lines up. Uses the max across the whole
            // grid (passed by the parent), not this card's own count,
            // so 4-vote cards and 0-vote cards align to the same
            // horizontal line.
            { marginTop: 6 + maxRingCount * ringThickness },
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
  // No hard-coded width anymore — the wrap fills whatever cell the
  // parent grid provides. Callers control size + margin via the
  // outer cell so we can drop the same card into a small
  // 8-column wait grid OR a big 2-column scoring grid without
  // touching this file.
  wrap: {
    alignItems: 'center',
  },
  // Positioning parent for the nested rings — rings absolute-
  // position around it. Full width of the cell.
  frameOuter: {
    width: '100%',
    aspectRatio: 9 / 16,
    position: 'relative',
  },
  // Match HandCardThumbnail — surface fill + magenta accent border
  // in the base (unvoted) state. Ring overlays cover this border
  // once votes come in.
  videoFrame: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#141A33',
    borderWidth: 1.5,
    borderColor: theme.colors.vibePink,
  },
  video: {
    flex: 1,
  },
  // Pulse ring insets past every edge — no hard-coded height so it
  // scales with the card. Uses bottom:-8 instead of a fixed height.
  pulseRing: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    borderRadius: 16,
    borderWidth: 2,
  },
  pickerName: {
    fontSize: 11,
    // marginTop is set inline based on ring count — leaving base 0
    // here so the inline value takes precedence cleanly.
    textAlign: 'center',
    fontWeight: '600',
    width: '100%',
  },
  pickerNameMe: {
    fontWeight: 'bold',
  },
  // Small expand chip in the top-right — smaller than the hand-card
  // version because VoteAuraCard is only 100pt wide.
  fullscreenBtn: {
    position: 'absolute',
    top: 4,
    right: 4,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
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
