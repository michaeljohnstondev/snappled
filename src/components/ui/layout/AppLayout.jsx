import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../../store/AuthContext';
import HomeHeader from '../headers/HomeHeader';
import UpdateBanner from '../UpdateBanner';
import UploadProgressToast from '../UploadProgressToast';
import { useAppUpdate } from '../../../hooks/useAppUpdate';
import theme from '../../../theme/themes';
import { useTheme, useThemedStyles } from '../../../theme/ThemeContext';

// The version tag is gone from the chrome. It existed to answer "is
// this device actually on the update I just shipped", which mattered
// while OTAs were being pushed constantly and a stale bundle was the
// first suspect for any bug report. It stopped earning its corner of
// every screen. useAppUpdate still drives UpdateBanner; only the
// readout and its two imports went.

/**
 * Wraps a screen with:
 * - Background gradient
 * - SafeArea
 * - HomeHeader (resource bar) at top — every stat is now
 *   press-and-hold for an info popup (no tap actions).
 *
 * The bottom nav bar is now handled by BottomTabNavigator at the root.
 */
export default function AppLayout({ navigation, children, hideHeader = false }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user, userCurrency } = useAuth();
  // OTA: silently downloads new bundles on launch + foreground and
  // surfaces a Restart banner the moment one is ready, so users never
  // run stale JS for longer than a single session.
  const { isUpdateReady, applyUpdate } = useAppUpdate();

  const userStats = {
    tokens: userCurrency.tokens || 0,
    coins: userCurrency.coins || 0,
    trophies: userCurrency.trophies || 0,
    level: userCurrency.level || 1,
    xp: userCurrency.xp || user?.profile?.experience || 0,
    username: user?.username || user?.email?.split('@')[0] || 'Player',
  };

  const handleProfilePress = () => navigation?.navigate('UserProfile', { userId: user?.uid });
  const handleAdminPress = () => navigation?.navigate('Admin');

  return (
    <LinearGradient colors={t.colors.backgroundGradient} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {!hideHeader && (
          <HomeHeader
            userStats={userStats}
            onProfilePress={handleProfilePress}
            onAdminPress={handleAdminPress}
            userId={user?.uid}
          />
        )}
        <View style={styles.content}>{children}</View>
      </SafeAreaView>

      <UpdateBanner visible={isUpdateReady} onRestart={applyUpdate} />

      <UploadProgressToast />
    </LinearGradient>
  );
}

const makeStyles = (t) => ({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { flex: 1 },
});
