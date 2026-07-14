// HandCardThumbnail — one card in the picking/voting grid. 4:5
// aspect thumbnail with a round play button + @username in the
// bottom-left and an optional duration badge in the top-right.
// Selection state renders as a cyan ring overlay so the card's
// footprint stays constant.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SnappleThumbnailImg from '../../ui/SnappleThumbnail';
import theme from '../../../theme/themes';

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
    <Pressable style={styles.card} onPress={onPress}>
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

      {isSelected && <View style={styles.selectionRing} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    flex: 1,
    aspectRatio: 4 / 5,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#0a1428',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  videoWrap: { flex: 1 },
  placeholder: {
    flex: 1,
    backgroundColor: '#0a1428',
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
  selectionRing: {
    ...StyleSheet.absoluteFillObject,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: theme.colors.vibeGreen,
  },
});
