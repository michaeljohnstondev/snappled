import React, { useState } from 'react';
import { View, Text, StyleSheet, Dimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
// All system UI hiding removed for testing
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
  const [layoutDims, setLayoutDims] = useState({ w: 0, h: 0 });
  const screen = Dimensions.get('screen');
  const win = Dimensions.get('window');

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
    <LinearGradient
      colors={theme.colors.backgroundGradient}
      style={styles.container}
      onLayout={(e) => {
        const { width, height } = e.nativeEvent.layout;
        setLayoutDims({ w: Math.round(width), h: Math.round(height) });
      }}
    >
      <View style={styles.debugBox} pointerEvents="none">
        <Text style={styles.debugText}>L:{layoutDims.w}x{layoutDims.h}</Text>
        <Text style={styles.debugText}>W:{Math.round(win.width)}x{Math.round(win.height)}</Text>
        <Text style={styles.debugText}>S:{Math.round(screen.width)}x{Math.round(screen.height)}</Text>
      </View>
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
  debugBox: {
    position: 'absolute',
    top: 50,
    right: 10,
    backgroundColor: 'rgba(255,0,0,0.9)',
    padding: 6,
    borderRadius: 6,
    zIndex: 9999,
  },
  debugText: {
    color: '#fff',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
