import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Alert, Pressable, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import BasicCameraView from '../components/media/BasicCameraView';
import RecordingControls from '../components/media/RecordingControls';
import VibeButton from '../components/ui/VibeButton';
import theme from '../theme/themes';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function RecordScreen() {
  const navigation = useNavigation();
  const [cameraRef, setCameraRef] = useState(null);
  const [facing, setFacing] = useState('front');
  const [isRecording, setIsRecording] = useState(false);
  const [recordedVideo, setRecordedVideo] = useState(null);
  const [cameraReady, setCameraReady] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);

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
    setIsRecording(false);
    setRecordedVideo(video);
    setRecordingTime(finalTime || 0);
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
    // TODO: Navigate to video preview screen
    console.log('Preview video:', video);
    Alert.alert(
      'Preview Video',
      'Video preview will be implemented soon!',
      [
        { text: 'OK' },
        { text: 'Submit Video', onPress: () => handleContinueWithVideo(video) }
      ]
    );
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

  return (
    <View style={styles.container}>
      {/* Camera View - Full Screen */}
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
              <Text style={styles.successSubtitle}>
                {recordingTime >= maxDuration 
                  ? "Maximum time reached" 
                  : `${(maxDuration - recordingTime).toFixed(1)}s remaining`}
              </Text>
              
              <View style={styles.successButtons}>
                {recordingTime < maxDuration && (
                  <VibeButton
                    label={`Record More (${(maxDuration - recordingTime).toFixed(1)}s left)`}
                    onPress={() => setRecordedVideo(null)}
                    style={styles.recordMoreButton}
                  />
                )}
                <VibeButton
                  label="Preview Video"
                  onPress={() => handlePreviewVideo(recordedVideo)}
                  style={styles.previewButton}
                />
              </View>
            </LinearGradient>
          </View>
        )}

      {/* Bottom Controls */}
      <View style={styles.bottomControls}>
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
        
        {!cameraReady && (
          <Text style={styles.cameraStatus}>Initializing camera...</Text>
        )}
      </View>

    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
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
  bottomControls: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    padding: 32,
    paddingBottom: 48,
    alignItems: 'center',
  },
  cameraStatus: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
  },
});