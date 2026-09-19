import React, { useState } from 'react';
import { View, StyleSheet, Pressable, Image } from 'react-native';
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
      {/* The S, trimmed out of the adaptive icon into its own asset -
          icon-android.png carries Android's safe-zone padding, so the
          art fills only 52% of that canvas and would have rendered at
          half whatever size it was given.

          Worth watching: the person badge used to sit here and was
          removed partly because it cost the resource row the width its
          numbers need. This takes some of that back, so if the coin or
          trophy figures start truncating at four digits, this is why. */}
      <Image
        source={require('../../../assets/images/logo-s.png')}
        style={styles.logo}
        resizeMode="contain"
      />

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
  // 34x30 is the trimmed art's own aspect (532x468), matched to the
  // 34pt height of the resource pills beside it so the row reads as one
  // band rather than a logo floating next to some buttons.
  logo: {
    width: 34,
    height: 30,
    marginRight: 10,
  },
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