// NotificationSettingsScreen — user-facing controls for push
// notifications. Toggles per-type opt-out flags stored under
// user.settings.notifications.push.* which every Cloud Function
// fan-out reads before sending FCM.
//
// Also surfaces:
//   - OS-level permission status (with a "grant" CTA if not granted)
//   - Manage Blocked Users list (unblock)
//   - Manage Muted Users list (unmute)
//
// All writes go straight to the user doc via userService.updateUserData.

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, Switch, Pressable, ScrollView, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../store/AuthContext';
import { useModal } from '../store/ModalContext';
import { userService } from '../services/userService';
import { blockingService } from '../services/blockingService';
import { muteService } from '../services/muteService';
import { fcmService } from '../services/fcmServiceWrapper';
import AppLayout from '../components/ui/layout/AppLayout';
import theme from '../theme/themes';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

// Static toggle list. Each entry maps to a boolean at
// user.settings.notifications.push.{key}. Server reads the same
// path when deciding whether to send. Adding a new notification type
// = add a new entry here + gate the Cloud Function on it.
const TOGGLES = [
  { key: 'newFollower', label: 'New followers', desc: 'When someone new follows you.' },
  { key: 'followBack', label: 'Follow-backs', desc: 'When someone you follow follows you back.' },
  { key: 'followedUserSnapple', label: 'Snapples from friends', desc: "When people you follow make new snapples. Batched if they upload several at once." },
  { key: 'gameInvite', label: 'Game invites', desc: 'When someone invites you to a game. (Coming soon)' },
  { key: 'newPrompts', label: 'New hot prompts', desc: 'Occasional pings when a proven high-engagement prompt goes live.' },
];

export default function NotificationSettingsScreen({ navigation }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const { showAlert, showError, showConfirm } = useModal();

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [perms, setPerms] = useState(null);
  // Local toggle state — mirrors user.settings.notifications.push
  const [toggles, setToggles] = useState({});
  const [blockedList, setBlockedList] = useState([]);
  const [mutedList, setMutedList] = useState([]);

  // loadAll — pulls the user's current push preferences + block/mute
  // lists on mount. Runs once; no live sync needed since this screen
  // is the only writer.
  const loadAll = useCallback(async () => {
    if (!user?.uid) return;
    setLoading(true);
    try {
      const data = await userService.getUserData(user.uid);
      const push = data?.settings?.notifications?.push || {};
      const initial = {};
      TOGGLES.forEach(({ key }) => {
        // Every type defaults ON. A user who has never opened this
        // screen has no stored flags at all, so `undefined` has to
        // read as on — same rule the Cloud Functions apply.
        initial[key] = push[key] !== undefined ? push[key] : true;
      });
      setToggles(initial);
      setBlockedList(data?.social?.blockedUsers || []);
      setMutedList(data?.social?.mutedNotifications || []);
      const p = await fcmService.getPermissionStatus();
      setPerms(p);
    } catch (e) {
      showError('Error', 'Could not load notification settings.');
    } finally {
      setLoading(false);
    }
  }, [user?.uid, showError]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // handleToggle — flips a single push preference and persists it.
  // Optimistic — UI flips immediately; failure surfaces via error toast.
  const handleToggle = async (key) => {
    const next = !toggles[key];
    setToggles((prev) => ({ ...prev, [key]: next }));
    setSaving(true);
    try {
      await userService.updateUserData(user.uid, {
        [`settings.notifications.push.${key}`]: next,
      });
    } catch (e) {
      // Revert on failure so state matches server.
      setToggles((prev) => ({ ...prev, [key]: !next }));
      showError('Error', 'Could not save that preference.');
    } finally {
      setSaving(false);
    }
  };

  // handleGrantPermission — prompts the OS dialog + registers the
  // token. Used when perms.granted is false so the user can flip
  // permission on from inside the app.
  const handleGrantPermission = async () => {
    try {
      const ok = await fcmService.registerTokenForUser(user.uid);
      const p = await fcmService.getPermissionStatus();
      setPerms(p);
      if (!ok || !p.granted) {
        showAlert(
          'Permission needed',
          'Notifications are off for Snappled in your device settings. Open Settings → Snappled → Notifications to enable.',
        );
      }
    } catch (e) {
      showError('Error', e.message);
    }
  };

  // handleUnblock — pulls someone off the block list. Confirmation
  // dialog first so an accidental tap doesn't silently undo a block.
  const handleUnblock = (uid) => {
    showConfirm(
      'Unblock user?',
      "You'll be able to see each other again, but you won't automatically start following them.",
      async () => {
        const r = await blockingService.unblockUser(user.uid, uid);
        if (r.success) setBlockedList((prev) => prev.filter((id) => id !== uid));
        else showError('Error', r.error);
      },
    );
  };

  // handleUnmute — unmute a user. Silent (they don't know they were
  // muted in the first place) so no confirmation needed.
  const handleUnmute = async (uid) => {
    const r = await muteService.unmuteUser(user.uid, uid);
    if (r.success) setMutedList((prev) => prev.filter((id) => id !== uid));
    else showError('Error', r.error);
  };

  if (loading) {
    return (
      <AppLayout navigation={navigation}>
        <View style={styles.loadingWrap}>
          <ActivityIndicator size="large" color={theme.colors.vibeBlue} />
        </View>
      </AppLayout>
    );
  }

  return (
    <AppLayout navigation={navigation}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>Notifications</Text>

        {perms && !perms.granted && (
          <Pressable style={styles.permCard} onPress={handleGrantPermission}>
            <Ionicons name="notifications-off" size={20} color={theme.colors.vibeRed} />
            <View style={{ flex: 1 }}>
              <Text style={styles.permTitle}>Notifications are off</Text>
              <Text style={styles.permBody}>
                Tap to grant permission. Without it, none of the toggles below matter.
              </Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={theme.colors.vibeBlue} />
          </Pressable>
        )}

        <Text style={styles.h2}>Types</Text>
        {TOGGLES.map(({ key, label, desc }) => (
          <View key={key} style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowLabel}>{label}</Text>
              <Text style={styles.rowDesc}>{desc}</Text>
            </View>
            <Switch
              value={!!toggles[key]}
              onValueChange={() => handleToggle(key)}
              disabled={saving}
              trackColor={{ true: theme.colors.vibeBlue, false: '#333' }}
              thumbColor="#fff"
            />
          </View>
        ))}

        <Text style={styles.h2}>Muted people</Text>
        {mutedList.length === 0 ? (
          <Text style={styles.emptyText}>You haven't muted anyone. Tap Mute on a profile to silence their pings without unfollowing.</Text>
        ) : (
          mutedList.map((uid) => (
            <PeopleRow
              key={uid}
              uid={uid}
              actionLabel="Unmute"
              onPress={() => handleUnmute(uid)}
              navigation={navigation}
            />
          ))
        )}

        <Text style={styles.h2}>Blocked people</Text>
        {blockedList.length === 0 ? (
          <Text style={styles.emptyText}>You haven't blocked anyone. Blocking hides them from you and you from them.</Text>
        ) : (
          blockedList.map((uid) => (
            <PeopleRow
              key={uid}
              uid={uid}
              actionLabel="Unblock"
              onPress={() => handleUnblock(uid)}
              navigation={navigation}
            />
          ))
        )}
      </ScrollView>
    </AppLayout>
  );
}

// PeopleRow — one row in the muted / blocked list. Resolves the uid to
// a username asynchronously so the list can render immediately with a
// placeholder while userService catches up.
function PeopleRow({ uid, actionLabel, onPress }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [username, setUsername] = useState(null);
  useEffect(() => {
    let cancelled = false;
    userService.getUserData(uid).then((d) => {
      if (!cancelled) setUsername(d?.username || d?.displayName || uid.slice(0, 6));
    });
    return () => { cancelled = true; };
  }, [uid]);
  return (
    <View style={styles.peopleRow}>
      <Text style={styles.peopleUsername} numberOfLines={1}>
        @{username || '…'}
      </Text>
      <Pressable style={styles.actionBtn} onPress={onPress}>
        <Text style={styles.actionBtnText}>{actionLabel}</Text>
      </Pressable>
    </View>
  );
}

const makeStyles = (t) => ({
  loadingWrap: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: 20, paddingBottom: 60 },
  h1: {
    color: t.colors.textPrimary,
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginBottom: 20,
  },
  h2: {
    color: theme.colors.vibeBlue,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 10,
  },
  permCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.vibeRed,
    backgroundColor: 'rgba(255, 68, 68, 0.08)',
    marginBottom: 8,
  },
  permTitle: { color: t.colors.textPrimary, fontSize: 14, fontWeight: '800' },
  permBody: { color: t.colors.textSecondary, fontSize: 12, marginTop: 2 },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.divider,
  },
  rowText: { flex: 1, paddingRight: 12 },
  rowLabel: { color: t.colors.textPrimary, fontSize: 15, fontWeight: '700' },
  rowDesc: { color: t.colors.textSecondary, fontSize: 12, marginTop: 2 },
  emptyText: {
    color: t.colors.textSecondary,
    fontSize: 13,
    lineHeight: 18,
    paddingVertical: 8,
  },
  peopleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.divider,
  },
  peopleUsername: { color: t.colors.textPrimary, fontSize: 14, fontWeight: '600', flex: 1 },
  actionBtn: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: theme.colors.vibeBlue,
  },
  actionBtnText: {
    color: theme.colors.vibeBlue,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 1,
  },
});
