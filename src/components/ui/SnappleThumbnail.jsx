// SnappleThumbnail.jsx
// Renders a static thumbnail image for a snapple's video. Calls into
// thumbnailService (which caches + caps concurrency) so a grid of N
// items doesn't fan out N native extractions or — worse — N full
// video sessions. If extraction is unavailable or fails, falls back
// to a lightweight play-icon placeholder rather than loading the
// actual video (the prior fallback opened a VideoView per item, which
// kneecapped the profile screen at 10+ snapples).

import React, { useState, useEffect } from 'react';
import { View, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { thumbnailService } from '../../services/thumbnailService';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

// Resolves and renders a thumbnail for a single videoUrl. Loading
// state shows a spinner; error/unavailable shows a placeholder icon.
export default function SnappleThumbnail({ videoUrl, style }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [thumbnailUri, setThumbnailUri] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    if (!videoUrl) {
      setLoading(false);
      return;
    }
    // Queues behind the concurrency cap in thumbnailService — safe to
    // call from many mounted thumbnails at once.
    thumbnailService.getThumbnail(videoUrl)
      .then((uri) => {
        if (cancelled) return;
        setThumbnailUri(uri || null);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [videoUrl]);

  if (loading) {
    return (
      <View style={[styles.placeholder, style]}>
        <ActivityIndicator size="small" color={theme.colors.vibeBlue} />
      </View>
    );
  }

  if (thumbnailUri) {
    return (
      <Image
        source={{ uri: thumbnailUri }}
        style={[StyleSheet.absoluteFill, style]}
        resizeMode="cover"
      />
    );
  }

  // Extraction unavailable or failed — show a static play-icon tile.
  // Never load the actual video here: doing so opens a native video
  // session per item, which is what was tanking the profile screen.
  return (
    <View style={[styles.placeholder, style]}>
      <Ionicons name="play-circle" size={32} color="rgba(255,255,255,0.5)" />
    </View>
  );
}

const makeStyles = (t) => ({
  placeholder: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
});
