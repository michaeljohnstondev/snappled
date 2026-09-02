import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable, Dimensions } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SnappleThumbnail from '../SnappleThumbnail';
import SortModal from '../modals/SortModal';
import theme from '../../../theme/themes';
import { useTheme, useThemedStyles } from '../../../theme/ThemeContext';

const { width: screenWidth } = Dimensions.get('window');
const ITEM_SIZE = (screenWidth - 60) / 2;

function getHotScore(item) {
  const likes = item.likes || 0;
  const views = item.views || 0;
  const createdAt = item.createdAt?.toDate ? item.createdAt.toDate() : new Date(item.createdAt || 0);
  const hoursAge = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60);
  // Recency boost decays over 24 hours
  const recencyBonus = Math.max(0, 100 - (hoursAge * 4));
  return likes * 10 + views + recencyBonus;
}

function sortSnapples(items, sortBy, ascending) {
  const sorted = [...items].sort((a, b) => {
    switch (sortBy) {
      case 'hot': return getHotScore(b) - getHotScore(a);
      case 'likes': return (b.likes || 0) - (a.likes || 0);
      case 'views': return (b.views || 0) - (a.views || 0);
      case 'price': return (b.currentPrice || 10) - (a.currentPrice || 10);
      case 'time':
      default:
        const aTime = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
        const bTime = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
        return bTime - aTime;
    }
  });
  return ascending ? sorted.reverse() : sorted;
}

export default function SnappleGrid({
  snapples,
  onSnapplePress,
  refreshing,
  onRefresh,
  sortBy: externalSortBy,
  ascending: externalAscending,
  hideSort = false,
}) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [selectedSnapple, setSelectedSnapple] = useState(null);
  const [sortBy, setSortBy] = useState(externalSortBy || 'time');
  const [ascending, setAscending] = useState(externalAscending || false);
  const [showSortModal, setShowSortModal] = useState(false);

  // Sync with external sort props
  React.useEffect(() => {
    if (externalSortBy !== undefined) setSortBy(externalSortBy);
    if (externalAscending !== undefined) setAscending(externalAscending);
  }, [externalSortBy, externalAscending]);

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
    if (total === 0) return t.colors.textSecondary;
    
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
          {item.videoUrl ? (
            <SnappleThumbnail videoUrl={item.videoUrl} />
          ) : (
            <View style={styles.thumbnailPlaceholder}>
              <Ionicons name="play-circle" size={32} color="white" />
            </View>
          )}

          {/* Overlay info on thumbnail */}
          <View style={styles.overlayInfo}>
            <Text style={styles.creatorText} numberOfLines={1}>
              @{item.creatorUsername || 'anonymous'}
            </Text>
            <View style={styles.statsRow}>
              <Text style={styles.statText}>{formatCount(item.likes || 0)} ♥</Text>
              <Text style={styles.statText}>{formatCount(item.views || 0)} 👁</Text>
              <Text style={styles.statText}>{item.currentPrice || 10} 💎</Text>
            </View>
          </View>

          {/* Engagement Indicator */}
          <View style={[styles.engagementIndicator, { backgroundColor: engagementColor }]} />

          {/* Lock badge for private snapples — only the creator ever sees
              their own private snapples here (queries filter them out
              everywhere else), but flagging them visually helps the
              creator find their drafts at a glance. */}
          {item.isPrivate && (
            <View style={styles.privateBadge}>
              <Ionicons name="lock-closed" size={12} color="#fff" />
            </View>
          )}
        </View>
      </Pressable>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Ionicons name="videocam-off" size={48} color={t.colors.textSecondary} />
      <Text style={styles.emptyTitle}>No Snapples Yet</Text>
      <Text style={styles.emptySubtitle}>
        Be the first to create a Snapple for this prompt!
      </Text>
    </View>
  );

  const sortedSnapples = sortSnapples(snapples, sortBy, ascending);

  const sortLabel = { time: 'Newest', likes: 'Likes', views: 'Views', price: 'Price' }[sortBy];

  const renderHeader = () => hideSort ? null : (
    <View style={styles.sortRow}>
      <Pressable style={styles.sortButton} onPress={() => setShowSortModal(true)}>
        <Ionicons name="swap-vertical" size={14} color={theme.colors.vibeBlue} />
        <Text style={styles.sortButtonText}>{sortLabel}</Text>
        <Ionicons name={ascending ? 'arrow-up' : 'arrow-down'} size={12} color={theme.colors.vibeBlue} />
      </Pressable>
    </View>
  );

  return (
    <View style={styles.container}>
      <FlatList
        data={sortedSnapples}
        keyExtractor={(item, index) => item?.id || item?.videoId || `snapple-${index}`}
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
        // Virtualization tuning — keeps the number of concurrently
        // mounted thumbnails small so a profile with 50 snapples
        // doesn't kick off 50 native extractions on first render.
        initialNumToRender={6}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews
      />
      <SortModal
        visible={showSortModal}
        onClose={() => setShowSortModal(false)}
        sortBy={sortBy}
        ascending={ascending}
        onSelect={(value, asc) => {
          setSortBy(value);
          setAscending(asc);
        }}
      />
    </View>
  );
}

const makeStyles = (t) => ({
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
    color: t.colors.textPrimary,
    marginBottom: 4,
  },
  headerSubtitle: {
    fontSize: 14,
    color: t.colors.textSecondary,
    fontWeight: theme.fontWeights.medium,
  },
  sortRow: {
    paddingHorizontal: 20,
    paddingBottom: 12,
    flexDirection: 'row',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: theme.colors.vibeBlue,
  },
  sortButtonText: {
    color: theme.colors.vibeBlue,
    fontSize: 12,
    fontWeight: theme.fontWeights.semiBold,
  },
  gridContainer: {
    paddingHorizontal: 20,
    paddingTop: 6,
    paddingBottom: 80,
  },
  row: {
    justifyContent: 'space-between',
  },
  snappleItem: {
    width: ITEM_SIZE,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
  },
  selectedItem: {
    borderColor: theme.colors.vibeCyan,
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
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  overlayInfo: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    padding: 8,
    gap: 2,
  },
  engagementIndicator: {
    position: 'absolute',
    top: 8,
    left: 8,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  privateBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderWidth: 1.5,
    borderColor: theme.colors.vibeYellow,
    justifyContent: 'center',
    alignItems: 'center',
  },
  creatorText: {
    color: t.colors.textPrimary,
    fontSize: 11,
    fontWeight: theme.fontWeights.semiBold,
    textShadowColor: 'rgba(0, 0, 0, 0.8)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  statsRow: {
    flexDirection: 'row',
    gap: 10,
  },
  statText: {
    color: 'rgba(255, 255, 255, 0.8)',
    fontSize: 10,
    fontWeight: theme.fontWeights.medium,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
  },
  emptyTitle: {
    color: t.colors.textPrimary,
    fontSize: 18,
    fontWeight: theme.fontWeights.semiBold,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    color: t.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
});