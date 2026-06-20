// Warmup phase (a.k.a. REVIEW) — shows the prompt + the user's drawn hand
// before picking starts. Players hit the Ready button when they're set;
// host force-advances to PICKING when everyone's ready or the timer hits 0.

import React from 'react';
import { View, Text, Pressable, FlatList, Modal, StyleSheet, Dimensions } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import VibeButton from '../../ui/VibeButton';
import SnappleThumbnailImg from '../../ui/SnappleThumbnail';
import PreviewPlayer from '../PreviewPlayer';
import theme from '../../../theme/themes';

const { width: screenWidth } = Dimensions.get('window');

// Renders the warmup grid + ready controls. State (hand, ready map)
// and handlers come from GameScreen.
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
  isAdmin,
  onExcludeFromPool,
}) {
  const isReady = !!readyMap?.[selfUid];
  const readyCount = (players || []).filter(p => readyMap?.[p.uid]).length;
  const totalCount = (players || []).length;

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
        showsVerticalScrollIndicator={false}
        renderItem={({ item }) => (
          <Pressable
            style={styles.handCard}
            onPress={() => onPreviewCard({ ...item, _isWaiting: true })}
          >
            <View style={styles.handCardVideo}>
              {item.videoUrl ? <SnappleThumbnailImg videoUrl={item.videoUrl} /> : null}
            </View>
          </Pressable>
        )}
      />

      <View style={styles.footer}>
        <Text style={styles.readyCount}>
          {readyCount} of {totalCount} ready
        </Text>
        <VibeButton
          label={isReady ? "Ready! ✓" : "Ready Up"}
          onPress={() => onToggleReady(!isReady)}
          color={isReady ? "green" : "blue"}
        />
      </View>

      {/* Preview modal — tap a card on the grid to watch it during
          warmup. View-only here (no Play / Pick action — picking
          hasn't started yet). */}
      {previewCard && (
        <Modal visible transparent animationType="fade" onRequestClose={onClosePreview}>
          <View style={styles.previewOverlay}>
            <View style={styles.previewCard}>
              <PreviewPlayer videoUrl={previewCard.videoUrl} muted={!!previewCard.muted} />
              {/* Admin nuke — delegates to GameScreen so the exclusion
                  confirms, broadcasts, and auto-replaces in everyone's
                  hand who doesn't own the card. */}
              {isAdmin && onExcludeFromPool && (previewCard.id || previewCard.snappleId) && (
                <Pressable
                  style={warmupAdminStyles.poolNukeBtn}
                  onPress={() => {
                    onExcludeFromPool(previewCard.snappleId || previewCard.id);
                    onClosePreview();
                  }}
                >
                  <Ionicons name="eye-off" size={16} color={theme.colors.vibeRed} />
                  <Text style={warmupAdminStyles.poolNukeText}>Exclude from pool</Text>
                </Pressable>
              )}
              <Pressable style={styles.previewBack} onPress={onClosePreview}>
                <Text style={styles.previewBackText}>Back</Text>
              </Pressable>
            </View>
          </View>
        </Modal>
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
    justifyContent: 'center',
    alignSelf: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 68, 68, 0.5)',
    backgroundColor: 'rgba(255, 68, 68, 0.1)',
    marginTop: 8,
  },
  poolNukeText: {
    color: '#FF4444',
    fontSize: 12,
    fontWeight: 'bold',
  },
});

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
    gap: 10,
  },
  readyCount: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    textAlign: 'center',
  },
  previewOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
  },
  previewCard: {
    width: '100%', aspectRatio: 9 / 16,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 3, borderColor: theme.colors.vibeBlue, backgroundColor: '#000',
  },
  previewBack: {
    position: 'absolute', bottom: 16, left: 16,
    paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  previewBackText: { color: 'white', fontSize: 14, fontWeight: 'bold' },
});
