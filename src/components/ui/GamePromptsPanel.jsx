// GamePromptsPanel.jsx — the Game Prompts tab.
//
// Game prompts are what a round asks the room. This is where players
// rank this season's deck, see the candidates competing for next
// season, and pay tickets to submit their own. At rollover the best-
// voted become the next season's deck, so the community authors each
// season.
//
// Follows PromptSortDeck's precedent of talking to its own service
// rather than threading all of this through an already long screen.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Pressable, TextInput, Modal, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PromptSortDeck from './PromptSortDeck';
import VibeSegmentedControl from './VibeSegmentedControl';
import CurrencyIcon from './CurrencyIcon';
import {
  gamePromptService, costForSeason, GAME_PROMPT_MAX_LEN,
} from '../../services/gamePromptService';
import { useModal } from '../../store/ModalContext';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

const FILTERS = [
  { label: 'Top', value: 'top' },
  { label: 'New', value: 'new' },
  { label: 'Mine', value: 'mine' },
];

/**
 * @param {object} user
 * @param {number} tickets  current balance, shown before someone pays
 */
export default function GamePromptsPanel({ user, tickets = 0 }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { showConfirm, showError, showToast } = useModal();

  const [season, setSeason] = useState(0);
  const [filter, setFilter] = useState('top');
  const [prompts, setPrompts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [s, { prompts: rows }] = await Promise.all([
      gamePromptService.getSeason(),
      gamePromptService.list({ filter, userId: user?.uid }),
    ]);
    setSeason(s);
    setPrompts(rows);
    setLoading(false);
  }, [filter, user?.uid]);

  useEffect(() => { load(); }, [load]);

  const cost = costForSeason(season);

  // Confirm before submitting. When it costs tickets, the fee buys a
  // place in the vote rather than a guaranteed slot - the part people
  // most need to know before they pay, not after. Free in the beta, so
  // there is nothing to warn about there.
  const submit = () => {
    const text = draft.trim();
    if (!text) return;
    if (tickets < cost) {
      showError('Not Enough Tickets',
        `Creating a game prompt costs ${cost} tickets. You have ${tickets}.`);
      return;
    }
    showConfirm(
      cost > 0 ? `Spend ${cost} tickets?` : 'Submit this prompt?',
      `"${text}" goes up for a vote. If it wins, it plays in Season ${season + 1}.`
        + (cost > 0 ? ' Tickets are not refunded if it is voted down.' : ''),
      async () => {
        setSubmitting(true);
        const res = await gamePromptService.create(text);
        setSubmitting(false);
        if (!res.success) { showError('Could Not Submit', res.error); return; }
        setDraft('');
        setComposing(false);
        showToast('reward', 'Prompt submitted',
          cost > 0 ? `-${cost} tickets` : 'Up for the vote');
        load();
      },
    );
  };

  const report = (prompt) => showConfirm(
    'Report this prompt?',
    'Prompts reported by several players are removed from every game.',
    async () => {
      const res = await gamePromptService.report(prompt.id, user?.uid, 'inappropriate');
      if (res.success) showToast('info', 'Reported', 'Thanks for flagging it');
      else showError('Could Not Report', res.error);
    },
  );

  // Season 0 is the beta. Nobody should see "Season 0": to a beta player
  // this IS Season 1, just before it is official.
  const isBeta = season === 0;
  const seasonLabel = isBeta ? 'SEASON 1 \u00b7 BETA' : `SEASON ${season}`;
  const explainer = isBeta
    ? 'Beta rankings decide Season 1. The best make the deck at launch.'
    : `Rank what plays this season. The best become Season ${season + 1}.`;

  return (
    <View style={styles.wrap}>
      <View style={styles.seasonRow}>
        <Text style={styles.season}>{seasonLabel}</Text>
        <Pressable style={styles.createBtn} onPress={() => setComposing(true)}>
          <Ionicons name="add" size={18} color={theme.colors.vibeGreen} />
          <Text style={styles.createText}>New prompt</Text>
          {cost > 0 ? (
            <>
              <CurrencyIcon name="tickets" size={20} />
              <Text style={styles.createCost}>{cost}</Text>
            </>
          ) : (
            <Text style={styles.createCost}>FREE</Text>
          )}
        </Pressable>
      </View>
      <Text style={styles.explain}>{explainer}</Text>

      {user?.uid ? (
        <PromptSortDeck
          userId={user.uid}
          target="gamePrompts"
          title="RANK GAME PROMPTS"
          subtitle="Swipe right to keep it, left to cut it"
        />
      ) : null}

      <VibeSegmentedControl
        options={FILTERS}
        selectedValue={filter}
        onSelect={setFilter}
        style={styles.filters}
      />

      {loading ? (
        <ActivityIndicator color={theme.colors.vibeBlue} style={styles.spinner} />
      ) : prompts.length === 0 ? (
        <Text style={styles.empty}>
          {filter === 'mine' ? 'You haven’t submitted a prompt yet.' : 'No prompts here yet.'}
        </Text>
      ) : (
        prompts.map(p => (
          <View key={p.id} style={styles.row}>
            <View style={styles.rowMain}>
              <Text style={styles.rowText}>{p.text}</Text>
              <View style={styles.meta}>
                <Text style={[styles.badge,
                  p.status === 'candidate' ? styles.badgeCandidate : styles.badgeLive]}>
                  {p.status === 'candidate' ? 'CANDIDATE' : 'LIVE'}
                </Text>
                <Ionicons name="thumbs-up" size={12} color={t.colors.textSecondary} />
                <Text style={styles.metaText}>{p.likeCount || 0}</Text>
                <Ionicons name="thumbs-down" size={12} color={t.colors.textSecondary} />
                <Text style={styles.metaText}>{p.dislikeCount || 0}</Text>
              </View>
            </View>
            {p.createdBy !== user?.uid && (
              <Pressable onPress={() => report(p)} hitSlop={10} style={styles.flag}>
                <Ionicons name="flag-outline" size={18} color={t.colors.textSecondary} />
              </Pressable>
            )}
          </View>
        ))
      )}

      <Modal visible={composing} transparent animationType="fade"
        onRequestClose={() => setComposing(false)}>
        <Pressable style={styles.backdrop} onPress={() => setComposing(false)}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>NEW GAME PROMPT</Text>
            <TextInput
              value={draft}
              onChangeText={setDraft}
              placeholder="Worst poker face"
              placeholderTextColor={t.colors.textSecondary}
              maxLength={GAME_PROMPT_MAX_LEN}
              style={styles.input}
              autoFocus
            />
            <Text style={styles.counter}>{draft.length}/{GAME_PROMPT_MAX_LEN}</Text>
            {cost > 0 && (
              <View style={styles.balanceRow}>
                <CurrencyIcon name="tickets" size={18} />
                <Text style={styles.balance}>{`You have ${tickets}`}</Text>
              </View>
            )}
            <Pressable
              style={[styles.submit, (!draft.trim() || submitting) && styles.submitOff]}
              onPress={submit}
              disabled={!draft.trim() || submitting}
            >
              {submitting
                ? <ActivityIndicator color="#000" />
                : <Text style={styles.submitText}>
                  {cost > 0 ? `SUBMIT FOR ${cost}` : 'SUBMIT'}
                </Text>}
            </Pressable>
          </Pressable>
        </Pressable>
      </Modal>
    </View>
  );
}

const makeStyles = (t) => ({
  wrap: { paddingHorizontal: 16, paddingBottom: 24 },
  seasonRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    marginTop: 8,
  },
  season: { color: theme.colors.vibeYellow, fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  createBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingVertical: 7, paddingHorizontal: 12,
    borderWidth: 2, borderColor: theme.colors.vibeGreen,
    borderRadius: theme.sizes.buttonRadius, backgroundColor: 'rgba(0,0,0,0.3)',
  },
  createText: { color: theme.colors.vibeGreen, fontWeight: '700', marginRight: 4 },
  createCost: { color: theme.colors.vibeGreen, fontWeight: '900' },
  explain: { color: t.colors.textSecondary, fontSize: 12, marginTop: 6 },
  filters: { marginTop: 24, marginBottom: 12 },
  spinner: { marginTop: 24 },
  empty: { color: t.colors.textSecondary, textAlign: 'center', marginTop: 24 },
  row: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  rowMain: { flex: 1 },
  rowText: { color: t.colors.textPrimary, fontSize: 15, fontWeight: '600' },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 5 },
  metaText: { color: t.colors.textSecondary, fontSize: 12, marginRight: 6 },
  badge: {
    fontSize: 9, fontWeight: '900', letterSpacing: 1,
    paddingHorizontal: 6, paddingVertical: 2, borderRadius: 4, borderWidth: 1,
    marginRight: 6, overflow: 'hidden',
  },
  badgeLive: { color: theme.colors.vibeGreen, borderColor: theme.colors.vibeGreen },
  badgeCandidate: { color: theme.colors.vibeYellow, borderColor: theme.colors.vibeYellow },
  flag: { paddingLeft: 12 },
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.75)',
    justifyContent: 'center', paddingHorizontal: 24,
  },
  sheet: {
    padding: 20, borderRadius: 18, borderWidth: 3, borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(10, 26, 42, 0.97)',
  },
  sheetTitle: {
    color: '#fff', fontSize: 18, fontWeight: '900', letterSpacing: 2,
    textAlign: 'center', marginBottom: 14,
  },
  input: {
    color: '#fff', fontSize: 16, borderWidth: 2, borderColor: 'rgba(0,198,255,0.4)',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  counter: { color: t.colors.textSecondary, fontSize: 11, textAlign: 'right', marginTop: 4 },
  balanceRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 10 },
  balance: { color: t.colors.textSecondary, fontSize: 13 },
  submit: {
    marginTop: 16, paddingVertical: 13, borderRadius: 12,
    backgroundColor: theme.colors.vibeGreen, alignItems: 'center',
  },
  submitOff: { opacity: 0.4 },
  submitText: { color: '#000', fontWeight: '900', letterSpacing: 1.5 },
});
