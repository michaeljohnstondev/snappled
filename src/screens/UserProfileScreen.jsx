import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, FlatList, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../store/AuthContext';
import { userService } from '../services/userService';
import { levelService } from '../services/levelService';
import { snappleService } from '../services/snappleService';
import VibeSegmentedControl from '../components/ui/VibeSegmentedControl';
import VibeButton from '../components/ui/VibeButton';
import SnappleThumbnail from '../components/ui/SnappleThumbnail';
import theme from '../theme/themes';

const { width: screenWidth } = Dimensions.get('window');
const ITEM_SIZE = (screenWidth - 60) / 2;

export default function UserProfileScreen({ route, navigation }) {
  const { userId } = route.params || {};
  const { user } = useAuth();
  const [profileData, setProfileData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [activeTab, setActiveTab] = useState('created');
  const [createdSnapples, setCreatedSnapples] = useState([]);
  const [ownedSnapples, setOwnedSnapples] = useState([]);

  const isOwnProfile = user?.uid === userId;

  useEffect(() => {
    loadProfile();
  }, [userId]);

  useEffect(() => {
    if (userId) {
      loadSnapples();
    }
  }, [userId]);

  const loadProfile = async () => {
    setIsLoading(true);
    try {
      const data = await userService.getUserData(userId);
      setProfileData(data);

      if (user?.uid && !isOwnProfile) {
        const following = await userService.isFollowing(user.uid, userId);
        setIsFollowing(following);
      }
    } catch (error) {
      console.error('[UserProfileScreen] Error loading profile:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSnapples = async () => {
    try {
      // Load snapples created by this user
      const result = await snappleService.getActiveSnapples(50);
      if (result.success) {
        const created = result.snapples.filter(s => s.creatorId === userId);
        setCreatedSnapples(created);
      }
      // TODO: Load owned/purchased snapples from user's deck
      setOwnedSnapples([]);
    } catch (error) {
      console.error('[UserProfileScreen] Error loading snapples:', error);
    }
  };

  const handleFollow = async () => {
    if (!user?.uid) return;
    try {
      const result = await userService.toggleFollow(user.uid, userId);
      if (result.success) {
        setIsFollowing(result.isFollowing);
      }
    } catch (error) {
      console.error('[UserProfileScreen] Follow error:', error);
    }
  };

  const handleSnapplePress = (snapple) => {
    // Navigate back and open the snapple overlay
    // For now just log it
    console.log('[UserProfileScreen] Snapple pressed:', snapple.id);
  };

  const username = profileData?.username || profileData?.email?.split('@')[0] || 'Unknown';
  const totalXP = profileData?.profile?.xp || profileData?.profile?.experience || 0;
  const level = levelService.getLevelFromXP(totalXP);
  const rank = profileData?.profile?.rank || profileData?.rank || 'Rookie';
  const followers = profileData?.social?.followers?.length || 0;
  const followingCount = profileData?.social?.following?.length || 0;

  const tabOptions = [
    { label: 'Created', value: 'created' },
    { label: 'Deck', value: 'deck' },
    { label: 'Collection', value: 'collection' },
  ];

  const handleTabSelect = (tab) => {
    if (tab === 'deck' && isOwnProfile) {
      navigation.navigate('DeckBuilder');
      return;
    }
    setActiveTab(tab);
  };

  const activeSnapples = activeTab === 'created' ? createdSnapples
    : activeTab === 'deck' ? ownedSnapples
    : ownedSnapples; // TODO: filter collection vs deck

  const renderSnappleItem = ({ item }) => (
    <Pressable style={styles.snappleItem} onPress={() => handleSnapplePress(item)}>
      <View style={styles.videoContainer}>
        {item.videoUrl ? (
          <SnappleThumbnail videoUrl={item.videoUrl} />
        ) : (
          <View style={styles.thumbnailPlaceholder}>
            <Ionicons name="play-circle" size={28} color="white" />
          </View>
        )}
      </View>
      <View style={styles.snappleInfo}>
        <Text style={styles.snapplePrompt} numberOfLines={1}>{item.prompt}</Text>
        <View style={styles.snappleStats}>
          <Text style={styles.snappleStat}>{item.likes || 0} likes</Text>
          <Text style={styles.snappleStat}>{item.views || 0} views</Text>
        </View>
      </View>
    </Pressable>
  );

  const renderHeader = () => (
    <>
      {/* Avatar + Name */}
      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {username.charAt(0).toUpperCase()}
          </Text>
        </View>
        <Text style={styles.username}>@{username}</Text>
        <View style={styles.badgeRow}>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>Lvl {level}</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>{rank}</Text>
          </View>
        </View>
      </View>

      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{followers}</Text>
          <Text style={styles.statLabel}>Followers</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{followingCount}</Text>
          <Text style={styles.statLabel}>Following</Text>
        </View>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{createdSnapples.length}</Text>
          <Text style={styles.statLabel}>Snapples</Text>
        </View>
      </View>

      {/* Actions */}
      {!isOwnProfile ? (
        <View style={styles.actionSection}>
          <VibeButton
            label={isFollowing ? 'Following' : 'Follow'}
            onPress={handleFollow}
            variant="toggle"
            color={isFollowing ? 'green' : 'blue'}
          />
        </View>
      ) : (
        <Pressable style={styles.achievementsBtn} onPress={() => navigation.navigate('Achievements')}>
          <Ionicons name="trophy" size={20} color={theme.colors.vibeYellow} />
          <Text style={styles.achievementsBtnText}>Achievements</Text>
          <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
        </Pressable>
      )}

      {/* Tabs */}
      <View style={styles.tabSection}>
        <VibeSegmentedControl
          options={tabOptions}
          selectedValue={activeTab}
          onSelect={handleTabSelect}
        />
      </View>
    </>
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>
        {activeTab === 'created' ? 'No snapples created yet'
          : activeTab === 'deck' ? 'No snapples in deck yet'
          : 'No snapples in collection yet'}
      </Text>
    </View>
  );

  return (
    <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backButton}>
          <View style={styles.backBg}>
            <Ionicons name="arrow-back" size={20} color="white" />
          </View>
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 36 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.vibeBlue} />
        </View>
      ) : !profileData ? (
        <View style={styles.loadingContainer}>
          <Text style={styles.errorText}>User not found</Text>
        </View>
      ) : (
        <FlatList
          data={activeSnapples}
          keyExtractor={(item, index) => item?.id || `snapple-${index}`}
          renderItem={renderSnappleItem}
          numColumns={2}
          columnWrapperStyle={styles.row}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
  },
  backButton: {},
  backBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: theme.fontWeights.bold,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  errorText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  profileSection: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 12,
  },
  avatarText: {
    color: theme.colors.vibeBlue,
    fontSize: 32,
    fontWeight: theme.fontWeights.bold,
  },
  username: {
    color: theme.colors.textPrimary,
    fontSize: 22,
    fontWeight: theme.fontWeights.bold,
    marginBottom: 4,
  },
  badgeRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 4,
  },
  badge: {
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0, 198, 255, 0.1)',
  },
  badgeText: {
    color: theme.colors.vibeBlue,
    fontSize: 12,
    fontWeight: theme.fontWeights.bold,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  statItem: {
    alignItems: 'center',
  },
  statNumber: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: theme.fontWeights.bold,
  },
  statLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 4,
  },
  actionSection: {
    paddingTop: 20,
  },
  achievementsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 12,
    backgroundColor: 'rgba(255,215,0,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,215,0,0.2)',
  },
  achievementsBtnText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: theme.fontWeights.semiBold,
  },
  tabSection: {
    paddingTop: 20,
    paddingBottom: 16,
  },
  row: {
    justifyContent: 'space-between',
  },
  snappleItem: {
    width: ITEM_SIZE,
    borderRadius: 12,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  videoContainer: {
    aspectRatio: 9 / 16,
  },
  thumbnailPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  snappleInfo: {
    padding: 8,
    gap: 4,
  },
  snapplePrompt: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: theme.fontWeights.medium,
  },
  snappleStats: {
    flexDirection: 'row',
    gap: 12,
  },
  snappleStat: {
    color: theme.colors.textSecondary,
    fontSize: 10,
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
});
