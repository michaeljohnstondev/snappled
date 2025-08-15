import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, Alert } from 'react-native';
import theme from '../../theme/themes';

export default function RecordingControls({ 
  cameraRef, 
  onRecordingComplete,
  onRecordingStart,
  onRecordingStop,
  onCameraReset,
  maxDuration = 10 
}) {
  const [isRecording, setIsRecording] = useState(false);
  const [recordingTime, setRecordingTime] = useState(0);
  const [canStopManually, setCanStopManually] = useState(false);
  
  const timerRef = useRef(null);
  const recordingPromiseRef = useRef(null);
  const isRecordingRef = useRef(false);

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, []);

  function startTimer() {
    timerRef.current = setInterval(() => {
      setRecordingTime(prev => {
        const newTime = prev + 0.1;
        
        // Allow manual stop after 1 second
        if (newTime >= 1 && !canStopManually) {
          setCanStopManually(true);
        }
        
        return Math.min(newTime, maxDuration);
      });
    }, 100);
  }

  function stopTimer() {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  }

  function resetState() {
    setIsRecording(false);
    setRecordingTime(0);
    setCanStopManually(false);
    isRecordingRef.current = false;
    stopTimer();
  }

  async function startRecording() {
    if (!cameraRef) {
      console.log('Cannot start recording - no camera ref');
      return;
    }

    if (isRecordingRef.current) {
      console.log('Already recording, cannot start new recording');
      return;
    }

    console.log('Starting recording...');
    
    try {
      // Force stop any existing recording first
      console.log('Ensuring camera is not recording...');
      try {
        cameraRef.stopRecording();
        console.log('Stopped any existing recording');
        // Small delay to ensure cleanup
        await new Promise(resolve => setTimeout(resolve, 200));
      } catch (stopError) {
        console.log('No existing recording to stop (this is normal)');
      }

      // Update state
      setIsRecording(true);
      isRecordingRef.current = true;
      setRecordingTime(0);
      setCanStopManually(false);
      
      // Start timer
      startTimer();
      
      // Notify parent
      onRecordingStart?.();

      const recordingOptions = {
        quality: '720p',
        maxDuration: maxDuration * 1000, // Convert to milliseconds
      };

      console.log('Starting camera recording with options:', recordingOptions);
      
      // Start recording and store the promise
      recordingPromiseRef.current = cameraRef.recordAsync(recordingOptions);
      
      const video = await recordingPromiseRef.current;
      
      console.log('Recording completed, video:', video);
      
      // Only process if we're still in recording state
      if (isRecordingRef.current) {
        resetState();
        onRecordingComplete?.(video);
      }
      
    } catch (error) {
      console.error('Recording error:', error);
      resetState();
      onRecordingStop?.(error);
      
      if (error.message.includes('recording is already in progress')) {
        Alert.alert(
          'Camera Busy',
          'Camera is stuck in recording mode. Try switching cameras or restart the app.',
          [
            { text: 'OK' },
            { text: 'Force Reset', onPress: forceResetCamera }
          ]
        );
      } else {
        Alert.alert('Recording Error', error.message);
      }
    }
  }

  function stopRecording() {
    if (!isRecordingRef.current || !cameraRef) {
      console.log('Cannot stop recording - not recording or no camera ref');
      return;
    }

    console.log(`Manually stopping recording at ${recordingTime.toFixed(1)}s`);
    
    try {
      // Stop the camera recording
      cameraRef.stopRecording();
      console.log('Stop recording called on camera');
      
      // Update UI immediately
      setIsRecording(false);
      isRecordingRef.current = false;
      stopTimer();
      
      // Notify parent
      onRecordingStop?.();
      
    } catch (error) {
      console.error('Error stopping recording:', error);
      resetState();
    }
  }

  function forceResetCamera() {
    console.log('Force resetting camera state...');
    resetState();
    onCameraReset?.();
  }

  function handleRecordButtonPress() {
    if (isRecording) {
      if (canStopManually) {
        stopRecording();
      } else {
        Alert.alert(
          'Recording...', 
          'Please wait at least 1 second before stopping the recording.'
        );
      }
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
        {isRecording && !canStopManually && (
          <Text style={styles.waitText}>Recording... (wait 1s to stop)</Text>
        )}
      </View>

      {/* Record Button */}
      <TouchableOpacity
        style={[
          styles.recordButton,
          isRecording && styles.recordingActive,
          isRecording && !canStopManually && styles.recordingDisabled
        ]}
        onPress={handleRecordButtonPress}
        activeOpacity={0.8}
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
        {isRecording 
          ? (canStopManually ? 'Tap to stop recording' : 'Recording started...') 
          : 'Tap to start recording'
        }
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    gap: 16,
  },
  timerContainer: {
    backgroundColor: 'rgba(0,0,0,0.7)',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    alignItems: 'center',
  },
  timerText: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
  },
  waitText: {
    color: '#ffaa00',
    fontSize: 12,
    marginTop: 2,
  },
  recordButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(255,255,255,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: 'white',
  },
  recordingActive: {
    backgroundColor: 'rgba(255,0,0,0.3)',
    borderColor: '#ff0000',
  },
  recordingDisabled: {
    opacity: 0.7,
  },
  recordButtonInner: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: '#ff0000',
  },
  recordingInner: {
    width: 30,
    height: 30,
    borderRadius: 4,
    backgroundColor: '#ff0000',
  },
  statusText: {
    color: 'white',
    fontSize: 14,
    textAlign: 'center',
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
});