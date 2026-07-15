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
import ShimmerBar from '../ui/ShimmerBar';
import BackChunk from '../ui/BackChunk';
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
            <BackChunk onPress={onClose} style={styles.actionBackFlex} />
            <ShimmerBar
              colors={[theme.colors.vibeGreen, theme.colors.vibeBlue]}
              label={primaryLabel}
              onPress={onPrimary}
              style={styles.actionSubmitChunk}
            />
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
  // BACK + primary CTA are now the shared BackChunk + ShimmerBar
  // components. Only the flex slots remain here so the outer
  // actionRow gets its 1/4 + 3/4 split.
  actionBackFlex: {
    flex: 1,
  },
  actionSubmitChunk: {
    flex: 3,
    borderTopWidth: 0,
  },
});
