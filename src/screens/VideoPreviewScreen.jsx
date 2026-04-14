import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { VideoView, useVideoPlayer } from 'expo-video';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import VibeButton from '../components/ui/VibeButton';
import { useAuth } from '../store/AuthContext';
import { useModal } from '../store/ModalContext';
import { uploadVideo } from '../services/videoStorage';
import { snappleService } from '../services/snappleService';
import { achievementService } from '../services/achievementService';
import { levelService } from '../services/levelService';
import theme from '../theme/themes';

export default function VideoPreviewScreen({ route, navigation }) {
  const { recordedVideo, cameraFacing } = route.params || {};
  const prompt = route.params?.prompt || {};
  const { user, userCurrency, updateUserCurrency } = useAuth();
  const { showSuccess, showError, showConfirm, showToast } = useModal();
  const [isPlaying, setIsPlaying] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  
  console.log('[VideoPreview] Camera facing:', cameraFacing);
  
  const player = useVideoPlayer(recordedVideo?.uri || null, (player) => {
    player.loop = true;
    player.muted = false;
    player.play(); // Start playing immediately
  });

  // Animated style for horizontal flip - only for front camera
  const animatedStyle = useAnimatedStyle(() => {
    const scaleValue = cameraFacing === 'front' ? -1 : 1;
    console.log('[VideoPreview] ScaleX value:', scaleValue, 'for camera:', cameraFacing);
    return {
      transform: [{ scaleX: scaleValue }],
    };
  });

  const handleScreenTap = () => {
    if (isPlaying) {
      player.pause();
      setIsPlaying(false);
    } else {
      player.play();
      setIsPlaying(true);
    }
  };

  const handleClose = () => {
    navigation.goBack();
  };

  const handleSubmit = async () => {
    if (!recordedVideo?.uri) {
      showError('Error', 'No video to submit');
      return;
    }

    if (!user?.uid) {
      showError('Error', 'You must be logged in to submit');
      return;
    }

    // Check prompt lockout (last 10 min)
    if (prompt?.lockoutAt && new Date().toISOString() >= prompt.lockoutAt) {
      showError('Prompt Closing', 'This prompt is closing soon — no new snapples allowed');
      return;
    }

    // Check if user already made a snapple for this prompt this cycle
    if (prompt?.id) {
      try {
        const { collection: col, query: q, where, getDocs } = await import('firebase/firestore');
        const { db } = await import('../services/firebase');
        const existingQuery = q(
          col(db, 'snapples'),
          where('promptId', '==', prompt.id),
          where('creatorId', '==', user.uid)
        );
        const existing = await getDocs(existingQuery);
        if (!existing.empty) {
          const count = existing.size; // how many they already have
          const price = count === 1 ? 1000 : 5000;
          showConfirm(
            'Extra Snapple',
            `You have ${count} snapple${count > 1 ? 's' : ''} for this prompt. Extra slot costs ${price.toLocaleString()} coins.`,
            async () => {
              if ((userCurrency.coins || 0) < price) {
                showError('Not Enough Coins', `You need ${price.toLocaleString()} coins`);
                return;
              }
              await updateUserCurrency({ coins: (userCurrency.coins || 0) - price });
              doSubmit();
            }
          );
          return;
        }
      } catch (e) {}
    }

    doSubmit();
  };

  const doSubmit = async () => {
    setIsSubmitting(true);
    setUploadProgress(0);
    player.pause();
    setIsPlaying(false);

    try {
      // Upload video to Firebase Storage
      const uploadResult = await uploadVideo(
        recordedVideo.uri,
        prompt?.text || 'Snapple video',
        user.uid,
        (progress) => setUploadProgress(progress)
      );

      // Create the snapple record
      const snappleResult = await snappleService.createSnapple({
        promptId: prompt?.id || 'unknown',
        videoUrl: uploadResult.downloadURL,
        videoId: uploadResult.id,
        creatorId: user.uid,
        creatorUsername: user.username || user.email?.split('@')[0] || 'anonymous',
        prompt: prompt?.text || 'Snapple video',
        category: prompt?.category || 'general',
      });

      if (snappleResult.success) {
        // Award 75 XP for creating a snapple
        try {
          const { doc: xpDoc, updateDoc: xpUpdate, increment: xpInc, getDoc: xpGet } = await import('firebase/firestore');
          const { db: xpDb } = await import('../services/firebase');

          const beforeSnap = await xpGet(xpDoc(xpDb, 'users', user.uid));
          const beforeData = beforeSnap.data() || {};
          const beforeXP = beforeData.profile?.experience || beforeData.profile?.xp || 0;
          const beforeLevel = levelService.getLevelFromXP(beforeXP);

          // Check XP boost
          const boosts = beforeData.boosts || {};
          const now = new Date().toISOString();
          const xpAmount = (boosts.xpBoost && boosts.xpBoost > now) ? 150 : 75;

          await xpUpdate(xpDoc(xpDb, 'users', user.uid), {
            'profile.experience': xpInc(xpAmount),
            'profile.xp': xpInc(xpAmount),
            'stats.videosCreated': xpInc(1),
          }).catch(() => {});

          showToast('reward', `+${xpAmount} XP`, xpAmount > 75 ? 'Snapple created (2x boost!)' : 'Snapple created');

          const afterLevel = levelService.getLevelFromXP(beforeXP + xpAmount);
          if (afterLevel > beforeLevel) {
            setTimeout(() => showToast('level_up', `Level ${afterLevel}!`, `${levelService.xpForLevel(afterLevel + 1)} XP to next level`), 1500);
          }

          // Check achievements
          const afterSnap = await xpGet(xpDoc(xpDb, 'users', user.uid));
          const stats = afterSnap.data()?.stats || {};
          stats.level = afterLevel;
          stats.trophies = afterSnap.data()?.resources?.trophies || 0;
          const newAchievements = await achievementService.checkAndAward(user.uid, stats);
          newAchievements.forEach((a, i) => {
            const rewards = [];
            if (a.coins) rewards.push(`+${a.coins}c`);
            if (a.xp) rewards.push(`+${a.xp}xp`);
            setTimeout(() => showToast('achievement', a.name, rewards.join(' ')), 3000 + i * 1500);
          });
        } catch (e) {}

        // Increment participant count on the prompt
        if (prompt?.id) {
          try {
            const { doc: docRef, updateDoc: update, increment: inc } = await import('firebase/firestore');
            const { db: database } = await import('../services/firebase');
            // Try both collections since prompt could be from either
            await update(docRef(database, 'activePrompts', prompt.id), {
              participantCount: inc(1),
            }).catch(() =>
              update(docRef(database, 'snapplePrompts', prompt.id), {
                participantCount: inc(1),
              }).catch(() => {})
            );
          } catch (e) {}
        }
        showConfirm(
          'Snapple Created!',
          'Save to your collection?',
          async () => {
            // Save to collection + mark ownership on snapple doc
            const owned = [...(userCurrency.ownedSnapples || []), snappleResult.snappleId];
            await updateUserCurrency({ ownedSnapples: owned });
            // Add creator to owners array on the snapple
            const { doc, updateDoc, arrayUnion } = await import('firebase/firestore');
            const { db } = await import('../services/firebase');
            await updateDoc(doc(db, 'snapples', snappleResult.snappleId), {
              owners: arrayUnion(user.uid),
            });
            navigation.navigate('Home');
          },
          () => {
            // Skip — just go home
            navigation.navigate('Home');
          }
        );
      } else {
        showError('Error', snappleResult.error || 'Failed to create snapple');
      }
    } catch (error) {
      console.error('[VideoPreview] Submit error:', error);
      console.error('[VideoPreview] Error details:', JSON.stringify(error, null, 2));
      try {
        showError('Upload Failed', error.message || 'Something went wrong. Please try again.');
      } catch (e) {
        // Modal not ready
        console.error('[VideoPreview] Could not show error modal');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleRetake = () => {
    // Go back to record screen
    navigation.goBack();
  };

  return (
    <View style={styles.container}>
      {/* Full Screen Video Player */}
      {recordedVideo?.uri ? (
        <View style={[styles.video, { transform: [{ scaleX: cameraFacing === 'front' ? -1 : 1 }] }]}>
          <VideoView
            player={player}
            style={styles.videoInner}
            contentFit="cover"
            fullscreenOptions={{ enabled: false }}
            allowsPictureInPicture={false}
            showsPlaybackControls={false}
            nativeControls={false}
          />
        </View>
      ) : (
        <View style={styles.errorContainer}>
          <Ionicons name="videocam-off" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.errorText}>No video to preview</Text>
        </View>
      )}

      {/* Transparent Overlay for Controls */}
      <Pressable style={styles.overlay} onPress={handleScreenTap}>
        {/* Close Button */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <View style={styles.controlButton}>
              <Text style={styles.closeText}>✕</Text>
            </View>
          </Pressable>
        </View>

        {/* Play Button - Only show when paused */}
        {!isPlaying && (
          <View style={styles.playButton}>
            <View style={styles.playButtonGradient}>
              <Text style={styles.playText}>▶</Text>
            </View>
          </View>
        )}

        {/* Bottom Controls */}
        <View style={styles.controls}>
          {isSubmitting ? (
            <View style={styles.uploadingContainer}>
              <ActivityIndicator size="small" color={theme.colors.vibeBlue} />
              <Text style={styles.uploadingText}>
                Uploading... {Math.round(uploadProgress)}%
              </Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
              </View>
            </View>
          ) : (
            <>
              <VibeButton
                label="Retake"
                onPress={handleRetake}
                variant="toggle"
                color="blue"
                style={{ flex: 1, backgroundColor: '#000000' }}
              />
              <VibeButton
                label="Submit"
                onPress={handleSubmit}
                variant="toggle"
                color="blue"
                style={{ flex: 1, backgroundColor: '#000000' }}
              />
            </>
          )}
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
  video: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  videoInner: {
    width: '100%',
    height: '100%',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
    backgroundColor: '#000',
  },
  errorText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 10,
    elevation: 10,
  },
  header: {
    position: 'absolute',
    top: 60,
    left: 20,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
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
    backgroundColor: '#000000',
    borderWidth: 3,
    borderColor: '#00C6FF',
  },
  playButton: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playButtonGradient: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#000000',
    borderWidth: 3,
    borderColor: '#00C6FF',
  },
  controls: {
    position: 'absolute',
    bottom: 48,
    left: 20,
    right: 20,
    flexDirection: 'row',
    gap: 16,
  },
  uploadingContainer: {
    flex: 1,
    alignItems: 'center',
    backgroundColor: '#000000',
    borderRadius: 12,
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
    paddingVertical: 14,
    paddingHorizontal: 20,
    gap: 8,
  },
  uploadingText: {
    color: theme.colors.vibeBlue,
    fontSize: 14,
    fontWeight: 'bold',
  },
  progressBar: {
    width: '100%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: theme.colors.vibeBlue,
    borderRadius: 2,
  },
  closeText: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  playText: {
    color: 'white',
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginLeft: 2, // Slight offset to visually center triangle
  },
});