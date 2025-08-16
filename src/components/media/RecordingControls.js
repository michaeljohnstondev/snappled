import React, { useState, useRef, useEffect } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Alert } from "react-native";
import VibeAlert from "../ui/VibeAlert";
import theme from "../../theme/themes";

export default function RecordingControls({
  cameraRef,
  isRecording,
  recordingTime,
  onRecordingComplete,
  onRecordingStart,
  onRecordingStop,
  onRecordingTimeUpdate,
  onCameraReset,
  maxDuration = 10,
}) {
  const [canStopManually, setCanStopManually] = useState(false);

  const timerRef = useRef(null);
  const recordingPromiseRef = useRef(null);
  const isRecordingRef = useRef(false);
  const recordingTimeRef = useRef(0);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

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

      // Auto-stop at max duration - let camera complete naturally
      if (newTime >= (maxDuration || 10)) {
        // Don't manually stop - let the camera recording complete naturally
        // The camera should auto-complete when maxDuration is reached
        stopTimer();
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
      // Force stop any existing recording first
      console.log("Ensuring camera is not recording...");
      try {
        cameraRef.stopRecording();
        console.log("Stopped any existing recording");
        // Small delay to ensure cleanup
        await new Promise((resolve) => setTimeout(resolve, 200));
      } catch (stopError) {
        console.log("No existing recording to stop (this is normal)");
      }

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
    } else {
      startRecording();
    }
  }

  return (
    <View style={styles.container}>
      {/* Timer Display */}
      <View style={styles.timerContainer}>
        <Text style={styles.timerText}>
          {recordingTime.toFixed(1)}s / {maxDuration}.0s
        </Text>
      </View>

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

      {/* Status Text */}
      <Text style={styles.statusText}>
        {isRecording ? "Tap to stop recording" : "Tap to start recording"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    gap: 16,
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
