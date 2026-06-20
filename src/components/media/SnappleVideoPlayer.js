// SnappleVideoPlayer.js
// Auto-looping VideoView used wherever a snapple plays at full size
// (overlay, profile, deck preview). Reads its source through the
// shared video cache so repeat opens are instant.
//
// muted resolution: caller can pass an explicit `muted` prop to drive
// the speaker live (e.g. SnappleOverlay's optimistic toggle). When
// omitted we fall back to snapple.muted so existing call sites keep
// working unchanged.

import React, { useImperativeHandle, forwardRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useCachedVideoUri } from '../../services/videoCache';

const SnappleVideoPlayer = forwardRef(({ snapple, style, muted }, ref) => {
  // Explicit `muted` prop wins; otherwise fall back to the snapple's
  // own field so legacy callers that don't pass `muted` still respect
  // the creator's mute setting.
  const resolvedMuted = muted !== undefined ? !!muted : !!snapple?.muted;
  const cachedUri = useCachedVideoUri(snapple?.videoUrl || null);
  const player = useVideoPlayer(cachedUri, (player) => {
    player.loop = true;
    player.muted = resolvedMuted;
    player.play();
  });

  // Sync runtime mute changes onto the player. The useVideoPlayer init
  // callback only fires when the source URI changes, so without this
  // a toggle on a mounted player would do nothing audible.
  useEffect(() => {
    if (player) player.muted = resolvedMuted;
  }, [player, resolvedMuted]);

  useImperativeHandle(ref, () => ({
    play: () => player.play(),
    pause: () => player.pause(),
    get playing() {
      return player.playing;
    },
  }));

  if (!snapple?.videoUrl) {
    return <View style={[styles.container, style, styles.placeholder]} />;
  }

  return (
    <View style={[styles.container, style]}>
      <VideoView
        player={player}
        style={styles.video}
        contentFit="cover"
        fullscreenOptions={{ enabled: false }}
        allowsPictureInPicture={false}
        showsPlaybackControls={false}
        nativeControls={false}
      />
    </View>
  );
});

SnappleVideoPlayer.displayName = 'SnappleVideoPlayer';
export default SnappleVideoPlayer;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  video: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  placeholder: {
    justifyContent: 'center',
    alignItems: 'center',
  },
});
