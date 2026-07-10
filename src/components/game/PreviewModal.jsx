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
  primaryIcon = 'play',
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
          <Pressable style={styles.actionBar} onPress={onPrimary}>
            <Text style={styles.actionBarText}>{primaryLabel}</Text>
            {primaryIcon ? (
              <Ionicons name={primaryIcon} size={22} color="#fff" />
            ) : null}
          </Pressable>
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
  overlaySlot: {
    position: 'absolute',
    bottom: 120,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 10,
  },
  // Fat cyan action bar — solid punch of color across the bottom with
  // graffiti-thick text so the primary CTA is impossible to miss.
  // Vertical padding kept near-equal so the label sits visually
  // centered; the small extra chin at the bottom is intentional
  // breathing room on devices without a home indicator.
  actionBar: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.colors.vibeBlue,
    paddingTop: 20,
    paddingBottom: 24,
    paddingHorizontal: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    borderTopWidth: 3,
    borderTopColor: '#000',
  },
  actionBarText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: '900',
    letterSpacing: 3,
    textTransform: 'uppercase',
  },
});
