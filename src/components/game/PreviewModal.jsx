// PreviewModal — full-bleed video preview shared by the PICKING and
// VOTING phases. Video fills the screen, top row hosts close (+ optional
// admin control), and a fat cyan action bar spans the bottom with the
// phase's primary CTA (PLAY THIS CARD / PICK AS FAVORITE).
//
// Optional overlaySlot is rendered as a floating layer above the bottom
// bar — used for CreatorActionRow (mute/report) so the user can act on
// the previewed card without leaving the modal.

import React from 'react';
import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PreviewPlayer from './PreviewPlayer';
import theme from '../../theme/themes';

// Render the modal. When `primaryLabel` is null the bottom action bar
// is hidden (used by the post-pick wait-screen preview where the card
// has already been played).
export default function PreviewModal({
  visible,
  videoUrl,
  muted,
  onClose,
  primaryLabel,
  // Optional trailing icon. Defaulted to null so both PLAY THIS CARD
  // and PICK AS FAVORITE render text-only; callers can pass one
  // explicitly when they want an accent glyph.
  primaryIcon = null,
  onPrimary,
  topRightSlot,
  overlaySlot,
}) {
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.root}>
        <PreviewPlayer videoUrl={videoUrl} muted={!!muted} />

        <View style={styles.topBar}>
          <Pressable style={styles.closeBtn} onPress={onClose}>
            <Ionicons name="close" size={22} color="white" />
          </Pressable>
          {topRightSlot ? <View>{topRightSlot}</View> : <View />}
        </View>

        {overlaySlot ? (
          <View style={styles.overlaySlot}>{overlaySlot}</View>
        ) : null}

        {primaryLabel ? (
          <View style={styles.actionRow}>
            {/* Back chunk mirrors the picking / voting submit bars —
                1/4 width, cyan text on dark, closes the preview so
                the user lands back on the grid with selection intact. */}
            <Pressable style={styles.actionBackChunk} onPress={onClose}>
              <Text style={styles.actionBackText}>BACK</Text>
            </Pressable>
            <Pressable
              style={[styles.actionBar, styles.actionSubmitChunk]}
              onPress={onPrimary}
            >
              <Text style={styles.actionBarText}>{primaryLabel}</Text>
              {primaryIcon ? (
                <Ionicons name={primaryIcon} size={22} color="#fff" />
              ) : null}
            </Pressable>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#000',
  },
  topBar: {
    position: 'absolute',
    top: 48,
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 10,
  },
  closeBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  // Right-side vertical rail — mirrors TikTok's action column so
  // Follow / Save / Buy / Report stack down the edge of the video
  // instead of blocking a strip at the bottom.
  overlaySlot: {
    position: 'absolute',
    right: 14,
    bottom: 140,
    alignItems: 'center',
    zIndex: 10,
  },
  // Split action row: 1/4 Back chunk + 3/4 primary CTA chunk. The
  // OUTER row is what carries the absolute bottom positioning now
  // that the bar is split; the two chunks live inside it as
  // regular flex children.
  actionRow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'stretch',
    borderTopWidth: 3,
    borderTopColor: '#000',
  },
  // Solid cyan fill with white text — matches the phase-chip active
  // state up top so leaving the preview reads as a real cyan action,
  // not gray chrome. Sits next to the green submit chunk = the
  // core vibe palette.
  actionBackChunk: {
    flex: 1,
    paddingTop: 20,
    paddingBottom: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: theme.colors.vibeBlue,
    borderRightWidth: 2,
    borderRightColor: '#000',
  },
  actionBackText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
  // Right-hand submit chunk — flex: 3 so it takes 3/4 of the row.
  // NO longer position: absolute (the outer row carries that now)
  // and NO borderTopWidth (the row already draws one).
  actionSubmitChunk: {
    flex: 3,
    backgroundColor: theme.colors.vibeGreen,
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  actionBar: {},
  actionBarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
});
