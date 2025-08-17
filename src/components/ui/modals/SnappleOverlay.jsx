import React, { useState, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  Pressable, 
  Dimensions, 
  ScrollView,
  Alert
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import SnappleVideoPlayer from '../../media/SnappleVideoPlayer';
import VibeButton from '../VibeButton';
import CommentSection from '../../comments/CommentSection';
import { useAuth } from '../../../store/AuthContext';
import theme from '../../../theme/themes';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

export default function SnappleOverlay({ 
  visible, 
  snapple, 
  onClose, 
  onLike, 
  onDislike, 
  onBuy, 
  onReport 
}) {
  const { user } = useAuth();
  const [isPlaying, setIsPlaying] = useState(false);
  const [showComments, setShowComments] = useState(false);
  const [userInteraction, setUserInteraction] = useState({
    hasLiked: false,
    hasDisliked: false,
    hasPurchased: false
  });

  const handlePlayPause = () => {
    setIsPlaying(!isPlaying);
  };

  const handleLike = async () => {
    if (userInteraction.hasLiked) return;
    
    try {
      await onLike?.(snapple.id);
      setUserInteraction(prev => ({
        ...prev,
        hasLiked: true,
        hasDisliked: false
      }));
    } catch (error) {
      Alert.alert('Error', 'Failed to like Snapple');
    }
  };

  const handleDislike = async () => {
    if (userInteraction.hasDisliked) return;
    
    try {
      await onDislike?.(snapple.id);
      setUserInteraction(prev => ({
        ...prev,
        hasDisliked: true,
        hasLiked: false
      }));
    } catch (error) {
      Alert.alert('Error', 'Failed to dislike Snapple');
    }
  };

  const handleBuy = () => {
    Alert.alert(
      'Purchase Snapple',
      `Buy this Snapple for ${snapple?.currentPrice || 10} coins?`,
      [
        { text: 'Cancel', style: 'cancel' },
        { 
          text: 'Buy', 
          onPress: async () => {
            try {
              await onBuy?.(snapple.id);
              setUserInteraction(prev => ({ ...prev, hasPurchased: true }));
              Alert.alert('Success!', 'Snapple purchased and added to your deck!');
            } catch (error) {
              Alert.alert('Error', 'Purchase failed. Please try again.');
            }
          }
        }
      ]
    );
  };

  const handleReport = () => {
    Alert.alert(
      'Report Snapple',
      'Why are you reporting this content?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Inappropriate', onPress: () => submitReport('inappropriate') },
        { text: 'Spam', onPress: () => submitReport('spam') },
        { text: 'Copyright', onPress: () => submitReport('copyright') },
        { text: 'Other', onPress: () => submitReport('other') }
      ]
    );
  };

  const submitReport = async (reason) => {
    try {
      await onReport?.(snapple.id, reason);
      Alert.alert('Reported', 'Thank you for your report. We\'ll review this content.');
    } catch (error) {
      Alert.alert('Error', 'Failed to submit report');
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
      presentationStyle="overFullScreen"
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        {/* Video Section */}
        <View style={styles.videoSection}>
          <SnappleVideoPlayer
            videoUrl={snapple.videoUrl}
            isPlaying={isPlaying}
            onPlayPause={handlePlayPause}
            style={styles.videoPlayer}
          />

          {/* Video Controls */}
          <View style={styles.videoControls}>
            <Pressable style={styles.closeButton} onPress={onClose}>
              <BlurView intensity={20} style={styles.controlBlur}>
                <Ionicons name="close" size={24} color="white" />
              </BlurView>
            </Pressable>

            <Pressable style={styles.playButton} onPress={handlePlayPause}>
              <BlurView intensity={20} style={styles.playBlur}>
                <Ionicons 
                  name={isPlaying ? "pause" : "play"} 
                  size={32} 
                  color="white" 
                />
              </BlurView>
            </Pressable>
          </View>

          {/* Video Info Overlay */}
          <View style={styles.videoInfo}>
            <BlurView intensity={40} style={styles.infoBlur}>
              <Text style={styles.creatorName}>
                @{snapple.creatorUsername || 'anonymous'}
              </Text>
              <Text style={styles.promptText} numberOfLines={2}>
                {snapple.prompt}
              </Text>
            </BlurView>
          </View>
        </View>

        {/* Actions Section */}
        <View style={styles.actionsSection}>
          <ScrollView style={styles.actionsScroll} showsVerticalScrollIndicator={false}>
            {/* Like/Dislike */}
            <View style={styles.actionGroup}>
              <Pressable 
                style={[styles.actionButton, userInteraction.hasLiked && styles.activeAction]}
                onPress={handleLike}
              >
                <LinearGradient
                  colors={userInteraction.hasLiked ? 
                    [theme.colors.vibePink, theme.colors.vibeOrange] : 
                    ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']
                  }
                  style={styles.actionGradient}
                >
                  <Ionicons 
                    name="heart" 
                    size={24} 
                    color={userInteraction.hasLiked ? "white" : theme.colors.textSecondary} 
                  />
                </LinearGradient>
              </Pressable>
              <Text style={styles.actionCount}>{formatCount(snapple.likes)}</Text>
            </View>

            <View style={styles.actionGroup}>
              <Pressable 
                style={[styles.actionButton, userInteraction.hasDisliked && styles.activeAction]}
                onPress={handleDislike}
              >
                <LinearGradient
                  colors={userInteraction.hasDisliked ? 
                    [theme.colors.vibeOrange, theme.colors.vibePink] : 
                    ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']
                  }
                  style={styles.actionGradient}
                >
                  <Ionicons 
                    name="thumbs-down" 
                    size={24} 
                    color={userInteraction.hasDisliked ? "white" : theme.colors.textSecondary} 
                  />
                </LinearGradient>
              </Pressable>
              <Text style={styles.actionCount}>{formatCount(snapple.dislikes)}</Text>
            </View>

            {/* Buy */}
            <View style={styles.actionGroup}>
              <Pressable 
                style={[styles.actionButton, userInteraction.hasPurchased && styles.purchasedAction]}
                onPress={handleBuy}
                disabled={userInteraction.hasPurchased}
              >
                <LinearGradient
                  colors={userInteraction.hasPurchased ? 
                    [theme.colors.vibeGreen, theme.colors.vibeBlue] :
                    [theme.colors.vibeYellow, theme.colors.vibeOrange]
                  }
                  style={styles.actionGradient}
                >
                  <Ionicons 
                    name={userInteraction.hasPurchased ? "checkmark" : "diamond"} 
                    size={24} 
                    color="white" 
                  />
                </LinearGradient>
              </Pressable>
              <Text style={styles.actionCount}>
                {userInteraction.hasPurchased ? 'Owned' : `${snapple.currentPrice || 10}`}
              </Text>
            </View>

            {/* Comments */}
            <View style={styles.actionGroup}>
              <Pressable 
                style={[styles.actionButton, showComments && styles.activeAction]}
                onPress={() => setShowComments(!showComments)}
              >
                <LinearGradient
                  colors={showComments ? 
                    [theme.colors.vibeBlue, theme.colors.vibeGreen] : 
                    ['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']
                  }
                  style={styles.actionGradient}
                >
                  <Ionicons 
                    name="chatbubble" 
                    size={24} 
                    color={showComments ? "white" : theme.colors.textSecondary} 
                  />
                </LinearGradient>
              </Pressable>
              <Text style={styles.actionCount}>
                {formatCount(snapple.commentCount || 0)}
              </Text>
            </View>

            {/* Report */}
            <View style={styles.actionGroup}>
              <Pressable style={styles.actionButton} onPress={handleReport}>
                <LinearGradient
                  colors={['rgba(255,255,255,0.1)', 'rgba(255,255,255,0.05)']}
                  style={styles.actionGradient}
                >
                  <Ionicons name="flag" size={20} color={theme.colors.textSecondary} />
                </LinearGradient>
              </Pressable>
              <Text style={styles.actionCount}>Report</Text>
            </View>

            {/* Comments Section */}
            {showComments && (
              <View style={styles.commentsContainer}>
                <CommentSection
                  snappleId={snapple.id}
                  currentUserId={user?.uid}
                />
              </View>
            )}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: 'black',
  },
  videoSection: {
    flex: 1,
    position: 'relative',
  },
  videoPlayer: {
    flex: 1,
  },
  videoControls: {
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
    borderRadius: 22,
    overflow: 'hidden',
  },
  playButton: {
    width: 64,
    height: 64,
    borderRadius: 32,
    overflow: 'hidden',
    position: 'absolute',
    left: '50%',
    marginLeft: -32,
  },
  controlBlur: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  playBlur: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  videoInfo: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 100,
    borderRadius: 12,
    overflow: 'hidden',
  },
  infoBlur: {
    padding: 16,
  },
  creatorName: {
    color: 'white',
    fontSize: 16,
    fontWeight: theme.fontWeights.bold,
    marginBottom: 4,
  },
  promptText: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 14,
    lineHeight: 18,
  },
  actionsSection: {
    width: 80,
    backgroundColor: 'rgba(0,0,0,0.8)',
    paddingTop: 60,
  },
  actionsScroll: {
    flex: 1,
  },
  actionGroup: {
    alignItems: 'center',
    marginBottom: 24,
    paddingHorizontal: 12,
  },
  actionButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    overflow: 'hidden',
    marginBottom: 6,
  },
  activeAction: {
    transform: [{ scale: 1.1 }],
  },
  purchasedAction: {
    opacity: 0.7,
  },
  actionGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionCount: {
    color: 'white',
    fontSize: 10,
    fontWeight: theme.fontWeights.medium,
    textAlign: 'center',
  },
  commentsContainer: {
    marginTop: 16,
    paddingHorizontal: 12,
    maxHeight: 200,
  },
});