// SectionTabs.jsx — the app's tab pills.
//
// The Store already had a tab look: dark pills, a 2pt divider border, and
// cyan fill + cyan text when active. Anywhere else that needed tabs was
// reaching for VibeSegmentedControl, a joined iOS-style bar that reads as
// a different app. This is the Store's look as a component, so new tabs
// match without copying styles around.
//
// Tabs share the row equally. With two or three options that reads as a
// deliberate control rather than a couple of buttons left-aligned.

import React from 'react';
import { View, Text, Pressable } from 'react-native';
import theme from '../../theme/themes';
import { useThemedStyles } from '../../theme/ThemeContext';

/**
 * @param {{label: string, value: string}[]} options
 * @param {string} value     the selected option's value
 * @param {Function} onChange called with the tapped option's value
 */
export default function SectionTabs({ options, value, onChange, style }) {
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={[styles.row, style]}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <Pressable
            key={o.value}
            onPress={() => onChange(o.value)}
            style={({ pressed }) => [
              styles.tab,
              active && styles.tabActive,
              pressed && styles.pressed,
            ]}
          >
            <Text style={[styles.text, active && styles.textActive]} numberOfLines={1}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (t) => ({
  row: { flexDirection: 'row', gap: 8 },
  tab: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 2,
    borderColor: t.colors.divider,
  },
  tabActive: {
    backgroundColor: 'rgba(0,198,255,0.15)',
    borderColor: theme.colors.vibeBlue,
  },
  pressed: { opacity: 0.7 },
  text: {
    fontSize: 13,
    fontWeight: theme.fontWeights.bold,
    color: t.colors.textSecondary,
  },
  textActive: { color: theme.colors.vibeBlue },
});
