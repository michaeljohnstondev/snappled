// FollowingListScreen — list of users the given profile follows (or is
// followed by). Reads route.params.userId + route.params.type
// ('following' | 'followers'). Each row taps into OtherPersonsProfile
// so the caller can drill from friend to friend.

import React, { useEffect, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../store/AuthContext';
import { userService } from '../services/userService';
import theme from '../theme/themes';

// Render the list. Loads the target user's social array, hydrates each
// uid into { uid, username, level, ... } via userService.getUserData,
// and shows a tappable row per person.
export default function FollowingListScreen({ route, navigation }) {
  const { user } = useAuth();
  const { userId, type = 'following' } = route?.params || {};

  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;
    load();
  }, [userId, type]);

  // Pull the profile doc, grab the ids in social[type], then hydrate
  // each id into a display record. Failures per-id are swallowed so
  // one bad user doc doesn't blank the whole list.
  const load = async () => {
    setIsLoading(true);
    try {
      const data = await userService.getUserData(userId);
      const ids = data?.social?.[type] || [];
      const hydrated = [];
      for (const uid of ids) {
        try {
          const profile = await userService.getUserData(uid);
          if (profile) {
            hydrated.push({
              uid,
              username: profile.username || profile.email?.split('@')[0] || 'Unknown',
              rank: profile.profile?.rank || 'Rookie',
            });
          }
        } catch (e) {}
      }
      setUsers(hydrated);
    } catch (error) {
      console.error('[FollowingListScreen] load error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Tap a row → open that user's profile. Own uid is a no-op so we
  // don't recurse into an "other" view of ourselves.
  const handleUserPress = (u) => {
    if (u.uid === user?.uid) return;
    navigation.navigate('OtherPersonsProfile', { userId: u.uid });
  };

  const title = type === 'followers' ? 'Followers' : 'Following';

  const renderItem = ({ item }) => (
    <Pressable style={styles.row} onPress={() => handleUserPress(item)}>
      <View style={styles.avatar}>
        <Text style={styles.avatarText}>{item.username.charAt(0).toUpperCase()}</Text>
      </View>
      <View style={styles.rowText}>
        <Text style={styles.username}>@{item.username}</Text>
        <Text style={styles.rank}>{item.rank}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={theme.colors.textSecondary} />
    </Pressable>
  );

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} style={styles.backBtn}>
          <View style={styles.backBg}>
            <Ionicons name="arrow-back" size={20} color="white" />
          </View>
        </Pressable>
        <Text style={styles.headerTitle}>{title}</Text>
        <View style={{ width: 36 }} />
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.vibeBlue} />
        </View>
      ) : users.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Text style={styles.emptyText}>
            {type === 'followers' ? 'No followers yet' : 'Not following anyone yet'}
          </Text>
        </View>
      ) : (
        <FlatList
          data={users}
          keyExtractor={(item) => item.uid}
          renderItem={renderItem}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingTop: 50,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(0,198,255,0.2)',
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
  emptyContainer: { flex: 1, justifyContent: 'center', alignItems: 'center', padding: 32 },
  emptyText: { color: theme.colors.textSecondary, fontSize: 14, textAlign: 'center' },
  listContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 12, paddingHorizontal: 14,
    borderRadius: 12, borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  avatar: {
    width: 44, height: 44, borderRadius: 22,
    backgroundColor: 'rgba(0,198,255,0.1)',
    borderWidth: 2, borderColor: theme.colors.vibeBlue,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: {
    color: theme.colors.vibeBlue, fontSize: 18,
    fontWeight: theme.fontWeights.bold,
  },
  rowText: { flex: 1 },
  username: {
    color: theme.colors.textPrimary, fontSize: 15,
    fontWeight: theme.fontWeights.bold,
  },
  rank: {
    color: theme.colors.textSecondary, fontSize: 12, marginTop: 2,
  },
});
