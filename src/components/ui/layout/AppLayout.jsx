import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../../store/AuthContext';
import HomeHeader from '../headers/HomeHeader';
import TokenPromptModal from '../modals/TokenPromptModal';
import theme from '../../../theme/themes';

/**
 * Wraps a screen with:
 * - Background gradient
 * - SafeArea
 * - HomeHeader (resource bar) at top
 * - Token modal handling
 *
 * The bottom nav bar is now handled by BottomTabNavigator at the root.
 */
export default function AppLayout({ navigation, children, hideHeader = false }) {
  const { user, userCurrency } = useAuth();
  const [showTokenModal, setShowTokenModal] = useState(false);

  const userStats = {
    tokens: userCurrency.tokens || 0,
    coins: userCurrency.coins || 0,
    trophies: userCurrency.trophies || 0,
    level: userCurrency.level || 1,
    xp: userCurrency.xp || user?.profile?.experience || 0,
    username: user?.username || user?.email?.split('@')[0] || 'Player',
  };

  const handleProfilePress = () => navigation?.navigate('UserProfile', { userId: user?.uid });
  const handleTokenPress = () => setShowTokenModal(true);
  const handleAdminPress = () => navigation?.navigate('Admin');
  const handleCreatePrompt = () => navigation?.navigate('CreatePrompt');

  return (
    <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        {!hideHeader && (
          <HomeHeader
            userStats={userStats}
            onProfilePress={handleProfilePress}
            onTokenPress={handleTokenPress}
            onAdminPress={handleAdminPress}
            userId={user?.uid}
          />
        )}
        <View style={styles.content}>{children}</View>
      </SafeAreaView>

      <TokenPromptModal
        visible={showTokenModal}
        onClose={() => setShowTokenModal(false)}
        onCreatePrompt={handleCreatePrompt}
        userTokens={userStats.tokens}
        navigation={navigation}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  content: { flex: 1 },
});
