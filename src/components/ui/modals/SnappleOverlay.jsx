import React, { useState, useRef, useMemo, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  Dimensions,
  Share
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import { runOnJS } from 'react-native-reanimated';
import SnappleVideoPlayer from '../../media/SnappleVideoPlayer';
import { useAuth } from '../../../store/AuthContext';
import { useModal } from '../../../store/ModalContext';
import { snappleService } from '../../../services/snappleService';
import theme from '../../../theme/themes';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function SnappleOverlay({
  visible,
  snapple: snappleProp,
  // Optional list + initial index. When present, users can swipe up/down
  // in the overlay to move through the list without closing back to the
  // grid. Callers that only ever open a single snapple can keep passing
  // `snapple` on its own.
  snapples,
  initialIndex = 0,
  onClose,
  onBuy,
  onReport,
  navigation,
}) {
  const { user, userCurrency, updateUserCurrency } = useAuth();
  const { showConfirm, showError, showAlert } = useModal();
  const playerRef = useRef(null);
  // Index into `snapples` (ignored when the caller only passed a single
  // `snapple`). Reset on open so re-tapping a grid thumbnail always
  // lands on the tapped card.
  const [currentIndex, setCurrentIndex] = useState(initialIndex);
  useEffect(() => {
    if (visible) setCurrentIndex(initialIndex);
  }, [visible, initialIndex]);
  // Active snapple: swipable list wins when present, otherwise fall
  // back to the single-prop form. Clamped so an out-of-range index
  // from a stale close/reopen can't crash the render.
  const snapple = (snapples && snapples.length > 0)
    ? snapples[Math.max(0, Math.min(currentIndex, snapples.length - 1))]
    : snappleProp;

  // Vertical swipe → advance / go back within the swipable list.
  // activeOffsetY([-15, 15]) means Pressables underneath still get
  // taps (Gesture.Pan only "wins" once the finger has moved past the
  // threshold), and failOffsetX cancels the swipe if the drag drifts
  // sideways so a horizontal fling never fires an accidental page.
  const swipeGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY([-15, 15])
        .failOffsetX([-30, 30])
        .onEnd((e) => {
          const canSwipe = snapples && snapples.length > 1;
          if (!canSwipe) return;
          if (e.translationY < -80) {
            runOnJS(setCurrentIndex)(
              Math.min(currentIndex + 1, snapples.length - 1),
            );
          } else if (e.translationY > 80) {
            runOnJS(setCurrentIndex)(Math.max(currentIndex - 1, 0));
          }
        }),
    [snapples, currentIndex],
  );
  const [isPlaying, setIsPlaying] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const [metrics, setMetrics] = useState({
    likes: snapple?.likes || 0,
    dislikes: snapple?.dislikes || 0,
    buyCount: snapple?.buyCount || 0,
    currentPrice: snapple?.currentPrice || 10,
  });
  // hasLiked / hasDisliked are derived from snapple.likedBy /
  // snapple.dislikedBy (denormalized 2-way index on the snapple doc)
  // — no separate Firestore fetch. Kept in local state so optimistic
  // updates on tap feel instant; re-syncs when a new snapple opens.
  const [userInteraction, setUserInteraction] = useState({
    hasLiked: (snapple?.likedBy || []).includes(user?.uid),
    hasDisliked: (snapple?.dislikedBy || []).includes(user?.uid),
    hasPurchased: false
  });
  // Local mirror of snapple.isPrivate so the lock badge and toggle UI
  // update instantly when the creator flips it, without waiting for the
  // parent to refetch.
  const [isPrivate, setIsPrivate] = useState(!!snapple?.isPrivate);
  // Same pattern for the muted toggle. Creator-only; applies to all
  // playbacks (home, game, voting, owners' decks).
  const [muted, setMuted] = useState(!!snapple?.muted);
  // Admin-only mirror for the excludeFromPool flag. Snappy local
  // toggle; the underlying service write is admin-gated.
  const [excludeFromPool, setExcludeFromPool] = useState(!!snapple?.excludeFromPool);

  // Sync local privacy when a different snapple opens
  React.useEffect(() => {
    setIsPrivate(!!snapple?.isPrivate);
    setMuted(!!snapple?.muted);
    setExcludeFromPool(!!snapple?.excludeFromPool);
  }, [snapple?.id, snapple?.isPrivate, snapple?.muted, snapple?.excludeFromPool]);

  // Refetch the snapple on every open so local state reflects the
  // LIVE Firestore doc, not whatever the parent grid cached on first
  // mount. Without this, toggling mute/private/excludeFromPool here,
  // closing, then reopening would revert the UI to the parent's stale
  // value (most parents don't subscribe to per-snapple changes).
  React.useEffect(() => {
    if (!visible || !snapple?.id) return;
    let cancelled = false;
    (async () => {
      try {
        const result = await snappleService.getSnapple(snapple.id);
        if (cancelled || !result?.success || !result.snapple) return;
        const fresh = result.snapple;
        setIsPrivate(!!fresh.isPrivate);
        setMuted(!!fresh.muted);
        setExcludeFromPool(!!fresh.excludeFromPool);
      } catch (e) { /* non-fatal — prop-sync above already set defaults */ }
    })();
    return () => { cancelled = true; };
  }, [visible, snapple?.id]);

  // ADMIN_UIDS gates the admin-only pool-exclusion toggle. Mirrors
  // the same list used in AdminScreen / GameScreen / UserMenu.
  const ADMIN_UIDS = ['SrB8T1TmftQzu90H7phQkRJXkRn2'];
  const isAdmin = ADMIN_UIDS.includes(user?.uid);

  // Reset metrics, load interactions, and track view when snapple changes
  React.useEffect(() => {
    if (snapple && visible) {
      setMetrics({
        likes: snapple.likes || 0,
        dislikes: snapple.dislikes || 0,
        buyCount: snapple.buyCount || 0,
        currentPrice: snapple.currentPrice || 10,
        views: (snapple.views || 0) + 1,
      });
      snappleService.incrementViews(snapple.id);

      // Derive interaction state from the snapple's inverse arrays —
      // no Firestore round-trip needed. Both arrays already loaded
      // as part of the snapple prop.
      if (user?.uid) {
        setUserInteraction({
          hasLiked: (snapple.likedBy || []).includes(user.uid),
          hasDisliked: (snapple.dislikedBy || []).includes(user.uid),
          hasPurchased: false,
        });
      }
    }
  }, [snapple?.id, visible]);

  const handlePlayPause = () => {
    if (isPlaying) {
      playerRef.current?.pause();
      setIsPlaying(false);
    } else {
      playerRef.current?.play();
      setIsPlaying(true);
    }
  };

  // Toggle reaction — one entry point handles like / dislike / clear.
  // Optimistic UI: flip local state + counter, then call the batched
  // 2-way service write. On failure, roll back.
  const applyReaction = async (targetType) => {
    const currentType = userInteraction.hasLiked
      ? 'like'
      : userInteraction.hasDisliked
        ? 'dislike'
        : null;
    if (targetType === currentType) return;
    const prevInteraction = userInteraction;
    const prevMetrics = metrics;

    // Compute counter deltas from the transition.
    let dLikes = 0, dDislikes = 0;
    if (currentType === 'like') dLikes -= 1;
    if (currentType === 'dislike') dDislikes -= 1;
    if (targetType === 'like') dLikes += 1;
    if (targetType === 'dislike') dDislikes += 1;

    setUserInteraction(prev => ({
      ...prev,
      hasLiked: targetType === 'like',
      hasDisliked: targetType === 'dislike',
    }));
    setMetrics(prev => ({
      ...prev,
      likes: Math.max(0, prev.likes + dLikes),
      dislikes: Math.max(0, prev.dislikes + dDislikes),
    }));

    try {
      const result = await snappleService.setSnappleReaction(
        snapple.id, user.uid, targetType, currentType,
      );
      if (!result?.success) throw new Error(result?.error || 'reaction failed');
    } catch (e) {
      // Roll back to whatever the state was pre-tap.
      setUserInteraction(prevInteraction);
      setMetrics(prevMetrics);
    }
  };

  const handleLike = () => applyReaction(userInteraction.hasLiked ? null : 'like');
  const handleDislike = () => applyReaction(userInteraction.hasDisliked ? null : 'dislike');

  const handleBuy = () => {
    // Skip the confirm flow entirely if the user already owns this snapple —
    // just tell them. Tap-anywhere-to-dismiss alert (no buttons).
    const alreadyOwned =
      (userCurrency.ownedSnapples || []).includes(snapple.id) ||
      (snapple.owners || []).includes(user?.uid);
    if (alreadyOwned) {
      showAlert('Already Owned', 'You already have this snapple in your collection.', null);
      return;
    }

    showConfirm(
      'Purchase Snapple',
      `Buy this Snapple for ${metrics.currentPrice} coins?`,
      async () => {
        try {
          const result = await onBuy?.(snapple.id);
          if (result?.success) {
            setMetrics(prev => ({
              ...prev,
              buyCount: prev.buyCount + 1,
              currentPrice: result.newPrice || prev.currentPrice,
            }));
            setUserInteraction(prev => ({ ...prev, hasPurchased: true }));
          } else if (result?.error) {
            showError('Purchase Failed', result.error);
          }
        } catch (error) {
          showError('Purchase Failed', error.message || 'Something went wrong');
        }
      }
    );
  };

  const handleReport = () => {
    showConfirm(
      'Report Snapple',
      'Report this content as inappropriate?',
      () => submitReport('inappropriate')
    );
  };

  const submitReport = async (reason) => {
    try {
      await onReport?.(snapple.id, reason);
    } catch (error) {
      // silently fail
    }
  };

  const formatCount = (count) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count?.toString() || '0';
  };

  if (!visible || !snapple) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      {/* Modals render in a portal outside the app's root
          GestureHandlerRootView, so gestures inside need their own
          root to be active. Same pattern PromptCurator uses. */}
      <GestureHandlerRootView style={{ flex: 1 }}>
      <View style={styles.overlay}>
        {/* GestureDetector wraps ONLY the video + tap-to-pause
            layer. If it wrapped the whole screen, the Pan gesture
            would race with the action buttons' Pressables and eat
            their taps — user couldn't hit close / like / delete /
            report / etc. Buttons render as siblings outside the
            gesture so they get touches directly. */}
        <GestureDetector gesture={swipeGesture}>
          <View style={StyleSheet.absoluteFill}>
            <SnappleVideoPlayer
              ref={playerRef}
              snapple={snapple}
              /* Drive mute live from the creator-only toggle's local state so
                 the speaker reacts instantly, before the parent re-fetches
                 the snapple doc. */
              muted={muted}
              style={StyleSheet.absoluteFill}
            />

            {/* Tap to pause/play — behind buttons, ONLY covers the
                video area so it doesn't fight the buttons for taps. */}
            <Pressable style={StyleSheet.absoluteFill} onPress={handlePlayPause}>
              {!isPlaying && (
                <View style={styles.pauseIndicator}>
                  <View style={styles.playIconBg}>
                    <Ionicons name="play" size={40} color="white" />
                  </View>
                </View>
              )}
            </Pressable>
          </View>
        </GestureDetector>

        {/* Close Button - top left */}
        <Pressable style={styles.closeButton} onPress={onClose}>
          <View style={styles.buttonBg}>
            <Ionicons name="close" size={24} color="white" />
          </View>
        </Pressable>

        {/* Action Buttons - right side */}
        <View style={styles.actionsColumn}>
          <View style={styles.actionGroup}>
            <Pressable style={styles.actionButton} onPress={handleLike}>
              <View style={[styles.buttonBg, userInteraction.hasLiked && styles.activeBg]}>
                <Ionicons name="heart" size={20} color={userInteraction.hasLiked ? theme.colors.vibeRed : 'white'} />
              </View>
            </Pressable>
            <Text style={styles.actionCount}>{formatCount(metrics.likes)}</Text>
          </View>

          <View style={styles.actionGroup}>
            <Pressable style={styles.actionButton} onPress={handleDislike}>
              <View style={[styles.buttonBg, userInteraction.hasDisliked && styles.activeBg]}>
                <Ionicons name="thumbs-down" size={19} style={{ marginTop: 3 }} color={userInteraction.hasDisliked ? theme.colors.vibeOrange : 'white'} />
              </View>
            </Pressable>
            <Text style={styles.actionCount}>{formatCount(metrics.dislikes)}</Text>
          </View>

          {/* Buy button — hidden entirely for private snapples since they
              can't be purchased. The creator viewing their own private
              snapple also doesn't see it. */}
          {!isPrivate && (
            <View style={styles.actionGroup}>
              <Pressable style={styles.actionButton} onPress={handleBuy} disabled={userInteraction.hasPurchased}>
                <View style={[styles.buttonBg, userInteraction.hasPurchased && styles.purchasedBg]}>
                  <Ionicons name={userInteraction.hasPurchased ? "checkmark" : "diamond"} size={20} style={{ marginTop: 2 }} color={userInteraction.hasPurchased ? theme.colors.vibeGreen : theme.colors.vibeBlue} />
                </View>
              </Pressable>
              {/* Owned state still surfaces the current price under
                  "Owned" — signals that the snapple has resale value
                  without hiding the number entirely. */}
              {userInteraction.hasPurchased ? (
                <View style={styles.buyLabelStack}>
                  <Text style={[styles.actionCount, styles.ownedLabel]}>Owned</Text>
                  <Text style={styles.ownedPrice}>{metrics.currentPrice}c</Text>
                </View>
              ) : (
                <Text style={styles.actionCount}>{metrics.currentPrice}</Text>
              )}
            </View>
          )}

          <View style={styles.actionGroup}>
            <Pressable style={styles.actionButton} onPress={async () => {
              // Save button is a 2-way toggle. Batched service call
              // updates BOTH user.wishlistedSnapples AND
              // snapple.wishlistedBy atomically; the AuthContext
              // snapshot listener picks up the user-side change and
              // re-renders the button state.
              const wishlisted = (userCurrency.wishlistedSnapples || []).includes(snapple.id);
              await snappleService.setSnappleWishlist(
                snapple.id, user.uid, !wishlisted, wishlisted,
              );
            }}>
              <View style={[styles.buttonBg, (userCurrency.wishlistedSnapples || []).includes(snapple.id) && styles.activeBg]}>
                <Ionicons name={(userCurrency.wishlistedSnapples || []).includes(snapple.id) ? "bookmark" : "bookmark-outline"} size={20} color={(userCurrency.wishlistedSnapples || []).includes(snapple.id) ? theme.colors.vibeYellow : 'white'} />
              </View>
            </Pressable>
            <Text style={styles.actionCount}>{(userCurrency.wishlistedSnapples || []).includes(snapple.id) ? 'Saved' : 'Save'}</Text>
          </View>

          <View style={styles.actionGroup}>
            <Pressable style={styles.actionButton} onPress={async () => {
              try {
                await Share.share({
                  message: `Check out this Snapple by @${snapple.creatorUsername || 'anonymous'}: "${snapple.prompt}"`,
                });
              } catch (e) {}
            }}>
              <View style={styles.buttonBg}>
                <Ionicons name="share-social" size={20} style={{ marginTop: 2, marginLeft: -2 }} color="white" />
              </View>
            </Pressable>
            <Text style={styles.actionCount}>Share</Text>
          </View>

          {(snapple.creatorId === user?.uid || (userCurrency.ownedSnapples || []).includes(snapple.id)) ? (
            <View style={styles.actionGroup}>
              <Pressable style={styles.actionButton} onPress={() => {
                showConfirm(
                  'Discard Snapple',
                  'Remove this snapple from your collection?',
                  async () => {
                    // Remove from user's owned lists
                    const updated = (userCurrency.ownedSnapples || []).filter(id => id !== snapple.id);
                    const updatedCards = (userCurrency.ownedCards || []).filter(id => id !== snapple.id);
                    const discarded = [...(userCurrency.discardedSnapples || []), snapple.id];
                    await updateUserCurrency({ ownedSnapples: updated, ownedCards: updatedCards, discardedSnapples: discarded });
                    // Remove from snapple's owners array
                    try {
                      const { doc, updateDoc, arrayRemove } = await import('firebase/firestore');
                      const { db } = await import('../../../services/firebase');
                      await updateDoc(doc(db, 'snapples', snapple.id), {
                        owners: arrayRemove(user.uid),
                      });
                    } catch (e) {}
                    onClose();
                  }
                );
              }}>
                <View style={styles.buttonBg}>
                  <Ionicons name="ban" size={20} color="white" />
                </View>
              </Pressable>
              <Text style={styles.actionCount}>Discard</Text>
            </View>
          ) : (
            <View style={styles.actionGroup}>
              <Pressable style={styles.actionButton} onPress={handleReport}>
                <View style={styles.buttonBg}>
                  <Ionicons name="flag" size={20} color="white" />
                </View>
              </Pressable>
              <Text style={styles.actionCount}>Report</Text>
            </View>
          )}

          {/* Creator-only: flip private ↔ public anytime. Private hides
              the snapple from public feeds and disables NEW buys; the
              UI confirms first if there are existing buyers (they keep
              their copy — see persistPrivacy / handlePrivacyToggle).
              Optimistic UI: flip the icon first, persist after. */}
          {snapple.creatorId === user?.uid && (
            <View style={styles.actionGroup}>
              <Pressable
                style={styles.actionButton}
                onPress={() => {
                  const next = !isPrivate;
                  // Owners always includes the creator; anyone else in
                  // the array is a paying buyer who's grandfathered in.
                  const buyerCount = (snapple.owners || [])
                    .filter((id) => id !== snapple.creatorId).length;

                  const persistPrivacy = async () => {
                    setIsPrivate(next);
                    const result = await snappleService.setSnapplePrivacy(snapple.id, user.uid, next);
                    if (!result.success) {
                      setIsPrivate(!next);
                      showError('Error', result.error || 'Could not update privacy');
                    }
                  };

                  // Only warn when going PUBLIC → PRIVATE with buyers.
                  // Public-bound flips never need a warning. Mentions
                  // Delete as the alternative for creators whose real
                  // intent is a full takedown, not just "no new buys".
                  if (next && buyerCount > 0) {
                    const noun = buyerCount === 1 ? 'player' : 'players';
                    const verb = buyerCount === 1 ? 'owns' : 'own';
                    showConfirm(
                      'Make Private?',
                      `${buyerCount} ${noun} already ${verb} this. They'll keep their copy — going private just stops new buys and hides it from public feeds.\n\nWant to take it down entirely? Use Delete instead.`,
                      persistPrivacy
                    );
                  } else {
                    persistPrivacy();
                  }
                }}
              >
                <View style={[styles.buttonBg, isPrivate && styles.activeBg]}>
                  <Ionicons
                    name={isPrivate ? 'lock-closed' : 'lock-open'}
                    size={20}
                    color={isPrivate ? theme.colors.vibeYellow : 'white'}
                  />
                </View>
              </Pressable>
              <Text style={styles.actionCount}>{isPrivate ? 'Private' : 'Public'}</Text>
            </View>
          )}

          {/* Creator-only: mute toggle. Applies to ALL playbacks across
              the app (home, game, voting, owners' decks). Useful for
              legacy uploads with background noise or for visual-only
              cards. Optimistic flip, rollback on failure. */}
          {snapple.creatorId === user?.uid && (
            <View style={styles.actionGroup}>
              <Pressable
                style={styles.actionButton}
                onPress={async () => {
                  const next = !muted;
                  setMuted(next);
                  const result = await snappleService.setSnappleMuted(snapple.id, user.uid, next);
                  if (!result.success) {
                    setMuted(!next);
                    showError('Error', result.error || 'Could not update mute');
                  }
                }}
              >
                <View style={[styles.buttonBg, muted && styles.activeBg]}>
                  <Ionicons
                    name={muted ? 'volume-mute' : 'volume-high'}
                    size={20}
                    color={muted ? theme.colors.vibeYellow : 'white'}
                  />
                </View>
              </Pressable>
              <Text style={styles.actionCount}>{muted ? 'Muted' : 'Sound'}</Text>
            </View>
          )}

          {/* Admin-only: pool exclusion. When ON the snapple stops
              showing up in bot picks and in the practice-mode hand
              padding pool. Doesn't affect visibility / ownership /
              marketplace / playability from any owner's own deck —
              purely a quality lever on the auto-pool. Visible to
              admins on any snapple, including snapples they didn't
              create. */}
          {isAdmin && (
            <View style={styles.actionGroup}>
              <Pressable
                style={styles.actionButton}
                onPress={async () => {
                  const next = !excludeFromPool;
                  setExcludeFromPool(next);
                  const result = await snappleService.setSnappleExcludeFromPool(
                    snapple.id,
                    user.uid,
                    next,
                  );
                  if (!result.success) {
                    setExcludeFromPool(!next);
                    showError('Error', result.error || 'Could not update pool exclusion');
                  }
                }}
              >
                <View style={[styles.buttonBg, excludeFromPool && styles.activeBg]}>
                  <Ionicons
                    name={excludeFromPool ? 'eye-off' : 'eye'}
                    size={20}
                    color={excludeFromPool ? theme.colors.vibeRed : 'white'}
                  />
                </View>
              </Pressable>
              <Text style={styles.actionCount}>{excludeFromPool ? 'Pool: Off' : 'Pool: On'}</Text>
            </View>
          )}

          {snapple.creatorId === user?.uid && (
            <View style={styles.actionGroup}>
              <Pressable style={styles.actionButton} onPress={() => {
                showConfirm(
                  'Delete Snapple',
                  'This removes it for everyone. Are you sure?',
                  async () => {
                    const result = await snappleService.deleteSnapple(snapple.id, user.uid);
                    if (result.success) {
                      onClose();
                    }
                  }
                );
              }}>
                <View style={styles.buttonBg}>
                  <Ionicons name="trash" size={20} color="white" />
                </View>
              </Pressable>
              <Text style={styles.actionCount}>Delete</Text>
            </View>
          )}
        </View>

        {/* Creator Info - bottom left */}
        <View style={styles.videoInfo}>
          <Pressable onPress={() => {
            onClose();
            // Own creator → tabbed own-profile; anyone else → the
            // read-only OtherPersonsProfile view.
            if (snapple.creatorId && navigation) {
              const isSelf = snapple.creatorId === user?.uid;
              navigation.navigate(
                isSelf ? 'UserProfile' : 'OtherPersonsProfile',
                { userId: snapple.creatorId },
              );
            }
          }}>
            <Text style={styles.creatorName}>@{snapple.creatorUsername || 'anonymous'}</Text>
          </Pressable>
          <Text style={styles.promptText} numberOfLines={2}>{snapple.prompt}</Text>
          <Text style={styles.viewCount}>{formatCount(metrics.views || 0)} views</Text>
        </View>
      </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: '#000',
  },
  pauseIndicator: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIconBg: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 4,
  },
  closeButton: {
    position: 'absolute',
    top: 20,
    left: 16,
    zIndex: 10,
  },
  buttonBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  activeBg: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  purchasedBg: {
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  // Bottom-anchored column growing upward. Full stack (up to
  // ~8 buttons for creator+admin) fits without clipping the top
  // like/dislike once bottom is at 60.
  actionsColumn: {
    position: 'absolute',
    right: 12,
    bottom: 60,
    alignItems: 'center',
    gap: 12,
    zIndex: 10,
  },
  actionGroup: {
    alignItems: 'center',
  },
  actionButton: {
    marginBottom: 2,
  },
  actionCount: {
    color: 'white',
    fontSize: 11,
    fontWeight: theme.fontWeights.semiBold,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  // Owned-state label stack — "Owned" on top (green) with the
  // current price muted underneath so users still see resale value.
  buyLabelStack: {
    alignItems: 'center',
  },
  ownedLabel: {
    color: theme.colors.vibeGreen,
  },
  ownedPrice: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 10,
    fontWeight: theme.fontWeights.semiBold,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginTop: 1,
  },
  videoInfo: {
    position: 'absolute',
    bottom: 40,
    left: 16,
    right: 80,
    zIndex: 10,
  },
  creatorName: {
    color: 'white',
    fontSize: 16,
    fontWeight: theme.fontWeights.bold,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginBottom: 4,
  },
  promptText: {
    color: 'rgba(255, 255, 255, 0.9)',
    fontSize: 14,
    lineHeight: 18,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
    marginBottom: 4,
  },
  viewCount: {
    color: 'rgba(255, 255, 255, 0.7)',
    fontSize: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
});