import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraPermission,
  useMicrophonePermission,
} from 'react-native-vision-camera';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedProps,
} from 'react-native-reanimated';
import { useIsFocused } from '@react-navigation/native';
import theme from '../../theme/themes';

const AnimatedCamera = Animated.createAnimatedComponent(Camera);

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
  // Only stream when this screen is focused — prevents the camera's native
  // preview surface from sticking around behind other screens after nav.
  const isFocused = useIsFocused();

  const device = useCameraDevice(facing === 'front' ? 'front' : 'back');

  // Pinch-to-zoom: zoom is a shared value clamped between device.minZoom and device.maxZoom.
  // pinchStart captures the zoom level at gesture begin so scaling is relative, not absolute.
  const zoom = useSharedValue(device?.neutralZoom ?? 1);
  const pinchStart = useSharedValue(1);

  const minZoom = device?.minZoom ?? 1;
  const maxZoom = Math.min(device?.maxZoom ?? 8, 8);

  const pinchGesture = Gesture.Pinch()
    .onStart(() => {
      pinchStart.value = zoom.value;
    })
    .onUpdate((e) => {
      const next = pinchStart.value * e.scale;
      zoom.value = Math.min(Math.max(next, minZoom), maxZoom);
    });

  const animatedProps = useAnimatedProps(() => ({ zoom: zoom.value }));

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

  // Fully unmount the Camera when blurred. isActive={false} alone leaves
  // the native preview surface in the compositor — it keeps painting black
  // over other screens (touches pass through, but the pixels don't).
  return (
    <GestureDetector gesture={pinchGesture}>
      <View style={[styles.container, style]}>
        {isFocused ? (
          <AnimatedCamera
            ref={cameraRef}
            style={StyleSheet.absoluteFill}
            device={device}
            isActive={true}
            video={true}
            audio={true}
            animatedProps={animatedProps}
            onInitialized={() => setIsReady(true)}
            onError={(err) => {
              console.error('VisionCamera error:', err);
              onError?.(err);
            }}
          />
        ) : null}
      </View>
    </GestureDetector>
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
