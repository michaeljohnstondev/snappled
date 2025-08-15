import { View, Text, StyleSheet, FlatList, Pressable, Dimensions } from 'react-native';
import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import VibeButton from '../../components/ui/VibeButton';
import theme from '../../theme/themes';

const { width: screenWidth } = Dimensions.get('window');
const videoWidth = screenWidth - 32;

// Mock video data (would come from API)
const mockVideos = [
  {
    id: '1',
    username: '@sarah_vibes',
    duration: 8.2,
    likes: 156,
    views: 892,
    isLiked: false,
    thumbnail: null, // Would be video thumbnail
  },
  {
    id: '2', 
    username: '@mike_creative',
    duration: 9.8,
    likes: 234,
    views: 1205,
    isLiked: true,
    thumbnail: null,
  },
  {
    id: '3',
    username: '@dance_queen',
    duration: 10.0,
    likes: 445,
    views: 2103,
    isLiked: false,
    thumbnail: null,
  },
  {
    id: '4',
    username: '@funny_guy',
    duration: 7.5,
    likes: 89,
    views: 456,
    isLiked: false,
    thumbnail: null,
  },
  {
    id: '5',
    username: '@creative_soul',
    duration: 9.1,
    likes: 312,
    views: 1876,
    isLiked: true,
    thumbnail: null,
  }
];

export default function FeedScreen({ navigation }) {
  const [videos, setVideos] = useState(mockVideos);
  const [currentIndex, setCurrentIndex] = useState(0);

  // Get current prompt for context
  const getCurrentPrompt = () => {
    const now = new Date();
    const hourIndex = now.getHours();
    const prompts = [
      "What's the weirdest thing you've ever eaten?",
      "Show your best dance move in 10 seconds.",
      "Impersonate your favorite celebrity.",
    ];
    return prompts[hourIndex % prompts.length];
  };

  const [currentPrompt] = useState(getCurrentPrompt());

  const toggleLike = (videoId) => {
    setVideos(prevVideos => 
      prevVideos.map(video => 
        video.id === videoId 
          ? { 
              ...video, 
              isLiked: !video.isLiked,
              likes: video.isLiked ? video.likes - 1 : video.likes + 1
            }
          : video
      )
    );
  };

  const handleCreateVideo = () => {
    navigation.navigate('VideoRecord');
  };

  const renderVideoItem = ({ item, index }) => (
    <View style={styles.videoContainer}>
      {/* Video Placeholder (would be actual video player) */}
      <View style={styles.videoPlaceholder}>
        <LinearGradient
          colors={[theme.colors.vibeBlue, theme.colors.vibePurple]}
          style={styles.videoGradient}
        >
          <Ionicons name="play-circle" size={64} color="rgba(255,255,255,0.8)" />
          <Text style={styles.placeholderText}>Tap to play video</Text>
        </LinearGradient>
      </View>

      {/* Video Info Overlay */}
      <View style={styles.videoInfo}>
        <View style={styles.videoHeader}>
          <Text style={styles.username}>{item.username}</Text>
          <Text style={styles.duration}>{item.duration}s</Text>
        </View>

        <View style={styles.videoStats}>
          <View style={styles.statItem}>
            <Ionicons name="eye" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.statText}>{item.views}</Text>
          </View>
          
          <Pressable 
            onPress={() => toggleLike(item.id)}
            style={styles.likeButton}
          >
            <Ionicons 
              name={item.isLiked ? "heart" : "heart-outline"} 
              size={18} 
              color={item.isLiked ? theme.colors.vibePink : theme.colors.textSecondary} 
            />
            <Text style={[styles.statText, item.isLiked && { color: theme.colors.vibePink }]}>
              {item.likes}
            </Text>
          </Pressable>
        </View>
      </View>
    </View>
  );

  return (
    <LinearGradient
      colors={theme.colors.backgroundGradient}
      style={styles.container}
    >
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="chevron-back" size={24} color={theme.colors.textPrimary} />
        </Pressable>
        <Text style={styles.headerTitle}>Video Feed</Text>
        <Pressable onPress={handleCreateVideo} style={styles.createButton}>
          <Ionicons name="add-circle" size={24} color={theme.colors.vibeGreen} />
        </Pressable>
      </View>

      {/* Current Prompt Info */}
      <View style={styles.promptInfo}>
        <Text style={styles.promptLabel}>Current Prompt:</Text>
        <Text style={styles.promptText}>{currentPrompt}</Text>
      </View>

      {/* Video Feed */}
      <FlatList
        data={videos}
        keyExtractor={(item) => item.id}
        renderItem={renderVideoItem}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.feedContainer}
        ItemSeparatorComponent={() => <View style={styles.separator} />}
        ListFooterComponent={() => (
          <View style={styles.footerContainer}>
            <Text style={styles.footerText}>
              That&apos;s all for now! Check back soon for new videos.
            </Text>
            <VibeButton
              label="Create Your Video"
              onPress={handleCreateVideo}
              style={styles.createVideoButton}
            />
          </View>
        )}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingTop: 60,
    paddingHorizontal: 24,
    paddingBottom: 20,
  },
  backButton: {
    padding: 8,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    ...theme.shadows?.textGlow,
  },
  createButton: {
    padding: 8,
  },
  promptInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    marginHorizontal: 16,
    padding: 16,
    borderRadius: 12,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: theme.colors.vibeBlue,
  },
  promptLabel: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '600',
    marginBottom: 4,
    textTransform: 'uppercase',
    letterSpacing: 1,
  },
  promptText: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    fontWeight: '500',
    lineHeight: 22,
  },
  feedContainer: {
    paddingHorizontal: 16,
    paddingBottom: 32,
  },
  videoContainer: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
  },
  videoPlaceholder: {
    width: videoWidth,
    height: videoWidth * 0.75, // 4:3 aspect ratio
  },
  videoGradient: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  placeholderText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 16,
    fontWeight: '500',
    marginTop: 12,
  },
  videoInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    background: 'linear-gradient(transparent, rgba(0,0,0,0.8))',
    padding: 16,
  },
  videoHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  username: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  duration: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 14,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  videoStats: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  likeButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: '500',
  },
  separator: {
    height: 20,
  },
  footerContainer: {
    alignItems: 'center',
    padding: 32,
  },
  footerText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  createVideoButton: {
    backgroundColor: theme.colors.vibeGreen,
    paddingHorizontal: 32,
  },
});