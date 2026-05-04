import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Pressable, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BasicCameraView from '../components/media/BasicCameraView';
import RecordingControls from '../components/media/RecordingControls';
import VibeButton from '../components/ui/VibeButton';
import theme from '../theme/themes';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function RecordScreen({ route }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [cameraRef, setCameraRef] = useState(null);
  const [facing, setFacing] = useState('back');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showPrompt, setShowPrompt] = useState(!!route.params?.prompt);
  const [cameraKey, setCameraKey] = useState(0); // Force camera remount
  
  const maxDuration = 10; // 10 second max for Snapples
  const { prompt } = route.params || {};
  const promptText = prompt?.text || "Free record — pick a prompt for your snapple after recording";

  // Auto-hide prompt after 5 seconds
  useEffect(() => {
    if (showPrompt) {
      const timer = setTimeout(() => {
        setShowPrompt(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showPrompt]);

  function handleOverlayTouch() {
    setShowPrompt(false); // Any touch on overlay dismisses prompt
  }

  function handleCameraReady(camera) {
    console.log('[RecordScreen] Camera ready');
    setCameraRef(camera);
    setCameraReady(true);
  }

  function handleCameraError(error) {
    console.error('[RecordScreen] Camera error:', error);
    Alert.alert('Camera Error', 'Failed to initialize camera. Please try again.');
  }

  function handleRecordingStart() {
    console.log('[RecordScreen] Recording started');
    setIsRecording(true);
    setRecordingTime(0);
    setShowPrompt(false); // Hide prompt when recording starts
    // Keep overlay visible during recording so stop button works
  }

  function handleRecordingStop(error) {
    console.log('[RecordScreen] Recording stopped', error ? 'with error:' : 'successfully');
    setIsRecording(false);
    if (error) {
      console.error('[RecordScreen] Recording error:', error);
    }
  }

  function handleRecordingComplete(video, finalTime) {
    console.log('[RecordScreen] Recording completed:', video, 'Time:', finalTime);
    console.log('[RecordScreen] Video URI:', video?.uri);
    setIsRecording(false);
    setRecordedVideo(video);
    setRecordingTime(finalTime || 0);
    
    // Navigate to preview screen immediately
    if (video && video.uri) {
      console.log('[RecordScreen] Navigating to VideoPreview...');
      navigation.navigate('VideoPreview', {
        recordedVideo: video,
        cameraFacing: facing,
        prompt,
      });
    } else {
      console.log('[RecordScreen] No video or URI to navigate with');
    }
  }

  function handleRecordingTimeUpdate(time) {
    setRecordingTime(time);
  }

  function handleContinueWithVideo(video) {
    // For now, just go back to home screen
    // TODO: Navigate to proper submission flow
    navigation.navigate('Home');
  }

  function handlePreviewVideo(video) {
    // Navigate to video preview screen
    navigation.navigate('VideoPreview', {
      recordedVideo: video,
      cameraFacing: facing,
      prompt,
    });
  }

  function toggleCamera() {
    setFacing(prev => prev === 'front' ? 'back' : 'front');
  }

  function handleClose() {
    if (isRecording) {
      Alert.alert(
        'Recording in Progress',
        'Are you sure you want to stop recording and go back?',
        [
          { text: 'Cancel', style: 'cancel' },
          { 
            text: 'Stop & Go Back', 
            style: 'destructive',
            onPress: () => navigation.goBack()
          }
        ]
      );
    } else {
      navigation.goBack();
    }
  }

  function handleCameraReset() {
    console.log('[RecordScreen] Resetting camera');
    setCameraRef(null);
    setCameraReady(false);
    setIsRecording(false);
    setRecordedVideo(null);
    setRecordingTime(0);
  }

  function handleRecordAgain() {
    console.log('[RecordScreen] Record again - resetting all states');
    // Reset all states to initial values - clean slate
    setIsRecording(false);
    setRecordedVideo(null); // This should hide the success overlay
    setRecordingTime(0);
    setShowPrompt(true); // Show prompt again
    
    // Force camera component to remount by changing its key
    setCameraKey(prev => prev + 1);
    setCameraReady(false);
    setCameraRef(null);
    
    console.log('[RecordScreen] States reset - camera will remount');
  }

  return (
    <View style={styles.container}>
      {/* Camera View - Full Screen */}
      <BasicCameraView
        key={cameraKey}
        onCameraReady={handleCameraReady}
        onError={handleCameraError}
        facing={facing}
        mode="video"
        style={styles.camera}
      />

        {/* Top Controls - removed, now on overlay */}

        {/* Recording Indicator */}
        {isRecording && (
          <View style={styles.recordingIndicator}>
            <View style={styles.recordingDot} />
            <Text style={styles.recordingText}>REC</Text>
          </View>
        )}

        {/* Success Overlay */}
        {recordedVideo && (
          <View style={styles.successOverlay}>
            <LinearGradient
              colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.6)']}
              style={styles.successContent}
            >
              <Text style={styles.successIcon}>✓</Text>
              <Text style={styles.successTitle}>Video Recorded!</Text>
              <Text style={styles.successSubtitle}>
                {recordingTime >= maxDuration 
                  ? "Maximum time reached" 
                  : "Recording complete"}
              </Text>
              
              <View style={styles.successButtons}>
                {recordingTime < maxDuration && (
                  <VibeButton
                    label="Record Again"
                    onPress={handleRecordAgain}
                    style={styles.recordMoreButton}
                  />
                )}
                <VibeButton
                  label="Preview Video"
                  onPress={() => handlePreviewVideo(recordedVideo)}
                  style={styles.previewButton}
                />
                <VibeButton
                  label="Go Home"
                  onPress={() => navigation.navigate('Home')}
                  style={styles.homeButton}
                />
              </View>
            </LinearGradient>
          </View>
        )}

      {/* Overlay with All Controls */}
      <Pressable style={styles.overlayContainer} onPress={handleOverlayTouch}>
        {/* Top Controls */}
        <View style={styles.topControls}>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <LinearGradient
              colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.5)']}
              style={styles.controlButton}
            >
              <Text style={styles.closeText}>✕</Text>
            </LinearGradient>
          </Pressable>

          <View style={styles.titleContainer}>
            {/* Spacer */}
          </View>

          <Pressable
            onPress={toggleCamera}
            style={[styles.controlButton, isRecording && styles.disabledButton]}
            disabled={isRecording}
          >
            <Ionicons name="camera-reverse" size={24} color={isRecording ? '#666' : 'white'} />
          </Pressable>
        </View>

        {/* Prompt Section - Only show when showPrompt is true */}
        {showPrompt && (
          <View style={styles.promptContainer}>
            <LinearGradient
              colors={['rgba(0,0,0,0.8)', 'rgba(0,0,0,0.6)']}
              style={styles.promptContent}
            >
              <Text style={styles.promptText}>{promptText}</Text>
            </LinearGradient>
          </View>
        )}

        {/* Record Controls - Always visible */}
        <View style={[styles.overlayControls, { bottom: 40 + insets.bottom }]}>
          <RecordingControls
            cameraRef={cameraRef}
            isRecording={isRecording}
            recordingTime={recordingTime}
            onRecordingStart={handleRecordingStart}
            onRecordingStop={handleRecordingStop}
            onRecordingComplete={handleRecordingComplete}
            onRecordingTimeUpdate={handleRecordingTimeUpdate}
            onCameraReset={handleCameraReset}
            maxDuration={10} // 10 second max for Snapples
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
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  topControls: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
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
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
  },
  disabledButton: {
    opacity: 0.5,
  },
  titleContainer: {
    alignItems: 'center',
    flex: 1,
    paddingHorizontal: 16,
  },
  screenTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
  },
  screenSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 2,
  },
  recordingIndicator: {
    position: 'absolute',
    top: 120,
    left: 20,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255,0,0,0.8)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    zIndex: 10,
  },
  recordingDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: 'white',
    marginRight: 6,
  },
  recordingText: {
    color: 'white',
    fontSize: 12,
    fontWeight: theme.fontWeights.bold,
  },
  successOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 20,
  },
  successContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  successTitle: {
    color: 'white',
    fontSize: 24,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  successSubtitle: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 32,
  },
  successButtons: {
    flexDirection: 'column',
    width: '100%',
  },
  recordMoreButton: {
    marginBottom: 12,
    backgroundColor: 'rgba(0, 255, 255, 0.08)',
  },
  previewButton: {
    backgroundColor: 'rgba(0, 255, 255, 0.08)',
  },
  homeButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    marginTop: 12,
  },
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 32,
    paddingBottom: 48,
    alignItems: 'center',
  },
  closeText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  flipText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
  },
  disabledText: {
    color: '#666',
  },
  successIcon: {
    color: theme.colors.vibeGreen,
    fontSize: 48,
    fontWeight: 'bold',
  },
  overlayContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 15,
    backgroundColor: 'transparent',
  },
  topControls: {
    position: 'absolute',
    top: 60,
    left: 20,
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  promptContainer: {
    position: 'absolute',
    top: '50%',
    left: 32,
    right: 32,
    transform: [{ translateY: -50 }],
    justifyContent: 'center',
    alignItems: 'center',
  },
  promptContent: {
    paddingHorizontal: 32,
    paddingVertical: 24,
    borderRadius: 16,
    alignItems: 'center',
    maxWidth: '100%',
  },
  promptText: {
    color: 'white',
    fontSize: 20,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
  },
  overlayControls: {
    position: 'absolute',
    left: 0,
    right: 0,
    paddingHorizontal: 32,
    paddingTop: 32,
    alignItems: 'center',
  },
});