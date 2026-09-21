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
import { gamePromptService } from '../../services/gamePromptService';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

// How many cards the pool deck pulls in one go. It is a fetch window,
// not a quota — whatever comes back is all rankable in one sitting.
// Game prompts take the whole unsorted list instead; see getUnsorted.
const POOL_DECK_SIZE = 40;

/**
 * @param {string} userId
 * @param {string[]} liveTexts  prompts currently in rotation, so the
 *   deck never asks someone to pre-judge one that is already running
 *   with its own rating buttons further up the screen
 * @param {Function} onSorted  optional, fired after each vote with the
 *   running count so the parent can react (a reward, a nudge)
 * @param {Function} onReport  optional, called with the card on top.
 *   Lives here rather than in the parent because the deck is what knows
 *   which prompt you are looking at.
 */
export default function PromptSortDeck({
  userId, liveTexts, onSorted,
  // Which prompts it sorts. Game prompts rank this season's deck and
  // next season's candidates; the default is the snapple prompt pool.
  target = 'promptPool',
  onReport,
  // Admin only, and only where a caller passes it - the game prompts
  // panel does, the snapple pool deck does not. Called with the card on
  // top, same as onReport.
  onAdmin,
  title = 'HELP SORT THESE',
  subtitle = 'Not live yet - decide what makes the cut',
  // Shown when there is nothing in the stack at all. Worth overriding:
  // "you have ranked everything" and "the pool is empty" are different
  // facts, and only the caller knows which deck this is.
  emptyTitle = 'All caught up',
  emptySub = 'You have ranked everything there is right now.',
}) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [deck, setDeck] = useState([]);
  const [index, setIndex] = useState(0);
  const [loading, setLoading] = useState(true);
  const [sorted, setSorted] = useState(0);
  // True once a deliberate refresh has come back with nothing. Distinct
  // from an empty first load: it means we looked again, just now, and
  // there really is nothing new.
  const [exhausted, setExhausted] = useState(false);

  const load = useCallback(async (fresh = false) => {
    if (!userId) return;
    setLoading(true);
    const { prompts } = target === 'gamePrompts'
      ? await gamePromptService.getUnsorted(userId, { fresh })
      : await promptVoteService.getUnsortedPool(userId, POOL_DECK_SIZE, liveTexts || []);
    setDeck(prompts);
    setIndex(0);
    setLoading(false);
    // Only a refresh can conclude "nothing new" - the first load
    // returning empty just means you are caught up already.
    if (fresh) setExhausted(prompts.length === 0);
    // Deliberately not keyed on liveTexts: the rotation changing under
    // someone mid-swipe should not reshuffle the stack in their hands.
  }, [userId, target]); // eslint-disable-line react-hooks/exhaustive-deps

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
    promptVoteService.vote(prompt.id, userId, value, target);
  }, [userId, onSorted, target]);

  if (loading) {
    return (
      <View style={styles.wrap}>
        <ActivityIndicator color={theme.colors.vibeBlue} />
      </View>
    );
  }

  const current = deck[index];

  // Two ways to land here, and they are not the same message. Either the
  // stack ran out under you after some swipes, or there was nothing in
  // it when the screen opened. The second case used to `return null`,
  // which drew literally nothing - so somebody who had ranked every
  // prompt got a blank gap where the deck should be, indistinguishable
  // from a screen that had failed to load. Both cases say something now.
  if (!current) {
    const swiped = sorted > 0;
    return (
      <View style={styles.wrap}>
        <View style={styles.donePane}>
          <Ionicons
            name={swiped ? 'checkmark-circle' : 'albums-outline'}
            size={48}
            color={swiped ? theme.colors.vibeGreen : t.colors.textSecondary}
          />
          <Text style={styles.doneTitle}>{swiped ? 'Nice work' : emptyTitle}</Text>
          <Text style={styles.doneSub}>
            {swiped
              ? `You sorted ${sorted} ${sorted === 1 ? 'prompt' : 'prompts'}`
              : emptySub}
          </Text>
          {/* Says so when there is nothing left, rather than offering a
              button that looks broken. Tapping "Sort more" on an empty
              well used to do exactly nothing on screen. */}
          {exhausted ? (
            <Text style={styles.doneSub}>
              {"That's everything for now - check back when new ones arrive."}
            </Text>
          ) : (
            <Pressable style={styles.reload} onPress={() => load(true)}>
              <Text style={styles.reloadText}>
                {swiped ? 'Sort more' : 'Check for new'}
              </Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  return (
    <View style={styles.wrap}>
      {/* No counter. It read "3/10", which made a stack of ten look
          like an assignment with a finish line - and now that the deck
          holds everything unsorted, the honest number would be "3/312",
          which is worse. Rank until you are bored; the done pane says
          how many you got through. */}
      <View style={styles.headerRow}>
        <Text style={styles.label}>{title}</Text>
      </View>
      {/* Optional. The game tab passes none - its how-to lives in the
          intro card instead of a line of subtext under every heading. */}
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : <View style={styles.subSpacer} />}

      <SwipeCard
        key={current.id}
        onSwipeLeft={() => handleVote(current, -1)}
        onSwipeRight={() => handleVote(current, 1)}
        leftLabel="WEAK"
        rightLabel="FUN"
      >
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

      {/* Under the verdict buttons, not beside them. Reporting is a
          different kind of act from rating - rare, and not a third
          opinion - so it should not sit in the row you are tapping
          quickly. */}
      <View style={styles.footerRow}>
        {onReport ? (
          <Pressable style={styles.report} onPress={() => onReport(current)} hitSlop={8}>
            <Ionicons name="flag-outline" size={13} color={t.colors.textSecondary} />
            <Text style={styles.reportText}>Report</Text>
          </Pressable>
        ) : null}
        {onAdmin ? (
          <Pressable style={styles.report} onPress={() => onAdmin(current)} hitSlop={8}>
            <Ionicons name="construct-outline" size={13} color={theme.colors.vibeYellow} />
            <Text style={[styles.reportText, { color: theme.colors.vibeYellow }]}>
              Manage
            </Text>
          </Pressable>
        ) : null}
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
  subSpacer: { height: 12 },
  sub: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: 11,
    alignSelf: 'stretch',
    paddingHorizontal: 16,
    marginTop: 2,
    marginBottom: 12,
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

  footerRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
  },
  report: {
    flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 16,
    paddingVertical: 4, paddingHorizontal: 10,
  },
  reportText: { color: t.colors.textSecondary, fontSize: 12, fontWeight: '600' },

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
