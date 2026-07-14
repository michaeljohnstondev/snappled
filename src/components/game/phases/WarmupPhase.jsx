// Warmup phase (a.k.a. REVIEW) — shows the prompt + the user's drawn hand
// before picking starts. Players hit the Ready button when they're set;
// host force-advances to PICKING when everyone's ready or the timer hits 0.

import React from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import SnappleThumbnailImg from '../../ui/SnappleThumbnail';
import PreviewModal from '../PreviewModal';
import RoundHeaderBar from '../round/RoundHeaderBar';
import theme from '../../../theme/themes';

// Renders the warmup grid + ready controls. State (hand, ready map)
// and handlers come from GameScreen.
export default function WarmupPhase({
  hand,
  timer,
  readyMap,
  players,
  selfUid,
  previewCard,
  currentPrompt,
  onLeave,
  onPreviewCard,
  onClosePreview,
  onToggleReady,
  onHelp,
  isAdmin,
  onExcludeFromPool,
}) {
  const isReady = !!readyMap?.[selfUid];
  const readyCount = (players || []).filter(p => readyMap?.[p.uid]).length;
  const totalCount = (players || []).length;

  return (
    <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
      {/* Chips-only header — warmup doesn't need the prompt banner;
          the prompt gets its own moment during picking. */}
      <RoundHeaderBar phase="review" timerSec={timer} onHelp={onHelp} />

      {/* Flex-fill 3 rows × 2 columns — matches PickingPhase so the
          layout doesn't jump when warmup transitions to picking. */}
      <View style={styles.handGrid}>
        {hand.map((item, i) => (
          <Pressable
            key={item?.id || `hand-${i}`}
            style={styles.handCard}
            onPress={() => onPreviewCard({ ...item, _isWaiting: true })}
          >
            <View style={styles.handCardVideo}>
              {item.videoUrl ? <SnappleThumbnailImg videoUrl={item.videoUrl} /> : null}
            </View>
          </Pressable>
        ))}
      </View>

      {/* Ready Up bar — full-width, flush at the bottom, styled to
          match the PLAY THIS CARD action bar in PreviewModal. Flips
          green when the local player is ready. Sub-line shows how
          many players are in. */}
      <Pressable
        style={[styles.readyBar, isReady && styles.readyBarReady]}
        onPress={() => onToggleReady(!isReady)}
      >
        <Text style={styles.readyBarText}>
          {isReady ? 'READY ✓' : 'READY UP'}
        </Text>
        <Text style={styles.readyBarSub}>
          {readyCount} of {totalCount} ready · {timer}s
        </Text>
      </Pressable>

      {/* Full-bleed preview — same PreviewModal picking uses. No
          primary CTA because picking hasn't started yet; the top-
          right admin nuke stays available. */}
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
  // Flex-fill 3 rows × 2 columns. Container claims the remaining
  // vertical space; each card takes 50% width × 33.33% height.
  handGrid: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  handCard: {
    width: '50%',
    height: '33.333%',
    backgroundColor: 'rgba(0,0,0,0.3)',
    overflow: 'hidden',
  },
  handCardVideo: { flex: 1 },
  // Full-width action bar, flush at bottom. Bigger than the other
  // CTA bars because it's the ONLY thing the warmup screen wants
  // you to tap — 60s of dead space above it otherwise. Flips green
  // when locally ready.
  readyBar: {
    backgroundColor: theme.colors.vibeBlue,
    paddingTop: 32,
    paddingBottom: 42,
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
    fontSize: 26,
    fontWeight: '900',
    letterSpacing: 4,
    textTransform: 'uppercase',
  },
  readyBarSub: {
    color: 'rgba(255,255,255,0.85)',
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    marginTop: 6,
  },
});
