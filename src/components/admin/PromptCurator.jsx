// PromptCurator.jsx
// Admin-only Tinder-style swipe deck for triaging prompts. Shows one
// prompt at a time from either gamePrompts or promptPool; swipe left
// to delete, swipe right to keep (no-op), tap to edit. After the deck
// is exhausted shows a Reload button so the admin can refresh from
// Firestore (in case they want a second pass or pulled-in additions).
//
// All Firebase work goes through promptAdminService — this component
// stays a dumb stateful UI.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, StyleSheet, Modal, TextInput,
  ActivityIndicator, Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { GestureHandlerRootView, PanGestureHandler } from 'react-native-gesture-handler';
import Animated, {
  useSharedValue, useAnimatedStyle, useAnimatedGestureHandler,
  withSpring, withTiming, runOnJS,
} from 'react-native-reanimated';
import VibeButton from '../ui/VibeButton';
import {
  listAllPrompts,
  updatePromptText,
  deletePrompt,
} from '../../services/promptAdminService';
import theme from '../../theme/themes';

const { width: screenWidth } = Dimensions.get('window');
const SWIPE_THRESHOLD = screenWidth * 0.3;
const SWIPE_OFF_SCREEN = screenWidth * 1.2;

// Toggle between the two collections the curator supports. Mirror the
// UI tab strip styling so it doesn't feel out of place.
function CollectionToggle({ value, onChange }) {
  const options = [
    { key: 'gamePrompts', label: 'Game' },
    { key: 'promptPool', label: 'Snapple' },
  ];
  return (
    <View style={styles.toggleWrap}>
      {options.map(o => {
        const active = value === o.key;
        return (
          <Pressable
            key={o.key}
            onPress={() => onChange(o.key)}
            style={[styles.toggleBtn, active && styles.toggleBtnActive]}
          >
            <Text style={[styles.toggleBtnText, active && styles.toggleBtnTextActive]}>
              {o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

// Edit modal — pre-fills with current text. Saves on enter or button.
function EditPromptModal({ visible, initialText, onCancel, onSave }) {
  const [text, setText] = useState(initialText || '');
  useEffect(() => { setText(initialText || ''); }, [initialText]);
  if (!visible) return null;
  return (
    <Modal visible transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.modalOverlay}>
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>Edit prompt</Text>
          <TextInput
            style={styles.modalInput}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            placeholderTextColor={theme.colors.textSecondary}
          />
          <View style={styles.modalButtons}>
            <Pressable style={styles.modalCancel} onPress={onCancel}>
              <Text style={styles.modalCancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              style={styles.modalSave}
              onPress={() => onSave(text)}
              disabled={!text.trim()}
            >
              <Text style={styles.modalSaveText}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// The swipeable card. translateX driven by pan; release decides
// whether to fire delete / keep based on threshold. Tap delegated to
// parent via onTap so the edit modal lives one level up.
function SwipeCard({ prompt, onSwipeLeft, onSwipeRight, onTap }) {
  const tx = useSharedValue(0);

  const gesture = useAnimatedGestureHandler({
    onActive: (e) => { tx.value = e.translationX; },
    onEnd: () => {
      if (tx.value < -SWIPE_THRESHOLD) {
        tx.value = withTiming(-SWIPE_OFF_SCREEN, { duration: 200 }, (done) => {
          if (done) runOnJS(onSwipeLeft)();
        });
      } else if (tx.value > SWIPE_THRESHOLD) {
        tx.value = withTiming(SWIPE_OFF_SCREEN, { duration: 200 }, (done) => {
          if (done) runOnJS(onSwipeRight)();
        });
      } else {
        tx.value = withSpring(0);
      }
    },
  });

  // Card tilts as it swipes — purely visual feedback. ~15deg at the
  // threshold, capped at 25deg if user keeps dragging.
  const cardStyle = useAnimatedStyle(() => {
    const rotate = (tx.value / screenWidth) * 25;
    return {
      transform: [
        { translateX: tx.value },
        { rotate: `${Math.max(-25, Math.min(25, rotate))}deg` },
      ],
    };
  });

  // Action badges fade in based on swipe direction so the admin sees
  // what's about to happen before they release.
  const deleteBadgeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, -tx.value / SWIPE_THRESHOLD)),
  }));
  const keepBadgeStyle = useAnimatedStyle(() => ({
    opacity: Math.min(1, Math.max(0, tx.value / SWIPE_THRESHOLD)),
  }));

  return (
    <PanGestureHandler onGestureEvent={gesture}>
      <Animated.View style={[styles.card, cardStyle]}>
        <Animated.View style={[styles.badgeDelete, deleteBadgeStyle]}>
          <Text style={styles.badgeDeleteText}>DELETE</Text>
        </Animated.View>
        <Animated.View style={[styles.badgeKeep, keepBadgeStyle]}>
          <Text style={styles.badgeKeepText}>KEEP</Text>
        </Animated.View>

        <Pressable style={styles.cardInner} onPress={onTap}>
          <Text style={styles.cardCategory}>{prompt.category || 'general'}</Text>
          <Text style={styles.cardText}>{prompt.text}</Text>
          <Text style={styles.cardHint}>tap to edit · swipe left to delete · swipe right to keep</Text>
        </Pressable>
      </Animated.View>
    </PanGestureHandler>
  );
}

// All-done splash. Reload pulls a fresh list (e.g. after a seed
// script run added more, or admin wants a second pass).
function DonePane({ reviewedCount, onReload }) {
  return (
    <View style={styles.donePane}>
      <Ionicons name="checkmark-circle" size={64} color={theme.colors.vibeGreen} />
      <Text style={styles.doneTitle}>All caught up</Text>
      <Text style={styles.doneSub}>Reviewed {reviewedCount} prompts</Text>
      <VibeButton label="Reload" onPress={onReload} variant="toggle" color="blue" />
    </View>
  );
}

export default function PromptCurator() {
  const [collectionName, setCollectionName] = useState('gamePrompts');
  const [deck, setDeck] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // prompt being edited

  // Pull the deck whenever the collection changes (or Reload clicked).
  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    setIndex(0);
    try {
      const docs = await listAllPrompts(collectionName);
      setDeck(docs);
    } catch (err) {
      setError(err.message || 'Failed to load prompts');
      setDeck([]);
    } finally {
      setLoading(false);
    }
  }, [collectionName]);

  useEffect(() => { reload(); }, [reload]);

  const current = deck[index];

  // Swipe left → delete from Firestore + advance. Drop from local deck
  // immediately so the next card snaps in without waiting for refetch.
  const handleSwipeLeft = useCallback(async () => {
    if (!current) return;
    const id = current.id;
    setIndex(i => i + 1);
    try {
      await deletePrompt(collectionName, id);
    } catch (err) {
      console.warn('[PromptCurator] delete failed:', err.message);
      // Soft-fail: card already advanced; admin can reload if needed.
    }
  }, [current, collectionName]);

  // Swipe right → no-op, just advance.
  const handleSwipeRight = useCallback(() => {
    setIndex(i => i + 1);
  }, []);

  const handleSaveEdit = useCallback(async (newText) => {
    if (!editing) return;
    try {
      await updatePromptText(collectionName, editing.id, newText);
      // Update the deck in place so the on-card text reflects the save
      // without a full refetch.
      setDeck(prev => prev.map(p =>
        p.id === editing.id ? { ...p, text: newText.trim() } : p,
      ));
    } catch (err) {
      console.warn('[PromptCurator] edit save failed:', err.message);
    } finally {
      setEditing(null);
    }
  }, [editing, collectionName]);

  return (
    <GestureHandlerRootView style={styles.container}>
      <CollectionToggle value={collectionName} onChange={setCollectionName} />

      <View style={styles.progressRow}>
        <Text style={styles.progressText}>
          {loading
            ? 'Loading…'
            : deck.length === 0
              ? 'Empty collection'
              : current
                ? `${index + 1} of ${deck.length}`
                : `Done · ${deck.length} reviewed`}
        </Text>
      </View>

      <View style={styles.deckArea}>
        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.vibeBlue} />
        ) : error ? (
          <Text style={styles.errorText}>{error}</Text>
        ) : !current ? (
          <DonePane reviewedCount={deck.length} onReload={reload} />
        ) : (
          // Keyed on id so the SwipeCard's shared values reset between
          // prompts (otherwise the new card would inherit the prior
          // card's translateX/rotation).
          <SwipeCard
            key={current.id}
            prompt={current}
            onSwipeLeft={handleSwipeLeft}
            onSwipeRight={handleSwipeRight}
            onTap={() => setEditing(current)}
          />
        )}
      </View>

      <EditPromptModal
        visible={!!editing}
        initialText={editing?.text}
        onCancel={() => setEditing(null)}
        onSave={handleSaveEdit}
      />
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, paddingHorizontal: 16 },

  toggleWrap: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 12,
    marginBottom: 8,
  },
  toggleBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 14,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    alignItems: 'center',
  },
  toggleBtnActive: { backgroundColor: theme.colors.vibeBlue },
  toggleBtnText: {
    color: theme.colors.vibeBlue, fontWeight: 'bold', fontSize: 14,
  },
  toggleBtnTextActive: { color: '#000' },

  progressRow: { alignItems: 'center', marginBottom: 12 },
  progressText: { color: theme.colors.textSecondary, fontSize: 13 },

  deckArea: {
    flex: 1, justifyContent: 'center', alignItems: 'center', paddingBottom: 24,
  },
  errorText: { color: theme.colors.vibeRed, textAlign: 'center' },

  card: {
    width: screenWidth - 32,
    backgroundColor: 'rgba(0,0,0,0.5)',
    borderRadius: 18,
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
    padding: 24,
    minHeight: 320,
  },
  cardInner: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  cardCategory: {
    color: theme.colors.vibeBlue,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  cardText: {
    color: '#fff',
    fontSize: 22,
    fontWeight: 'bold',
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: 24,
  },
  cardHint: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    textAlign: 'center',
    position: 'absolute',
    bottom: 0,
  },

  // Action badges sit at the top corners and fade in as the card is
  // pulled toward their side. Borrows the rotated-stamp look from
  // typical Tinder clones.
  badgeDelete: {
    position: 'absolute',
    top: 18, right: 18,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 3,
    borderColor: theme.colors.vibeRed,
    transform: [{ rotate: '12deg' }],
    zIndex: 2,
  },
  badgeDeleteText: {
    color: theme.colors.vibeRed,
    fontSize: 16, fontWeight: 'bold', letterSpacing: 1,
  },
  badgeKeep: {
    position: 'absolute',
    top: 18, left: 18,
    paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 6,
    borderWidth: 3,
    borderColor: theme.colors.vibeGreen,
    transform: [{ rotate: '-12deg' }],
    zIndex: 2,
  },
  badgeKeepText: {
    color: theme.colors.vibeGreen,
    fontSize: 16, fontWeight: 'bold', letterSpacing: 1,
  },

  donePane: { alignItems: 'center', gap: 12 },
  doneTitle: { color: '#fff', fontSize: 22, fontWeight: 'bold' },
  doneSub: { color: theme.colors.textSecondary, fontSize: 14, marginBottom: 8 },

  modalOverlay: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'center', alignItems: 'center', paddingHorizontal: 24,
  },
  modalCard: {
    width: '100%', backgroundColor: '#0a0f1e',
    borderRadius: 16, borderWidth: 2, borderColor: theme.colors.vibeBlue,
    padding: 18,
  },
  modalTitle: {
    color: '#fff', fontSize: 16, fontWeight: 'bold', marginBottom: 12,
  },
  modalInput: {
    color: '#fff', fontSize: 15, minHeight: 100,
    borderRadius: 12, padding: 12,
    textAlignVertical: 'top',
    borderWidth: 2, borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  modalButtons: { flexDirection: 'row', gap: 10, marginTop: 14 },
  modalCancel: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.2)',
  },
  modalCancelText: { color: '#fff', fontWeight: 'bold' },
  modalSave: {
    flex: 1, paddingVertical: 12, borderRadius: 12, alignItems: 'center',
    backgroundColor: theme.colors.vibeBlue,
  },
  modalSaveText: { color: '#000', fontWeight: 'bold' },
});
