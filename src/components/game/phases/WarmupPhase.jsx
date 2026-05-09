// Warmup phase (a.k.a. REVIEW) — shows the prompt + the user's drawn hand
// before picking starts so players can scout. Auto-advances to PICKING
// when the timer runs out; host can also start early.

import React from 'react';
import { View, Text, Pressable, FlatList, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import VibeButton from '../../ui/VibeButton';
import { CardThumbnailDelayed } from '../CardThumbnail';
import theme from '../../../theme/themes';

const { width: screenWidth } = Dimensions.get('window');

// Renders the warmup grid. State (hand) and handlers come from GameScreen.
export default function WarmupPhase({
  hand,
  isHost,
  timer,
  onLeave,
  onPreviewCard,
  onStartRound,
}) {
  return (
    <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onLeave}>
          <View style={styles.backBg}>
            <Ionicons name="close" size={18} color="white" />
          </View>
        </Pressable>
        <Text style={styles.headerTitle}>Warmup</Text>
        <Text style={styles.timerText}>{timer}s</Text>
      </View>

      <FlatList
        data={hand}
        keyExtractor={(item, idx) => item?.id || `hand-${idx}`}
        numColumns={3}
        contentContainerStyle={[styles.handContainer, { paddingTop: 16 }]}
        columnWrapperStyle={styles.handRow}
        renderItem={({ item, index }) => (
          <Pressable
            style={styles.handCard}
            onPress={() => onPreviewCard({ ...item, _isWaiting: true })}
          >
            <View style={styles.handCardVideo}>
              <CardThumbnailDelayed videoUrl={item.videoUrl} delay={index * 80} />
            </View>
          </Pressable>
        )}
      />

      <View style={styles.footer}>
        {isHost ? (
          <VibeButton label="Start Round" onPress={onStartRound} />
        ) : (
          <Text style={styles.waitingText}>Waiting for host... {timer}s</Text>
        )}
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
  backBg: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: theme.colors.vibeBlue,
  },
  headerTitle: {
    color: theme.colors.vibeBlue, fontSize: 20, fontWeight: theme.fontWeights.bold,
    letterSpacing: 1,
    textTransform: 'uppercase',
  },
  timerText: {
    color: theme.colors.textPrimary, fontSize: 16, fontWeight: theme.fontWeights.bold,
    minWidth: 48, textAlign: 'center',
    backgroundColor: 'rgba(0, 198, 255, 0.15)',
    borderRadius: 8, borderWidth: 1, borderColor: theme.colors.vibeBlue,
    paddingVertical: 4, paddingHorizontal: 8,
  },
  handContainer: { paddingHorizontal: 12, paddingBottom: 40 },
  handRow: { gap: 8, marginBottom: 8 },
  handCard: {
    width: (screenWidth - 40) / 3, aspectRatio: 9 / 16, borderRadius: 10, overflow: 'hidden',
    borderWidth: 2, borderColor: theme.colors.vibeBlue, backgroundColor: 'rgba(0,0,0,0.3)',
  },
  handCardVideo: { flex: 1 },
  footer: {
    padding: 16,
    paddingBottom: 24,
  },
  waitingText: {
    color: theme.colors.textSecondary, fontSize: 14, textAlign: 'center', marginTop: 12,
  },
});
