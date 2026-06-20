// Picking phase — choose a card from your hand for the current prompt.
// Two states: pre-pick (card grid + mulligan + preview modal) and
// post-pick (YOUR PICK thumbnail + per-player status list). Includes
// the admin Edit/Delete prompt overlay accessible to admin UIDs.

import React from 'react';
import {
  View, Text, Pressable, FlatList, ScrollView, Modal, TextInput,
  ActivityIndicator, StyleSheet, Dimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import SnappleThumbnailImg from '../../ui/SnappleThumbnail';
import PreviewPlayer from '../PreviewPlayer';
import CreatorActionRow from '../CreatorActionRow';
import { snappleService } from '../../../services/snappleService';
import theme from '../../../theme/themes';

const { width: screenWidth } = Dimensions.get('window');

// Renders the picking phase. All state and async work lives in GameScreen
// — this component is pure render with handlers passed in.
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
  onPickCard,
  onMulliganToggle,
  onMulliganSwap,
  onEditPromptOpen,
  onEditPromptClose,
  onEditPromptTextChange,
  onEditPromptSave,
  onDeletePrompt,
}) {
  const currentPrompt = game.prompts[game.currentRound - 1] || 'Show us something!';
  const alreadyPicked = game.submissions.some(s => s.uid === user.uid);

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

  return (
    <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={onLeave}>
          <View style={styles.backBg}>
            <Ionicons name="close" size={18} color="white" />
          </View>
        </Pressable>
        <Text style={styles.headerTitle}>Picking</Text>
        <Text style={styles.timerText}>{timer}s</Text>
      </View>

      {/* Prompt + admin Edit/Delete buttons (admin only) */}
      <View style={styles.promptBanner}>
        <Text style={styles.promptText}>{currentPrompt}</Text>
        {isAdmin && (
          <View style={styles.promptAdminRow}>
            <Pressable style={styles.promptAdminBtn} onPress={() => onEditPromptOpen(currentPrompt)}>
              <Text style={styles.promptAdminBtnText}>Edit</Text>
            </Pressable>
            <Pressable
              style={[styles.promptAdminBtn, { borderColor: theme.colors.vibeRed }]}
              onPress={onDeletePrompt}
            >
              <Text style={[styles.promptAdminBtnText, { color: theme.colors.vibeRed }]}>Delete</Text>
            </Pressable>
          </View>
        )}
      </View>

      {alreadyPicked ? (
        // Post-pick wait screen — YOUR PICK + standings + voted-status list.
        // Other players' cards intentionally hidden until voting.
        (() => {
          const myPick = (game.submissions || []).find(s => s.uid === user.uid);
          const submittedCount = (game.submissions || []).length;
          const totalCount = (game.players || []).length;
          return (
            <ScrollView
              style={styles.pickedWaitWrap}
              contentContainerStyle={styles.pickedWaitContent}
              showsVerticalScrollIndicator={false}
            >
              <View style={styles.yourPickSection}>
                <Text style={styles.yourPickLabel}>YOUR PICK</Text>
                <View style={styles.yourPickCard}>
                  {myPick?.videoUrl ? <SnappleThumbnailImg videoUrl={myPick.videoUrl} /> : null}
                </View>
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
          );
        })()
      ) : (
        <>
          <Text style={styles.pickInstruction}>
            {mulliganMode ? 'Tap a card to replace it' : ''}
          </Text>
          <FlatList
            data={hand}
            keyExtractor={(item, i) => item?.id || `hand-${i}`}
            numColumns={3}
            columnWrapperStyle={styles.handRow}
            contentContainerStyle={styles.handContainer}
            showsVerticalScrollIndicator={false}
            renderItem={({ item }) => (
              <Pressable
                style={[
                  styles.handCard,
                  selectedCard?.id === item.id && styles.handCardSelected,
                  mulliganMode && styles.handCardMulligan,
                ]}
                onPress={() => {
                  if (mulliganMode) onMulliganSwap(item);
                  else onPreviewCard(item);
                }}
              >
                <View style={styles.handCardVideo}>
                  {item.videoUrl ? <SnappleThumbnailImg videoUrl={item.videoUrl} /> : null}
                </View>
              </Pressable>
            )}
          />
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
        </>
      )}

      {/* Card preview modal — Play This Card from hand, or just info+actions
          row when triggered from the post-pick wait screen. */}
      {previewCard && (
        <Modal visible transparent animationType="fade" onRequestClose={onClosePreview}>
          <View style={styles.previewOverlay}>
            <View style={styles.previewCard}>
              <PreviewPlayer videoUrl={previewCard.videoUrl} muted={!!previewCard.muted} />
              {previewCard._isWaiting && (
                <CreatorActionRow
                  submission={previewCard}
                  currentUser={user}
                  ownedSnappleIds={userCurrency.ownedSnapples || []}
                  showToast={showToast}
                  showError={showError}
                />
              )}
              {/* Admin nuke — removes from bot/practice pool. Mirrors
                  the in-game voting preview button so admin can flag
                  bad cards anywhere they appear, including their own
                  hand during PICKING. */}
              {isAdmin && (previewCard.id || previewCard.snappleId) && (
                <Pressable
                  style={pickingAdminStyles.poolNukeBtn}
                  onPress={async () => {
                    const id = previewCard.snappleId || previewCard.id;
                    const r = await snappleService.setSnappleExcludeFromPool(
                      id,
                      user.uid,
                      true,
                    );
                    if (r?.success) {
                      showToast?.('reward', 'Excluded from pool', 'Bots won\'t draw this');
                    } else {
                      showError?.('Error', r?.error || 'Could not exclude');
                    }
                  }}
                >
                  <Ionicons name="eye-off" size={16} color={theme.colors.vibeRed} />
                  <Text style={pickingAdminStyles.poolNukeText}>Exclude from pool</Text>
                </Pressable>
              )}
              <View style={styles.previewButtons}>
                <Pressable style={styles.previewCancel} onPress={onClosePreview}>
                  <Text style={styles.previewCancelText}>Back</Text>
                </Pressable>
                {!previewCard._isWaiting && (
                  <Pressable style={styles.previewPlay} onPress={() => onPickCard(previewCard)}>
                    <Text style={styles.previewPlayText}>Play This Card</Text>
                  </Pressable>
                )}
              </View>
            </View>
          </View>
        </Modal>
      )}

      {/* Admin: edit / replace the round's prompt mid-game */}
      {isEditingPrompt && (
        <Modal visible transparent animationType="fade" onRequestClose={onEditPromptClose}>
          <Pressable style={styles.previewOverlay} onPress={onEditPromptClose}>
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

// Admin nuke styling for the in-hand card preview. Subdued + red so
// it's clearly not a player action and never the easiest tap target.
const pickingAdminStyles = StyleSheet.create({
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
    letterSpacing: 1, textTransform: 'uppercase',
  },
  timerText: {
    color: theme.colors.textPrimary, fontSize: 16, fontWeight: theme.fontWeights.bold,
    minWidth: 48, textAlign: 'center',
    backgroundColor: 'rgba(0, 198, 255, 0.15)',
    borderRadius: 8, borderWidth: 1, borderColor: theme.colors.vibeBlue,
    paddingVertical: 4, paddingHorizontal: 8,
  },
  loadingHand: {
    flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12,
  },
  loadingHandText: {
    color: theme.colors.textSecondary, fontSize: 14,
  },
  promptBanner: {
    marginHorizontal: 16, marginTop: 12, marginBottom: 12, padding: 20, borderRadius: 16,
    backgroundColor: 'rgba(0,0,0,0.4)',
    borderWidth: 3, borderColor: theme.colors.vibeBlue,
  },
  promptText: {
    color: 'white', fontSize: 18, fontWeight: theme.fontWeights.bold,
    textAlign: 'center', lineHeight: 24,
  },
  promptAdminRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
    marginTop: 12,
  },
  promptAdminBtn: {
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  promptAdminBtnText: {
    color: theme.colors.vibeBlue,
    fontSize: 12,
    fontWeight: 'bold',
  },
  pickInstruction: {
    color: theme.colors.textSecondary, fontSize: 13, textAlign: 'center',
  },
  handContainer: { paddingHorizontal: 12, paddingBottom: 40 },
  handRow: { gap: 8, marginBottom: 8 },
  handCard: {
    width: (screenWidth - 40) / 3, aspectRatio: 9 / 16, borderRadius: 10, overflow: 'hidden',
    borderWidth: 2, borderColor: theme.colors.vibeBlue, backgroundColor: 'rgba(0,0,0,0.3)',
  },
  handCardSelected: { borderColor: theme.colors.vibeGreen, borderWidth: 3 },
  handCardMulligan: { borderColor: theme.colors.vibeYellow, borderStyle: 'dashed' },
  handCardVideo: { flex: 1 },
  mulliganBtnBottom: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'center',
    marginTop: 8,
    marginBottom: 16,
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
    fontWeight: theme.fontWeights.bold,
  },
  // Post-pick wait screen
  pickedWaitWrap: { flex: 1, paddingHorizontal: 20 },
  pickedWaitContent: { paddingTop: 8, paddingBottom: 40 },
  yourPickSection: { alignItems: 'center', marginBottom: 20 },
  yourPickLabel: {
    color: theme.colors.vibeBlue, fontSize: 11, fontWeight: 'bold',
    letterSpacing: 2, marginBottom: 8,
  },
  yourPickCard: {
    width: 130, height: 180, borderRadius: 12, overflow: 'hidden',
    borderWidth: 2, borderColor: theme.colors.vibeGreen,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  pickProgressText: {
    color: 'white', fontSize: 14, fontWeight: 'bold',
    textAlign: 'center', marginBottom: 12,
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
  // Preview modal (shared)
  previewOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
  },
  previewCard: {
    width: '100%', aspectRatio: 9 / 16,
    borderRadius: 16, overflow: 'hidden',
    borderWidth: 3, borderColor: theme.colors.vibeBlue, backgroundColor: '#000',
  },
  previewButtons: {
    position: 'absolute', bottom: 16, left: 16, right: 16,
    flexDirection: 'row', gap: 12, justifyContent: 'space-between',
  },
  previewCancel: {
    paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.6)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.3)',
  },
  previewCancelText: { color: 'white', fontSize: 14, fontWeight: 'bold' },
  previewPlay: {
    flex: 1,
    paddingVertical: 12, paddingHorizontal: 20, borderRadius: 10,
    backgroundColor: 'rgba(0,198,255,0.15)',
    borderWidth: 2, borderColor: theme.colors.vibeBlue,
    alignItems: 'center',
  },
  previewPlayText: { color: theme.colors.vibeBlue, fontSize: 14, fontWeight: 'bold' },
  // Admin edit-prompt modal
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
    fontWeight: theme.fontWeights.bold,
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
