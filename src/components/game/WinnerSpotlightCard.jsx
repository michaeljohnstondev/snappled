// Spotlight card for a winner — plays the snapple video on loop. Each
// winner has its own animated values so multi-winner ties can shrink to
// their own scoreboard rows independently. Layout is flex-row inside the
// parent overlay, so ties land side-by-side automatically; this component
// only animates scale / opacity / Y.

import React from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import PreviewPlayer from './PreviewPlayer';
import theme from '../../theme/themes';

// Renders one big winner card with a 9:16 aspect, vibe-blue glow border,
// and overlay labels (winner/tie + player + creator + voters).
export default function WinnerSpotlightCard({ submission, player, isTie, anim, voters }) {
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
          <Text style={styles.voters} numberOfLines={1}>
            voted by {voters.join(', ')}
          </Text>
        )}
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
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
    color: theme.colors.textSecondary,
    fontSize: 10,
  },
  voters: {
    color: theme.colors.vibeBlue,
    fontSize: 9,
    marginTop: 3,
    fontStyle: 'italic',
  },
});
