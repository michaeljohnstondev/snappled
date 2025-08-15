import React, { useState, useRef, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Alert,
  Animated,
  Dimensions
} from 'react-native';
import { Video } from 'expo-video';
import { LinearGradient } from 'expo-linear-gradient';
import CurrencyDisplay from '../currency/CurrencyDisplay';
import PurchaseModal from '../currency/PurchaseModal';
import CommentSection from '../social/CommentSection';
import theme from '../../theme/themes';
import { snappleService } from '../../services/snappleService';
import { currencyService } from '../../services/currencyService';
import { auth } from '../../services/firebase';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function SnappleVideoPlayer({ 
  snapple,
  userCurrency = {},
  onSnappleUpdate,
  style 
}) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [userInteraction, setUserInteraction] = useState({ hasLiked: false, hasDisliked: false });
  const [isWishlisted, setIsWishlisted] = useState(false);
  const [showPurchaseModal, setShowPurchaseModal] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [isLoading, setIsLoading] = useState({});
  
  const videoRef = useRef(null);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const hideControlsTimer = useRef(null);

  useEffect(() => {
    loadUserInteractions();
  }, [snapple.id]);

  useEffect(() => {
    if (isPlaying && showControls) {
      resetHideControlsTimer();
    } else {
      clearHideControlsTimer();
    }
  }, [isPlaying, showControls]);

  async function loadUserInteractions() {
    if (!auth.currentUser) return;
    
    try {
      const interaction = await snappleService.getUserInteraction(snapple.id, auth.currentUser.uid);
      setUserInteraction(interaction);
      
      // Check if wishlisted
      const wishlisted = userCurrency.wishlistedSnapples?.includes(snapple.id) || false;
      setIsWishlisted(wishlisted);
    } catch (error) {
      console.error('Error loading user interactions:', error);
    }
  }

  function resetHideControlsTimer() {
    clearHideControlsTimer();
    hideControlsTimer.current = setTimeout(() => {
      hideControls();
    }, 3000);
  }

  function clearHideControlsTimer() {
    if (hideControlsTimer.current) {
      clearTimeout(hideControlsTimer.current);
      hideControlsTimer.current = null;
    }
  }

  function showControlsTemporarily() {
    setShowControls(true);
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    
    if (isPlaying) {
      resetHideControlsTimer();
    }
  }

  function hideControls() {
    Animated.timing(controlsOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => {
      setShowControls(false);
    });
  }

  function handleVideoPress() {
    if (!showControls) {
      showControlsTemporarily();
    } else {
      togglePlayPause();
    }
  }

  function togglePlayPause() {
    if (isPlaying) {
      videoRef.current?.pause();
      setIsPlaying(false);
      clearHideControlsTimer();
    } else {
      videoRef.current?.play();
      setIsPlaying(true);
      resetHideControlsTimer();
    }
  }

  async function handleLike() {
    if (!auth.currentUser || isLoading.like) return;
    
    setIsLoading(prev => ({ ...prev, like: true }));
    
    try {
      const result = await snappleService.likeSnapple(snapple.id, auth.currentUser.uid);
      
      if (result.success) {
        setUserInteraction({ hasLiked: true, hasDisliked: false });
        onSnappleUpdate?.({
          ...snapple,
          likes: userInteraction.hasLiked ? snapple.likes : snapple.likes + 1,
          dislikes: userInteraction.hasDisliked ? snapple.dislikes - 1 : snapple.dislikes,
          totalVotes: userInteraction.hasDisliked ? snapple.totalVotes : snapple.totalVotes + 1
        });
      } else {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to like snapple');
    } finally {
      setIsLoading(prev => ({ ...prev, like: false }));
    }
  }

  async function handleDislike() {
    if (!auth.currentUser || isLoading.dislike) return;
    
    setIsLoading(prev => ({ ...prev, dislike: true }));
    
    try {
      const result = await snappleService.dislikeSnapple(snapple.id, auth.currentUser.uid);
      
      if (result.success) {
        setUserInteraction({ hasLiked: false, hasDisliked: true });
        onSnappleUpdate?.({
          ...snapple,
          likes: userInteraction.hasLiked ? snapple.likes - 1 : snapple.likes,
          dislikes: userInteraction.hasDisliked ? snapple.dislikes : snapple.dislikes + 1,
          totalVotes: userInteraction.hasLiked ? snapple.totalVotes : snapple.totalVotes + 1
        });
      } else {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to dislike snapple');
    } finally {
      setIsLoading(prev => ({ ...prev, dislike: false }));
    }
  }

  async function handleWishlist() {
    if (!auth.currentUser || isLoading.wishlist) return;
    
    setIsLoading(prev => ({ ...prev, wishlist: true }));
    
    try {
      let result;
      if (isWishlisted) {
        result = await snappleService.removeFromWishlist(snapple.id, auth.currentUser.uid);
      } else {
        result = await snappleService.addToWishlist(snapple.id, auth.currentUser.uid);
      }
      
      if (result.success) {
        setIsWishlisted(!isWishlisted);
        onSnappleUpdate?.({
          ...snapple,
          wishlistCount: isWishlisted ? snapple.wishlistCount - 1 : snapple.wishlistCount + 1
        });
      } else {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to update wishlist');
    } finally {
      setIsLoading(prev => ({ ...prev, wishlist: false }));
    }
  }

  function handleReport() {
    Alert.alert(
      'Report Snapple',
      'Why are you reporting this content?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Inappropriate Content', onPress: () => submitReport('inappropriate') },
        { text: 'Spam', onPress: () => submitReport('spam') },
        { text: 'Copyright Violation', onPress: () => submitReport('copyright') },
        { text: 'Other', onPress: () => submitReport('other') },
      ]
    );
  }

  async function submitReport(reason) {
    if (!auth.currentUser) return;
    
    try {
      const result = await snappleService.reportSnapple(snapple.id, auth.currentUser.uid, reason);
      
      if (result.success) {
        Alert.alert('Report Submitted', 'Thank you for helping keep Snapple Park safe. We\'ll review this content.');
      } else {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to submit report');
    }
  }

  function handlePurchase() {
    if (!auth.currentUser) {
      Alert.alert('Login Required', 'Please log in to purchase Snapples');
      return;
    }
    
    if (userCurrency.ownedSnapples?.includes(snapple.id)) {
      Alert.alert('Already Owned', 'You already own this Snapple!');
      return;
    }
    
    setShowPurchaseModal(true);
  }

  function handlePurchaseComplete(result) {
    onSnappleUpdate?.({
      ...snapple,
      buyCount: snapple.buyCount + 1,
      currentPrice: result.newPrice
    });
  }

  const isOwned = userCurrency.ownedSnapples?.includes(snapple.id);

  return (
    <View style={[styles.container, style]}>
      <TouchableOpacity 
        style={styles.videoContainer} 
        activeOpacity={1}
        onPress={handleVideoPress}
      >
        <Video
          ref={videoRef}
          source={{ uri: snapple.videoUrl }}
          style={styles.video}
          isLooping
          shouldPlay={isPlaying}
          isMuted={false}
          resizeMode="cover"
        />
        
        {/* Video Overlay Controls */}
        <Animated.View 
          style={[styles.overlay, { opacity: controlsOpacity }]}
          pointerEvents={showControls ? 'auto' : 'none'}
        >
          {/* Top Info Bar */}
          <LinearGradient
            colors={['rgba(0,0,0,0.7)', 'transparent']}
            style={styles.topGradient}
          >
            <View style={styles.topInfo}>
              <View style={styles.creatorInfo}>
                <Text style={styles.creatorName}>@{snapple.creatorName || 'Unknown'}</Text>
                <Text style={styles.prompt}>{snapple.prompt}</Text>
              </View>
              <TouchableOpacity onPress={handleReport} style={styles.reportButton}>
                <Text style={styles.reportIcon}>⚠️</Text>
              </TouchableOpacity>
            </View>
          </LinearGradient>

          {/* Center Play/Pause Button */}
          <TouchableOpacity style={styles.playButton} onPress={togglePlayPause}>
            <Text style={styles.playIcon}>{isPlaying ? '⏸️' : '▶️'}</Text>
          </TouchableOpacity>

          {/* Bottom Controls */}
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.8)']}
            style={styles.bottomGradient}
          >
            <View style={styles.bottomControls}>
              {/* Engagement Stats */}
              <View style={styles.statsRow}>
                <Text style={styles.statText}>👍 {snapple.likes}</Text>
                <Text style={styles.statText}>👎 {snapple.dislikes}</Text>
                <Text style={styles.statText}>🛒 {snapple.buyCount}</Text>
                <Text style={styles.statText}>⭐ {snapple.wishlistCount}</Text>
              </View>

              {/* Action Buttons */}
              <View style={styles.actionButtons}>
                {/* Like/Dislike */}
                <TouchableOpacity 
                  style={[styles.actionButton, userInteraction.hasLiked && styles.activeButton]}
                  onPress={handleLike}
                  disabled={isLoading.like}
                >
                  <Text style={styles.actionIcon}>👍</Text>
                </TouchableOpacity>

                <TouchableOpacity 
                  style={[styles.actionButton, userInteraction.hasDisliked && styles.activeButton]}
                  onPress={handleDislike}
                  disabled={isLoading.dislike}
                >
                  <Text style={styles.actionIcon}>👎</Text>
                </TouchableOpacity>

                {/* Wishlist */}
                <TouchableOpacity 
                  style={[styles.actionButton, isWishlisted && styles.activeButton]}
                  onPress={handleWishlist}
                  disabled={isLoading.wishlist}
                >
                  <Text style={styles.actionIcon}>{isWishlisted ? '⭐' : '☆'}</Text>
                </TouchableOpacity>

                {/* Purchase Button */}
                <TouchableOpacity 
                  style={[
                    styles.purchaseButton, 
                    isOwned && styles.ownedButton
                  ]}
                  onPress={handlePurchase}
                  disabled={isOwned}
                >
                  <Text style={styles.purchaseText}>
                    {isOwned ? 'OWNED' : `🪙 ${snapple.currentPrice || 10}`}
                  </Text>
                </TouchableOpacity>

                {/* Comment Button */}
                <TouchableOpacity 
                  style={styles.actionButton}
                  onPress={() => setShowComments(true)}
                >
                  <Text style={styles.actionIcon}>💬</Text>
                </TouchableOpacity>
              </View>
            </View>
          </LinearGradient>
        </Animated.View>
      </TouchableOpacity>

      {/* Purchase Modal */}
      <PurchaseModal
        visible={showPurchaseModal}
        onClose={() => setShowPurchaseModal(false)}
        type="snapple"
        snappleData={{
          id: snapple.id,
          prompt: snapple.prompt,
          creatorName: snapple.creatorName,
          currentPrice: snapple.currentPrice || 10,
          likes: snapple.likes,
          dislikes: snapple.dislikes,
          buyCount: snapple.buyCount
        }}
        userCurrency={{
          userId: auth.currentUser?.uid,
          ...userCurrency
        }}
        onPurchaseComplete={handlePurchaseComplete}
      />

      {/* Comment Section */}
      <CommentSection
        visible={showComments}
        onClose={() => setShowComments(false)}
        snappleId={snapple.id}
        snappleTitle={snapple.prompt}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
    aspectRatio: 9/16, // TikTok-style aspect ratio
    backgroundColor: '#000',
    borderRadius: theme.sizes.borderRadius || 12,
    overflow: 'hidden',
  },
  videoContainer: {
    flex: 1,
    position: 'relative',
  },
  video: {
    flex: 1,
    width: '100%',
    height: '100%',
  },
  overlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'space-between',
  },
  topGradient: {
    paddingTop: 40,
    paddingHorizontal: 16,
    paddingBottom: 20,
  },
  topInfo: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  creatorInfo: {
    flex: 1,
  },
  creatorName: {
    color: 'white',
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    ...theme.shadows?.textGlow,
  },
  prompt: {
    color: 'white',
    fontSize: 14,
    opacity: 0.9,
    lineHeight: 18,
  },
  reportButton: {
    padding: 8,
  },
  reportIcon: {
    fontSize: 20,
  },
  playButton: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: [{ translateX: -30 }, { translateY: -30 }],
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: 'rgba(255,255,255,0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  playIcon: {
    fontSize: 24,
    color: 'white',
  },
  bottomGradient: {
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 40,
  },
  bottomControls: {
    gap: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
  },
  statText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '500',
    opacity: 0.9,
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    gap: 8,
  },
  actionButton: {
    padding: 12,
    borderRadius: 25,
    backgroundColor: 'rgba(255,255,255,0.2)',
    minWidth: 50,
    alignItems: 'center',
  },
  activeButton: {
    backgroundColor: theme.colors.primary,
  },
  actionIcon: {
    fontSize: 18,
  },
  purchaseButton: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 20,
    backgroundColor: theme.colors.primary,
    minWidth: 80,
    alignItems: 'center',
  },
  ownedButton: {
    backgroundColor: theme.colors.success || '#4ade80',
  },
  purchaseText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },
});