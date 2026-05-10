// Final results phase — game-over screen with the placement-sorted
// scoreboard and a Share button. Reached after the last round's
// RoundResults dismisses.

import React from 'react';
import { View, Text, Pressable, StyleSheet, Share } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import VibeButton from '../../ui/VibeButton';
import { gameService } from '../../../services/gameService';
import theme from '../../../theme/themes';

// Same palette as the voting wait screen + round-results scoreboard so
// player colors stay consistent across all three.
const VOTER_PALETTE = [
  theme.colors.vibeBlue,
  theme.colors.vibeCyan,
  theme.colors.vibePurple,
  theme.colors.vibePink,
  theme.colors.vibeYellow,
  theme.colors.vibeOrange,
  theme.colors.vibeAqua,
  theme.colors.vibeTeal,
];

// Renders the final placement scoreboard. handleFinish closes out the
// game (reward claim, navigation back to lobby, etc.) — passed in as
// onDone since that side of the game lifecycle stays in GameScreen.
export default function FinalResultsPhase({ game, selfUid, onDone }) {
  const rewards = gameService.calculateRewards(game.players);

  // Per-player color map — self locks to vibeGreen, others cycle through
  // the palette in players-array order so the colors line up with what
  // they saw on the voting wait + round-results scoreboards.
  const playerColors = new Map();
  let pi = 0;
  (game.players || []).forEach(p => {
    if (p.uid === selfUid) {
      playerColors.set(p.uid, theme.colors.vibeGreen);
    } else {
      playerColors.set(p.uid, VOTER_PALETTE[pi % VOTER_PALETTE.length]);
      pi++;
    }
  });

  // Build a multi-line share string with winner + full leaderboard +
  // the winning snapple's video URL if present.
  const handleShare = async () => {
    try {
      const winner = rewards[0];
      const winningSub = game.submissions.find(s => s.uid === winner?.uid);
      await Share.share({
        message: `🏆 Game Over on Snappled!\n\nWinner: ${winner?.username}\n${winningSub?.videoUrl ? winningSub.videoUrl + '\n\n' : '\n'}${rewards.map(p => `#${p.placement} ${p.username} — ${p.points} pts`).join('\n')}\n\n🔥 Get Snappled — snappled://`,
      });
    } catch (e) {}
  };

  return (
    <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
      <View style={styles.header}>
        <View style={{ width: 36 }} />
        <Text style={styles.headerTitle}>Final Results</Text>
        <View style={{ width: 36 }} />
      </View>

      <View style={styles.content}>
        {rewards.map((p, i) => {
          const color = playerColors.get(p.uid) || theme.colors.textSecondary;
          const isMe = p.uid === selfUid;
          return (
            <View
              key={p.uid}
              style={[
                styles.row,
                { borderLeftWidth: 6, borderLeftColor: color },
              ]}
            >
              <Text style={styles.placement}>#{p.placement}</Text>
              <Text style={[styles.name, isMe && { color: theme.colors.vibeGreen }]}>
                {p.username}
              </Text>
              <Text style={styles.total}>{p.points} pts</Text>
            </View>
          );
        })}

        <View style={styles.actions}>
          <VibeButton label="Done" onPress={onDone} />
          <Pressable style={styles.shareBtn} onPress={handleShare}>
            <Ionicons name="share-social" size={16} color={theme.colors.vibeBlue} />
            <Text style={styles.shareText}>Share</Text>
          </Pressable>
        </View>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 40,
    paddingBottom: 12,
    borderBottomWidth: 2,
    borderBottomColor: 'rgba(0, 198, 255, 0.2)',
  },
  headerTitle: {
    color: theme.colors.vibeBlue, fontSize: 20, fontWeight: theme.fontWeights.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  content: { flex: 1, paddingHorizontal: 20, paddingTop: 20 },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(0,0,0,0.3)', padding: 16, borderRadius: 12,
    marginBottom: 8,
  },
  placement: { color: theme.colors.textPrimary, fontSize: 20, fontWeight: 'bold', width: 36 },
  name: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: theme.fontWeights.semiBold, flex: 1 },
  total: { color: theme.colors.vibeBlue, fontSize: 14, fontWeight: 'bold' },
  actions: { marginTop: 24, gap: 12 },
  shareBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
    paddingVertical: 10, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: theme.colors.vibeBlue,
  },
  shareText: { color: theme.colors.vibeBlue, fontSize: 14, fontWeight: theme.fontWeights.semiBold },
});
