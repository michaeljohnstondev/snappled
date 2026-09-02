// FollowingListScreen — list of users the given profile follows (or is
// followed by). Reads route.params.userId + route.params.type
// ('following' | 'followers'). Each row taps into OtherPersonsProfile
// so the caller can drill from friend to friend.

import React, { useEffect, useMemo, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, FlatList, ActivityIndicator, TextInput,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../store/AuthContext';
import { userService } from '../services/userService';
import theme from '../theme/themes';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

// Render the list. Loads the target user's social array, hydrates each
// uid into { uid, username, level, ... } via userService.getUserData,
// and shows a tappable row per person.
export default function FollowingListScreen({ route, navigation }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const { userId, type = 'following' } = route?.params || {};

  const [users, setUsers] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');

  // Filter list client-side by username substring. Case-insensitive.
  // Rank isn't matched because it's a discrete label and would create
  // noisy "Rookie" matches; if users want to filter by rank later we
  // can add a separate control.
  const filteredUsers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return users;
    return users.filter(u => (u.username || '').toLowerCase().includes(q));
  }, [users, search]);

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
      <Ionicons name="chevron-forward" size={18} color={t.colors.textSecondary} />
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
        <>
          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color={theme.colors.vibeBlue} />
            <TextInput
              style={styles.searchInput}
              value={search}
              onChangeText={setSearch}
              placeholder={`Search ${title.toLowerCase()}...`}
              placeholderTextColor={t.colors.textSecondary}
              autoCapitalize="none"
              autoCorrect={false}
            />
            {search ? (
              <Pressable onPress={() => setSearch('')} hitSlop={8}>
                <Ionicons name="close-circle" size={18} color={t.colors.textSecondary} />
              </Pressable>
            ) : null}
          </View>
          {filteredUsers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>No matches for "{search}"</Text>
            </View>
          ) : (
            <FlatList
              data={filteredUsers}
              keyExtractor={(item) => item.uid}
              renderItem={renderItem}
              contentContainerStyle={styles.listContent}
              ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
              keyboardShouldPersistTaps="handled"
            />
          )}
        </>
      )}
    </View>
  );
}

const makeStyles = (t) => ({
  container: { flex: 1, backgroundColor: t.colors.background },
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
  emptyText: { color: t.colors.textSecondary, fontSize: 14, textAlign: 'center' },
  listContent: { paddingHorizontal: 20, paddingTop: 16, paddingBottom: 40 },
  // Search pill lives just below the header. Cyan border matches the
  // rest of the input styling in the app. Clears with an X on the
  // right when there's text.
  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginHorizontal: 20,
    marginTop: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  searchInput: {
    flex: 1,
    color: t.colors.textPrimary,
    fontSize: 14,
    padding: 0,
  },
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
    color: t.colors.textPrimary, fontSize: 15,
    fontWeight: theme.fontWeights.bold,
  },
  rank: {
    color: t.colors.textSecondary, fontSize: 12, marginTop: 2,
  },
});
