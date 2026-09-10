// BackChunk — the 1/4-width "BACK" pill that sits next to the
// primary CTA (SUBMIT VOTE, PLAY THIS SNAPPLE, VOTE FAVORITE) in
// the split action row. Static gradient (no shimmer — this is a
// recessive action, not a primary). Word only, no chevron: the
// label already says BACK and the glyph just crowded it.
//
// Colors are the reverse of the CTA palette (purple → blue instead
// of blue → purple) so BACK feels like the mirror of "forward" and
// the two chunks together read as one gradient across the row.

import React from 'react';
import { Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

/**
 * @param {string[]} colors  override the gradient. Defaults to the
 *   reverse-of-the-CTA purple to blue; a caller with its own state -
 *   the mulligan chunk turning red once it is armed - passes its own.
 * @param {object} textStyle label overrides
 */
export default function BackChunk({
  onPress, label = 'BACK', style, textStyle,
  colors = [theme.colors.vibePurple, theme.colors.vibeBlue],
}) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable onPress={onPress} style={[styles.wrap, style]}>
      <LinearGradient
        colors={colors}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.gradient}
      >
        {/* Shrinks rather than wraps. The chunk is a quarter of the row,
            which is generous for BACK and tight for a longer label like
            MULLIGAN (2) - and a label that wraps to two lines in a bar
            this shallow looks broken. */}
        <Text
          style={[styles.label, textStyle]}
          numberOfLines={1}
          adjustsFontSizeToFit
          minimumFontScale={0.7}
        >
          {label}
        </Text>
      </LinearGradient>
    </Pressable>
  );
}

const makeStyles = (t) => ({
  wrap: {
    // Parent supplies flex sizing (usually flex: 1 next to a flex:3
    // ShimmerBar). The gradient inside fills whatever we get.
  },
  gradient: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    paddingTop: 20,
    paddingBottom: 30,
    borderRightWidth: 2,
    borderRightColor: '#000',
  },
  label: {
    color: t.colors.textPrimary,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 2.5,
    textTransform: 'uppercase',
  },
});
