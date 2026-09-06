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
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

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
// Where the crown settles once it has been seen. Not as small as a
// reaction emoji - it is still the loudest thing on the card - but out
// of the middle, and low enough into the top edge to read as sitting ON
// the snapple rather than floating above it.
const CROWN_PERCH_SCALE = 0.42;
const CROWN_PERCH_INSET = 16;

const VoteAuraCard = React.memo(function VoteAuraCard({
  submission, voters, picker, onPress, isWinner, pointsEarned,
  // Inline playback — matches the picking/voting/warmup hand cards.
  // When isPlaying is true the thumbnail swaps to a mini-player;
  // playToken bumps to force a remount so re-taps replay.
  isPlaying, playToken = 0, onTogglePlay, onFullscreen,
  // Rendered straddling the BOTTOM EDGE OF THE VIDEO. It has to live
  // in here rather than as a sibling in the grid cell, because the
  // picker's name is drawn inside this component below the video -
  // anything positioned against the cell lands on top of that name.
  overlaySlot,
  // Max ring count across the whole grid — used to reserve a
  // consistent gap between the card and its picker name so every
  // card in the grid lines up regardless of individual vote count.
  maxRingCount = 0,
}) {
  const styles = useThemedStyles(makeStyles);
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

  // ...then gets out of the way. Big and centred is the right ANNOUNCEMENT
  // but the wrong resting state: it sits over the middle of the clip,
  // which is exactly what someone wants to watch again. So it holds the
  // pose for a beat and then perches on the top edge, small, where a
  // crown belongs anyway.
  const perch = useRef(new Animated.Value(0)).current;
  // The travel distance is half the card, which is only known once the
  // frame has laid out - hence measuring rather than guessing a number
  // that would be wrong on every screen size.
  const [frameH, setFrameH] = useState(0);

  useEffect(() => {
    if (!isWinner) return;
    crownScale.setValue(0);
    perch.setValue(0);
    Animated.sequence([
      Animated.spring(crownScale, {
        toValue: 1,
        delay: 250,
        useNativeDriver: true,
        friction: 4,
        tension: 120,
      }),
      Animated.delay(900),
      Animated.spring(perch, {
        toValue: 1,
        useNativeDriver: true,
        friction: 7,
        tension: 60,
      }),
    ]).start();
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
      <View
        style={styles.frameOuter}
        onLayout={(e) => setFrameH(e.nativeEvent.layout.height)}
      >
        <View style={styles.videoFrame}>
          <View style={styles.video}>
            {/* Thumbnail always renders underneath; the inline
                player overlays on top when playing so the video's
                first-frame gap doesn't flash black. */}
            {submission?.videoUrl ? (
              <SnappleThumbnailImg
                videoUrl={submission.videoUrl}
                thumbUrl={submission.gridThumbUrl}
              />
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
              pointerEvents="none"
              style={[
                styles.winnerBadge,
                {
                  transform: [
                    // Travel first, then scale: with scale applied
                    // first the translation would be scaled down too
                    // and the crown would stop short of the edge.
                    {
                      translateY: perch.interpolate({
                        inputRange: [0, 1],
                        // Half the frame, less enough to leave the
                        // crown straddling the top edge rather than
                        // clearing it entirely.
                        outputRange: [0, -(frameH / 2) + CROWN_PERCH_INSET],
                      }),
                    },
                    { scale: crownScale },
                    {
                      scale: perch.interpolate({
                        inputRange: [0, 1],
                        outputRange: [1, CROWN_PERCH_SCALE],
                      }),
                    },
                  ],
                },
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

        {overlaySlot ? (
          <View style={styles.overlaySlot} pointerEvents="box-none">
            {overlaySlot}
          </View>
        ) : null}
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

const makeStyles = (t) => ({
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
  // No border on the videoFrame — the vote-ring overlays draw
  // their own outward borders as votes stack, and the base card
  // reads fine on its own without a competing purple stroke.
  videoFrame: {
    width: '100%',
    aspectRatio: 9 / 16,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#141A33',
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
  // Covers the whole video. Reactions scatter across the clip now
  // rather than sitting in a strip at one edge, so the slot has to be
  // the full frame and position within it. box-none, so the wrapper
  // doesn't swallow taps meant for the card behind it while the
  // individual emoji stay tappable.
  overlaySlot: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 5,
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
  // Centred over the clip and unplated. Tucked in a corner at 24pt it
  // read as a status pip; winning a round is the loudest moment in the
  // game and deserves the middle of the card. pointerEvents none so it
  // never intercepts a tap meant for the video.
  winnerBadge: {
    ...StyleSheet.absoluteFillObject,
    alignItems: 'center',
    justifyContent: 'center',
    zIndex: 8,
  },
  winnerBadgeText: {
    fontSize: 84,
    // A drop shadow rather than a background plate - it holds up over
    // any frame without boxing the crown in.
    textShadowColor: 'rgba(0,0,0,0.65)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 8,
  },
  // Bottom-LEFT. It used to sit bottom-right, which is where the
  // add-reaction toggle now lives - the two stacked, and the gold
  // chip showing through behind the toggle read as a second button.
  // Nothing else is down here: the crown is top-left, expand top-right.
  pointsChip: {
    position: 'absolute',
    bottom: 6,
    left: 6,
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
