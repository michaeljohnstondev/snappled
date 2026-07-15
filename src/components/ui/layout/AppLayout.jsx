import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import Constants from 'expo-constants';
import * as Updates from 'expo-updates';
import { useAuth } from '../../../store/AuthContext';
import HomeHeader from '../headers/HomeHeader';
import UpdateBanner from '../UpdateBanner';
import UploadProgressToast from '../UploadProgressToast';
import { useAppUpdate } from '../../../hooks/useAppUpdate';
import theme from '../../../theme/themes';

const APP_VERSION = Constants.expoConfig?.version || '?';
const UPDATE_TAG = Updates.updateId
  ? Updates.updateId.slice(0, 8)
  : 'embed';

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
    <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
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

      <Text style={styles.versionTag} pointerEvents="none">
        v{APP_VERSION} · {UPDATE_TAG}
      </Text>

      <UpdateBanner visible={isUpdateReady} onRestart={applyUpdate} />

      <UploadProgressToast />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { flex: 1 },
  versionTag: {
    position: 'absolute',
    top: 6,
    left: 10,
    color: '#00C6FF',
    fontSize: 11,
    fontFamily: 'monospace',
    fontWeight: 'bold',
    backgroundColor: 'rgba(0,0,0,0.6)',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
