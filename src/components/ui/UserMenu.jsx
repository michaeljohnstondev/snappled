import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { signOut } from 'firebase/auth';
import { auth } from '../../services/firebase';
import { useModal } from '../../store/ModalContext';
import theme from '../../theme/themes';

const ADMIN_UIDS = ['SrB8T1TmftQzu90H7phQkRJXkRn2'];

// Top-right user menu (profile / admin / sign out). Uses VibeAlerts
// (showConfirm / showError from ModalContext) to keep the look
// consistent with the rest of the app — native Alert.alert was the
// outlier breaking the punk theme.
export default function UserMenu({ visible, onClose, onProfilePress, onAdminPress, userId }) {
  const { showConfirm, showError } = useModal();

  // Confirm via VibeAlert, then sign the user out. AuthContext routes
  // them back to LandingScreen automatically on auth state change.
  const handleLogout = () => {
    showConfirm(
      'Sign Out',
      'Are you sure you want to sign out?',
      async () => {
        try {
          await signOut(auth);
          onClose();
        } catch (error) {
          console.error('Error signing out:', error);
          showError('Error', 'Failed to sign out. Please try again.');
        }
      },
    );
  };

  const handleProfilePress = () => {
    onProfilePress?.();
    onClose();
  };

  if (!visible) return null;

  return (
    <>
      {/* Backdrop */}
      <Pressable style={styles.backdrop} onPress={onClose} />
      
      {/* Menu */}
      <View style={styles.menuContainer}>
        <LinearGradient
          colors={['rgba(0,0,0,0.9)', 'rgba(0,0,0,0.8)']}
          style={styles.menu}
        >
          {/* Profile Button */}
          <Pressable style={styles.menuItem} onPress={handleProfilePress}>
            <View style={styles.menuIconContainer}>
              <Ionicons name="person-outline" size={20} color={theme.colors.vibeBlue} />
            </View>
            <Text style={styles.menuText}>Profile</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
          </Pressable>

          {/* Admin Button — only for admins */}
          {ADMIN_UIDS.includes(userId) && (
            <>
              <View style={styles.divider} />
              <Pressable style={styles.menuItem} onPress={() => { onAdminPress?.(); onClose(); }}>
                <View style={styles.menuIconContainer}>
                  <Ionicons name="shield-outline" size={20} color={theme.colors.vibeGreen} />
                </View>
                <Text style={styles.menuText}>Admin</Text>
                <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
              </Pressable>
            </>
          )}

          {/* Divider */}
          <View style={styles.divider} />

          {/* Logout Button */}
          <Pressable style={styles.menuItem} onPress={handleLogout}>
            <View style={styles.menuIconContainer}>
              <Ionicons name="log-out-outline" size={20} color={theme.colors.vibePink} />
            </View>
            <Text style={[styles.menuText, styles.logoutText]}>Sign Out</Text>
            <Ionicons name="chevron-forward" size={16} color={theme.colors.textSecondary} />
          </Pressable>
        </LinearGradient>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'transparent',
    zIndex: 5,
  },
  menuContainer: {
    position: 'absolute',
    top: 70,
    left: 20,
    zIndex: 10,
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  menu: {
    minWidth: 160,
    paddingVertical: 8,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  menuIconContainer: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  menuText: {
    flex: 1,
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: theme.fontWeights.medium,
  },
  logoutText: {
    color: theme.colors.vibePink,
  },
  divider: {
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    marginHorizontal: 16,
    marginVertical: 4,
  },
});