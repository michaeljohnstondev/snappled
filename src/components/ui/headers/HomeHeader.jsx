import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ResourceContainer from './ResourceContainer';
import UserMenu from '../UserMenu';
import theme from '../../../theme/themes';

export default function HomeHeader({ userStats, onProfilePress, onAdminPress, userId }) {
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
          <Ionicons name="person" size={20} color={theme.colors.textSecondary} />
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

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
    gap: 12,
    // Was transparent, showing the app gradient through. The resource bar
    // is chrome and stays dark in both themes (same call as the nav bar
    // and the in-round header), so it needs its own fill now — otherwise
    // its white text would sit on the light background.
    backgroundColor: theme.colors.background,
  },
  profileContainer: {
    // Remove flex: 1 to eliminate gap
  },
  profileImage: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    justifyContent: 'center',
    alignItems: 'center',
  },
});