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
      {/* Nothing to the left of the resources. The S was tried here
          and removed: the row is the numbers, and a mark beside them
          took width the figures need without telling anyone anything
          the nav bar does not already say. */}
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
    // The resource pills bring their own padding and their own border,
    // so they already read as separated from the edge. 16 on top of
    // that was the header padding doing the pills' job twice over.
    paddingVertical: 9,
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