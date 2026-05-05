import React, { useState, useCallback, useEffect } from 'react';
import { View, StyleSheet, Platform, StatusBar as RNStatusBar, Dimensions } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
const SafeAreaView = ({ children, style }) => <View style={style}>{children}</View>;
import { LinearGradient } from 'expo-linear-gradient';
import { useAuth } from '../../../store/AuthContext';
import HomeHeader from '../headers/HomeHeader';
import ButtonContainer from '../navigation/ButtonContainer';
import NavButton from '../navigation/NavButton';
import RecordNavButton from '../navigation/RecordNavButton';
import TokenPromptModal from '../modals/TokenPromptModal';
import theme from '../../../theme/themes';

/**
 * Wraps a screen with the standard chrome:
 * - Background gradient
 * - SafeArea
 * - HomeHeader (resource bar) at top
 * - ButtonContainer (nav bar) at bottom
 * - Token modal handling
 *
 * Usage:
 *   <AppLayout navigation={navigation} active="profile">
 *     {screen content}
 *   </AppLayout>
 *
 * active values: 'prompts' | 'play' | 'profile' | 'store' | null
 */
export default function AppLayout({ navigation, active, children, hideNav = false, hideHeader = false }) {
  const { user, userCurrency } = useAuth();
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [screenHeight, setScreenHeight] = useState(Dimensions.get('screen').height);
  const [settling, setSettling] = useState(false);

  // Force system UI re-hide on focus + recalc dimensions + brief settle delay
  useFocusEffect(
    useCallback(() => {
      RNStatusBar.setHidden(true, 'fade');
      if (Platform.OS === 'android') {
        try {
          const NavigationBar = require('expo-navigation-bar');
          NavigationBar.setVisibilityAsync('hidden').catch(() => {});
          NavigationBar.setBehaviorAsync('overlay-swipe').catch(() => {});
        } catch (e) {}
      }
      // Brief settle period to let Android re-layout after camera dismounts
      setSettling(true);
      const t1 = setTimeout(() => {
        setScreenHeight(Dimensions.get('screen').height);
        setSettling(false);
      }, 250);
      return () => clearTimeout(t1);
    }, [])
  );

  // Listen for dimension changes (e.g. after camera releases system bars)
  useEffect(() => {
    const sub = Dimensions.addEventListener('change', ({ screen }) => {
      setScreenHeight(screen.height);
    });
    return () => sub?.remove();
  }, []);

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
      key={screenHeight}
      colors={theme.colors.backgroundGradient}
      style={styles.container}
    >
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
        <View style={styles.content}>{settling ? null : children}</View>
        {!hideNav && (
          <ButtonContainer>
            <NavButton title="Prompts" onPress={() => navigation?.navigate('Home')} active={active === 'prompts'} />
            <NavButton title="Play" onPress={() => navigation?.navigate('Game')} active={active === 'play'} />
            <RecordNavButton onPress={() => navigation?.navigate('Record', { prompt: null })} />
            <NavButton title="Profile" onPress={() => navigation?.navigate('UserProfile', { userId: user?.uid })} active={active === 'profile'} />
            <NavButton title="Store" onPress={() => navigation?.navigate('Store')} active={active === 'store'} />
          </ButtonContainer>
        )}
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
