import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ResourceContainer from './ResourceContainer';
import UserMenu from '../UserMenu';
import theme from '../../../theme/themes';

export default function HomeHeader({ userStats, onProfilePress, onTokenPress }) {
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
      
      <ResourceContainer userStats={userStats} onTokenPress={onTokenPress} />

      <UserMenu
        visible={showUserMenu}
        onClose={handleMenuClose}
        onProfilePress={handleUserProfilePress}
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