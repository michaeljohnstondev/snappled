import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';

const VibeHelpButton = ({ onPress, style, size = 'normal' }) => {
  const buttonStyle = size === 'small' ? styles.smallButton : styles.button;
  const textStyle = size === 'small' ? styles.smallText : styles.text;

  return (
    <TouchableOpacity
      style={[buttonStyle, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={textStyle}>?</Text>
    </TouchableOpacity>
  );
};

const VibeHelpTextButton = ({ onPress, style, label = 'Need help?' }) => {
  return (
    <TouchableOpacity
      style={[styles.textButton, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.textButtonLabel}>💡 {label}</Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  smallButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#4CAF50',
    justifyContent: 'center',
    alignItems: 'center',
  },
  text: {
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
  smallText: {
    color: '#fff',
    fontSize: 12,
    fontWeight: 'bold',
  },
  textButton: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(76, 175, 80, 0.1)',
    borderWidth: 1,
    borderColor: '#4CAF50',
    alignItems: 'center',
  },
  textButtonLabel: {
    color: '#4CAF50',
    fontSize: 13,
    fontWeight: '500',
  },
});

export { VibeHelpButton, VibeHelpTextButton };
export default VibeHelpButton;
