import React, { useState, useRef } from 'react';
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
import SnappleVideoPlayer from '../../media/SnappleVideoPlayer';
import { useAuth } from '../../../store/AuthContext';
import { useModal } from '../../../store/ModalContext';
import { snappleService } from '../../../services/snappleService';
import theme from '../../../theme/themes';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function SnappleOverlay({ 
  visible, 
  snapple, 
  onClose,
  onLike,
  onDislike,
  onBuy,
  onReport,
  navigation
}) {
  const { user, userCurrency, updateUserCurrency } = useAuth();
  const { showConfirm, showError, showAlert } = useModal();
  const playerRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(true);
  const [showComments, setShowComments] = useState(false);
  const [metrics, setMetrics] = useState({
    likes: snapple?.likes || 0,
    dislikes: snapple?.dislikes || 0,
    buyCount: snapple?.buyCount || 0,
    currentPrice: snapple?.currentPrice || 10,
  });
  const [userInteraction, setUserInteraction] = useState({
    hasLiked: false,
    hasDisliked: false,
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

      // Load existing interaction state
      if (user?.uid) {
        snappleService.getUserInteraction(snapple.id, user.uid).then((interaction) => {
          setUserInteraction({
            hasLiked: interaction.hasLiked,
            hasDisliked: interaction.hasDisliked,
            hasPurchased: false,
          });
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

  const handleLike = async () => {
    const wasLiked = userInteraction.hasLiked;
    const wasDisliked = userInteraction.hasDisliked;

    if (wasLiked) {
      // Unlike
      setMetrics(prev => ({ ...prev, likes: prev.likes - 1 }));
      setUserInteraction(prev => ({ ...prev, hasLiked: false }));
      try {
        await snappleService.unlikeSnapple(snapple.id, user.uid);
      } catch (error) {
        setMetrics(prev => ({ ...prev, likes: prev.likes + 1 }));
        setUserInteraction(prev => ({ ...prev, hasLiked: true }));
      }
    } else {
      // Like
      setMetrics(prev => ({
        ...prev,
        likes: prev.likes + 1,
        dislikes: wasDisliked ? prev.dislikes - 1 : prev.dislikes,
      }));
      setUserInteraction(prev => ({ ...prev, hasLiked: true, hasDisliked: false }));
      try {
        await onLike?.(snapple.id);
      } catch (error) {
        setMetrics(prev => ({
          ...prev,
          likes: prev.likes - 1,
          dislikes: wasDisliked ? prev.dislikes + 1 : prev.dislikes,
        }));
        setUserInteraction(prev => ({ ...prev, hasLiked: false, hasDisliked: wasDisliked }));
      }
    }
  };

  const handleDislike = async () => {
    const wasDisliked = userInteraction.hasDisliked;
    const wasLiked = userInteraction.hasLiked;

    if (wasDisliked) {
      // Undislike
      setMetrics(prev => ({ ...prev, dislikes: prev.dislikes - 1 }));
      setUserInteraction(prev => ({ ...prev, hasDisliked: false }));
      try {
        await snappleService.unlikeSnapple(snapple.id, user.uid);
      } catch (error) {
        setMetrics(prev => ({ ...prev, dislikes: prev.dislikes + 1 }));
        setUserInteraction(prev => ({ ...prev, hasDisliked: true }));
      }
    } else {
      // Dislike
      setMetrics(prev => ({
        ...prev,
        dislikes: prev.dislikes + 1,
        likes: wasLiked ? prev.likes - 1 : prev.likes,
      }));
      setUserInteraction(prev => ({ ...prev, hasDisliked: true, hasLiked: false }));
      try {
        await onDislike?.(snapple.id);
      } catch (error) {
        setMetrics(prev => ({
          ...prev,
          dislikes: prev.dislikes - 1,
          likes: wasLiked ? prev.likes + 1 : prev.likes,
        }));
        setUserInteraction(prev => ({ ...prev, hasDisliked: false, hasLiked: wasLiked }));
      }
    }
  };

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
      <View style={styles.overlay}>
        {/* Full Screen Video */}
        <SnappleVideoPlayer
          ref={playerRef}
          snapple={snapple}
          style={StyleSheet.absoluteFill}
        />

        {/* Tap to pause/play - covers entire screen behind buttons */}
        <Pressable style={StyleSheet.absoluteFill} onPress={handlePlayPause}>
          {!isPlaying && (
            <View style={styles.pauseIndicator}>
              <View style={styles.playIconBg}>
                <Ionicons name="play" size={40} color="white" />
              </View>
            </View>
          )}
        </Pressable>

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
              <Text style={styles.actionCount}>{userInteraction.hasPurchased ? 'Owned' : `${metrics.currentPrice}`}</Text>
            </View>
          )}

          <View style={styles.actionGroup}>
            <Pressable style={styles.actionButton} onPress={async () => {
              const wishlisted = (userCurrency.wishlistedSnapples || []).includes(snapple.id);
              if (wishlisted) {
                await snappleService.removeFromWishlist(user.uid, snapple.id);
                await updateUserCurrency({ wishlistedSnapples: (userCurrency.wishlistedSnapples || []).filter(id => id !== snapple.id) });
              } else {
                await snappleService.addToWishlist(user.uid, snapple.id);
                await updateUserCurrency({ wishlistedSnapples: [...(userCurrency.wishlistedSnapples || []), snapple.id] });
              }
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
            if (snapple.creatorId && navigation) {
              navigation.navigate('UserProfile', { userId: snapple.creatorId });
            }
          }}>
            <Text style={styles.creatorName}>@{snapple.creatorUsername || 'anonymous'}</Text>
          </Pressable>
          <Text style={styles.promptText} numberOfLines={2}>{snapple.prompt}</Text>
          <Text style={styles.viewCount}>{formatCount(metrics.views || 0)} views</Text>
        </View>
      </View>
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
  actionsColumn: {
    position: 'absolute',
    right: 12,
    bottom: 120,
    alignItems: 'center',
    gap: 16,
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