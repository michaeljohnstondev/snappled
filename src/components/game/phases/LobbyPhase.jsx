// Lobby phase — pre-game waiting room. Shows current player roster, host
// controls (+ Add Bot, Start Game), and a 6-char game code for friends to
// join with. Wrapped in ScrollView so 8-player lobbies don't push the
// Start button offscreen.

import React from 'react';
import { View, Text, Pressable, StyleSheet, ScrollView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import VibeButton from '../../ui/VibeButton';
import { gameService } from '../../../services/gameService';
import theme from '../../../theme/themes';
import { useTheme, useThemedStyles } from '../../../theme/ThemeContext';

// Renders the lobby UI. All state stays in GameScreen — handlers passed in.
export default function LobbyPhase({
  game,
  gameId,
  isHost,
  onLeave,
  onAddBot,
  onStartGame,
  onSetRounds,
}) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const totalRounds = game?.totalRounds ?? 5;
  return (
    <LinearGradient colors={t.colors.backgroundGradient} style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onLeave}>
          <View style={styles.backBg}>
            <Ionicons name="arrow-back" size={20} color="white" />
          </View>
        </Pressable>
        <Text style={styles.headerTitle}>Lobby</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Waiting for Players</Text>
        <Text style={styles.subtitle}>
          {game.players.length}/{gameService.MAX_PLAYERS} players
        </Text>

        <View style={styles.playerList}>
          {game.players.map(p => (
            <View key={p.uid} style={styles.playerRow}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{p.username.charAt(0).toUpperCase()}</Text>
              </View>
              <Text style={styles.playerName}>{p.username}</Text>
              {p.uid === game.hostId && <Text style={styles.hostBadge}>HOST</Text>}
            </View>
          ))}
        </View>

        {/* Play-to target picker — host-only. ∞ stores totalRounds=0
            (host ends manually from the scoreboard). Field is named
            `totalRounds` for backward compat but it's the score target
            now: first player to N points wins. */}
        {isHost && (
          <View style={styles.roundsPicker}>
            <Text style={styles.roundsLabel}>PLAY TO</Text>
            <View style={styles.roundsOptions}>
              {[25, 50, 100, 0].map(n => (
                <Pressable
                  key={n}
                  style={[styles.roundsOption, totalRounds === n && styles.roundsOptionActive]}
                  onPress={() => onSetRounds?.(n)}
                >
                  <Text style={[styles.roundsOptionText, totalRounds === n && styles.roundsOptionTextActive]}>
                    {n === 0 ? '∞' : n}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>
        )}
        {!isHost && (
          <Text style={styles.roundsReadonly}>
            {totalRounds === 0 ? 'Game ends when host calls it' : `Play to ${totalRounds} pts`}
          </Text>
        )}

        {isHost && (
          <View style={styles.buttons}>
            {game.players.length < gameService.MAX_PLAYERS && (
              <VibeButton label="+ Add Bot" onPress={onAddBot} variant="toggle" color="cyan" />
            )}
            {game.players.length >= 2 ? (
              <VibeButton label="Start Game" onPress={onStartGame} />
            ) : (
              <Text style={styles.waiting}>Need at least 2 players to start</Text>
            )}
          </View>
        )}

        <Text style={styles.gameCode}>
          {game?.joinCode
            ? `Join code: ${game.joinCode}`
            : `Game ID: ${gameId.slice(0, 6).toUpperCase()}`}
        </Text>
      </ScrollView>
    </LinearGradient>
  );
}

const makeStyles = (t) => ({
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
  backBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
  },
  headerTitle: {
    color: theme.colors.vibeBlue,
    fontSize: 20,
    fontWeight: theme.fontWeights.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  content: {
    flexGrow: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
    paddingTop: 16,
    paddingBottom: 80,
    gap: 16,
  },
  title: {
    color: theme.colors.vibeBlue,
    fontSize: 32,
    fontWeight: theme.fontWeights.bold,
    letterSpacing: 2,
    textTransform: 'uppercase',
  },
  subtitle: {
    color: t.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
    maxWidth: 280,
  },
  playerList: { width: '100%', gap: 12, marginTop: 16 },
  playerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: 'rgba(0,0,0,0.3)', padding: 12, borderRadius: 12,
    borderWidth: 2, borderColor: theme.colors.vibeBlue,
  },
  avatar: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,198,255,0.1)',
    borderWidth: 2, borderColor: theme.colors.vibeBlue,
    justifyContent: 'center', alignItems: 'center',
  },
  avatarText: { color: theme.colors.vibeBlue, fontSize: 16, fontWeight: 'bold' },
  playerName: { color: t.colors.textPrimary, fontSize: 14, fontWeight: theme.fontWeights.semiBold, flex: 1 },
  hostBadge: {
    color: theme.colors.vibeYellow, fontSize: 10, fontWeight: 'bold',
    backgroundColor: 'rgba(255,215,0,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
  },
  buttons: { width: '100%', gap: 12, marginTop: 16 },
  waiting: { color: t.colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 12 },
  gameCode: { color: t.colors.textSecondary, fontSize: 12, marginTop: 16 },
  roundsPicker: {
    alignItems: 'center',
    marginTop: 16,
  },
  roundsLabel: {
    color: theme.colors.vibeBlue,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 2,
    marginBottom: 6,
  },
  roundsOptions: {
    flexDirection: 'row',
    gap: 8,
  },
  roundsOption: {
    width: 40,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
  },
  roundsOptionActive: {
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,198,255,0.12)',
  },
  roundsOptionText: {
    color: t.colors.textSecondary,
    fontSize: 14,
    fontWeight: 'bold',
  },
  roundsOptionTextActive: {
    color: theme.colors.vibeBlue,
  },
  roundsReadonly: {
    color: t.colors.textSecondary,
    fontSize: 13,
    marginTop: 16,
    fontStyle: 'italic',
  },
});
