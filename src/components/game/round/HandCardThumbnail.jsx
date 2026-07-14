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
  onPress,
  label,
  duration,
}) {
  const username = label || `@${card?.creatorUsername || 'anon'}`;
  return (
    <View style={[styles.glowWrap, isSelected && styles.glowWrapFeatured]}>
      <Pressable
        style={[styles.card, isSelected && styles.cardFeatured]}
        onPress={onPress}
      >
        <View style={styles.videoWrap}>
          {card?.videoUrl ? (
            <SnappleThumbnailImg videoUrl={card.videoUrl} />
          ) : (
            <View style={styles.placeholder} />
          )}
        </View>

        {duration ? (
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>{duration}</Text>
          </View>
        ) : null}

        <View style={styles.footer}>
          <View style={styles.playBtn}>
            <Ionicons name="play" size={12} color="white" />
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
