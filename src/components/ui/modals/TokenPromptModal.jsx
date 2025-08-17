import React from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  Pressable 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { BlurView } from 'expo-blur';
import VibeButton from '../VibeButton';
import theme from '../../../theme/themes';

export default function TokenPromptModal({ 
  visible, 
  onClose, 
  onCreatePrompt,
  userTokens = 0 
}) {
  const handleCreatePrompt = () => {
    onCreatePrompt?.();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent={true}
      onRequestClose={onClose}
    >
      <View style={styles.overlay}>
        <BlurView intensity={20} style={styles.blurBackground}>
          <Pressable style={styles.backdrop} onPress={onClose} />
          
          <View style={styles.modalContainer}>
            <LinearGradient
              colors={['rgba(18, 3, 48, 0.95)', 'rgba(11, 17, 37, 0.95)']}
              style={styles.modal}
            >
              {/* Header */}
              <View style={styles.header}>
                <View style={styles.tokenIcon}>
                  <Ionicons name="ticket" size={32} color={theme.colors.vibePink} />
                </View>
                <Text style={styles.title}>Create Custom Prompt</Text>
                <Text style={styles.subtitle}>
                  Spend 1 token to create your own prompt for the community
                </Text>
              </View>

              {/* Token Info */}
              <View style={styles.tokenInfo}>
                <Text style={styles.tokenText}>
                  You have {userTokens} token{userTokens !== 1 ? 's' : ''} available
                </Text>
              </View>

              {/* Buttons */}
              <View style={styles.buttonContainer}>
                <VibeButton
                  label="Create Prompt (1 Token)"
                  onPress={handleCreatePrompt}
                  style={styles.createButton}
                  textStyle={styles.createButtonText}
                  disabled={userTokens < 1}
                />

                <Pressable style={styles.cancelButton} onPress={onClose}>
                  <Text style={styles.cancelButtonText}>Cancel</Text>
                </Pressable>
              </View>
            </LinearGradient>
          </View>
        </BlurView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  blurBackground: {
    flex: 1,
    width: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  modalContainer: {
    width: '85%',
    maxWidth: 350,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  modal: {
    padding: 24,
    alignItems: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  tokenIcon: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255, 20, 147, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 20,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  tokenInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 8,
    marginBottom: 24,
  },
  tokenText: {
    color: theme.colors.vibePink,
    fontSize: 14,
    fontWeight: theme.fontWeights.semiBold,
    textAlign: 'center',
  },
  buttonContainer: {
    width: '100%',
    gap: 12,
  },
  createButton: {
    backgroundColor: 'rgba(255, 20, 147, 0.15)',
    borderColor: theme.colors.vibePink,
    borderWidth: 2,
    paddingVertical: 16,
    borderRadius: 12,
    shadowColor: theme.colors.vibePink,
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 6,
  },
  createButtonText: {
    color: theme.colors.vibePink,
    fontSize: 16,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
    width: '100%',
  },
  cancelButton: {
    paddingVertical: 14,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  cancelButtonText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: theme.fontWeights.medium,
    textAlign: 'center',
  },
});