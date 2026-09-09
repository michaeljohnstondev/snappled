// PromptSortDeck.jsx — the community sorting deck.
//
// The app has 348 prompts sitting in `promptPool` and, until this, no
// screen anywhere that could display one. That is the real reason the
// pool has never had a single vote: nobody was ever shown a prompt to
// rate. Rotation then picked from that unsorted pile at random, so a
// weak prompt was only ever discovered by burning a live slot on it.
//
// This is where a prompt gets judged BEFORE it costs anyone an hour.
// Swipe right if it sounds fun to shoot, left if it doesn't.
//
// Follows PromptCurator's precedent of talking to its own service — the
// alternative is threading deck state through an already long screen.

import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import SwipeCard from './SwipeCard';
import { promptVoteService } from '../../services/promptVoteService';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

// How many cards one sitting holds. Short on purpose: a stack that ends
// feels finishable, and the section reloads for anyone who wants more.
const DECK_SIZE = 10;

/**
 * @param {string} userId
 * @param {string[]} liveTexts  prompts currently in rotation, so the
 *   deck never asks someone to pre-judge one that is already running
 *   with its own rating buttons further up the screen
 * @param {Function} onSorted  optional, fired after each vote with the
 *   running count so the parent can react (a reward, a nudge)
 */
export default function PromptSortDeck({ userId, liveTexts, onSorted }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [deck, setDeck] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sorted, setSorted] = useState(0);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { prompts } = await promptVoteService.getUnsortedPool(
      userId, DECK_SIZE, liveTexts || [],
    );
    setDeck(prompts);
    setIndex(0);
    setLoading(false);
    // Deliberately not keyed on liveTexts: the rotation changing under
    // someone mid-swipe should not reshuffle the stack in their hands.
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { load(); }, [load]);

  // Advance first, write second. The card has already flown off screen
  // by the time this runs, so waiting on the network would leave a gap
  // where the deck shows nothing. The vote document is idempotent, so a
  // failure costs one rating rather than corrupting a count.
  const handleVote = useCallback((prompt, value) => {
    setIndex(i => i + 1);
    setSorted(n => {
      const next = n + 1;
      onSorted?.(next);
      return next;
    });
    promptVoteService.vote(prompt.id, userId, value, 'promptPool');
  }, [userId, onSorted]);

  if (loading) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator color={theme.colors.vibeBlue} />
      </View>
    );
  }

  // Nothing waiting: either the pool is genuinely sorted or this user
  // has been through everything currently unused. Both are a good
  // outcome and neither deserves an error.
  if (!deck.length) return null;

  const current = deck[index];

  if (!current) {
    return (
      <View style={styles.wrap}>
        <View style={styles.donePane}>
          <Ionicons name="checkmark-circle" size={48} color={theme.colors.vibeGreen} />
          <Text style={styles.doneTitle}>Nice work</Text>
          <Text style={styles.doneSub}>
            You sorted {sorted} {sorted === 1 ? 'prompt' : 'prompts'}
          </Text>
          <Pressable style={styles.reload} onPress={load}>
            <Text style={styles.reloadText}>Sort more</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.headerRow}>
        <Text style={styles.label}>HELP SORT THESE</Text>
        <Text style={styles.counter}>{index + 1}/{deck.length}</Text>
      </View>
      <Text style={styles.sub}>Not live yet — decide what makes the cut</Text>

      <SwipeCard
        key={current.id}
        onSwipeLeft={() => handleVote(current, -1)}
        onSwipeRight={() => handleVote(current, 1)}
        leftLabel="WEAK"
        rightLabel="FUN"
      >
        <Text style={styles.cardCategory}>{current.category}</Text>
        <Text style={styles.cardText}>{current.text}</Text>
        <Text style={styles.cardHint}>{'swipe left if weak · right if fun'}</Text>
      </SwipeCard>

      {/* Buttons as well as the gesture. Swiping is not discoverable on
          its own, and some people simply prefer a target to hit. */}
      <View style={styles.actions}>
        <Pressable
          style={[styles.action, styles.actionWeak]}
          onPress={() => handleVote(current, -1)}
        >
          <Ionicons name="thumbs-down" size={22} color={theme.colors.vibeRed} />
        </Pressable>
        <Pressable
          style={[styles.action, styles.actionFun]}
          onPress={() => handleVote(current, 1)}
        >
          <Ionicons name="thumbs-up" size={22} color={theme.colors.vibeGreen} />
        </Pressable>
      </View>
    </View>
  );
}

const makeStyles = (t) => ({
  wrap: { marginTop: 28, alignItems: 'center' },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    alignSelf: 'stretch',
    paddingHorizontal: 16,
  },
  label: {
    color: t.colors.textSecondary,
    fontSize: 12,
    fontWeight: 'bold',
    letterSpacing: 1.5,
  },
  counter: {
    color: t.colors.textSecondary,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  sub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    alignSelf: 'stretch',
    paddingHorizontal: 16,
    marginTop: 2,
    marginBottom: 12,
  },

  cardCategory: {
    color: theme.colors.vibeBlue,
    fontSize: 11,
    fontWeight: 'bold',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 16,
  },
  cardText: {
    color: t.colors.textPrimary,
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

  actions: { flexDirection: 'row', gap: 28, marginTop: 18 },
  action: {
    width: 54, height: 54, borderRadius: 27,
    borderWidth: 2,
    alignItems: 'center', justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  actionWeak: { borderColor: theme.colors.vibeRed },
  actionFun: { borderColor: theme.colors.vibeGreen },

  donePane: { alignItems: 'center', gap: 8, paddingVertical: 24 },
  doneTitle: { color: t.colors.textPrimary, fontSize: 20, fontWeight: 'bold' },
  doneSub: { color: t.colors.textSecondary, fontSize: 13, marginBottom: 8 },
  reload: {
    paddingHorizontal: 18, paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
  },
  reloadText: { color: theme.colors.vibeBlue, fontWeight: 'bold', fontSize: 14 },
});
