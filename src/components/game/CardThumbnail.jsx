// Hand-card video thumbnail used during the warmup/picking grids.
// Memoized so timer ticks in the parent don't re-mount the player and lose
// loaded frames. CardThumbnailDelayed is the same component but with an
// optional staggered mount so a grid of cards lights up sequentially.

import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ActivityIndicator } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useCachedVideoUri } from '../../services/videoCache';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

// Plays a paused first-frame thumbnail for a hand card. Uses the cached
// video URI when available so subsequent rounds reuse the local file.
export const CardThumbnail = React.memo(function CardThumbnail({ videoUrl }) {
  const styles = useThemedStyles(makeStyles);
  const cachedUri = useCachedVideoUri(videoUrl);
  const player = useVideoPlayer(cachedUri, (p) => {
    p.loop = false;
    p.muted = true;
    p.pause();
  });
  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      fullscreenOptions={{ enabled: false }}
      showsPlaybackControls={false}
      nativeControls={false}
    />
  );
});

// Wraps CardThumbnail with a delay-then-mount so 6+ cards in a grid don't
// all spin up their video players at the same instant. Shows a spinner
// while waiting.
export const CardThumbnailDelayed = React.memo(function CardThumbnailDelayed({ videoUrl, delay = 0 }) {
  const styles = useThemedStyles(makeStyles);
  const [mounted, setMounted] = useState(delay === 0);

  useEffect(() => {
    if (delay > 0) {
      const t = setTimeout(() => setMounted(true), delay);
      return () => clearTimeout(t);
    }
  }, []);

  if (!mounted) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.placeholder]}>
        <ActivityIndicator size="small" color={theme.colors.vibeBlue} />
      </View>
    );
  }

  return <CardThumbnail videoUrl={videoUrl} />;
});

const makeStyles = (t) => ({
  placeholder: {
    backgroundColor: 'rgba(0,198,255,0.05)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});
