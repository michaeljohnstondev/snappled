import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert, Platform } from "react-native";
import VibeAlert from "../ui/VibeAlert";
import theme from "../../theme/themes";
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

export default function RecordingControls({
  cameraRef,
  isRecording,
  recordingTime,
  onRecordingComplete,
  onRecordingStart,
  onRecordingStop,
  onRecordingTimeUpdate,
  onCameraReset,
  onCountdownChange,
  maxDuration = 10,
}) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [canStopManually, setCanStopManually] = useState(false);
  // Countdown before recording starts. We fire the native start at the
  // "1" tick so vision-camera's ~1s encoder setup overlaps the last
  // countdown frame — by the time the overlay clears the camera is
  // already capturing.
  const [countdown, setCountdown] = useState(0);

  const timerRef = useRef(null);
  const recordingPromiseRef = useRef(null);
  const isRecordingRef = useRef(false);
  const recordingTimeRef = useRef(0);
  const countdownTimeoutsRef = useRef([]);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
      countdownTimeoutsRef.current.forEach((id) => clearTimeout(id));
      countdownTimeoutsRef.current = [];
    };
  }, []);

  // Mirror the countdown value out to the parent screen so it can render
  // the big centered number overlay.
  useEffect(() => {
    onCountdownChange?.(countdown);
  }, [countdown]);

  // Run a 3-2-1 countdown and kick off the actual recording the moment
  // the overlay clears. On fast devices the prior "start at 1" timing
  // captured ~2s of pre-action footage; aligning the start with the
  // overlay clear keeps the recorded video lined up with what the
  // user sees as "GO".
  function runCountdownThenRecord() {
    if (countdown > 0) return;
    setCountdown(3);
    const t1 = setTimeout(() => setCountdown(2), 1000);
    const t2 = setTimeout(() => setCountdown(1), 2000);
    const t3 = setTimeout(() => {
      setCountdown(0);
      startRecording();
    }, 3000);
    countdownTimeoutsRef.current.push(t1, t2, t3);
  }

  function cancelCountdown() {
    countdownTimeoutsRef.current.forEach((id) => clearTimeout(id));
    countdownTimeoutsRef.current = [];
    setCountdown(0);
  }

  function startTimer(resetTime = true) {
    if (resetTime) {
      recordingTimeRef.current = 0;
    }
    timerRef.current = setInterval(() => {
      recordingTimeRef.current += 0.1;
      const newTime = Math.min(recordingTimeRef.current, maxDuration);
      onRecordingTimeUpdate?.(newTime);

      // Allow manual stop after 0.5 seconds
      if (newTime >= 0.2 && !canStopManually) {
        setCanStopManually(true);
      }

      // Auto-stop at max duration. Vision-camera does NOT honor a
      // maxDuration option in its startRecording call, so the JS timer
      // is what enforces the cap — we have to actively stop the camera
      // here. Comment in earlier version claimed the camera would
      // auto-complete; that was wrong and let snapples run past 10s.
      if (newTime >= (maxDuration || 10)) {
        stopTimer();
        if (isRecordingRef.current && cameraRef?.stopRecording) {
          isRecordingRef.current = false;
          try { cameraRef.stopRecording(); } catch (e) {}
        }
      }
    }, 100);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function resetState() {
    setCanStopManually(false);
    isRecordingRef.current = false;
    stopTimer();
  }

  async function startRecording() {
    if (!cameraRef) {
      console.log("Cannot start recording - no camera ref");
      return;
    }

    if (isRecordingRef.current) {
      console.log("Already recording, cannot start new recording");
      return;
    }

    console.log("Starting recording...");

    try {
      // Update state
      isRecordingRef.current = true;
      setCanStopManually(false);

      // Start timer
      startTimer();

      // Notify parent
      onRecordingStart?.();

      const recordingOptions = {
        quality: "720p",
        maxDuration: (maxDuration || 10) * 1000, // Convert to milliseconds
        // Force H.264 on iOS so the recorded MOV can play on
        // Android / web without a re-encode. iOS records HEVC by
        // default on modern devices, which Firebase stores fine
        // but breaks playback on non-Apple video pipelines.
        ...(Platform.OS === 'ios' && { codec: 'avc1' }),
      };

      console.log("Starting camera recording with options:", recordingOptions);

      // Start recording and store the promise
      recordingPromiseRef.current = cameraRef.recordAsync(recordingOptions);

      const video = await recordingPromiseRef.current;

      console.log("Recording completed, video:", video);

      // Always process completion, whether manual or automatic stop
      resetState();
      onRecordingComplete?.(video, recordingTimeRef.current);
    } catch (error) {
      console.error("Recording error:", error);
      resetState();
      onRecordingStop?.(error);

      if (error.message.includes("recording is already in progress")) {
        Alert.alert(
          "Camera Busy",
          "Camera is stuck in recording mode. Try switching cameras or restart the app.",
          [{ text: "OK" }, { text: "Force Reset", onPress: forceResetCamera }]
        );
      } else {
        Alert.alert("Recording Error", error.message);
      }
    }
  }

  function stopRecording() {
    if (!isRecordingRef.current || !cameraRef) {
      console.log("Cannot stop recording - not recording or no camera ref");
      return;
    }

    console.log(
      `Manually stopping recording at ${recordingTimeRef.current.toFixed(1)}s`
    );

    try {
      // Stop the camera recording
      cameraRef.stopRecording();
      console.log("Stop recording called on camera");

      // Update UI immediately
      isRecordingRef.current = false;
      stopTimer();

      // Note: onRecordingComplete will be called automatically when the camera stops
      // We don't need to call onRecordingStop here
    } catch (error) {
      console.error("Error stopping recording:", error);
      resetState();
      onRecordingStop?.(error);
    }
  }

  function handleStopRecording() {
    // Stop recording and go directly to preview
    stopRecording();
  }

  function forceResetCamera() {
    console.log("Force resetting camera state...");
    resetState();
    onCameraReset?.();
  }

  function handleRecordButtonPress() {
    if (isRecording) {
      handleStopRecording();
    } else if (countdown > 0) {
      // Tap during countdown cancels it.
      cancelCountdown();
    } else {
      runCountdownThenRecord();
    }
  }

  return (
    <View style={styles.container}>
      {/* Record Button */}
      <TouchableOpacity
        style={[
          styles.recordButton,
          isRecording && styles.recordingActive,
          isRecording && !canStopManually && styles.recordingDisabled,
        ]}
        onPress={handleRecordButtonPress}
        activeOpacity={0.8}
        disabled={isRecording && !canStopManually}
      >
        <View
          style={[
            styles.recordButtonInner,
            isRecording && styles.recordingInner,
          ]}
        />
      </TouchableOpacity>
    </View>
  );
}

const makeStyles = (t) => ({
  container: {
    alignItems: "center",
    justifyContent: "center",
    height: 120, // Fixed height to maintain consistent space
    position: "relative",
  },
  timerContainer: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: "center",
  },
  timerText: {
    color: "white",
    fontSize: 16,
    fontWeight: "bold",
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
    borderWidth: 4,
    borderColor: "white",
  },
  recordingActive: {
    borderColor: "#ff0000",
  },
  recordingDisabled: {
    opacity: 0.7,
  },
  recordButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: "#ff0000",
  },
  recordingInner: {
    width: 30,
    height: 30,
    borderRadius: 4,
    backgroundColor: "#ff0000",
  },
  statusText: {
    color: "white",
    fontSize: 14,
    textAlign: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
});
