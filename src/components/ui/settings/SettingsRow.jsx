// SettingsRow — one row on the Settings screen.
//
// Dumb UI only. It renders an icon chip, a label, an optional
// description, and one of three right-hand accessories:
//   - a Switch      (pass `value` + `onValueChange`)
//   - a chevron     (pass `onPress`, no `value`)
//   - a static text (pass `valueText`, e.g. an app version)
//
// Keeping the three shapes in one component is what makes the
// Settings screen read as a single list instead of three different
// looking ones. All state and persistence lives in the screen.

import React from 'react';
import { View, Text, StyleSheet, Switch, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../../theme/themes';

export default function SettingsRow({
  icon,
  iconColor = theme.colors.vibeBlue,
  label,
  desc,
  value,
  onValueChange,
  valueText,
  onPress,
  disabled = false,
  destructive = false,
}) {
  const isSwitch = typeof value === 'boolean';
  // A switch row must not also swallow taps as navigation — the
  // Switch owns the gesture, so only non-switch rows get pressable.
  const pressable = !!onPress && !isSwitch;
  const Wrapper = pressable ? Pressable : View;
  // Only Pressable accepts a style callback; handing one to a plain
  // View leaves it unstyled.
  const wrapperProps = pressable
    ? {
        onPress,
        disabled,
        style: ({ pressed }) => [styles.row, pressed && styles.rowPressed],
      }
    : { style: styles.row };

  return (
    <Wrapper {...wrapperProps}>
      {!!icon && (
        <View style={[styles.iconChip, { borderColor: iconColor }]}>
          <Ionicons name={icon} size={18} color={iconColor} />
        </View>
      )}

      <View style={styles.text}>
        <Text style={[styles.label, destructive && styles.labelDestructive]}>
          {label}
        </Text>
        {!!desc && <Text style={styles.desc}>{desc}</Text>}
      </View>

      {isSwitch ? (
        <Switch
          value={value}
          onValueChange={onValueChange}
          disabled={disabled}
          trackColor={{ true: theme.colors.vibeBlue, false: '#333' }}
          thumbColor="#fff"
        />
      ) : valueText !== undefined ? (
        <Text style={styles.valueText} numberOfLines={1}>{valueText}</Text>
      ) : onPress ? (
        <Ionicons
          name="chevron-forward"
          size={18}
          color={theme.colors.textSecondary}
        />
      ) : null}
    </Wrapper>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
  },
  rowPressed: { backgroundColor: 'rgba(0,198,255,0.06)' },
  iconChip: {
    width: 34,
    height: 34,
    borderRadius: 10,
    borderWidth: 1.5,
    backgroundColor: 'rgba(255,255,255,0.04)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: { flex: 1, paddingRight: 8 },
  label: { color: '#fff', fontSize: 15, fontWeight: '700' },
  labelDestructive: { color: theme.colors.vibePink },
  desc: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 2,
    lineHeight: 16,
  },
  valueText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: '600',
    maxWidth: 140,
  },
});
