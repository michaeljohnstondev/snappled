import React, { useImperativeHandle, forwardRef } from 'react';
import { View, StyleSheet } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';

const SnappleVideoPlayer = forwardRef(({ snapple, style }, ref) => {
  const player = useVideoPlayer(snapple?.videoUrl || null, (player) => {
    player.loop = true;
    player.muted = !!snapple?.muted;
    player.play();
  });

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
