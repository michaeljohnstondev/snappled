import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Alert, Platform } from 'react-native';
import { CameraView, useCameraPermissions, useMicrophonePermissions } from 'expo-camera';
import theme from '../../theme/themes';

export default function BasicCameraView({ 
  onCameraReady,
  onError,
  facing = 'front', // Default to front camera
  mode = 'video',
  style
}) {
  const [cameraPermission, requestCameraPermission] = useCameraPermissions();
  const [microphonePermission, requestMicrophonePermission] = useMicrophonePermissions();
  const [isCameraReady, setIsCameraReady] = useState(false);
  const cameraRef = useRef(null);

  useEffect(() => {
    console.log('BasicCameraView: Initializing permissions...');
    console.log('Platform:', Platform.OS);
    
    if (!cameraPermission) {
      console.log('Requesting camera permission...');
      requestCameraPermission();
    }
    
    if (!microphonePermission && mode === 'video') {
      console.log('Requesting microphone permission...');
      requestMicrophonePermission();
    }
  }, [cameraPermission, microphonePermission, mode]);

  useEffect(() => {
    console.log('Camera permission status:', cameraPermission);
    console.log('Microphone permission status:', microphonePermission);
  }, [cameraPermission, microphonePermission]);

  function handleCameraReady() {
    console.log('BasicCameraView: Camera is ready!');
    setIsCameraReady(true);
    onCameraReady?.(cameraRef.current);
  }

  function handleMountError(error) {
    console.error('BasicCameraView: Camera mount error:', error);
    const errorMessage = error?.nativeEvent?.message || error?.message || 'Unknown camera error';
    onError?.(errorMessage);
    Alert.alert(
      'Camera Error',
      `Failed to start camera: ${errorMessage}`
    );
  }

  function handleCameraError(error) {
    console.error('BasicCameraView: Camera runtime error:', error);
    const errorMessage = error?.nativeEvent?.message || error?.message || 'Camera runtime error';
    onError?.(errorMessage);
  }

  // Check if we're still loading permissions
  if (!cameraPermission || (mode === 'video' && !microphonePermission)) {
    return (
      <View style={[styles.container, styles.loadingContainer, style]}>
        <Text style={styles.loadingText}>Loading camera permissions...</Text>
      </View>
    );
  }

  // Check if permissions were denied
  if (!cameraPermission.granted) {
    return (
      <View style={[styles.container, styles.errorContainer, style]}>
        <Text style={styles.errorTitle}>Camera Permission Required</Text>
        <Text style={styles.errorText}>
          Please enable camera access in your device settings to use this feature.
        </Text>
      </View>
    );
  }

  if (mode === 'video' && !microphonePermission?.granted) {
    return (
      <View style={[styles.container, styles.errorContainer, style]}>
        <Text style={styles.errorTitle}>Microphone Permission Required</Text>
        <Text style={styles.errorText}>
          Please enable microphone access to record videos with audio.
        </Text>
      </View>
    );
  }

  // Render camera
  return (
    <View style={[styles.container, style]}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
        mode={mode}
        onCameraReady={handleCameraReady}
        onMountError={handleMountError}
        onError={handleCameraError}
      />
      
      {/* Camera status overlay */}
      {!isCameraReady && (
        <View style={styles.statusOverlay}>
          <Text style={styles.statusText}>Initializing camera...</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
  },
  loadingContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  loadingText: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    textAlign: 'center',
  },
  errorContainer: {
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
    padding: 24,
  },
  errorTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  errorText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  statusOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.7)',
  },
  statusText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
});