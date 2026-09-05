import React, { useState, useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Linking } from 'react-native';
import {
  Camera,
  useCameraDevice,
  useCameraDevices,
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
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

const AnimatedCamera = Animated.createAnimatedComponent(Camera);

export default function BasicCameraView({
  onCameraReady,
  onError,
  facing = 'front',
  mode = 'video',
  style,
}) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { hasPermission: cameraPermission, requestPermission: requestCameraPermission } = useCameraPermission();
  const { hasPermission: microphonePermission, requestPermission: requestMicrophonePermission } = useMicrophonePermission();
  const [isReady, setIsReady] = useState(false);
  const cameraRef = useRef(null);
  // Only stream when this screen is focused — prevents the camera's native
  // preview surface from sticking around behind other screens after nav.
  const isFocused = useIsFocused();

  // Default useCameraDevice('back') returns a single device whose minZoom
  // is often clamped to the main wide's 1.0x — pinch-out can't go below
  // that. Enumerate all devices and pick the back-facing one with the
  // lowest minZoom, which on phones with an ultra-wide lens gives us 0.5x.
  // Falls back to default useCameraDevice if the enumeration is empty.
  const allDevices = useCameraDevices();
  const fallbackDevice = useCameraDevice(facing === 'front' ? 'front' : 'back');
  const device = (() => {
    if (!allDevices || allDevices.length === 0) return fallbackDevice;
    const wantedPosition = facing === 'front' ? 'front' : 'back';
    const positionMatches = allDevices.filter(d => d?.position === wantedPosition);
    if (positionMatches.length === 0) return fallbackDevice;
    // Pick the one with the lowest minZoom — that's the widest-FOV lens.
    return positionMatches.reduce(
      (best, d) => (d.minZoom < (best?.minZoom ?? Infinity) ? d : best),
      null,
    ) || fallbackDevice;
  })();

  // Pinch-to-zoom: zoom is a shared value clamped between device.minZoom and device.maxZoom.
  // pinchStart captures the zoom level at gesture begin so scaling is relative, not absolute.
  // Start at minZoom (widest FOV) so it matches the phone's native camera default.
  const zoom = useSharedValue(device?.minZoom ?? 1);
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

  // Pick the format with the widest field of view — single-lens phones (like
  // Pixel 3) often expose multiple formats with different FOVs, and the
  // vision-camera default leans tighter than the native camera. This gets
  // back the peripheral pixels.
  const widestFormat = (() => {
    if (!device?.formats?.length) return undefined;
    return device.formats.reduce(
      (best, f) => ((f.fieldOfView || 0) > (best?.fieldOfView || 0) ? f : best),
      null,
    );
  })();

  const animatedProps = useAnimatedProps(() => ({ zoom: zoom.value }));

  // useSharedValue initializes once, but device.minZoom isn't ready on the
  // very first render. Sync it once the device is loaded so we actually
  // start at the widest available FOV.
  useEffect(() => {
    if (device?.minZoom != null) {
      zoom.value = device.minZoom;
    }
  }, [device?.minZoom]);

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
        // H.265 (HEVC) + 3 Mbps gets ~75% smaller files than the raw
        // iPhone default (~17 Mbps H.264) at visually-indistinguishable
        // quality on a phone screen. Smaller uploads → smaller downloads
        // → snapples actually load in time for the next round.
        cameraRef.current.startRecording({
          fileType: 'mp4',
          videoCodec: 'h265',
          videoBitRate: 3_000_000,
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
    // One button, two outcomes. Ask first: on a fresh install the OS
    // still shows its dialog and the user never leaves the app. If the
    // permission is blocked ("don't ask again", or a reinstall that
    // reset it), the request resolves false WITHOUT showing anything —
    // and that silent no-op is what used to strand people on this
    // screen with instructions and no way to act on them. Falling
    // through to openSettings lands them on this app's settings page
    // rather than making them hunt for it.
    const handleGrant = async () => {
      try {
        const cam = cameraPermission || await requestCameraPermission();
        const mic = microphonePermission
          || (mode === 'video' ? await requestMicrophonePermission() : true);
        if (!cam || !mic) await Linking.openSettings();
      } catch (e) {
        Linking.openSettings().catch(() => {});
      }
    };

    const missing = !cameraPermission && !microphonePermission
      ? 'Camera and microphone'
      : !cameraPermission ? 'Camera' : 'Microphone';

    return (
      <View style={[styles.container, style, styles.center]}>
        <Text style={styles.errorTitle}>{missing} access needed</Text>
        <Text style={styles.errorText}>
          {"Snappled records straight to the prompt — it can't do that without this."}
        </Text>
        <Pressable style={styles.permBtn} onPress={handleGrant}>
          <Text style={styles.permBtnText}>Grant access</Text>
        </Pressable>
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
            format={widestFormat}
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

const makeStyles = (t) => ({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  center: {
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  permBtn: {
    marginTop: 18,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,198,255,0.12)',
  },
  permBtnText: {
    color: theme.colors.vibeBlue,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  errorTitle: {
    color: t.colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  errorText: {
    color: t.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
});
