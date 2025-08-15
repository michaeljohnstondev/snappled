import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Pressable, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import BasicCameraView from '../../components/media/BasicCameraView';
import RecordingControls from '../../components/media/RecordingControls';
import VibeButton from '../../components/ui/VibeButton';
import theme from '../../theme/themes';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function RecordScreen() {
  const navigation = useNavigation();
  const [cameraRef, setCameraRef] = useState(null);
  const [facing, setFacing] = useState('front');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);

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
  }

  function handleRecordingStop(error) {
    console.log('[RecordScreen] Recording stopped', error ? 'with error:' : 'successfully');
    setIsRecording(false);
    if (error) {
      console.error('[RecordScreen] Recording error:', error);
    }
  }

  function handleRecordingComplete(video) {
    console.log('[RecordScreen] Recording completed:', video);
    setIsRecording(false);
    setRecordedVideo(video);
    
    // Show success message and navigation options
    Alert.alert(
      'Video Recorded! 🎬',
      'Your Snapple video is ready!',
      [
        { 
          text: 'Record Another', 
          style: 'cancel',
          onPress: () => setRecordedVideo(null)
        },
        { 
          text: 'Continue', 
          onPress: () => handleContinueWithVideo(video)
        }
      ]
    );
  }

  function handleContinueWithVideo(video) {
    // Navigate to prompt screen or submission flow with the recorded video
    navigation.navigate('Prompt', { recordedVideo: video });
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
  }

  return (
    <View style={styles.container}>
      {/* Camera View */}
      <View style={styles.cameraContainer}>
        <BasicCameraView
          onCameraReady={handleCameraReady}
          onError={handleCameraError}
          facing={facing}
          mode="video"
          style={styles.camera}
        />

        {/* Top Controls */}
        <View style={styles.topControls}>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <LinearGradient
              colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.5)']}
              style={styles.controlButton}
            >
              <Ionicons name="close" size={24} color="white" />
            </LinearGradient>
          </Pressable>

          <View style={styles.titleContainer}>
            <Text style={styles.screenTitle}>Record Snapple</Text>
            <Text style={styles.screenSubtitle}>Create your video response</Text>
          </View>

          <Pressable 
            onPress={toggleCamera} 
            style={styles.flipButton}
            disabled={isRecording}
          >
            <LinearGradient
              colors={['rgba(0,0,0,0.7)', 'rgba(0,0,0,0.5)']}
              style={[styles.controlButton, isRecording && styles.disabledButton]}
            >
              <Ionicons name="camera-reverse" size={24} color={isRecording ? '#666' : 'white'} />
            </LinearGradient>
          </Pressable>
        </View>

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
              <Ionicons name="checkmark-circle" size={64} color={theme.colors.vibeGreen} />
              <Text style={styles.successTitle}>Video Recorded!</Text>
              <Text style={styles.successSubtitle}>Ready to continue with your Snapple</Text>
              
              <View style={styles.successButtons}>
                <VibeButton
                  label="Record Another"
                  onPress={() => setRecordedVideo(null)}
                  style={styles.recordAnotherButton}
                />
                <VibeButton
                  label="Continue"
                  onPress={() => handleContinueWithVideo(recordedVideo)}
                  style={styles.continueButton}
                />
              </View>
            </LinearGradient>
          </View>
        )}
      </View>

      {/* Bottom Controls */}
      <View style={styles.bottomControls}>
        <RecordingControls
          cameraRef={cameraRef}
          onRecordingStart={handleRecordingStart}
          onRecordingStop={handleRecordingStop}
          onRecordingComplete={handleRecordingComplete}
          onCameraReset={handleCameraReset}
          maxDuration={10} // 10 second max for Snapples
        />
        
        {!cameraReady && (
          <Text style={styles.cameraStatus}>Initializing camera...</Text>
        )}
      </View>

      {/* Tips */}
      {!isRecording && !recordedVideo && cameraReady && (
        <View style={styles.tipsContainer}>
          <Text style={styles.tipsTitle}>📱 Recording Tips</Text>
          <Text style={styles.tipsText}>• Keep it short and fun (max 10s)</Text>
          <Text style={styles.tipsText}>• Make sure you're well lit</Text>
          <Text style={styles.tipsText}>• Speak clearly for audio</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
  cameraContainer: {
    flex: 1,
    position: 'relative',
  },
  camera: {
    flex: 1,
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
  flipButton: {
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
    ...theme.shadows?.textGlow,
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
    flexDirection: 'row',
    gap: 16,
    width: '100%',
  },
  recordAnotherButton: {
    flex: 1,
    opacity: 0.8,
  },
  continueButton: {
    flex: 1,
  },
  bottomControls: {
    padding: 32,
    paddingBottom: 48,
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.8)',
  },
  cameraStatus: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
  tipsContainer: {
    position: 'absolute',
    bottom: 200,
    left: 20,
    right: 20,
    backgroundColor: 'rgba(0,0,0,0.7)',
    padding: 16,
    borderRadius: 12,
    zIndex: 5,
  },
  tipsTitle: {
    color: 'white',
    fontSize: 14,
    fontWeight: theme.fontWeights.semiBold,
    marginBottom: 8,
  },
  tipsText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    marginBottom: 4,
  },
});