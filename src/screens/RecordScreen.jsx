import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Pressable, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useFocusEffect } from '@react-navigation/native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BasicCameraView from '../components/media/BasicCameraView';
import RecordingControls from '../components/media/RecordingControls';
import theme from '../theme/themes';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function RecordScreen({ route }) {
  const navigation = useNavigation();
  const insets = useSafeAreaInsets();
  const [cameraRef, setCameraRef] = useState(null);
  const [facing, setFacing] = useState('back');
  const [isRecording, setIsRecording] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [showPrompt, setShowPrompt] = useState(!!route.params?.prompt);
  const [cameraKey, setCameraKey] = useState(0); // Force camera remount
  
  const maxDuration = 10; // 10 second max for Snapples
  const { prompt } = route.params || {};
  const promptText = prompt?.text || '';

  // Auto-hide the prompt banner after 5s (only visible if a prompt was passed).
  useEffect(() => {
    if (showPrompt) {
      const timer = setTimeout(() => {
        setShowPrompt(false);
      }, 5000);
      return () => clearTimeout(timer);
    }
  }, [showPrompt]);

  // Reset to a clean camera-ready state whenever this screen gains focus
  // (e.g. user hits Retake on VideoPreview and navigates back). Without
  // this the previous recording's success overlay stays mounted and the
  // user has to dismiss it before they can record again.
  useFocusEffect(
    React.useCallback(() => {
      setIsRecording(false);
      setRecordingTime(0);
      setShowPrompt(!!route.params?.prompt);
      setCameraKey(prev => prev + 1);
      setCameraReady(false);
      setCameraRef(null);
    }, [route.params?.prompt])
  );

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
    setIsRecording(false);
    setRecordingTime(finalTime || 0);
    if (video?.uri) {
      navigation.navigate('VideoPreview', {
        recordedVideo: video,
        cameraFacing: facing,
        prompt,
      });
    } else {
      Alert.alert('Recording Failed', 'No video file was produced. Try again.');
    }
  }

  function handleRecordingTimeUpdate(time) {
    setRecordingTime(time);
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
    setCameraRef(null);
    setCameraReady(false);
    setIsRecording(false);
    setRecordingTime(0);
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
        <View style={[styles.overlayControls, { paddingBottom: Math.max(insets.bottom, 24) + 24 }]}>
          <RecordingControls
            cameraRef={cameraRef}
            isRecording={isRecording}
            recordingTime={recordingTime}
            onRecordingStart={handleRecordingStart}
            onRecordingStop={handleRecordingStop}
            onRecordingComplete={handleRecordingComplete}
            onRecordingTimeUpdate={handleRecordingTimeUpdate}
            onCameraReset={handleCameraReset}
            maxDuration={10}
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
  closeText: {
    color: 'white',
    fontSize: 18,
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
    bottom: 0,
    paddingHorizontal: 32,
    paddingTop: 32,
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
});