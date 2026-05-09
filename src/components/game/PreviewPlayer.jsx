// Looping video player used inside preview modals (tap-to-watch on hand,
// vote, and wait screens). Plays automatically and loops; muted is
// driven by the snapple's own setting.

import React from 'react';
import { StyleSheet } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useCachedVideoUri } from '../../services/videoCache';

// Renders an autoplay/looping VideoView. Source defers to the cached URI
// once a download has resolved so previews open instantly on repeat views.
export default function PreviewPlayer({ videoUrl, muted = false }) {
  const cachedUri = useCachedVideoUri(videoUrl);
  const player = useVideoPlayer(cachedUri, (p) => {
    p.loop = true;
    p.muted = muted;
    p.play();
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
