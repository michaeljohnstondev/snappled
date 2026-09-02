import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ResourceContainer from './ResourceContainer';
import UserMenu from '../UserMenu';
import theme from '../../../theme/themes';
import { useTheme, useThemedStyles } from '../../../theme/ThemeContext';

export default function HomeHeader({ userStats, onProfilePress, onAdminPress, userId }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const handleProfilePress = () => {
    setShowUserMenu(!showUserMenu);
  };

  const handleMenuClose = () => {
    setShowUserMenu(false);
  };

  const handleUserProfilePress = () => {
    onProfilePress?.();
  };

  return (
    <View style={styles.header}>
      <View style={styles.profileContainer}>
        <Pressable style={styles.profileImage} onPress={handleProfilePress}>
          <Ionicons name="person" size={20} color={t.colors.textSecondary} />
        </Pressable>
      </View>
      
      <ResourceContainer userStats={userStats} />

      <UserMenu
        visible={showUserMenu}
        onClose={handleMenuClose}
        onProfilePress={handleUserProfilePress}
        onAdminPress={onAdminPress}
        userId={userId}
      />
    </View>
  );
}

const makeStyles = (t) => ({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    gap: 12,
  },
  profileContainer: {
    // Remove flex: 1 to eliminate gap
  },
  profileImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: t.colors.inputBackground,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});