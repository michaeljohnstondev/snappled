// Warmup phase (a.k.a. REVIEW) — shows the drawn hand before picking
// starts. Layout matches PickingPhase (2-col HandCardThumbnail grid
// with a YOUR HAND section header) minus the prompt banner, since
// the prompt reveals during PICKING. Players tap READY UP to
// advance; host force-transitions when everyone's ready or the
// timer hits 0.

import React, { useState } from 'react';
import { View, Text, Pressable, ScrollView, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import PreviewModal from '../PreviewModal';
import RoundHeaderBar from '../round/RoundHeaderBar';
import HandCardThumbnail from '../round/HandCardThumbnail';
import theme from '../../../theme/themes';

// Renders the warmup hand + ready controls. State lives in GameScreen;
// only local inline-play state lives here.
export default function WarmupPhase({
  hand,
  timer,
  readyMap,
  players,
  selfUid,
  previewCard,
  onLeave,
  onPreviewCard,
  onClosePreview,
  onToggleReady,
  onHelp,
  onHelpEnd,
  isAdmin,
  onExcludeFromPool,
}) {
  const isReady = !!readyMap?.[selfUid];
  const readyCount = (players || []).filter(p => readyMap?.[p.uid]).length;
  const totalCount = (players || []).length;

  // Same inline mini-player behavior as picking — tap a card body
  // plays it inline once. Token increments so re-tapping the same
  // card replays via a fresh mount.
  const [inlinePlaying, setInlinePlaying] = useState({ id: null, token: 0 });
  const bumpInline = (id) => {
    setInlinePlaying(prev => ({
      id,
      token: prev.id === id ? prev.token + 1 : 1,
    }));
  };

  return (
    <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
      {/* Chips-only header — no prompt banner during warmup. Ready
          count rides in the caption slot next to the WARMUP chip. */}
      <RoundHeaderBar
        phase="review"
        timerSec={timer}
        onHelp={onHelp}
        onHelpEnd={onHelpEnd}
        caption={`${readyCount} of ${totalCount} ready`}
      />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>YOUR HAND</Text>
          <Text style={styles.sectionCount}>{hand.length} cards</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.sectionHint}>Preview before picking</Text>
        </View>

        <View style={styles.grid}>
          {hand.map((item, i) => {
            const isInlinePlaying = inlinePlaying.id === item.id;
            return (
              <View key={item?.id || `hand-${i}`} style={styles.gridCell}>
                <HandCardThumbnail
                  card={item}
                  isPlaying={isInlinePlaying}
                  playToken={isInlinePlaying ? inlinePlaying.token : 0}
                  onTogglePlay={() => bumpInline(item.id)}
                  onFullscreen={() => {
                    setInlinePlaying({ id: null, token: 0 });
                    onPreviewCard({ ...item, _isWaiting: true });
                  }}
                />
              </View>
            );
          })}
          {hand.length % 2 === 1 && <View style={styles.gridCell} />}
        </View>
      </ScrollView>

      {/* Ready Up bar — flush at the bottom, same shape as the other
          primary action bars. Flips green when the local player is
          ready. */}
      <Pressable
        style={[styles.readyBar, isReady && styles.readyBarReady]}
        onPress={() => onToggleReady(!isReady)}
      >
        <Text style={styles.readyBarText}>
          {isReady ? 'READY ✓' : 'READY UP'}
        </Text>
      </Pressable>

      {/* Full-bleed preview — reuses PreviewModal from picking / voting.
          No primary CTA because picking hasn't started yet; admin
          exclude stays in the top-right slot. */}
      {previewCard && (
        <PreviewModal
          visible
          videoUrl={previewCard.videoUrl}
          muted={!!previewCard.muted}
          onClose={onClosePreview}
          primaryLabel={null}
          topRightSlot={
            isAdmin && onExcludeFromPool && (previewCard.id || previewCard.snappleId) ? (
              <Pressable
                style={warmupAdminStyles.poolNukeBtn}
                onPress={() => {
                  onExcludeFromPool(previewCard.snappleId || previewCard.id);
                  onClosePreview();
                }}
              >
                <Ionicons name="eye-off" size={16} color={theme.colors.vibeRed} />
                <Text style={warmupAdminStyles.poolNukeText}>Exclude</Text>
              </Pressable>
            ) : null
          }
        />
      )}
    </LinearGradient>
  );
}

// Admin nuke styling — matches the same button in PickingPhase and
// the in-game voting preview so admins see one consistent affordance.
const warmupAdminStyles = StyleSheet.create({
  poolNukeBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.5)',
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
  },
  poolNukeText: {
    color: '#FF4444',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

const styles = StyleSheet.create({
  container: { flex: 1 },
  scrollContent: {
    // Enough clearance for the flush READY UP bar (~110pt tall
    // including safe-area padding) so the last row of cards isn't
    // hidden behind it.
    paddingBottom: 140,
  },

  // Section header ("YOUR HAND · N cards · Preview before picking")
  // matches the shape used in picking + voting for consistency.
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    paddingHorizontal: 14,
    marginTop: 8,
    marginBottom: 8,
    gap: 8,
  },
  sectionTitle: {
    color: 'white',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  sectionCount: {
    color: 'rgba(255,255,255,0.6)',
    fontSize: 13,
    fontWeight: '600',
  },
  sectionHint: {
    color: theme.colors.vibeBlue,
    fontSize: 12,
    fontWeight: '700',
  },

  // 2-col grid — mirrors picking's grid so warmup → picking feels
  // like the same screen with a new bar underneath.
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
  },
  gridCell: {
    width: '50%',
    padding: 4,
  },

  // Full-width Ready Up bar — same shape / padding as the other
  // CTA bars in the game (PLAY THIS CARD, SUBMIT VOTE).
  readyBar: {
    backgroundColor: theme.colors.vibeBlue,
    paddingTop: 20,
    paddingBottom: 30,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 3,
    borderTopColor: '#000',
  },
  readyBarReady: {
    backgroundColor: theme.colors.vibeGreen,
  },
  readyBarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
});
