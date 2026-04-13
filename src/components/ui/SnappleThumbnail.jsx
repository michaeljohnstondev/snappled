import React, { useState, useEffect } from 'react';
import { View, Image, StyleSheet, ActivityIndicator } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { thumbnailService } from '../../services/thumbnailService';
import theme from '../../theme/themes';

// Fallback: paused video player (used when thumbnail extraction unavailable)
function VideoFallback({ videoUrl }) {
  const player = useVideoPlayer(videoUrl, (p) => {
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
}

export default function SnappleThumbnail({ videoUrl, style }) {
  const [thumbnailUri, setThumbnailUri] = useState(null);
  const [loading, setLoading] = useState(true);
  const [useFallback, setUseFallback] = useState(!thumbnailService.isAvailable());

  useEffect(() => {
    if (useFallback || !videoUrl) {
      setLoading(false);
      return;
    }
    thumbnailService.getThumbnail(videoUrl)
      .then(uri => {
        if (uri) {
          setThumbnailUri(uri);
        } else {
          setUseFallback(true);
        }
        setLoading(false);
      })
      .catch(() => {
        setUseFallback(true);
        setLoading(false);
      });
  }, [videoUrl]);

  if (loading) {
    return (
      <View style={[styles.container, style]}>
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

  if (useFallback && videoUrl) {
    return <VideoFallback videoUrl={videoUrl} />;
  }

  return <View style={[styles.container, style]} />;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
});
