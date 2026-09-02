import React, { useState, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, ScrollView, TextInput, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { collection, addDoc, doc, updateDoc, increment } from 'firebase/firestore';
import { db } from '../services/firebase';
import { promptRotationService } from '../services/promptRotationService';
import { validatePrompt, PROMPT_MAX_LENGTH } from '../utils/promptFilter';
import { VideoView, useVideoPlayer } from 'expo-video';
import Animated, { useSharedValue, useAnimatedStyle } from 'react-native-reanimated';
import VibeButton from '../components/ui/VibeButton';
import { useAuth } from '../store/AuthContext';
import { useModal } from '../store/ModalContext';
import { useRewardClaim } from '../store/RewardClaimContext';
import { useUploadQueue } from '../store/UploadQueueContext';
import { snappleService } from '../services/snappleService';
import { promptService } from '../services/promptService';
import { achievementService } from '../services/achievementService';
import { levelService } from '../services/levelService';
import theme from '../theme/themes';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

export default function VideoPreviewScreen({ route, navigation }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { recordedVideo, cameraFacing } = route.params || {};
  const initialPrompt = route.params?.prompt;
  const { user, userCurrency, updateUserCurrency } = useAuth();
  const { showSuccess, showError, showConfirm, showAlert, showToast } = useModal();
  const { flyRewards } = useRewardClaim();
  const { enqueueUpload } = useUploadQueue();
  const [isPlaying, setIsPlaying] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  // Private snapples never appear in public feeds (prompt grid, trending,
  // community game pool) and can't be purchased. The creator can still
  // play them from their own owned hand and flip back to public later.
  const [isPrivate, setIsPrivate] = useState(false);
  // Upload state now lives in UploadQueueContext; this screen fires
  // and forgets. The floating toast above the tab bar owns progress
  // + retry UI.

  // Prompt selection (for free-record mode). Picker no longer auto-opens
  // on free record — the user can tap the Prompts button when ready.
  const [prompt, setPrompt] = useState(initialPrompt || null);
  const [showPromptPicker, setShowPromptPicker] = useState(false);
  const [activePrompts, setActivePrompts] = useState([]);
  const [creatingPrompt, setCreatingPrompt] = useState(false);
  const [newPromptText, setNewPromptText] = useState('');
  
  console.log('[VideoPreview] Camera facing:', cameraFacing);
  
  const player = useVideoPlayer(recordedVideo?.uri || null, (player) => {
    player.loop = true;
    player.muted = false;
    player.play(); // Start playing immediately
  });

  // Sync mute toggle to the player.
  useEffect(() => {
    if (player) player.muted = isMuted;
  }, [isMuted, player]);

  // Auto-pause the recorded preview while the prompt picker modal is open
  // (resume on close). Keeps the user's eyes on the picker without a
  // looping clip distracting underneath.
  useEffect(() => {
    if (!player) return;
    if (showPromptPicker) {
      try { player.pause(); } catch (e) {}
      setIsPlaying(false);
    } else {
      try { player.play(); } catch (e) {}
      setIsPlaying(true);
    }
  }, [showPromptPicker, player]);

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

  const handleSubmit = async (overridePrompt) => {
    // Only honor overridePrompt if it actually looks like a prompt object — otherwise
    // a button onPress event leaks in as the first arg and overrides the picked prompt.
    const isValidPrompt = (p) => p && typeof p === 'object' && typeof p.id === 'string';
    const activePrompt = isValidPrompt(overridePrompt) ? overridePrompt : prompt;

    if (!recordedVideo?.uri) {
      showError('Error', 'No video to submit');
      return;
    }

    if (!user?.uid) {
      showError('Error', 'You must be logged in to submit');
      return;
    }

    if (!isValidPrompt(activePrompt)) {
      showError('Pick a Prompt', 'Choose a prompt before submitting your snapple.');
      setShowPromptPicker(true);
      return;
    }

    // Check prompt lockout (last 10 min)
    if (activePrompt?.lockoutAt && new Date().toISOString() >= activePrompt.lockoutAt) {
      showError('Prompt Closing', 'This prompt is closing soon — no new snapples allowed');
      return;
    }

    // Check if user already made a snapple for this prompt this cycle
    if (activePrompt?.id) {
      try {
        const { collection: col, query: q, where, getDocs } = await import('firebase/firestore');
        const { db } = await import('../services/firebase');
        const existingQuery = q(
          col(db, 'snapples'),
          where('promptId', '==', activePrompt.id),
          where('creatorId', '==', user.uid)
        );
        const existing = await getDocs(existingQuery);
        if (!existing.empty) {
          const count = existing.size;
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
              askSaveThenSubmit(activePrompt);
            }
          );
          return;
        }
      } catch (e) {}
    }

    askSaveThenSubmit(activePrompt);
  };

  // Runs after the upload lands. Owns the createSnapple call, XP /
  // achievement wiring, and application of the user's save/discard
  // choice. Captured as a closure by enqueueUpload so it survives
  // the screen unmount and fires wherever the user has navigated to.
  const buildOnUploadSuccess = (submitPrompt, saveChoice) => async (uploadResult) => {
    // Reviver perk: if this user revived/created the prompt instance
    // and no boost is currently live for this prompt, float their
    // snapple to the top for 2 hours.
    let boostedUntil = null;
    const isPromptOriginator =
      submitPrompt.createdBy === user.uid ||
      submitPrompt.revivedBy === user.uid ||
      submitPrompt.summonedBy === user.uid;
    if (isPromptOriginator) {
      try {
        const { collection: c, query: q, where: w, getDocs: g, limit: l } = await import('firebase/firestore');
        const { db: d } = await import('../services/firebase');
        const nowISO = new Date().toISOString();
        const existingBoost = await g(q(
          c(d, 'snapples'),
          w('promptId', '==', submitPrompt.id),
          w('boostedUntil', '>', nowISO),
          l(1),
        ));
        if (existingBoost.empty) {
          boostedUntil = new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString();
        }
      } catch (e) {}
    }

    const snappleResult = await snappleService.createSnapple({
      promptId: submitPrompt.id,
      videoUrl: uploadResult.downloadURL,
      videoId: uploadResult.id,
      // Video file metadata now lives on the snapple doc since we
      // killed the `videos` Firestore collection. filename is the
      // full Storage path used by cleanup on delete.
      filename: uploadResult.filename,
      fileSize: uploadResult.fileSize,
      mimeType: uploadResult.mimeType,
      creatorId: user.uid,
      creatorUsername: user.username || user.email?.split('@')[0] || 'anonymous',
      prompt: submitPrompt.text || 'Snapple video',
      category: submitPrompt.category || 'general',
      boostedUntil,
      muted: isMuted,
      isPrivate,
    });

    if (!snappleResult.success) {
      showError('Error', snappleResult.error || 'Failed to create snapple');
      return;
    }

    // Award XP/achievements once per promptId per user. Same gating
    // as the pre-refactor flow — recycled prompts (new promptId,
    // same text) count as a fresh cycle.
    try {
      const { doc: xpDoc, updateDoc: xpUpdate, increment: xpInc, getDoc: xpGet, arrayUnion: xpUnion } = await import('firebase/firestore');
      const { db: xpDb } = await import('../services/firebase');

      const beforeSnap = await xpGet(xpDoc(xpDb, 'users', user.uid));
      const beforeData = beforeSnap.data() || {};
      const earnedPrompts = beforeData.xpEarnedPrompts || [];
      const alreadyEarned = submitPrompt?.id && earnedPrompts.includes(submitPrompt.id);

      if (!alreadyEarned) {
        const beforeXP = beforeData.profile?.experience || beforeData.profile?.xp || 0;
        const beforeLevel = levelService.getLevelFromXP(beforeXP);

        const boosts = beforeData.boosts || {};
        const now = new Date().toISOString();
        const xpAmount = (boosts.xpBoost && boosts.xpBoost > now) ? 150 : 75;

        flyRewards({
          rewards: { xp: xpAmount },
          commit: async () => {
            const updates = {
              'profile.experience': xpInc(xpAmount),
              'profile.xp': xpInc(xpAmount),
              'stats.videosCreated': xpInc(1),
            };
            if (submitPrompt?.id) {
              updates.xpEarnedPrompts = xpUnion(submitPrompt.id);
            }
            await xpUpdate(xpDoc(xpDb, 'users', user.uid), updates).catch(() => {});
          },
        });

        const afterLevel = levelService.getLevelFromXP(beforeXP + xpAmount);
        if (afterLevel > beforeLevel) {
          setTimeout(() => showToast('level_up', `Level ${afterLevel}!`, `${levelService.xpForLevel(afterLevel + 1)} XP to next level`), 1500);
        }

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

        if (submitPrompt?.id) {
          try {
            const { doc: docRef, updateDoc: update, increment: inc } = await import('firebase/firestore');
            const { db: database } = await import('../services/firebase');
            await update(docRef(database, 'activePrompts', submitPrompt.id), {
              participantCount: inc(1),
            }).catch(() =>
              update(docRef(database, 'snapplePrompts', submitPrompt.id), {
                participantCount: inc(1),
              }).catch(() => {})
            );
          } catch (e) {}
        }
      }
    } catch (e) {}

    // Apply the save/discard choice picked up front. Save = stays as
    // owner + added to ownedSnapples. Discard = arrayRemove from
    // owners; the snapple stays live in the prompt grid until the
    // prompt expires. At prompt-expire time, cleanupOrphanSnapples
    // sweeps it only if nobody has owned or wishlisted it in the
    // meantime.
    const newSnappleId = snappleResult.snappleId;
    if (saveChoice === 'discard') {
      try {
        const { doc: docRef, updateDoc: update, arrayRemove: aRemove } = await import('firebase/firestore');
        const { db: database } = await import('../services/firebase');
        await update(docRef(database, 'snapples', newSnappleId), {
          owners: aRemove(user.uid),
        }).catch(() => {});
      } catch (e) {}
    } else {
      // Use arrayUnion at the Firestore layer so racing saves from
      // other tabs / other simultaneous uploads don't clobber each
      // other's ownedSnapples arrays. Top-level field name — the
      // rest of the app (userService, AuthContext, ProfileScreen)
      // reads/writes ownedSnapples at the doc root, NOT under
      // resources.*.
      try {
        const { doc: docRef, updateDoc: update, arrayUnion: aUnion } = await import('firebase/firestore');
        const { db: database } = await import('../services/firebase');
        await update(docRef(database, 'users', user.uid), {
          ownedSnapples: aUnion(newSnappleId),
        }).catch(() => {});
      } catch (e) {}
    }
  };

  // Kicks off the upload in the background and pops the user back to
  // wherever they came from immediately. The toast pill above the
  // tab bar surfaces progress + retry for the queued upload.
  const doSubmit = async (activePrompt, saveChoice) => {
    const submitPrompt = activePrompt || prompt;

    try {
      enqueueUpload({
        uri: recordedVideo.uri,
        promptText: submitPrompt?.text || 'Snapple video',
        userId: user.uid,
        label: submitPrompt?.text || 'Snapple',
        onSuccess: buildOnUploadSuccess(submitPrompt, saveChoice),
        onFailure: (err) => {
          // Toast already surfaces the retry chip; only fire a modal
          // if we've truly exhausted all retries and lost the video.
          console.error('[VideoPreview] Upload permanently failed:', err);
        },
      });
    } catch (e) {
      showError('Upload Failed', e.message || 'Could not queue upload.');
      return;
    }

    player.pause();
    setIsPlaying(false);
    navigation.popToTop();
  };

  // Ask the user up front whether to keep this snapple in their
  // collection, then hand off to doSubmit which enqueues + pops back.
  // Save is the default; the alert dismisses to Save on accidental tap.
  const askSaveThenSubmit = (submitPrompt) => {
    showAlert(
      'Save this snapple?',
      'Saved snapples stay in your collection. Discarded snapples stay live on the prompt for others to save or wishlist — they only disappear if nobody claims them by the time the prompt ends.',
      [
        { text: 'Discard', onPress: () => doSubmit(submitPrompt, 'discard') },
        { text: 'Save', onPress: () => doSubmit(submitPrompt, 'save') },
      ],
    );
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
    // Defer the submit until AFTER the picker's slide-out animation
    // completes. On iOS, kicking off another Modal (the Save/Discard
    // alert at the end of upload) while the picker is mid-dismiss
    // silently swallows the second modal — testers hit this as
    // "can't upload after picking a prompt". 400ms clears the slide.
    setTimeout(() => handleSubmit(p), 400);
  };

  const handleCreatePrompt = async () => {
    const validation = validatePrompt(newPromptText);
    if (!validation.valid) {
      showError('Invalid Prompt', validation.error);
      return;
    }
    const text = validation.cleaned;
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
        const result = await promptService.summonPrompt({
          text,
          userId: user.uid,
          username: user.username || user.email?.split('@')[0] || 'anonymous',
        });
        if (!result.success) {
          showError('Error', result.error || 'Failed to create prompt');
          return;
        }
        if (result.status === 'banned') {
          showError('Not Allowed', 'This prompt isn\'t allowed.');
          return;
        }
        // Already live → no ticket charged. Otherwise deduct 1.
        if (result.status !== 'already_active') {
          await updateDoc(doc(db, 'users', user.uid), {
            'resources.tokens': increment(-1),
          });
          showToast('reward', 'Prompt Created!', '-1 ticket');
        }
        handlePickPrompt(result.prompt);
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
          <Ionicons name="videocam-off" size={64} color={t.colors.textSecondary} />
          <Text style={styles.errorText}>No video to preview</Text>
        </View>
      )}

      {/* Transparent Overlay for Controls */}
      <Pressable style={styles.overlay} onPress={handleScreenTap}>
        {/* Close + Mute Buttons */}
        <View style={styles.header}>
          <Pressable onPress={handleClose} style={styles.closeButton}>
            <View style={styles.controlButton}>
              <Text style={styles.closeText}>✕</Text>
            </View>
          </Pressable>
          <View style={styles.headerRight}>
            {/* Private toggle: lock icon when on, open lock when off.
                Private snapples stay off public feeds + the marketplace
                but can still be played from the creator's own hand. */}
            <Pressable
              onPress={(e) => { e.stopPropagation?.(); setIsPrivate(p => !p); }}
              style={styles.muteButton}
            >
              <View style={[styles.controlButton, isPrivate && styles.controlButtonActive]}>
                <Ionicons
                  name={isPrivate ? 'lock-closed' : 'lock-open'}
                  size={18}
                  color="white"
                />
              </View>
            </Pressable>
            <Pressable onPress={(e) => { e.stopPropagation?.(); setIsMuted(m => !m); }} style={styles.muteButton}>
              <View style={styles.controlButton}>
                <Ionicons
                  name={isMuted ? 'volume-mute' : 'volume-high'}
                  size={20}
                  color="white"
                />
              </View>
            </Pressable>
          </View>
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
              onPress={() => handleSubmit()}
              variant="toggle"
              color="blue"
              style={{ flex: 1, backgroundColor: '#000000' }}
            />
          ) : (
            <VibeButton
              label="Prompts"
              onPress={() => setShowPromptPicker(true)}
              variant="toggle"
              color="green"
              style={{ flex: 1, backgroundColor: '#000000' }}
            />
          )}
        </View>

        {/* Selected prompt indicator */}
        {prompt && (
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
                <Ionicons name="close" size={24} color={t.colors.textPrimary} />
              </Pressable>
            </View>

            <ScrollView style={styles.pickerScroll} contentContainerStyle={styles.pickerScrollContent}>
              {/* Create your own */}
              {!creatingPrompt ? (
                <Pressable style={styles.createPromptCard} onPress={() => setCreatingPrompt(true)}>
                  <Ionicons name="add-circle" size={28} color={theme.colors.vibeBlue} />
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={styles.createPromptTitle}>Create Your Own</Text>
                    <Text style={styles.createPromptDesc}>Use 1 ticket to make a custom prompt</Text>
                  </View>
                  <Text style={styles.ticketPrice}>1 ticket</Text>
                </Pressable>
              ) : (
                <View style={styles.createPromptEditWrap}>
                  <TextInput
                    style={styles.promptInput}
                    placeholder="Enter your prompt..."
                    placeholderTextColor={t.colors.textSecondary}
                    value={newPromptText}
                    onChangeText={setNewPromptText}
                    autoFocus
                    multiline
                    maxLength={PROMPT_MAX_LENGTH}
                  />
                  <Text style={styles.charCounter}>{newPromptText.length}/{PROMPT_MAX_LENGTH}</Text>
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
                    <Ionicons name="chevron-forward" size={18} color={t.colors.textSecondary} />
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

const makeStyles = (t) => ({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  // Prompt swap chip sits above the Retake / Submit row. Padding
  // + position bumped so it (a) has real vertical breathing room
  // above the row and (b) matches VibeButton's ~50pt tap-target
  // height so the two rows feel like siblings.
  promptIndicator: {
    position: 'absolute',
    bottom: 122,
    left: 20,
    right: 20,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    minHeight: 50,
  },
  promptIndicatorLabel: {
    color: theme.colors.vibeBlue,
    fontSize: 12,
    fontWeight: 'bold',
  },
  promptIndicatorText: {
    flex: 1,
    color: t.colors.textPrimary,
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
    color: t.colors.textPrimary,
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
    borderColor: theme.colors.vibeBlue,
    borderRadius: 12,
    padding: 14,
    marginBottom: 16,
  },
  createPromptEditWrap: {
    width: '100%',
    marginBottom: 16,
  },
  charCounter: {
    color: t.colors.textSecondary,
    fontSize: 12,
    textAlign: 'right',
    marginTop: 4,
  },
  promptInputButtons: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 12,
    width: '100%',
  },
  createPromptTitle: {
    color: t.colors.textPrimary,
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
    color: t.colors.textPrimary,
    fontSize: 15,
    minHeight: 80,
    borderRadius: 12,
    padding: 14,
    textAlignVertical: 'top',
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    alignItems: 'center',
  },
  cancelBtnText: {
    color: t.colors.textPrimary,
    fontWeight: 'bold',
    fontSize: 15,
  },
  confirmBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    alignItems: 'center',
  },
  confirmBtnText: {
    color: theme.colors.vibeBlue,
    fontWeight: 'bold',
    fontSize: 15,
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
    color: t.colors.textPrimary,
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
    color: t.colors.textSecondary,
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
    right: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  closeButton: {
    width: 44,
    height: 44,
  },
  muteButton: {
    width: 44,
    height: 44,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
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
  controlButtonActive: {
    backgroundColor: '#00C6FF',
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
  closeText: {
    color: t.colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  playText: {
    color: t.colors.textPrimary,
    fontSize: 32,
    fontWeight: 'bold',
    textAlign: 'center',
    marginLeft: 2, // Slight offset to visually center triangle
  },
});