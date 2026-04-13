import React from 'react';
import { View, Text, StyleSheet, Modal, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../../theme/themes';

const SORT_OPTIONS = [
  { label: 'Hot', value: 'hot' },
  { label: 'Newest', value: 'time' },
  { label: 'Likes', value: 'likes' },
  { label: 'Views', value: 'views' },
  { label: 'Price', value: 'price' },
];

export default function SortModal({ visible, onClose, sortBy, ascending, onSelect }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.overlay} onPress={onClose}>
        <View style={styles.modal}>
          <Text style={styles.title}>Sort By</Text>

          {SORT_OPTIONS.map(opt => {
            const isActive = sortBy === opt.value;
            return (
              <Pressable
                key={opt.value}
                style={[styles.option, isActive && styles.optionActive]}
                onPress={() => {
                  if (isActive) {
                    onSelect(opt.value, !ascending);
                  } else {
                    onSelect(opt.value, false);
                  }
                  onClose();
                }}
              >
                <Text style={[styles.optionText, isActive && styles.optionTextActive]}>
                  {opt.label}
                </Text>
                {isActive && (
                  <Ionicons
                    name={ascending ? 'arrow-up' : 'arrow-down'}
                    size={16}
                    color={theme.colors.vibeBlue}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  modal: {
    width: '100%',
    backgroundColor: theme.colors.background,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
    padding: 16,
    gap: 8,
  },
  title: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
    marginBottom: 8,
  },
  option: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  optionActive: {
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0, 198, 255, 0.1)',
  },
  optionText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: theme.fontWeights.semiBold,
  },
  optionTextActive: {
    color: theme.colors.vibeBlue,
  },
});
