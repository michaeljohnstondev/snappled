import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../../theme/themes';
import { useTheme, useThemedStyles } from '../../../theme/ThemeContext';

export default function TokenPromptModal({
  visible,
  onClose,
  onCreatePrompt,
  userTokens = 0,
  navigation,
}) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const handleCreatePrompt = () => {
    onCreatePrompt?.();
    onClose();
  };

  const handleBuyTickets = () => {
    onClose();
    navigation?.navigate?.('Store');
  };

  const hasTickets = userTokens >= 1;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <Pressable style={styles.modal} onPress={(e) => e.stopPropagation()}>
          <View style={styles.header}>
            <View style={styles.iconCircle}>
              <Ionicons name="ticket" size={32} color={theme.colors.vibeYellow} />
            </View>
            <Text style={styles.title}>Topic Tickets</Text>
            <Text style={styles.subtitle}>
              Use a ticket to create your own custom prompt for the community
            </Text>
          </View>

          <View style={styles.balanceCard}>
            <Text style={styles.balanceLabel}>Your Balance</Text>
            <Text style={styles.balanceValue}>{userTokens} ticket{userTokens !== 1 ? 's' : ''}</Text>
          </View>

          <View style={styles.buttonContainer}>
            {hasTickets ? (
              <Pressable style={styles.primaryBtn} onPress={handleCreatePrompt}>
                <Text style={styles.primaryBtnText}>Create Prompt (1 Ticket)</Text>
              </Pressable>
            ) : (
              <Pressable style={styles.primaryBtn} onPress={handleBuyTickets}>
                <Text style={styles.primaryBtnText}>Buy Tickets</Text>
              </Pressable>
            )}
            <Pressable style={styles.secondaryBtn} onPress={onClose}>
              <Text style={styles.secondaryBtnText}>Close</Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const makeStyles = (t) => ({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
  },
  modal: {
    width: '100%',
    maxWidth: 400,
    backgroundColor: '#0a0f1e',
    borderRadius: 16,
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
    padding: 24,
  },
  header: {
    alignItems: 'center',
    marginBottom: 20,
  },
  iconCircle: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: 'rgba(255,215,0,0.1)',
    borderWidth: 2,
    borderColor: theme.colors.vibeYellow,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    color: 'white',
    fontSize: 22,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  balanceCard: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 2,
    borderColor: t.colors.divider,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 20,
    marginBottom: 20,
    alignItems: 'center',
  },
  balanceLabel: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    fontWeight: theme.fontWeights.semiBold,
    marginBottom: 4,
  },
  balanceValue: {
    color: theme.colors.vibeYellow,
    fontSize: 22,
    fontWeight: theme.fontWeights.bold,
  },
  buttonContainer: {
    gap: 10,
  },
  primaryBtn: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  primaryBtnText: {
    color: theme.colors.vibeBlue,
    fontSize: 15,
    fontWeight: theme.fontWeights.bold,
  },
  secondaryBtn: {
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: 'center',
  },
  secondaryBtnText: {
    color: 'white',
    fontSize: 15,
    fontWeight: theme.fontWeights.bold,
  },
});
