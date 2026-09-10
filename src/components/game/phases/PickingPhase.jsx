// Picking phase — mockup-driven redesign. Layout mirrors the
// tiktok-inspired mock: phase chips + tiny timer top bar, a rich
// pinned prompt banner, a horizontal hand rail where each thumbnail
// shows a play button + @username, and a "YOUR CARD" section at the
// bottom holding whatever the user has selected. A flush cyan
// PLAY THIS SNAPPLE bar sits under it all and submits the selected
// card. Tapping YOUR CARD's play icon (or tapping again in the
// hand) opens the fullscreen PreviewModal for a proper watch.

import React, { useState } from 'react';
import {
  View, Text, Pressable, ScrollView, Modal, TextInput,
  ActivityIndicator, StyleSheet, useWindowDimensions,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import PreviewModal from '../PreviewModal';
import CreatorActionRow from '../CreatorActionRow';
import HandCardThumbnail from '../round/HandCardThumbnail';
import RoundHeaderBar from '../round/RoundHeaderBar';
import RoundPromptBanner from '../round/RoundPromptBanner';
import ReactionBar, { mineFor } from '../ReactionBar';
import HandCardRail, { CARD_ASPECT } from '../round/HandCardRail';
import ShimmerBar from '../../ui/ShimmerBar';
import BackChunk from '../../ui/BackChunk';
import theme from '../../../theme/themes';
import { useTheme, useThemedStyles } from '../../../theme/ThemeContext';

// Renders the picking phase. All state and async work lives in
// GameScreen — this component is pure render with handlers passed in.
// New in this pass: `selectedCard` populates the YOUR CARD section
// at the bottom; tap-in-grid = select, tap-YOUR-CARD-play = preview
// fullscreen, PLAY THIS SNAPPLE bar submits.
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
  mulligansLeft = 0,
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
  onHelpEnd,
  onCreatorPress,
  onMulligan,
  onEditPromptOpen,
  onEditPromptClose,
  onEditPromptTextChange,
  onEditPromptSave,
  onDeletePrompt,
  onTrueDeletePrompt,
  onExcludeFromPool,
  // Reacting to your own pick while the round waits on everyone else.
  // The clip is on screen and there is nothing else to do; the old
  // screen just counted heads.
  onReact,
  reactionCooling,
}) {
  const currentPrompt = game.prompts[game.currentRound - 1] || 'Show us something!';
  const alreadyPicked = game.submissions.some(s => s.uid === user.uid);
  // The round CAP, not the points target - see RoundPromptBanner.
  const roundLimitShown = game.roundLimit || null;

  // Which card in the hand is playing inline right now (only one
  // at a time). Tap a different card = swap + play. Tap the same
  // card that's currently playing = pause (unmounts the player so
  // the thumbnail shows again). Token increment on swap forces a
  // fresh mount so the video starts from frame 0.
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  // Up here with the other hooks: there is an early return further
  // down, and a hook below it runs in some renders and not others.
  const { width } = useWindowDimensions();

  const [inlinePlaying, setInlinePlaying] = useState({ id: null, token: 0 });
  const bumpInline = (id) => {
    setInlinePlaying(prev => {
      if (prev.id === id) return { id: null, token: prev.token };
      return { id, token: prev.token + 1 };
    });
  };

  if (hand.length === 0) {
    return (
      <LinearGradient colors={t.colors.gameBackgroundGradient} style={styles.container}>
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
      <LinearGradient colors={t.colors.gameBackgroundGradient} style={styles.container}>
        <RoundHeaderBar phase="picking" timerSec={timer} onHelp={onHelp} onHelpEnd={onHelpEnd} />
        <RoundPromptBanner
          prompt={currentPrompt}
          round={game.currentRound}
          roundLimit={roundLimitShown}
        />
        <ScrollView
          contentContainerStyle={styles.pickedWaitContent}
          showsVerticalScrollIndicator={false}
        >
          {/* YOUR PICK horizontally centered — label above, card
              beneath, both centered on the screen. */}
          <View style={styles.yourPickSection}>
            <Text style={styles.yourPickLabel}>YOUR PICK</Text>
            {myPick?.videoUrl ? (
              <View style={styles.yourPickCardWrap}>
                <HandCardThumbnail
                  card={{
                    videoUrl: myPick.videoUrl,
                    creatorUsername: 'you',
                    gridThumbUrl: myPick.gridThumbUrl,
                  }}
                  label="@you"
                  onFullscreen={() => onPreviewCard({ ...myPick, _isWaiting: true })}
                  // Same corner as every other card in the app.
                  cornerSlot={onReact ? (
                    <ReactionBar
                      mode="picker"
                      collapsible
                      mine={mineFor(game.reactions, user?.uid, user?.uid)}
                      onReact={(key) => onReact(user?.uid, key)}
                      disabled={reactionCooling}
                    />
                  ) : null}
                />
              </View>
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
                wishlistedSnappleIds={userCurrency.wishlistedSnapples || []}
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
  // Swipe between hand cards inside the fullscreen player, the same as
  // the voting and results players. Opening a card used to be a dead
  // end: one clip, then close and tap the next, which is a poor way to
  // look through a hand you are choosing from.
  const previewAt = previewCard
    ? hand.findIndex(c => (c.id || c.snappleId) === (previewCard.id || previewCard.snappleId))
    : -1;
  const stepPreview = (d) => {
    const next = hand[previewAt + d];
    // Carries the flags the caller set, so a preview opened from the
    // waiting screen stays a waiting preview as you move through it.
    if (next) onPreviewCard({ ...next, _isWaiting: previewCard?._isWaiting });
  };

  // Passed in, not read off inventory: the free per-game one lives in
  // GameScreen and never lands in inventory at all.
  const hasMulligan = mulligansLeft > 0;

  // The CTA label already centres inside its own button; what it misses
  // is the middle of the SCREEN, because that button is only 3/4 of the
  // row once the mulligan takes a quarter. A single centred child with a
  // right margin of W sits W/2 to the left, so a margin of one quarter
  // of the screen moves it exactly the eighth it is out by - and falls
  // away when there is no mulligan and the bar is full width.
  const ctaTextStyle = hasMulligan ? { marginRight: width / 4 } : null;

  return (
    <LinearGradient colors={t.colors.gameBackgroundGradient} style={styles.container}>
      <RoundHeaderBar phase="picking" timerSec={timer} onHelp={onHelp} onHelpEnd={onHelpEnd} />

      {/* The prompt is pinned. It used to scroll away with the grid,
          which meant you could be choosing a card with the thing
          you're answering off-screen. Only the cards move now. */}
      <RoundPromptBanner
        prompt={currentPrompt}
        round={game.currentRound}
        roundLimit={roundLimitShown}
        onEdit={isAdmin ? () => onEditPromptOpen(currentPrompt) : undefined}
      />

      <View style={styles.sectionHead}>
        <Text style={styles.sectionTitle}>YOUR HAND</Text>
        <View style={{ flex: 1 }} />
        <Text style={styles.sectionHint}>Tap to select</Text>
      </View>

      <View style={styles.railWrap}>
        <HandCardRail
          grid
          cards={hand}
          renderCard={(item) => {
            const isSelected = selectedCard?.id === item.id;
            const isInlinePlaying = inlinePlaying.id === item.id;
            // Card body tap = SELECT + play inline once. Tap the
            // same card again to replay (playToken increments so
            // the inline player remounts). Fullscreen chip opens
            // the full preview modal.
            const onCardTap = () => {
              if (onSelectCard) onSelectCard(item);
              bumpInline(item.id);
            };
            const onFullscreen = () => {
              setInlinePlaying({ id: null, token: 0 });
              if (onSelectCard) onSelectCard(item);
              onPreviewCard(item);
            };
            return (
              <HandCardThumbnail
                card={item}
                aspect={CARD_ASPECT}
                isSelected={isSelected}
                isPlaying={isInlinePlaying}
                playToken={isInlinePlaying ? inlinePlaying.token : 0}
                onTogglePlay={onCardTap}
                onFullscreen={onFullscreen}
                onCreatorPress={onCreatorPress}
              />
            );
          }}
        />

      </View>

      {/* Flush submit bar — gradient + shimmer via ShimmerBar so the
          resting (blue → purple) and armed (green → yellow) states
          both feel alive.

          Mulligan rides IN this bar rather than above it. As its own
          centred pill it spent a whole row of height between the cards
          and the CTA to hold one chip - height the grid wanted, on the
          one screen where seeing the cards matters most. Beside the CTA
          it costs nothing: the bar was already there, and the 1/4 + 3/4
          split is the same one BACK and SUBMIT use in the preview
          modal, so the two bars read as the same furniture. */}
      <View style={styles.actionRow}>
        {hasMulligan && (
          // Same chunk the preview modal's BACK uses, so the two bars
          // are visibly the same furniture. Word only, no icon - the
          // label already says what it does and the glyph crowded a
          // quarter-width chunk. Turns red once armed, which is the
          // only thing that has to differ from BACK.
          <BackChunk
            onPress={onMulligan}
            style={styles.mulliganChunk}
            label={`MULLIGAN (${mulligansLeft})`}
            textStyle={styles.mulliganText}
          />
        )}
        {selectedCard ? (
          <ShimmerBar
            colors={[theme.colors.vibeGreen, theme.colors.vibeBlue]}
            label="PLAY THIS SNAPPLE"
            onPress={() => onPickCard(selectedCard)}
            style={styles.ctaChunk}
            textStyle={ctaTextStyle}
          />
        ) : (
          <ShimmerBar
            colors={[theme.colors.vibeBlue, theme.colors.vibeNeonPurple]}
            label="PICK A SNAPPLE"
            style={styles.ctaChunk}
            textStyle={ctaTextStyle}
          />
        )}
      </View>

      {/* Fullscreen preview modal — opened from either a grid tap
          (via _fromYourCard/regular) or from the YOUR CARD play icon.
          When previewing from picking, the CTA still submits. */}
      {previewCard && (
        <PreviewModal
          visible
          videoUrl={previewCard.videoUrl}
          muted={!!previewCard.muted}
          onClose={onClosePreview}
          onNext={previewAt >= 0 && previewAt < hand.length - 1
            ? () => stepPreview(1) : undefined}
          onPrev={previewAt > 0 ? () => stepPreview(-1) : undefined}
          primaryLabel={previewCard._isWaiting ? null : 'PLAY THIS SNAPPLE'}
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
                wishlistedSnappleIds={userCurrency.wishlistedSnapples || []}
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
              {/* Vertical stack — Save (primary), Replace (swap for
                  another prompt this round only), Delete (hard-remove
                  from the pool + swap), Cancel. */}
              <View style={styles.editPromptButtons}>
                <Pressable
                  style={[styles.editPromptBtn, { borderColor: theme.colors.vibeBlue }]}
                  onPress={onEditPromptSave}
                >
                  <Text style={[styles.editPromptBtnText, { color: theme.colors.vibeBlue }]}>Save</Text>
                </Pressable>
                <Pressable
                  style={[styles.editPromptBtn, { borderColor: theme.colors.vibeYellow }]}
                  onPress={onDeletePrompt}
                >
                  <Text style={[styles.editPromptBtnText, { color: theme.colors.vibeYellow }]}>Replace</Text>
                </Pressable>
                <Pressable
                  style={[styles.editPromptBtn, { borderColor: theme.colors.vibeRed }]}
                  onPress={onTrueDeletePrompt}
                >
                  <Text style={[styles.editPromptBtnText, { color: theme.colors.vibeRed }]}>Delete</Text>
                </Pressable>
                <Pressable
                  style={[styles.editPromptBtn, { borderColor: 'rgba(255,255,255,0.2)' }]}
                  onPress={onEditPromptClose}
                >
                  <Text style={styles.editPromptBtnText}>Cancel</Text>
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

// Whites split two ways here. Text that sits on the app background
// (section titles, player rows, the loading line) becomes a token and
// follows the theme. The edit-prompt modal keeps its literals — it's a
// dark slab with its own gradient, same reasoning as the action bars.
const makeStyles = (t) => ({
  container: { flex: 1 },
  scrollContent: {
    // Enough clearance for the flush action bar at the bottom
    // (~86pt tall including safe padding) so YOUR CARD isn't
    // hidden behind it.
    paddingBottom: 120,
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
    color: t.colors.textPrimary,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  sectionHint: {
    color: theme.colors.vibeBlue,
    fontSize: 12,
    fontWeight: '700',
  },

  // 2-col grid.
  // The rail now owns everything between the pinned prompt and the
  // action bar - the mulligan chip used to take a row out of this and
  // has moved into the bar. ShimmerBar is in normal flow, not overlaid,
  // so no clearance is needed - the old paddingBottom: 100 was left
  // over from the scroll layout and was eating height the cards use.
  railWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 8,
  },

  // The mulligan chunk and the CTA share the existing `actionRow`
  // below - it already describes this exact split (1/4 + 3/4, stretched
  // to one height, black top border) and was sitting unused. A second
  // near-identical style would have shadowed it silently, since a later
  // duplicate key just wins.
  mulliganChunk: {
    flex: 1,
  },
  mulliganText: {
    // Tighter than BACK's, which is set for a four-letter word.
    // BackChunk shrinks to fit on top of this, so a longer count
    // still lands on one line.
    fontSize: 11,
    letterSpacing: 0.5,
  },
  ctaChunk: {
    flex: 3,
  },

  // YOUR CARD section at the bottom of the scroll.
  yourCardSection: {
    paddingHorizontal: 14,
    marginTop: 14,
    marginBottom: 8,
    gap: 8,
  },
  // Fixed small width so the YOUR CARD thumbnail doesn't stretch
  // to full screen and blow past the visible viewport. The section
  // was blowing up to ~500pt tall on some phones; capping to a
  // ~150pt-wide chip keeps it visible without extra scroll.
  yourCardWrap: {
    width: 150,
  },
  yourCardEmpty: {
    width: 150,
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
    color: t.colors.textMuted,
    fontSize: 14,
    fontWeight: '600',
  },

  // (Legacy submitBar / submitBarDisabled / submitBarText styles
  // removed — flush CTA now handled by <ShimmerBar>.)

  // Split action row: 1/4 Back chunk, 3/4 primary CTA. Same
  // full-width footprint as the plain submit bar.
  actionRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: 3,
    borderTopColor: '#000',
  },
  actionBackChunk: {
    flex: 1,
    paddingTop: 20,
    paddingBottom: 30,
    alignItems: 'center',
    justifyContent: 'center',
    // Dim cyan-tinted dark background so it reads as chrome (not a
    // primary action) but stays inside the neon vibe palette.
    backgroundColor: 'rgba(10, 18, 40, 0.95)',
    borderRightWidth: 2,
    borderRightColor: '#000',
  },
  actionBackText: {
    // Matches PLAY THIS SNAPPLE typography (900 weight, 3pt tracking)
    // just shorter + cyan so the two chunks read as one bar even
    // though they're doing different things.
    color: theme.colors.vibeBlue,
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  actionSubmitChunk: {
    flex: 3,
    borderTopWidth: 0,
  },

  // Post-pick wait screen — leaderboard of who's picked yet.
  pickedWaitContent: {
    paddingHorizontal: 16,
    paddingBottom: 40,
  },
  // Wait screen — YOUR PICK label + thumbnail centered horizontally.
  yourPickSection: {
    alignItems: 'center',
    marginTop: 8,
    marginBottom: 14,
    gap: 10,
  },
  yourPickLabel: {
    color: t.colors.textPrimary,
    fontSize: 13,
    fontWeight: '900',
    letterSpacing: 1.5,
    textAlign: 'center',
  },
  yourPickCardWrap: {
    width: 180,
  },
  pickProgressText: {
    color: t.colors.textPrimary,
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
    borderWidth: 1, borderColor: t.colors.divider,
  },
  playerStatusName: {
    color: t.colors.textPrimary, fontSize: 13, fontWeight: '600', flex: 1,
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
    color: t.colors.textPrimary,
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 24,
    minHeight: 60,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 8,
    padding: 8,
  },
  // Vertical button stack — each takes full width, tap targets
  // stay comfortable, and the primary action sits on top.
  editPromptButtons: {
    flexDirection: 'column',
    gap: 8,
    marginTop: 16,
  },
  editPromptBtn: {
    paddingVertical: 12,
    paddingHorizontal: 12,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,0,0,0.4)',
    alignItems: 'center',
  },
  editPromptBtnText: {
    color: t.colors.textPrimary,
    fontSize: 14,
    fontWeight: 'bold',
    letterSpacing: 0.5,
  },
});
