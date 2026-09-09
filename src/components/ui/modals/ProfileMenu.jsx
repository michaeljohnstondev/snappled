// ProfileMenu — the hamburger on your own profile.
//
// Gathers the things that are ABOUT your account rather than part of
// browsing it: settings, achievements, signing out, and the version
// string. Those were scattered — two of them were buttons taking up a
// block on the profile itself, and the other two were rows inside
// Settings, which is meant for things you change rather than a fact to
// read and a way to leave.
//
// Only on your own profile. Nothing here means anything on someone
// else's, so the caller simply doesn't render it there.

import React from 'react';
import { View, Text, Pressable, Modal, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../../theme/themes';
import { useTheme, useThemedStyles } from '../../../theme/ThemeContext';

/**
 * @param {boolean} visible
 * @param {Function} onClose
 * @param {Function} onSettings, onAchievements, onSignOut
 * @param {string} version  shown, not tappable — it exists to be read
 *   out in a bug report
 */
export default function ProfileMenu({
  visible, onClose, onSettings, onAchievements, onSignOut, version,
}) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);

  // Closes before acting. Navigating with the modal still mounted
  // leaves it stacked over the destination on the way back.
  const go = (fn) => () => { onClose?.(); setTimeout(() => fn?.(), 0); };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={() => {}}>
          <Pressable style={styles.row} onPress={go(onAchievements)}>
            <Ionicons name="trophy" size={20} color={theme.colors.vibeYellow} />
            <Text style={styles.label}>Achievements</Text>
            <Ionicons name="chevron-forward" size={18} color={t.colors.textSecondary} />
          </Pressable>

          <Pressable style={styles.row} onPress={go(onSettings)}>
            <Ionicons name="settings-sharp" size={20} color={theme.colors.vibeBlue} />
            <Text style={styles.label}>Settings</Text>
            <Ionicons name="chevron-forward" size={18} color={t.colors.textSecondary} />
          </Pressable>

          <View style={styles.divider} />

          <Pressable style={styles.row} onPress={go(onSignOut)}>
            <Ionicons name="log-out-outline" size={20} color={theme.colors.vibePink} />
            <Text style={[styles.label, styles.danger]}>Sign Out</Text>
          </Pressable>

          {/* Not a row you can press. It is here to be read out when
              something goes wrong, which is the only time anyone wants
              it — and the reason it no longer sits on every screen. */}
          <Text style={styles.version}>{version}</Text>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (t) => ({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: '#0A1A2A',
    borderTopWidth: 2,
    borderColor: theme.colors.vibeBlue,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 8,
    paddingBottom: 28,
    paddingHorizontal: 16,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    paddingVertical: 16,
  },
  label: {
    flex: 1,
    color: t.colors.textPrimary,
    fontSize: 16,
    fontWeight: '700',
  },
  danger: { color: theme.colors.vibePink },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.12)',
    marginVertical: 4,
  },
  version: {
    color: t.colors.textSecondary,
    fontSize: 11,
    textAlign: 'center',
    marginTop: 10,
    fontVariant: ['tabular-nums'],
  },
});
