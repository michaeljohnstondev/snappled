// RoundPromptBanner — richer prompt card used across the round
// screens. Left cyan stripe, pink PROMPT label + "ROUND N" (adds
// "OF M" only when a max round is set), big prompt title, and an
// optional subtitle underneath. Rounded, not edge-to-edge — sits
// as a card inside the phase's padded content area.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../../theme/themes';
import { useTheme, useThemedStyles } from '../../../theme/ThemeContext';

// Render the banner. `round` is 1-based; `totalRounds` is optional
// (0 or null = infinite mode, hides the "OF M" suffix). `subtitle`
// is optional — omit to render just the prompt. `onEdit`/`onDelete`
// are admin-only handlers; when passed, small pencil/X icons appear
// in the top-right corner. Kept intentionally tiny so they don't
// look like player actions.
export default function RoundPromptBanner({
  prompt,
  round,
  totalRounds,
  subtitle,
  onEdit,
  onDelete,
}) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const roundText = totalRounds
    ? `ROUND ${round} OF ${totalRounds}`
    : `ROUND ${round}`;
  return (
    <View style={styles.card}>
      <View style={styles.stripe} />
      <View style={styles.body}>
        <View style={styles.labelRow}>
          <Text style={styles.promptLabel}>PROMPT</Text>
          <Text style={styles.roundLabel}>{roundText}</Text>
        </View>
        <Text style={styles.promptText}>{prompt}</Text>
        {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
      </View>

      {(onEdit || onDelete) ? (
        <View style={styles.adminCorner}>
          {onEdit ? (
            <Pressable style={styles.adminBtn} onPress={onEdit} hitSlop={6}>
              <Ionicons name="pencil" size={14} color="rgba(255,255,255,0.7)" />
            </Pressable>
          ) : null}
          {onDelete ? (
            <Pressable style={styles.adminBtn} onPress={onDelete} hitSlop={6}>
              <Ionicons name="close" size={16} color="rgba(255,120,120,0.85)" />
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (t) => ({
  card: {
    flexDirection: 'row',
    marginHorizontal: 12,
    marginTop: 4,
    marginBottom: 12,
    borderRadius: 14,
    backgroundColor: 'rgba(20, 34, 60, 0.7)',
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(0,198,255,0.2)',
  },
  stripe: {
    width: 4,
    backgroundColor: theme.colors.vibePink,
  },
  body: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 4,
  },
  labelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  promptLabel: {
    color: theme.colors.vibePink,
    fontSize: 11,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  roundLabel: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
  },
  promptText: {
    color: t.colors.textPrimary,
    fontSize: 24,
    fontWeight: '800',
    lineHeight: 30,
    marginTop: 2,
  },
  subtitle: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    marginTop: 6,
  },
  // Tiny corner admin controls. Positioned absolute so they don't
  // reflow the prompt when they render, and quiet-colored so they
  // don't compete with the prompt itself.
  adminCorner: {
    position: 'absolute',
    top: 6,
    right: 6,
    flexDirection: 'row',
    gap: 2,
  },
  adminBtn: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
