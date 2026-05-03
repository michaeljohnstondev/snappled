import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, addDoc, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../services/firebase';
import { promptRotationService } from '../services/promptRotationService';
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
  const initialPrompt = route.params?.prompt;
  const { user, userCurrency, updateUserCurrency } = useAuth();
  const { showSuccess, showError, showConfirm, showToast } = useModal();
  const [isPlaying, setIsPlaying] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  // Prompt selection (for free-record mode)
  const [prompt, setPrompt] = useState(initialPrompt || null);
  const [showPromptPicker, setShowPromptPicker] = useState(!initialPrompt);
  const [activePrompts, setActivePrompts] = useState([]);
  const [creatingPrompt, setCreatingPrompt] = useState(false);
  const [newPromptText, setNewPromptText] = useState('');
  
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

  // Load active prompts when picker opens
  useEffect(() => {
    if (showPromptPicker && activePrompts.length === 0) {
      promptRotationService.getActivePrompts().then(({ prompts }) => {
        setActivePrompts(prompts || []);
      }).catch(() => {});
    }
  }, [showPromptPicker]);

  const handlePickPrompt = (p) => {
    setPrompt(p);
    setShowPromptPicker(false);
    setCreatingPrompt(false);
    setNewPromptText('');
  };

  const handleCreatePrompt = async () => {
    const text = newPromptText.trim();
    if (!text) {
      showError('Empty', 'Enter a prompt first');
      return;
    }
    if ((userCurrency.tokens || 0) < 1) {
      showConfirm(
        'Not Enough Tickets',
        'You need 1 ticket to create a prompt. Go to the Store to buy more?',
        () => {
          setShowPromptPicker(false);
          navigation.navigate('Store');
        }
      );
      return;
    }
    showConfirm('Use 1 Ticket?', `Create prompt: "${text}"`, async () => {
      try {
        // Deduct ticket
        await updateDoc(doc(db, 'users', user.uid), {
          'resources.tokens': increment(-1),
        });
        // Create prompt in activePrompts
        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
        const lockoutAt = new Date(Date.now() + (24 * 60 - 10) * 60 * 1000).toISOString();
        const newDoc = await addDoc(collection(db, 'activePrompts'), {
          text,
          category: 'user',
          expiresAt,
          lockoutAt,
          createdAt: new Date().toISOString(),
          createdBy: user.uid,
          creatorUsername: user.username || user.email?.split('@')[0] || 'anonymous',
          isSystem: false,
          likeCount: 0, dislikeCount: 0,
          likes: [], dislikes: [],
          participantCount: 0, totalViews: 0,
        });
        const newPrompt = { id: newDoc.id, text, category: 'user', expiresAt, lockoutAt };
        showToast('reward', 'Prompt Created!', '-1 ticket');
        handlePickPrompt(newPrompt);
      } catch (e) {
        showError('Error', 'Failed to create prompt');
      }
    });
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
              {prompt ? (
                <VibeButton
                  label="Submit"
                  onPress={handleSubmit}
                  variant="toggle"
                  color="blue"
                  style={{ flex: 1, backgroundColor: '#000000' }}
                />
              ) : (
                <VibeButton
                  label="Pick Prompt"
                  onPress={() => setShowPromptPicker(true)}
                  variant="toggle"
                  color="green"
                  style={{ flex: 1, backgroundColor: '#000000' }}
                />
              )}
            </>
          )}
        </View>

        {/* Selected prompt indicator */}
        {prompt && !isSubmitting && (
          <Pressable style={styles.promptIndicator} onPress={() => setShowPromptPicker(true)}>
            <Text style={styles.promptIndicatorLabel}>Prompt:</Text>
            <Text style={styles.promptIndicatorText} numberOfLines={2}>{prompt.text}</Text>
            <Ionicons name="swap-horizontal" size={16} color={theme.colors.vibeBlue} />
          </Pressable>
        )}
      </Pressable>

      {/* Prompt Picker Modal */}
      <Modal visible={showPromptPicker} transparent animationType="slide" onRequestClose={() => setShowPromptPicker(false)}>
        <View style={styles.pickerOverlay}>
          <View style={styles.pickerCard}>
            <View style={styles.pickerHeader}>
              <Text style={styles.pickerTitle}>Pick a Prompt</Text>
              <Pressable onPress={() => setShowPromptPicker(false)}>
                <Ionicons name="close" size={24} color={theme.colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView style={styles.pickerScroll} contentContainerStyle={styles.pickerScrollContent}>
              {/* Create your own */}
              {!creatingPrompt ? (
                <Pressable style={styles.createPromptCard} onPress={() => setCreatingPrompt(true)}>
                  <Ionicons name="add-circle" size={28} color={theme.colors.vibeGreen} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.createPromptTitle}>Create Your Own</Text>
                    <Text style={styles.createPromptDesc}>Use 1 ticket to make a custom prompt</Text>
                  </View>
                  <Text style={styles.ticketPrice}>1 ticket</Text>
                </Pressable>
              ) : (
                <View style={styles.createPromptEditCard}>
                  <TextInput
                    style={styles.promptInput}
                    placeholder="Enter your prompt..."
                    placeholderTextColor={theme.colors.textSecondary}
                    value={newPromptText}
                    onChangeText={setNewPromptText}
                    autoFocus
                    multiline
                    maxLength={120}
                  />
                  <View style={styles.promptInputButtons}>
                    <Pressable style={styles.cancelBtn} onPress={() => { setCreatingPrompt(false); setNewPromptText(''); }}>
                      <Text style={styles.cancelBtnText}>Cancel</Text>
                    </Pressable>
                    <Pressable style={styles.confirmBtn} onPress={handleCreatePrompt}>
                      <Text style={styles.confirmBtnText}>Use 1 Ticket</Text>
                    </Pressable>
                  </View>
                </View>
              )}

              {/* Active prompts */}
              <Text style={styles.sectionLabel}>Active Prompts</Text>
              {activePrompts.length === 0 ? (
                <ActivityIndicator color={theme.colors.vibeBlue} style={{ marginVertical: 20 }} />
              ) : (
                activePrompts.map(p => (
                  <Pressable key={p.id} style={styles.promptOption} onPress={() => handlePickPrompt(p)}>
                    <Text style={styles.promptOptionText} numberOfLines={2}>{p.text}</Text>
                    <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
                  </Pressable>
                ))
              )}
            </ScrollView>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  promptIndicator: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
  },
  promptIndicatorLabel: {
    color: theme.colors.vibeBlue,
    fontSize: 12,
    fontWeight: 'bold',
  },
  promptIndicatorText: {
    flex: 1,
    color: '#fff',
    fontSize: 13,
  },
  pickerOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end',
  },
  pickerCard: {
    backgroundColor: '#0a0f1e',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    maxHeight: '85%',
    paddingBottom: 30,
  },
  pickerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  pickerTitle: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
  },
  pickerScroll: {
    paddingHorizontal: 16,
    paddingTop: 12,
  },
  pickerScrollContent: {
    paddingBottom: 40,
  },
  createPromptCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 2,
    borderColor: theme.colors.vibeGreen,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  createPromptEditCard: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 2,
    borderColor: theme.colors.vibeGreen,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  promptInputButtons: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
  },
  createPromptTitle: {
    color: '#fff',
    fontSize: 15,
    fontWeight: 'bold',
  },
  createPromptDesc: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 12,
    marginTop: 2,
  },
  ticketPrice: {
    color: theme.colors.vibeYellow,
    fontSize: 12,
    fontWeight: 'bold',
  },
  promptInput: {
    width: '100%',
    color: '#fff',
    fontSize: 15,
    minHeight: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    padding: 10,
    textAlignVertical: 'top',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: '#fff',
    fontWeight: 'bold',
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: theme.colors.vibeGreen,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: '#000',
    fontWeight: 'bold',
  },
  sectionLabel: {
    color: theme.colors.vibeBlue,
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
    marginTop: 4,
  },
  promptOption: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    borderRadius: 10,
    padding: 12,
    marginBottom: 8,
  },
  promptOptionText: {
    flex: 1,
    color: '#fff',
    fontSize: 14,
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