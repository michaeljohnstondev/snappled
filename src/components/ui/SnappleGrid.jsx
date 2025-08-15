import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Dimensions, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../theme/themes';

const { width: screenWidth } = Dimensions.get('window');
const ITEM_SIZE = (screenWidth - 60) / 2; // 2 columns with padding

export default function SnappleGrid({ snapples, onSnapplePress, refreshing, onRefresh }) {
  const [selectedSnapple, setSelectedSnapple] = useState(null);

  const handleSnapplePress = (snapple) => {
    setSelectedSnapple(snapple);
    onSnapplePress?.(snapple);
  };

  const formatTimeAgo = (timestamp) => {
    if (!timestamp) return 'just now';
    
    const now = new Date();
    const created = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diff = now - created;
    
    const seconds = Math.floor(diff / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'just now';
  };

  const formatCount = (count) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count.toString();
  };

  const getEngagementColor = (likes, dislikes) => {
    const total = likes + dislikes;
    if (total === 0) return theme.colors.textSecondary;
    
    const ratio = likes / total;
    if (ratio >= 0.8) return theme.colors.vibeGreen;
    if (ratio >= 0.6) return theme.colors.vibeYellow;
    if (ratio >= 0.4) return theme.colors.vibeOrange;
    return theme.colors.vibePink;
  };

  const renderSnappleItem = ({ item, index }) => {
    const engagementColor = getEngagementColor(item.likes || 0, item.dislikes || 0);
    const isSelected = selectedSnapple?.id === item.id;

    return (
      <Pressable
        style={[styles.snappleItem, isSelected && styles.selectedItem]}
        onPress={() => handleSnapplePress(item)}
      >
        <View style={styles.videoContainer}>
          {/* Video Thumbnail - You might want to generate/store thumbnails */}
          <View style={styles.thumbnailPlaceholder}>
            <LinearGradient
              colors={[theme.colors.vibeBackgroundPurple, theme.colors.vibeBackgroundBlue]}
              style={styles.thumbnailGradient}
            >
              <Ionicons name="play-circle" size={32} color="white" />
            </LinearGradient>
          </View>

          {/* Video Duration Badge */}
          <View style={styles.durationBadge}>
            <Text style={styles.durationText}>0:{Math.floor(Math.random() * 60).toString().padStart(2, '0')}</Text>
          </View>

          {/* Engagement Indicator */}
          <View style={[styles.engagementIndicator, { backgroundColor: engagementColor }]} />
        </View>

        <View style={styles.snappleInfo}>
          {/* Creator */}
          <Text style={styles.creatorText} numberOfLines={1}>
            @{item.creatorUsername || 'anonymous'}
          </Text>

          {/* Stats Row */}
          <View style={styles.statsRow}>
            <View style={styles.stat}>
              <Ionicons name="heart" size={12} color={theme.colors.vibePink} />
              <Text style={styles.statText}>{formatCount(item.likes || 0)}</Text>
            </View>

            <View style={styles.stat}>
              <Ionicons name="eye" size={12} color={theme.colors.vibeBlue} />
              <Text style={styles.statText}>{formatCount(item.views || 0)}</Text>
            </View>

            <View style={styles.stat}>
              <Ionicons name="diamond" size={12} color={theme.colors.vibeYellow} />
              <Text style={styles.statText}>{item.currentPrice || 10}</Text>
            </View>
          </View>

          {/* Time */}
          <Text style={styles.timeText}>{formatTimeAgo(item.createdAt)}</Text>
        </View>
      </Pressable>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="videocam-off" size={48} color={theme.colors.textSecondary} />
      <Text style={styles.emptyTitle}>No Snapples Yet</Text>
      <Text style={styles.emptySubtitle}>
        Be the first to create a Snapple for this prompt!
      </Text>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.headerContainer}>
      <Text style={styles.headerTitle}>Latest Snapples</Text>
      <Text style={styles.headerSubtitle}>
        {snapples?.length || 0} responses to this prompt
      </Text>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={snapples}
        keyExtractor={(item) => item.id || item.videoId}
        renderItem={renderSnappleItem}
        numColumns={2}
        contentContainerStyle={styles.gridContainer}
        columnWrapperStyle={styles.row}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmpty}
        refreshing={refreshing}
        onRefresh={onRefresh}
        ItemSeparatorComponent={() => <View style={{ height: 16 }} />}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  headerContainer: {
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    marginBottom: 16,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeights.medium,
  },
  gridContainer: {
    paddingHorizontal: 20,
    paddingBottom: 100, // Space for tab bar
  },
  row: {
    justifyContent: 'space-between',
  },
  snappleItem: {
    width: ITEM_SIZE,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  selectedItem: {
    borderColor: theme.colors.vibeBlue,
    borderWidth: 2,
    transform: [{ scale: 1.02 }],
  },
  videoContainer: {
    position: 'relative',
    aspectRatio: 9/16, // Vertical video ratio
  },
  thumbnailPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  thumbnailGradient: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  durationBadge: {
    position: 'absolute',
    bottom: 8,
    right: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  durationText: {
    color: 'white',
    fontSize: 10,
    fontWeight: theme.fontWeights.semiBold,
  },
  engagementIndicator: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  snappleInfo: {
    padding: 12,
    gap: 6,
  },
  creatorText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: theme.fontWeights.semiBold,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 12,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: theme.fontWeights.medium,
  },
  timeText: {
    color: theme.colors.textSecondary,
    fontSize: 10,
    fontWeight: theme.fontWeights.regular,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: theme.fontWeights.semiBold,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});