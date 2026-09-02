// Spotlight card for a winner — plays the snapple video on loop. Each
// winner has its own animated values so multi-winner ties can shrink to
// their own scoreboard rows independently. Layout is flex-row inside the
// parent overlay, so ties land side-by-side automatically; this component
// only animates scale / opacity / Y.

import React from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import PreviewPlayer from './PreviewPlayer';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

// Renders one big winner card with a 9:16 aspect, vibe-blue glow border,
// and overlay labels (winner/tie + player + creator + voters).
export default function WinnerSpotlightCard({ submission, player, isTie, anim, voters }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Animated.View
      style={[
        styles.card,
        {
          opacity: anim.opacity,
          transform: [
            { translateY: anim.translateY },
            { scale: anim.scale },
          ],
        },
      ]}
    >
      <View style={StyleSheet.absoluteFill}>
        <PreviewPlayer videoUrl={submission?.videoUrl} muted={!!submission?.muted} />
      </View>
      <View style={styles.label}>
        <Text style={styles.winnerLabel}>{isTie ? 'TIE' : 'WINNER'}</Text>
        <Text style={styles.player}>{player?.username || '?'}</Text>
        {voters && voters.length > 0 && (
          <View style={styles.voterChipRow}>
            {voters.map((v, i) => (
              <View
                key={`${v.uid}-${i}`}
                style={[styles.voterChip, { borderColor: v.color }]}
              >
                <Text style={styles.voterChipText} numberOfLines={1}>{v.name}</Text>
              </View>
            ))}
          </View>
        )}
      </View>
    </Animated.View>
  );
}

const makeStyles = (t) => ({
  card: {
    width: 150,
    aspectRatio: 9 / 16,
    borderRadius: 14,
    overflow: 'hidden',
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,0,0,0.6)',
    shadowColor: theme.colors.vibeBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 24,
    elevation: 16,
  },
  label: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    paddingVertical: 6,
    paddingHorizontal: 6,
    backgroundColor: 'rgba(0,0,0,0.85)',
    alignItems: 'center',
  },
  winnerLabel: {
    color: theme.colors.vibeBlue,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  player: {
    color: 'white',
    fontSize: 13,
    fontWeight: 'bold',
  },
  creator: {
    color: 'rgba(255,255,255,0.7)',
    fontSize: 10,
  },
  voterChipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 4,
    marginTop: 4,
  },
  voterChip: {
    borderWidth: 2,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
    backgroundColor: 'rgba(0,0,0,0.6)',
  },
  voterChipText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
});
