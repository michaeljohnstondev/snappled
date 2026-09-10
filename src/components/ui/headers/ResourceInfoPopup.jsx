// ResourceInfoPopup — the explainer for a resource in the top bar.
//
// Opened by TAPPING a resource pill and closed by tapping anywhere.
// It used to be press-and-hold, released to dismiss, which had two
// problems: nothing on screen suggested holding, and a tooltip that
// only exists while your thumb is down cannot hold anything you might
// want to act on - your finger is busy being the reason it is open.
// A latched popup can carry a button, which is what lets this one send
// you to the store for the thing you just ran out of.
//
// No "tap to dismiss" hint. A full-screen dimmed layer over a card is
// already the most universally understood dismiss affordance there is,
// and labelling it would be the only text on screen explaining how a
// modal works.
//
// Uses a Modal so it renders above every layer regardless of what
// parent tree clips it — the previous absolutely-positioned overlay
// got clipped by the header's natural bounds and rendered off-screen.

import React from 'react';
import { View, Text, Modal, Pressable, StyleSheet } from 'react-native';
import CurrencyIcon from '../CurrencyIcon';
import theme from '../../../theme/themes';

/**
 * @param {boolean} visible
 * @param {string} title
 * @param {string[]} bullets
 * @param {Function} onClose  backdrop tap and the Android back button
 * @param {{label, onPress, currency, color}} action  optional CTA, e.g.
 *   sending someone to the store for the resource they just tapped.
 *   Closes the popup itself before acting. `currency` draws the coin or
 *   ticket art inside the button, so it names the thing you are going
 *   to get rather than just describing it.
 */
export default function ResourceInfoPopup({
  visible, title, bullets, onClose, action,
}) {
  return (
    <Modal
      visible={!!visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      {/* The backdrop IS the dismiss target. */}
      <Pressable style={styles.backdrop} onPress={onClose}>
        {/* Swallows taps so pressing the card itself doesn't close the
            thing you are trying to read. */}
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>{title}</Text>
          <View style={styles.bulletList}>
            {(bullets || []).map((line, i) => (
              <View key={i} style={styles.bulletRow}>
                <Text style={styles.bulletDot}>•</Text>
                <Text style={styles.bulletText}>{line}</Text>
              </View>
            ))}
          </View>

          {action ? (
            // Wears the app's toggle-button look - 3pt neon border on a
            // dark fill, label in the same colour - rather than the flat
            // filled rectangle this started as, which matched nothing
            // else in the app. The currency art rides along so the
            // button shows what it is offering.
            <Pressable
              style={({ pressed }) => [
                styles.action,
                { borderColor: action.color || theme.colors.vibeBlue },
                pressed && styles.actionPressed,
              ]}
              onPress={() => { onClose?.(); action.onPress?.(); }}
            >
              {action.currency ? (
                <CurrencyIcon name={action.currency} size={22} />
              ) : null}
              <Text
                style={[styles.actionText, { color: action.color || theme.colors.vibeBlue }]}
              >
                {action.label}
              </Text>
            </Pressable>
          ) : null}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.75)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  card: {
    width: '100%',
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
    color: '#fff',
    fontSize: 14,
    lineHeight: 20,
    flex: 1,
  },
  action: {
    marginTop: 18,
    alignSelf: 'stretch',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderWidth: 3,
    borderRadius: theme.sizes.buttonRadius,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  actionPressed: {
    opacity: 0.7,
    transform: [{ scale: 0.98 }],
  },
  actionText: {
    fontSize: 16,
    fontWeight: '600',
    fontFamily: theme.fonts.main,
    textAlign: 'center',
  },
});
