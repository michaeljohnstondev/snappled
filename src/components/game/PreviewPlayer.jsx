// Looping video player used inside preview modals (tap-to-watch on hand,
// vote, and wait screens). Plays automatically and loops; muted is
// driven by the snapple's own setting.

import React, { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useCachedVideoUri, invalidateCachedVideo } from '../../services/videoCache';

// Renders an autoplay/looping VideoView. Source defers to the cached URI
// once a download has resolved so previews open instantly on repeat views.
// On playback error (corrupt cache / bad source) the cache entry is
// dropped so a re-open pulls fresh from the remote URL — fixes the
// "black rectangle that never plays" case.
export default function PreviewPlayer({ videoUrl, muted = false, loop = true }) {
  const cachedUri = useCachedVideoUri(videoUrl);
  const player = useVideoPlayer(cachedUri, (p) => {
    p.loop = loop;
    p.muted = muted;
    p.play();
  });

  useEffect(() => {
    if (!player) return;
    const sub = player.addListener?.('statusChange', (event) => {
      if (event?.status === 'error' && videoUrl) {
        console.warn('[PreviewPlayer] playback error — invalidating cache', {
          url: videoUrl,
          error: event?.error?.message,
        });
        invalidateCachedVideo(videoUrl);
      }
    });
    return () => { try { sub?.remove?.(); } catch (e) {} };
  }, [player, videoUrl]);

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
