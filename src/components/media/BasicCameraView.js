import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { View, Text, StyleSheet, Alert, Platform } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
} from 'react-native-vision-camera';
import theme from '../../theme/themes';

export default function BasicCameraView({
  onCameraReady,
  onError,
  facing = 'front',
  mode = 'video',
  style,
}) {
  const { hasPermission: cameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
  const { hasPermission: microphonePermission, requestPermission: requestMicrophonePermission } = useMicrophonePermission();
  const [isReady, setIsReady] = useState(false);
  const cameraRef = useRef(null);

  const device = useCameraDevice(facing === 'front' ? 'front' : 'back');

  useEffect(() => {
    if (!cameraPermission) requestCameraPermission().catch(() => {});
    if (!microphonePermission && mode === 'video') requestMicrophonePermission().catch(() => {});
  }, []);

  // Build a wrapper that matches expo-camera's API used by RecordingControls
  const cameraWrapper = useRef({
    recordAsync: async (options = {}) => {
      return new Promise((resolve, reject) => {
        if (!cameraRef.current) {
          reject(new Error('Camera not ready'));
          return;
        }
        cameraRef.current.startRecording({
          fileType: 'mp4',
          onRecordingFinished: (video) => resolve({ uri: 'file://' + video.path }),
          onRecordingError: (err) => reject(err),
        });
      });
    },
    stopRecording: async () => {
      if (cameraRef.current) {
        try { await cameraRef.current.stopRecording(); } catch (e) {}
      }
    },
  }).current;

  useEffect(() => {
    if (isReady && device && cameraPermission) {
      onCameraReady?.(cameraWrapper);
    }
  }, [isReady, device, cameraPermission]);

  if (!cameraPermission || !microphonePermission) {
    return (
      <View style={[styles.container, style, styles.center]}>
        <Text style={styles.errorTitle}>Camera Permission Required</Text>
        <Text style={styles.errorText}>Please enable camera access in settings.</Text>
      </View>
    );
  }

  if (!device) {
    return (
      <View style={[styles.container, style, styles.center]}>
        <Text style={styles.errorText}>No camera available</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, style]}>
      <Camera
        ref={cameraRef}
        style={StyleSheet.absoluteFill}
        device={device}
        isActive={true}
        video={true}
        audio={true}
        onInitialized={() => setIsReady(true)}
        onError={(err) => {
          console.error('VisionCamera error:', err);
          onError?.(err);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
});
