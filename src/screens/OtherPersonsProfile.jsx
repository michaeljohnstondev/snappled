// OtherPersonsProfile — read-only profile view for someone who isn't
// the signed-in user. Split off from UserProfileScreen intentionally
// so the "own profile" screen doesn't have to juggle both flows.
//
// Shows: avatar, username, level/rank, follower/following/snapple
// counts, Follow/Unfollow button, and grids for Created + Collection
// tabs. No Deck or Saved tabs — those are private to the owner.
// Following count is tappable so you can drill from friend to friend.

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, ActivityIndicator, FlatList, Dimensions,
} from 'react-native';
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
import theme from '../theme/themes';

const { width: screenWidth } = Dimensions.get('window');
const ITEM_SIZE = (screenWidth - 60) / 3;

// Renders the target user's profile. `userId` comes from route.params;
// if it's missing or equals the signed-in user, we bounce back to the
// tabbed own-profile screen instead of double-rendering.
export default function OtherPersonsProfile({ route, navigation }) {
  const { user } = useAuth();
  const targetUserId = route?.params?.userId;

  const [profileData, setProfileData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isFollowing, setIsFollowing] = useState(false);
  const [activeTab, setActiveTab] = useState('created');
  const [createdSnapples, setCreatedSnapples] = useState([]);
  const [ownedSnapples, setOwnedSnapples] = useState([]);
  const [selectedSnapple, setSelectedSnapple] = useState(null);
  // Index in the active-tab list of the tapped thumbnail, so the
  // overlay opens on the right video and lets the user swipe through.
  const [selectedIndex, setSelectedIndex] = useState(0);

  // Guard: OtherPersonsProfile should never render for the signed-in
  // user. If a caller wired this up wrong, jump to the tab-hosted
  // own profile so we don't show a stripped-down view of yourself.
  useEffect(() => {
    if (targetUserId && user?.uid && targetUserId === user.uid) {
      navigation.replace('Main');
    }
  }, [targetUserId, user?.uid]);

  useEffect(() => {
    if (!targetUserId) return;
    loadProfile();
    loadSnapples();
  }, [targetUserId]);

  // Fetch the profile doc + whether the current user follows them.
  const loadProfile = async () => {
    setIsLoading(true);
    try {
      const data = await userService.getUserData(targetUserId);
      setProfileData(data);
      if (user?.uid) {
        const following = await userService.isFollowing(user.uid, targetUserId);
        setIsFollowing(following);
      }
    } catch (error) {
      console.error('[OtherPersonsProfile] load error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Fetch created + owned public snapples for the grid tabs.
  // Created: query by creatorId directly. getActiveSnapples was wrong
  // — it sorts by totalVotes and returns top-50, so low-vote creators
  // showed as empty. Filter out private snapples client-side since
  // this is someone else's profile.
  // Collection: iterate ownedSnapples array in reverse since it's
  // append-only, giving "most recently added" first.
  const loadSnapples = async () => {
    try {
      const result = await snappleService.getSnapplesByCreator(targetUserId);
      if (result.success) {
        setCreatedSnapples((result.snapples || []).filter(s => s.isPrivate !== true));
      }
      const targetData = await userService.getUserData(targetUserId);
      const ownedIds = [...(targetData?.ownedSnapples || [])].reverse();
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
    } catch (error) {
      console.error('[OtherPersonsProfile] snapples error:', error);
    }
  };

  // Follow / Unfollow the profile owner.
  const handleFollow = async () => {
    if (!user?.uid) return;
    try {
      const result = await userService.toggleFollow(user.uid, targetUserId);
      if (result?.success) setIsFollowing(result.isFollowing);
    } catch (error) {
      console.error('[OtherPersonsProfile] follow error:', error);
    }
  };

  // Drill into who this profile follows (or is followed by). `type`
  // matches FollowingListScreen's route param — 'following' by
  // default, 'followers' for the other tap target.
  const openSocialList = (type) => {
    navigation.navigate('FollowingList', { userId: targetUserId, type });
  };

  const username = profileData?.username || profileData?.email?.split('@')[0] || 'Unknown';
  const totalXP = profileData?.profile?.xp || profileData?.profile?.experience || 0;
  const level = levelService.getLevelFromXP(totalXP);
  const rank = profileData?.profile?.rank || profileData?.rank || 'Rookie';
  const followers = profileData?.social?.followers?.length || 0;
  const followingCount = profileData?.social?.following?.length || 0;

  const tabOptions = [
    { label: 'Created', value: 'created' },
    { label: 'Collection', value: 'collection' },
  ];

  const activeSnapples = activeTab === 'created' ? createdSnapples : ownedSnapples;

  // Grid cell for a snapple thumbnail. Kept in the screen for now
  // since the same shape lives in UserProfileScreen — worth extracting
  // once a third caller shows up (YAGNI until then).
  // Wraps setSelectedSnapple with the tapped item's index so the
  // overlay can start on it and let the user swipe through the rest.
  const handleSnapplePress = (item) => {
    const idx = activeSnapples.findIndex(s => s?.id === item?.id);
    setSelectedIndex(Math.max(0, idx));
    setSelectedSnapple(item);
  };

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

  // Header block for the FlatList — avatar, stats, actions, tabs.
  const renderHeader = () => (
    <>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <View style={styles.backBg}>
            <Ionicons name="arrow-back" size={20} color="white" />
          </View>
        </Pressable>
        <Text style={styles.headerTitle}>Profile</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.profileSection}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{username.charAt(0).toUpperCase()}</Text>
        </View>
        <Text style={styles.username}>@{username}</Text>
        <View style={styles.badgeRow}>
          <View style={styles.badge}><Text style={styles.badgeText}>Lvl {level}</Text></View>
          <View style={styles.badge}><Text style={styles.badgeText}>{rank}</Text></View>
        </View>
      </View>

      <View style={styles.statsRow}>
        <Pressable style={styles.statItem} onPress={() => openSocialList('followers')}>
          <Text style={styles.statNumber}>{followers}</Text>
          <Text style={styles.statLabel}>Followers</Text>
        </Pressable>
        <Pressable style={styles.statItem} onPress={() => openSocialList('following')}>
          <Text style={styles.statNumber}>{followingCount}</Text>
          <Text style={styles.statLabel}>Following</Text>
        </Pressable>
        <View style={styles.statItem}>
          <Text style={styles.statNumber}>{createdSnapples.length}</Text>
          <Text style={styles.statLabel}>Snapples</Text>
        </View>
      </View>

      <View style={styles.actionSection}>
        <VibeButton
          label={isFollowing ? 'Following' : 'Follow'}
          onPress={handleFollow}
          variant="toggle"
          color={isFollowing ? 'green' : 'blue'}
        />
      </View>

      <View style={styles.tabSection}>
        <SectionDropdown
          options={tabOptions}
          selectedValue={activeTab}
          onSelect={setActiveTab}
        />
      </View>
    </>
  );

  // Empty-state text for whichever tab has zero items.
  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>
        {activeTab === 'created' ? 'No snapples created yet' : 'No snapples in collection yet'}
      </Text>
    </View>
  );

  return (
    <AppLayout navigation={navigation}>
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
          numColumns={3}
          columnWrapperStyle={styles.row}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        />
      )}

      <SnappleOverlay
        visible={!!selectedSnapple}
        snapple={selectedSnapple}
        snapples={activeSnapples}
        initialIndex={selectedIndex}
        onClose={() => setSelectedSnapple(null)}
        navigation={navigation}
      />
    </AppLayout>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingTop: 50,
    paddingBottom: 8,
    paddingHorizontal: 4,
  },
  backBtn: {},
  backBg: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: theme.colors.vibeBlue,
  },
  headerTitle: {
    color: theme.colors.vibeBlue, fontSize: 18,
    fontWeight: theme.fontWeights.bold,
    textTransform: 'uppercase', letterSpacing: 1.5,
  },
  loadingContainer: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  errorText: { color: theme.colors.textSecondary, fontSize: 16 },
  listContent: { paddingHorizontal: 20, paddingBottom: 40 },
  profileSection: { alignItems: 'center', paddingVertical: 24 },
  avatar: {
    width: 80, height: 80, borderRadius: 40,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 3, borderColor: theme.colors.vibeBlue,
    justifyContent: 'center', alignItems: 'center', marginBottom: 12,
  },
  avatarText: {
    color: theme.colors.vibeBlue, fontSize: 32,
    fontWeight: theme.fontWeights.bold,
  },
  username: {
    color: theme.colors.textPrimary, fontSize: 22,
    fontWeight: theme.fontWeights.bold, marginBottom: 4,
  },
  badgeRow: { flexDirection: 'row', gap: 8, marginTop: 4 },
  badge: {
    paddingVertical: 4, paddingHorizontal: 12, borderRadius: 12,
    borderWidth: 2, borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,198,255,0.1)',
  },
  badgeText: {
    color: theme.colors.vibeBlue, fontSize: 12,
    fontWeight: theme.fontWeights.bold,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingVertical: 20,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  statItem: { alignItems: 'center', flex: 1 },
  statNumber: {
    color: theme.colors.textPrimary, fontSize: 20,
    fontWeight: theme.fontWeights.bold,
  },
  // Cyan tint on the tappable count so users know it's actionable.
  statLabel: { color: theme.colors.textSecondary, fontSize: 12, marginTop: 4 },
  actionSection: { paddingTop: 20 },
  tabSection: { paddingTop: 20, paddingBottom: 16 },
  row: { justifyContent: 'space-between' },
  snappleItem: {
    width: ITEM_SIZE, borderRadius: 12, overflow: 'hidden',
    borderWidth: 3, borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  videoContainer: { aspectRatio: 9 / 16 },
  thumbnailPlaceholder: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  snappleInfo: { padding: 8, gap: 4 },
  snapplePrompt: {
    color: theme.colors.textPrimary, fontSize: 12,
    fontWeight: theme.fontWeights.medium,
  },
  snappleStats: { flexDirection: 'row', gap: 12 },
  snappleStat: { color: theme.colors.textSecondary, fontSize: 10 },
  emptyContainer: { paddingVertical: 60, alignItems: 'center' },
  emptyText: { color: theme.colors.textSecondary, fontSize: 14 },
});
