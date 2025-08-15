import React from 'react';
import { Modal, View, Text, StyleSheet, Pressable, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import VibeButton from './VibeButton';
import theme from '../../theme/themes';

const { width: screenWidth } = Dimensions.get('window');

export default function VibeModal({ 
  visible, 
  title, 
  message, 
  buttons = [], 
  onClose,
  type = 'info' // 'info', 'confirm', 'error', 'success'
}) {
  const getTypeColor = () => {
    switch (type) {
      case 'error': return '#FF4444';
      case 'success': return '#00FF41';
      case 'confirm': return '#00C6FF';
      default: return theme.colors.shadowGlow;
    }
  };

  const getTypeIcon = () => {
    switch (type) {
      case 'error': return '⚠️';
      case 'success': return '✓';
      case 'confirm': return '?';
      default: return 'ℹ️';
    }
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.modalContainer}>
          <LinearGradient
            colors={['#0A0A0A', '#1A1A2E', '#16213E']}
            style={styles.modal}
          >
            {/* Header */}
            <View style={[styles.header, { borderBottomColor: getTypeColor() }]}>
              <Text style={styles.icon}>{getTypeIcon()}</Text>
              <Text style={[styles.title, { color: getTypeColor() }]}>
                {title?.toUpperCase() || 'SYSTEM'}
              </Text>
            </View>

            {/* Message */}
            <View style={styles.content}>
              <Text style={styles.message}>{message}</Text>
            </View>

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              {buttons.length > 0 ? (
                buttons.map((button, index) => (
                  <VibeButton
                    key={index}
                    label={button.text?.toUpperCase() || 'OK'}
                    onPress={() => {
                      button.onPress?.();
                      onClose();
                    }}
                    style={[
                      styles.button,
                      buttons.length === 1 ? styles.singleButton : styles.multiButton
                    ]}
                  />
                ))
              ) : (
                <VibeButton
                  label="OK"
                  onPress={onClose}
                  style={styles.singleButton}
                />
              )}
            </View>
          </LinearGradient>
        </View>
      </Pressable>
    </Modal>
  );
}

export function VibeAlert(title, message, buttons) {
  // This will be used by our updated VibeAlert function
  return { title, message, buttons, type: 'info' };
}

export function VibeConfirm(title, message, onConfirm, onCancel) {
  return {
    title,
    message,
    type: 'confirm',
    buttons: [
      {
        text: 'Cancel',
        onPress: onCancel
      },
      {
        text: 'Confirm',
        onPress: onConfirm
      }
    ]
  };
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  modalContainer: {
    width: Math.min(screenWidth - 40, 400),
    maxHeight: '80%',
  },
  modal: {
    borderRadius: 16,
    borderWidth: 2,
    borderColor: 'rgba(0, 255, 255, 0.3)',
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
    borderBottomWidth: 1,
    backgroundColor: 'rgba(0, 255, 255, 0.05)',
  },
  icon: {
    fontSize: 20,
    marginRight: 12,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    fontFamily: theme.fonts.main,
    flex: 1,
  },
  content: {
    padding: 20,
  },
  message: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    lineHeight: 24,
    fontFamily: theme.fonts.main,
  },
  buttonContainer: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
  },
  button: {
    marginVertical: 0,
  },
  singleButton: {
    flex: 1,
  },
  multiButton: {
    flex: 1,
  },
});