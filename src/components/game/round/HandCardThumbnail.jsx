// HandCardThumbnail — one card in the picking/voting grid. 4:5
// aspect thumbnail with a round play button + @username in the
// bottom-left and an optional duration badge in the top-right.
// Selection state renders as a cyan ring overlay so the card's
// footprint stays constant.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import SnappleThumbnailImg from '../../ui/SnappleThumbnail';
import PreviewPlayer from '../PreviewPlayer';
import theme from '../../../theme/themes';

// Base palette for the card chrome. surface = card fill, line =
// subtle stroke, glow = selected-state accent (green = "picked").
const COLORS = {
  surface: '#141A33',
  line: '#263054',
  glow: theme.colors.vibeGreen,
};

// Render one card. `card` must have `videoUrl` + `creatorUsername`
// (falls back to a friendly placeholder). `label` overrides the
// username line entirely — used for "YOUR CARD" (renders "@you")
// without needing a real user object.
export default function HandCardThumbnail({
  card,
  isSelected,
  isPlaying,
  // Incremented on every tap by the parent — used as a React key on
  // the inline PreviewPlayer so tapping the same card again forces
  // a fresh mount and replays the video from the start.
  playToken = 0,
  onTogglePlay,
  onFullscreen,
  label,
  duration,
}) {
  const username = label || `@${card?.creatorUsername || 'anon'}`;
  return (
    <View style={[styles.glowWrap, isSelected && styles.glowWrapFeatured]}>
      {/* Card body tap = pause/play the inline mini-player. The
          fullscreen button below opens the full modal preview
          (which also selects the card). */}
      <Pressable
        style={[styles.card, isSelected && styles.cardFeatured]}
        onPress={onTogglePlay}
      >
        <View style={styles.videoWrap}>
          {/* Always render the static thumbnail underneath. When
              isPlaying flips on, PreviewPlayer overlays on top —
              the video's first-frame gap used to flash black; with
              the thumbnail underneath it holds the still until the
              video paints. */}
          {card?.videoUrl ? (
            <SnappleThumbnailImg videoUrl={card.videoUrl} />
          ) : (
            <View style={styles.placeholder} />
          )}
          {card?.videoUrl && isPlaying ? (
            <View style={StyleSheet.absoluteFill}>
              <PreviewPlayer
                key={`inline-${card.id || card.snappleId || 'x'}-${playToken}`}
                videoUrl={card.videoUrl}
                muted={!!card.muted}
                loop={false}
              />
            </View>
          ) : null}
        </View>

        {duration ? (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{duration}</Text>
          </View>
        ) : null}

        {/* Fullscreen expand chip — nested Pressable so it doesn't
            trigger the card body's play/pause. Absent onFullscreen
            = chip hidden (component still usable for read-only
            grids that don't want a modal). */}
        {onFullscreen ? (
          <Pressable
            style={styles.fullscreenBtn}
            onPress={onFullscreen}
            hitSlop={6}
          >
            <Ionicons name="expand" size={13} color="white" />
          </Pressable>
        ) : null}

        <View style={styles.footer}>
          <View style={styles.playBtn}>
            <Ionicons
              name={isPlaying ? 'pause' : 'play'}
              size={12}
              color="white"
            />
          </View>
          <Text style={styles.username} numberOfLines={1}>{username}</Text>
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  // Outer wrapper carries the drop-shadow on iOS / elevation on
  // Android. Needs an opaque background for iOS to render the
  // shadow at all.
  glowWrap: {
    borderRadius: 20,
    backgroundColor: COLORS.surface,
  },
  glowWrapFeatured: {
    shadowColor: COLORS.glow,
    shadowOpacity: 0.55,
    shadowRadius: 14,
    shadowOffset: { width: 0, height: 0 },
    elevation: 12,
  },
  // Optional bloom that softens the glow beyond the card border on
  // devices that don't render colored elevation shadows well.
  glowGradient: {
    position: 'absolute',
    top: -8,
    left: -8,
    right: -8,
    bottom: -8,
    borderRadius: 28,
  },
  card: {
    borderRadius: 20,
    overflow: 'hidden',
    borderWidth: 1.5,
    borderColor: COLORS.line,
    aspectRatio: 4 / 5,
    backgroundColor: '#0A0E1F',
  },
  cardFeatured: {
    borderWidth: 2,
    borderColor: COLORS.glow,
  },
  videoWrap: { flex: 1 },
  placeholder: {
    flex: 1,
    backgroundColor: '#0A0E1F',
  },
  durationBadge: {
    position: 'absolute',
    top: 8,
    right: 8,
    paddingVertical: 3,
    paddingHorizontal: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.75)',
  },
  // Fullscreen expand chip — top-right corner. Same dark chip
  // background as durationBadge so the two feel like the same
  // family of overlay controls.
  fullscreenBtn: {
    position: 'absolute',
    top: 8,
    right: 8,
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: 'rgba(0,0,0,0.65)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  durationText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  footer: {
    position: 'absolute',
    left: 8,
    bottom: 8,
    right: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  playBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.65)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingLeft: 2,
  },
  username: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
    flexShrink: 1,
    textShadowColor: 'rgba(0,0,0,0.9)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
