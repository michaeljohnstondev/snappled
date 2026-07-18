import React, { useState, useEffect, useMemo } from 'react';
import { View, Text, StyleSheet, Pressable, ActivityIndicator, FlatList, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../store/AuthContext';
import { userService } from '../services/userService';
import { levelService } from '../services/levelService';
import { snappleService } from '../services/snappleService';
import SectionDropdown from '../components/ui/SectionDropdown';
import VibeButton from '../components/ui/VibeButton';
import SnappleThumbnail from '../components/ui/SnappleThumbnail';
import SnappleOverlay from '../components/ui/modals/SnappleOverlay';
import AppLayout from '../components/ui/layout/AppLayout';
import { SNAPPLE_SORT_OPTIONS, sortSnapples } from '../lib/snappleSort';
import theme from '../theme/themes';

// 12 = 4 rows of 3 in the snapple grid — keeps each "Show more" tap
// aligned with the visual row structure (no half-empty last row).
const PAGE_SIZE = 12;

const { width: screenWidth } = Dimensions.get('window');
// 3-col grid: 40px horizontal padding (20+20) + 20px split across 2 gaps = 10px each.
const ITEM_SIZE = (screenWidth - 60) / 3;

export default function UserProfileScreen({ route, navigation }) {
  const { user, userCurrency } = useAuth();
  // Default to current user if no userId param (e.g. when navigating via Profile tab)
  const userId = route?.params?.userId || user?.uid;
  const [profileData, setProfileData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [activeTab, setActiveTab] = useState('created');
  const [createdSnapples, setCreatedSnapples] = useState([]);
  const [ownedSnapples, setOwnedSnapples] = useState([]);
  const [savedSnapples, setSavedSnapples] = useState([]);
  const [sortKey, setSortKey] = useState('newest');
  // Paginate so profiles with 100+ snapples don't dump the whole
  // grid on mount. Reset to PAGE_SIZE any time the tab or sort
  // changes so users see freshly-ordered results from the top.
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  useEffect(() => { setVisibleCount(PAGE_SIZE); }, [activeTab, sortKey]);

  const isOwnProfile = user?.uid === userId;

  useEffect(() => {
    loadProfile();
  }, [userId]);

  // Re-run loadSnapples when the userCurrency arrays change so the
  // Collection / Saved tabs live-update after a buy / save / discard.
  // Only add live deps for own profile — viewing someone else's
  // profile doesn't need to react to OUR array changes. AuthContext's
  // onSnapshot listener on our user doc is what drives these updates
  // in the first place, so Collection reflects server truth within a
  // second of any purchase.
  useEffect(() => {
    if (userId) {
      loadSnapples();
    }
  }, [
    userId,
    isOwnProfile ? (userCurrency?.ownedSnapples || []).length : 0,
    isOwnProfile ? (userCurrency?.wishlistedSnapples || []).length : 0,
  ]);

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
      // Query by creatorId directly. getActiveSnapples was the wrong
      // source — it sorts by totalVotes desc and only returns the top
      // 50, so a new user's own snapples (0 votes) got pushed off the
      // list. getSnapplesByCreator hits the creatorId index and is
      // already sorted newest-first. This is our own profile, so
      // private snapples are included.
      const result = await snappleService.getSnapplesByCreator(userId);
      if (result.success) {
        setCreatedSnapples(result.snapples || []);
      }
      // Load owned snapples from user doc. ownedSnapples is append-only
      // (see VideoPreviewScreen onSave, SnappleOverlay purchase flow),
      // so iterating in reverse gives "most recently added" first.
      const userData = await userService.getUserData(userId);
      const ownedIds = [...(userData?.ownedSnapples || [])].reverse();
      if (ownedIds.length > 0) {
        const owned = [];
        for (const id of ownedIds) {
          try {
            const snapResult = await snappleService.getSnapple(id);
            if (snapResult?.success && snapResult.snapple) {
              owned.push(snapResult.snapple);
            }
          } catch (e) {}
        }
        setOwnedSnapples(owned);
      } else {
        setOwnedSnapples([]);
      }

      // Wishlist (saved). wishlistedSnapples is a 2-way index on the
      // user doc — iterate ids and fetch each snapple, same pattern
      // as Collection uses for ownedSnapples above. Newest-first via
      // reverse (append-only writes).
      const wishlistIds = [...(userData?.wishlistedSnapples || [])].reverse();
      if (wishlistIds.length > 0) {
        const saved = [];
        for (const id of wishlistIds) {
          try {
            const snapResult = await snappleService.getSnapple(id);
            if (snapResult?.success && snapResult.snapple) {
              saved.push(snapResult.snapple);
            }
          } catch (e) {}
        }
        setSavedSnapples(saved);
      } else {
        setSavedSnapples([]);
      }
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

  const [selectedSnapple, setSelectedSnapple] = useState(null);
  // Which item in the active-tab list was tapped, so the overlay can
  // start on it and let the user swipe through the rest of the tab.
  const [selectedIndex, setSelectedIndex] = useState(0);

  const handleSnapplePress = (snapple) => {
    // Index into the RENDERED list (sorted + paged) so the overlay
    // opens on the right item and can swipe through visible siblings.
    const idx = pagedSnapples.findIndex(s => s?.id === snapple?.id);
    setSelectedIndex(Math.max(0, idx));
    setSelectedSnapple(snapple);
  };

  const username = profileData?.username || profileData?.email?.split('@')[0] || 'Unknown';
  const totalXP = profileData?.profile?.xp || profileData?.profile?.experience || 0;
  const level = levelService.getLevelFromXP(totalXP);
  const rank = profileData?.profile?.rank || profileData?.rank || 'Rookie';
  const followers = profileData?.social?.followers?.length || 0;
  const followingCount = profileData?.social?.following?.length || 0;

  // Dropdown-only view modes. Deck used to live here but was the
  // only option that navigated away instead of filtering the grid,
  // which read badly in a dropdown; it's a sibling button now.
  const tabOptions = [
    { label: 'Created', value: 'created' },
    { label: 'Collection', value: 'collection' },
    { label: 'Saved', value: 'saved' },
  ];

  const handleTabSelect = (tab) => setActiveTab(tab);

  const activeSnapples = activeTab === 'created' ? createdSnapples
    : activeTab === 'saved' ? savedSnapples
    : ownedSnapples; // collection

  // Sort → paginate. Sort is memoized on the raw array + key; the
  // page slice is derived after so "Show more" just bumps the
  // slice bound without re-sorting.
  const sortedSnapples = useMemo(
    () => sortSnapples(activeSnapples, sortKey),
    [activeSnapples, sortKey],
  );
  const pagedSnapples = useMemo(
    () => sortedSnapples.slice(0, visibleCount),
    [sortedSnapples, visibleCount],
  );
  const hasMore = sortedSnapples.length > pagedSnapples.length;

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
        <Pressable
          style={styles.statItem}
          onPress={() => navigation.navigate('FollowingList', { userId, type: 'followers' })}
        >
          <Text style={styles.statNumber}>{followers}</Text>
          <Text style={styles.statLabel}>Followers</Text>
        </Pressable>
        <Pressable
          style={styles.statItem}
          onPress={() => navigation.navigate('FollowingList', { userId, type: 'following' })}
        >
          <Text style={styles.statNumber}>{followingCount}</Text>
          <Text style={styles.statLabel}>Following</Text>
        </Pressable>
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

      {/* Section picker + Edit Deck. Dropdown filters the grid
          below; Edit Deck ships you to the DeckBuilder screen. Only
          shown on your own profile since Deck-building is per-user. */}
      <View style={styles.tabSection}>
        <View style={styles.tabRow}>
          <View style={styles.tabDropdown}>
            <SectionDropdown
              options={tabOptions}
              selectedValue={activeTab}
              onSelect={handleTabSelect}
            />
          </View>
          {isOwnProfile ? (
            <Pressable
              style={styles.editDeckBtn}
              onPress={() => navigation.navigate('DeckBuilder')}
            >
              <Ionicons name="layers" size={18} color={theme.colors.vibeGreen} />
              <Text style={styles.editDeckBtnText}>Edit Deck</Text>
            </Pressable>
          ) : null}
        </View>
        <View style={styles.sortRow}>
          <Text style={styles.sortLabel}>Sort by</Text>
          <View style={styles.sortDropdown}>
            <SectionDropdown
              options={SNAPPLE_SORT_OPTIONS}
              selectedValue={sortKey}
              onSelect={setSortKey}
            />
          </View>
        </View>
      </View>
    </>
  );

  // "Show more" pager. Bumps the visible slice by PAGE_SIZE each tap.
  // Nothing renders when there's nothing left to reveal.
  const renderFooter = () => {
    if (!hasMore) return null;
    const remaining = sortedSnapples.length - pagedSnapples.length;
    return (
      <Pressable
        style={styles.showMoreBtn}
        onPress={() => setVisibleCount(c => c + PAGE_SIZE)}
      >
        <Text style={styles.showMoreText}>
          Show {Math.min(PAGE_SIZE, remaining)} more · {remaining} left
        </Text>
      </Pressable>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>
        {activeTab === 'created' ? 'No snapples created yet'
          : activeTab === 'saved' ? 'No saved snapples yet'
          : 'No snapples in collection yet'}
      </Text>
    </View>
  );

  return (
    <AppLayout navigation={navigation} active="profile">
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
          data={pagedSnapples}
          keyExtractor={(item, index) => item?.id || `snapple-${index}`}
          renderItem={renderSnappleItem}
          numColumns={3}
          columnWrapperStyle={styles.row}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          ListFooterComponent={renderFooter}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}

      <SnappleOverlay
        visible={!!selectedSnapple}
        snapple={selectedSnapple}
        snapples={pagedSnapples}
        initialIndex={selectedIndex}
        onClose={() => setSelectedSnapple(null)}
        navigation={navigation}
      />
    </AppLayout>
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
  tabRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  tabDropdown: {
    flex: 1,
  },
  editDeckBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.vibeGreen,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  editDeckBtnText: {
    color: theme.colors.vibeGreen,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
  },
  // Sort control below the tab picker. Compact label + dropdown so
  // it doesn't dominate the header. Live filter inside FlatList.
  sortRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginTop: 10,
  },
  sortLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  sortDropdown: {
    flex: 1,
  },
  // "Show more" pager. Cyan-outline button spanning the grid width,
  // shown as the FlatList footer whenever more snapples exist beyond
  // the current visible slice.
  showMoreBtn: {
    marginTop: 16,
    marginHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,0,0,0.35)',
    alignItems: 'center',
  },
  showMoreText: {
    color: theme.colors.vibeBlue,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
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
