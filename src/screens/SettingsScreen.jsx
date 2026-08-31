// SettingsScreen — the app's single settings hub.
//
// Everything a user can change about their own account or the app's
// behaviour hangs off this screen. It owns no data of its own: each
// section reads from and writes to the service that already owns
// that state (soundService, firebase auth), and anything with a
// screen of its own (notifications) is a chevron row that navigates.
//
// Rows are rendered by src/components/ui/settings/SettingsRow so the
// list stays visually consistent whether a row is a switch, a link,
// or a static value.

import React, { useState, useCallback } from 'react';
import { View, Text, StyleSheet, ScrollView } from 'react-native';
import { signOut } from 'firebase/auth';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useAuth } from '../store/AuthContext';
import { useModal } from '../store/ModalContext';
import { auth } from '../services/firebase';
import { soundService } from '../services/soundService';
import { usernameService } from '../services/usernameService';
import AppLayout from '../components/ui/layout/AppLayout';
import SettingsRow from '../components/ui/settings/SettingsRow';
import UsernameEditor from '../components/ui/settings/UsernameEditor';
import theme from '../theme/themes';

const APP_VERSION = Constants.expoConfig?.version || '?';
// OTA bundle id. 'embed' means they're running the JS that shipped
// inside the build — the single most useful thing to know when a bug
// report says "it works on my phone".
const UPDATE_TAG = Updates.updateId ? Updates.updateId.slice(0, 8) : 'embed';

export default function SettingsScreen({ navigation }) {
  const { user } = useAuth();
  const { showConfirm, showError, showToast } = useModal();

  // soundService restores the stored preference during App.js startup,
  // so reading it synchronously on mount is already accurate here.
  const [sfxEnabled, setSfxEnabled] = useState(() => soundService.isEnabled());

  // Username edit state. `draft` is only meaningful while editing.
  const [editingName, setEditingName] = useState(false);
  const [draft, setDraft] = useState('');
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState(null);

  const username = user?.username || user?.email?.split('@')[0] || 'player';

  // handleSfxToggle — flips SFX and persists it. Optimistic: the switch
  // moves immediately because soundService swallows its own storage
  // failures (the preference just won't survive a restart).
  const handleSfxToggle = useCallback(async (next) => {
    setSfxEnabled(next);
    await soundService.setEnabled(next);
    // Play the confirmation AFTER enabling so turning sound on is
    // audible, and stays silent when turning it off.
    if (next) soundService.play('cardPick');
  }, []);

  // startEditingName — opens the inline editor seeded with the current
  // handle, so a small correction doesn't mean retyping the whole thing.
  const startEditingName = useCallback(() => {
    setDraft(user?.displayName || username);
    setNameError(null);
    setEditingName(true);
  }, [user?.displayName, username]);

  // handleSaveName — hands the rename to usernameService, which also
  // fans the new handle out to existing snapples and prompts. Errors
  // come back as user-facing copy and render under the field.
  const handleSaveName = useCallback(async () => {
    setSavingName(true);
    setNameError(null);
    const result = await usernameService.changeUsername(user?.uid, draft);
    setSavingName(false);

    if (!result.success) {
      setNameError(result.error);
      return;
    }

    setEditingName(false);
    // A partial fan-out still renamed the account — say so plainly
    // rather than claiming a clean success.
    if (result.staleCollections?.length) {
      showError(
        'Renamed, mostly',
        "You're @" + draft.toLowerCase() + " now, but some older posts still " +
          'show the old name. Reopen Settings and save again to retry.',
      );
    } else {
      showToast?.('reward', 'Username updated', '@' + draft.toLowerCase());
    }
  }, [user?.uid, draft, showError, showToast]);

  // handleSignOut — confirms, then signs out. AuthContext's auth-state
  // listener routes back to LandingScreen on its own.
  const handleSignOut = useCallback(() => {
    showConfirm('Sign Out', 'Are you sure you want to sign out?', async () => {
      try {
        await signOut(auth);
      } catch (error) {
        console.error('[Screen:Settings] sign out failed:', error);
        showError('Error', 'Failed to sign out. Please try again.');
      }
    });
  }, [showConfirm, showError]);

  return (
    <AppLayout navigation={navigation}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <Text style={styles.h1}>SETTINGS</Text>

        <Text style={styles.h2}>Account</Text>
        {editingName ? (
          <UsernameEditor
            value={draft}
            onChangeText={setDraft}
            onSave={handleSaveName}
            onCancel={() => setEditingName(false)}
            saving={savingName}
            error={nameError}
          />
        ) : (
          <SettingsRow
            icon="at"
            label="Username"
            desc={`@${username} — tap to change.`}
            onPress={startEditingName}
          />
        )}
        <SettingsRow
          icon="mail-outline"
          iconColor={theme.colors.vibeTeal}
          label="Email"
          desc="Used to sign in. Can't be changed here yet."
          valueText={user?.email || '—'}
        />

        <Text style={styles.h2}>App</Text>
        <SettingsRow
          icon="volume-high"
          iconColor={theme.colors.vibeGreen}
          label="Sound effects"
          desc="Card picks, vote locks and win stings during a game. Vibration stays on either way."
          value={sfxEnabled}
          onValueChange={handleSfxToggle}
        />
        <SettingsRow
          icon="notifications"
          label="Notifications"
          desc="Pick which pushes you get, and manage muted or blocked people."
          onPress={() => navigation.navigate('NotificationSettings')}
        />

        <Text style={styles.h2}>About</Text>
        <SettingsRow
          icon="information-circle-outline"
          iconColor={theme.colors.vibeYellow}
          label="Version"
          desc="Quote this in a bug report."
          valueText={`${APP_VERSION} · ${UPDATE_TAG}`}
        />

        <View style={styles.dangerZone}>
          <SettingsRow
            icon="log-out-outline"
            iconColor={theme.colors.vibePink}
            label="Sign Out"
            destructive
            onPress={handleSignOut}
          />
        </View>
      </ScrollView>
    </AppLayout>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: 20, paddingBottom: 60 },
  h1: {
    color: '#fff',
    fontSize: 24,
    fontWeight: '900',
    letterSpacing: 2,
    marginBottom: 4,
  },
  h2: {
    color: theme.colors.vibeBlue,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 24,
    marginBottom: 6,
  },
  dangerZone: { marginTop: 32 },
});
