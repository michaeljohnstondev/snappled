// Picking phase — mockup-driven redesign. Layout mirrors the
// tiktok-inspired mock: phase chips + tiny timer top bar, a rich
// prompt banner, a scrollable 2-col hand grid where each thumbnail
// shows a play button + @username, and a "YOUR CARD" section at the
// bottom holding whatever the user has selected. A flush cyan
// PLAY THIS CARD bar sits under it all and submits the selected
// card. Tapping YOUR CARD's play icon (or tapping again in the
// hand) opens the fullscreen PreviewModal for a proper watch.

import React from 'react';
import {
  View, Text, Pressable, ScrollView, Modal, TextInput,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import PreviewModal from '../PreviewModal';
import CreatorActionRow from '../CreatorActionRow';
import HandCardThumbnail from '../round/HandCardThumbnail';
import RoundHeaderBar from '../round/RoundHeaderBar';
import RoundPromptBanner from '../round/RoundPromptBanner';
import theme from '../../../theme/themes';

// Renders the picking phase. All state and async work lives in
// GameScreen — this component is pure render with handlers passed in.
// New in this pass: `selectedCard` populates the YOUR CARD section
// at the bottom; tap-in-grid = select, tap-YOUR-CARD-play = preview
// fullscreen, PLAY THIS CARD bar submits.
export default function PickingPhase({
  game,
  gameId,
  user,
  userCurrency,
  hand,
  isAdmin,
  isHost,
  isPractice,
  timer,
  selectedCard,
  previewCard,
  mulliganMode,
  isEditingPrompt,
  editPromptText,
  showToast,
  showError,
  onLeave,
  onPreviewCard,
  onClosePreview,
  onSelectCard,
  onPickCard,
  onHelp,
  onMulliganToggle,
  onMulliganSwap,
  onEditPromptOpen,
  onEditPromptClose,
  onEditPromptTextChange,
  onEditPromptSave,
  onDeletePrompt,
  onExcludeFromPool,
}) {
  const currentPrompt = game.prompts[game.currentRound - 1] || 'Show us something!';
  const alreadyPicked = game.submissions.some(s => s.uid === user.uid);
  const totalRoundsShown = game.totalRounds || null;

  if (hand.length === 0) {
    return (
      <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
        <View style={styles.loadingHand}>
          <ActivityIndicator size="large" color={theme.colors.vibeBlue} />
          <Text style={styles.loadingHandText}>Drawing your hand...</Text>
        </View>
      </LinearGradient>
    );
  }

  // Post-pick wait screen — leaderboard of who's picked. Same shape
  // as before, just with the new header on top for continuity.
  if (alreadyPicked) {
    const myPick = (game.submissions || []).find(s => s.uid === user.uid);
    const submittedCount = (game.submissions || []).length;
    const totalCount = (game.players || []).length;
    return (
      <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
        <RoundHeaderBar phase="picking" timerSec={timer} onHelp={onHelp} />
        <RoundPromptBanner
          prompt={currentPrompt}
          round={game.currentRound}
          totalRounds={totalRoundsShown}
        />
        <ScrollView contentContainerStyle={styles.pickedWaitContent}>
          <Text style={styles.yourPickLabel}>YOUR PICK</Text>
          <View style={styles.yourPickCard}>
            {myPick?.videoUrl ? (
              <HandCardThumbnail
                card={{ videoUrl: myPick.videoUrl, creatorUsername: 'you' }}
                label="@you"
                onPress={() => onPreviewCard({ ...myPick, _isWaiting: true })}
              />
            ) : null}
          </View>

          <Text style={styles.pickProgressText}>
            {submittedCount} of {totalCount} picked
          </Text>

          <View style={styles.playerStatusList}>
            {(game.players || []).map(p => {
              const picked = (game.submissions || []).some(s => s.uid === p.uid);
              const isMe = p.uid === user.uid;
              return (
                <View key={p.uid} style={styles.playerStatusRow}>
                  <Ionicons
                    name={picked ? 'checkmark-circle' : 'time-outline'}
                    size={18}
                    color={picked ? theme.colors.vibeGreen : theme.colors.textSecondary}
                  />
                  <Text style={[styles.playerStatusName, isMe && styles.playerStatusNameMe]}>
                    {p.username}
                  </Text>
                  <Text style={[styles.playerStatusLabel, picked && styles.playerStatusLabelDone]}>
                    {picked ? 'picked' : 'picking...'}
                  </Text>
                </View>
              );
            })}
          </View>
        </ScrollView>

        {/* Preview modal stays available on the wait screen so users
            can rewatch anyone's pick as they come in. */}
        {previewCard && (
          <PreviewModal
            visible
            videoUrl={previewCard.videoUrl}
            muted={!!previewCard.muted}
            onClose={onClosePreview}
            primaryLabel={null}
            overlaySlot={
              <CreatorActionRow
                submission={previewCard}
                currentUser={user}
                ownedSnappleIds={userCurrency.ownedSnapples || []}
                showToast={showToast}
                showError={showError}
              />
            }
          />
        )}
      </LinearGradient>
    );
  }

  // Pre-pick screen — chips, prompt, hand grid, YOUR CARD, submit bar.
  return (
    <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
      <RoundHeaderBar phase="picking" timerSec={timer} />

      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <RoundPromptBanner
          prompt={currentPrompt}
          round={game.currentRound}
          totalRounds={totalRoundsShown}
          onEdit={isAdmin ? () => onEditPromptOpen(currentPrompt) : undefined}
          onDelete={isAdmin ? onDeletePrompt : undefined}
        />

        <View style={styles.sectionHead}>
          <Text style={styles.sectionTitle}>YOUR HAND</Text>
          <Text style={styles.sectionCount}>{hand.length} cards</Text>
          <View style={{ flex: 1 }} />
          <Text style={styles.sectionHint}>
            {mulliganMode ? 'Tap to replace' : 'Tap to select'}
          </Text>
        </View>

        <View style={styles.grid}>
          {hand.map((item, i) => {
            const isSelected = selectedCard?.id === item.id;
            const onCardPress = () => {
              if (mulliganMode) {
                onMulliganSwap(item);
                return;
              }
              // Select and open fullscreen preview so the video
              // actually plays. YOUR CARD below stays populated
              // when the user closes the preview.
              if (onSelectCard) onSelectCard(item);
              onPreviewCard(item);
            };
            return (
              <View key={item?.id || `hand-${i}`} style={styles.gridCell}>
                <HandCardThumbnail
                  card={item}
                  isSelected={isSelected}
                  onPress={onCardPress}
                />
              </View>
            );
          })}
          {/* When the hand has an odd count, the last row has one card;
              add a spacer cell so the leftover doesn't stretch full-width. */}
          {hand.length % 2 === 1 && <View style={styles.gridCell} />}
        </View>

        {(user?.inventory?.mulligans || 0) > 0 && (
          <Pressable
            style={[styles.mulliganBtnBottom, mulliganMode && styles.mulliganBtnBottomActive]}
            onPress={onMulliganToggle}
          >
            <Ionicons
              name={mulliganMode ? 'close' : 'refresh'}
              size={16}
              color={mulliganMode ? theme.colors.vibeRed : theme.colors.vibeGreen}
            />
            <Text style={[styles.mulliganText, mulliganMode && { color: theme.colors.vibeRed }]}>
              {mulliganMode ? 'Cancel' : `Mulligan (${user?.inventory?.mulligans || 0})`}
            </Text>
          </Pressable>
        )}

        {/* YOUR CARD panel — shows the selected thumbnail with a play
            button that opens the fullscreen preview. Empty state
            prompts the user to pick one. */}
        <View style={styles.yourCardSection}>
          <Text style={styles.sectionTitle}>YOUR CARD</Text>
          <View style={styles.yourCardWrap}>
            {selectedCard ? (
              <HandCardThumbnail
                card={selectedCard}
                label="@you"
                onPress={() => onPreviewCard({ ...selectedCard, _fromYourCard: true })}
              />
            ) : (
              <View style={styles.yourCardEmpty}>
                <Text style={styles.yourCardEmptyText}>Pick a card above</Text>
              </View>
            )}
          </View>
        </View>
      </ScrollView>

      {/* Flush cyan submit bar — only enabled once a card is
          selected. Same shape as the PLAY THIS CARD bar in the
          fullscreen preview so the actions feel identical. */}
      <Pressable
        style={[styles.submitBar, !selectedCard && styles.submitBarDisabled]}
        onPress={() => selectedCard && onPickCard(selectedCard)}
        disabled={!selectedCard}
      >
        <Text style={styles.submitBarText}>
          {selectedCard ? 'PLAY THIS CARD' : 'PICK A CARD'}
        </Text>
      </Pressable>

      {/* Fullscreen preview modal — opened from either a grid tap
          (via _fromYourCard/regular) or from the YOUR CARD play icon.
          When previewing from picking, the CTA still submits. */}
      {previewCard && (
        <PreviewModal
          visible
          videoUrl={previewCard.videoUrl}
          muted={!!previewCard.muted}
          onClose={onClosePreview}
          primaryLabel={previewCard._isWaiting ? null : 'PLAY THIS CARD'}
          onPrimary={() => onPickCard(previewCard)}
          topRightSlot={
            isAdmin && onExcludeFromPool && (previewCard.id || previewCard.snappleId) ? (
              <Pressable
                style={pickingAdminStyles.poolNukeBtn}
                onPress={() => {
                  onExcludeFromPool(previewCard.snappleId || previewCard.id);
                  onClosePreview();
                }}
              >
                <Ionicons name="eye-off" size={16} color={theme.colors.vibeRed} />
                <Text style={pickingAdminStyles.poolNukeText}>Exclude</Text>
              </Pressable>
            ) : null
          }
          overlaySlot={
            previewCard._isWaiting ? (
              <CreatorActionRow
                submission={previewCard}
                currentUser={user}
                ownedSnappleIds={userCurrency.ownedSnapples || []}
                showToast={showToast}
                showError={showError}
              />
            ) : null
          }
        />
      )}

      {/* Admin: edit / replace the round's prompt mid-game */}
      {isEditingPrompt && (
        <Modal visible transparent animationType="fade" onRequestClose={onEditPromptClose}>
          <Pressable style={styles.editPromptOverlay} onPress={onEditPromptClose}>
            <Pressable style={styles.editPromptCard} onPress={() => {}}>
              <Text style={styles.editPromptTitle}>Edit Round Prompt</Text>
              <TextInput
                value={editPromptText}
                onChangeText={onEditPromptTextChange}
                style={styles.editPromptInput}
                multiline
                placeholder="New prompt text..."
                placeholderTextColor="rgba(255,255,255,0.3)"
              />
              <View style={styles.editPromptButtons}>
                <Pressable
                  style={[styles.editPromptBtn, { borderColor: 'rgba(255,255,255,0.2)' }]}
                  onPress={onEditPromptClose}
                >
                  <Text style={styles.editPromptBtnText}>Cancel</Text>
                </Pressable>
                <Pressable
                  style={[styles.editPromptBtn, { borderColor: theme.colors.vibeRed }]}
                  onPress={onDeletePrompt}
                >
                  <Text style={[styles.editPromptBtnText, { color: theme.colors.vibeRed }]}>Replace & Restart</Text>
                </Pressable>
                <Pressable
                  style={[styles.editPromptBtn, { borderColor: theme.colors.vibeBlue }]}
                  onPress={onEditPromptSave}
                >
                  <Text style={[styles.editPromptBtnText, { color: theme.colors.vibeBlue }]}>Save</Text>
                </Pressable>
              </View>
            </Pressable>
          </Pressable>
        </Modal>
      )}
    </LinearGradient>
  );
}

// Admin nuke chip for the fullscreen preview modal — subdued red so
// it can't be mistaken for a player action.
const pickingAdminStyles = StyleSheet.create({
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
    paddingBottom: 24,
  },
  loadingHand: {
    flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12,
  },
  loadingHandText: {
    color: theme.colors.textSecondary, fontSize: 14,
  },

  // Admin edit/delete row under the prompt (only shown to admin uids).
  promptAdminRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: -6,
    marginBottom: 10,
  },
  promptAdminBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 1.5,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  promptAdminBtnText: {
    color: theme.colors.vibeBlue,
    fontSize: 12,
    fontWeight: 'bold',
  },

  // Section headers ("YOUR HAND", "YOUR CARD").
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

  // 2-col grid.
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 10,
    marginBottom: 4,
  },
  gridCell: {
    width: '50%',
    padding: 4,
  },

  // Mulligan chip — carried over from the previous design.
  mulliganBtnBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    marginTop: 4,
    marginBottom: 8,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: theme.colors.vibeGreen,
    backgroundColor: 'rgba(0,255,65,0.1)',
  },
  mulliganBtnBottomActive: {
    borderColor: theme.colors.vibeRed,
    backgroundColor: 'rgba(255,68,68,0.15)',
  },
  mulliganText: {
    color: theme.colors.vibeGreen,
    fontSize: 13,
    fontWeight: 'bold',
  },

  // YOUR CARD section at the bottom of the scroll.
  yourCardSection: {
    paddingHorizontal: 14,
    marginTop: 14,
    marginBottom: 8,
    gap: 8,
  },
  yourCardWrap: {
    flexDirection: 'row',
  },
  yourCardEmpty: {
    flex: 1,
    aspectRatio: 4 / 5,
    borderRadius: 12,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: 'rgba(255,255,255,0.2)',
    backgroundColor: 'rgba(0,0,0,0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  yourCardEmptyText: {
    color: 'rgba(255,255,255,0.55)',
    fontSize: 14,
    fontWeight: '600',
  },

  // Flush action bar — green when a card is selected + ready to
  // submit (selection color), dim when nothing's picked yet.
  submitBar: {
    backgroundColor: theme.colors.vibeGreen,
    paddingTop: 20,
    paddingBottom: 30,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    borderTopWidth: 3,
    borderTopColor: '#000',
  },
  submitBarDisabled: {
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  submitBarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },

  // Post-pick wait screen — leaderboard of who's picked yet.
  pickedWaitContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  yourPickLabel: {
    color: 'white',
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.5,
    marginTop: 4,
    marginBottom: 8,
  },
  yourPickCard: {
    flexDirection: 'row',
    marginBottom: 14,
  },
  pickProgressText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
  },
  playerStatusList: { gap: 6 },
  playerStatusRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    paddingVertical: 8, paddingHorizontal: 14, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)',
  },
  playerStatusName: {
    color: 'white', fontSize: 13, fontWeight: '600', flex: 1,
  },
  playerStatusNameMe: { color: theme.colors.vibeBlue },
  playerStatusLabel: {
    color: theme.colors.textSecondary, fontSize: 11,
  },
  playerStatusLabelDone: {
    color: theme.colors.vibeGreen, fontWeight: 'bold',
  },

  // Admin edit-prompt modal.
  editPromptOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
  },
  editPromptCard: {
    width: '85%',
    backgroundColor: '#0A1A2A',
    borderRadius: 16,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    padding: 20,
  },
  editPromptTitle: {
    color: theme.colors.vibeBlue,
    fontSize: 14,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 12,
    letterSpacing: 1.5,
  },
  editPromptInput: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 24,
    minHeight: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    padding: 8,
  },
  editPromptButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 16,
  },
  editPromptBtn: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
  },
  editPromptBtnText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
});
