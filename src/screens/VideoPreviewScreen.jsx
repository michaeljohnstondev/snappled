import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, SafeAreaView, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import VibeButton from '../components/ui/VibeButton';
import theme from '../theme/themes';

export default function VideoPreviewScreen({ route, navigation }) {
  const { recordedVideo } = route.params || {};
  const [isPlaying, setIsPlaying] = useState(true);
  
  const player = useVideoPlayer(recordedVideo?.uri || null, (player) => {
    player.loop = true;
    player.muted = false;
  });

  const handleScreenTap = () => {
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  };

  const handleClose = () => {
    navigation.goBack();
  };

  const handleSubmit = () => {
    // TODO: Navigate to submission flow
    navigation.navigate('Home');
  };

  const handleRetake = () => {
    // Go back to record screen
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      {/* Full Screen Video Player */}
      {recordedVideo?.uri ? (
        <View style={styles.videoContainer}>
          <VideoView
            player={player}
            style={styles.video}
            contentFit="cover"
            allowsFullscreen={false}
            allowsPictureInPicture={false}
            showsPlaybackControls={false}
            nativeControls={false}
          />
        </View>
      ) : (
        <View style={styles.errorContainer}>
          <Ionicons name="videocam-off" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.errorText}>No video to preview</Text>
        </View>
      )}

      {/* Transparent Overlay for Controls */}
      <Pressable style={styles.overlay} onPress={handleScreenTap}>
        {/* Close Button */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <LinearGradient
              colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.5)']}
              style={styles.controlButton}
            >
              <Text style={styles.closeText}>✕</Text>
            </LinearGradient>
          </Pressable>
        </View>

        {/* Play Button - Only show when paused */}
        {!isPlaying && (
          <View style={styles.playButton}>
            <LinearGradient
              colors={['rgba(0,0,0,0.6)', 'rgba(0,0,0,0.4)']}
              style={styles.playButtonGradient}
            >
              <Text style={styles.playText}>▶</Text>
            </LinearGradient>
          </View>
        )}

        {/* Bottom Controls */}
        <View style={styles.controls}>
          <VibeButton
            label="Retake"
            onPress={handleRetake}
            style={styles.retakeButton}
          />
          <VibeButton
            label="Submit Snapple"
            onPress={handleSubmit}
            style={styles.submitButton}
          />
        </View>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  videoContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
  },
  video: {
    width: '100%',
    height: '100%',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#000',
  },
  errorText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
  },
  header: {
    position: 'absolute',
    top: 60,
    left: 20,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  closeButton: {
    width: 44,
    height: 44,
  },
  controlButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -40,
    marginLeft: -40,
  },
  playButtonGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  controls: {
    position: 'absolute',
    bottom: 48,
    left: 20,
    right: 20,
    flexDirection: 'row',
    gap: 16,
  },
  retakeButton: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
  },
  submitButton: {
    flex: 1,
    backgroundColor: 'rgba(0, 255, 255, 0.08)',
    borderColor: theme.colors.vibeBlue,
  },
  closeText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  playText: {
    color: 'white',
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginLeft: 2, // Slight offset to visually center triangle
  },
});