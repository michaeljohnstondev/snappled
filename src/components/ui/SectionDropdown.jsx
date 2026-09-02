// SectionDropdown — a single pill button that shows the currently-
// selected section label + chevron; tap opens a modal with the full
// options list. Used on profile screens where four labels
// (Created / Deck / Collection / Saved) don't fit as side-by-side
// segments without wrapping or shrinking inconsistently.
//
// Same options-shape as VibeSegmentedControl so callers can swap
// components without reshaping their tabOptions arrays.

import React, { useState } from 'react';
import { View, Text, StyleSheet, Pressable, Modal } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

export default function SectionDropdown({ options, selectedValue, onSelect, style }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [open, setOpen] = useState(false);
  const current = options.find(o => o.value === selectedValue) || options[0];

  // Called when the user picks a menu item — mirrors segmented
  // control's onSelect signature so parent screens don't care which
  // control they're using.
  const pick = (opt) => {
    setOpen(false);
    onSelect?.(opt.value);
  };

  return (
    <View style={[styles.wrap, style]}>
      <Pressable style={styles.trigger} onPress={() => setOpen(true)}>
        <Text style={styles.triggerText} numberOfLines={1}>
          {current?.icon ? `${current.icon} ` : ''}{current?.label || 'Select'}
        </Text>
        <Ionicons name="chevron-down" size={18} color={theme.colors.vibeBlue} />
      </Pressable>

      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => setOpen(false)}
      >
        <Pressable style={styles.overlay} onPress={() => setOpen(false)}>
          <Pressable style={styles.menu} onPress={() => {}}>
            {options.map((opt) => {
              const isActive = opt.value === selectedValue;
              return (
                <Pressable
                  key={opt.value}
                  style={[styles.item, isActive && styles.itemActive]}
                  onPress={() => pick(opt)}
                >
                  <Text style={[styles.itemText, isActive && styles.itemTextActive]}>
                    {opt.icon ? `${opt.icon} ` : ''}{opt.label}
                  </Text>
                  {isActive ? (
                    <Ionicons name="checkmark" size={18} color={theme.colors.vibeGreen} />
                  ) : null}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (t) => ({
  wrap: {
    // Parent controls positioning; the wrap is just a passthrough.
  },
  trigger: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  triggerText: {
    color: t.colors.textPrimary,
    fontSize: 15,
    fontWeight: '700',
    flex: 1,
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  menu: {
    width: '100%',
    maxWidth: 320,
    backgroundColor: '#0a0f1e',
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    paddingVertical: 6,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 14,
    paddingHorizontal: 18,
  },
  itemActive: {
    backgroundColor: 'rgba(0, 198, 255, 0.12)',
  },
  itemText: {
    color: t.colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  itemTextActive: {
    color: theme.colors.vibeGreen,
    fontWeight: '800',
  },
});
