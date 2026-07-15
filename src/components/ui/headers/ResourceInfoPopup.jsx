// ResourceInfoPopup — press-and-hold tooltip for a resource in the
// top HomeHeader bar. Absolutely-positioned overlay (NOT a Modal)
// because Modal hijacks the touch responder and would break the
// Pressable's onPressOut → the popup would stick on screen after
// release. This View renders in the same tree as the Pressable, so
// the finger keeps its grip on the Pressable and release cleanly
// fires the "hide popup" state update.
//
// Positioned to float below the resource row with a dim backdrop
// under the card that covers the rest of the screen but stays
// pointerEvents:'none' so nothing under it steals touches either.

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import theme from '../../../theme/themes';

export default function ResourceInfoPopup({ visible, title, bullets }) {
  if (!visible) return null;
  return (
    <View style={styles.wrap} pointerEvents="none">
      <View style={styles.backdrop} />
      <View style={styles.card}>
        <Text style={styles.title}>{title}</Text>
        <View style={styles.bulletList}>
          {(bullets || []).map((line, i) => (
            <View key={i} style={styles.bulletRow}>
              <Text style={styles.bulletDot}>•</Text>
              <Text style={styles.bulletText}>{line}</Text>
            </View>
          ))}
        </View>
        <Text style={styles.hint}>RELEASE TO CLOSE</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Full-screen shell positioned so the popup floats below the
  // resource row (top offset ≈ resource bar height + safe area).
  // High zIndex + elevation so it paints above sibling content.
  wrap: {
    position: 'absolute',
    top: 44,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 9999,
    elevation: 9999,
    alignItems: 'center',
  },
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.65)',
  },
  card: {
    marginTop: 20,
    width: '90%',
    maxWidth: 360,
    paddingVertical: 22,
    paddingHorizontal: 22,
    borderRadius: 18,
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(10, 26, 42, 0.96)',
  },
  title: {
    color: '#fff',
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 2,
    textAlign: 'center',
    textTransform: 'uppercase',
    marginBottom: 14,
  },
  bulletList: {
    alignSelf: 'stretch',
    gap: 8,
    marginBottom: 14,
  },
  bulletRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    paddingHorizontal: 4,
  },
  bulletDot: {
    color: theme.colors.vibeBlue,
    fontSize: 18,
    lineHeight: 22,
    fontWeight: '900',
  },
  bulletText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  hint: {
    color: theme.colors.vibeBlue,
    fontSize: 10,
    fontWeight: 'bold',
    letterSpacing: 2,
    textAlign: 'center',
    textTransform: 'uppercase',
    opacity: 0.55,
  },
});
