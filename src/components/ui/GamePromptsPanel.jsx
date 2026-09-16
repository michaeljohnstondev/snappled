// GamePromptsPanel.jsx — the Game Prompts tab.
//
// Game prompts are what a round asks the room. This is where players
// rank them and pay tickets to suggest their own; at season rollover the
// best-ranked become the next season's deck, so the community authors
// each season.
//
// One job per screen: a card to suggest, and a stack to rank. It used to
// also list every live prompt and candidate behind Top / New / Mine
// filters, which was a second way to look at the same prompts the deck
// was already handing you one at a time - and a list you scroll past is
// not how any of this gets decided. Ranking is, so ranking is what is
// here.
//
// Follows PromptSortDeck's precedent of talking to its own service
// rather than threading all of this through an already long screen.

import React, { useState, useEffect } from 'react';
import {
  View, Text, Pressable, TextInput, Modal, ActivityIndicator,
} from 'react-native';
import PromptSortDeck from './PromptSortDeck';
import CreatePromptCard from './CreatePromptCard';
import CurrencyIcon from './CurrencyIcon';
import {
  gamePromptService, costForSeason, GAME_PROMPT_MAX_LEN,
} from '../../services/gamePromptService';
import { useModal } from '../../store/ModalContext';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

/**
 * @param {object} user
 * @param {number} tickets  current balance, shown before someone pays
 */
export default function GamePromptsPanel({ user, tickets = 0 }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { showConfirm, showError, showToast } = useModal();

  const [season, setSeason] = useState(0);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    gamePromptService.getSeason()
      .then(s => { if (!cancelled) setSeason(s); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, []);

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
      },
    );
  };

  /** Report whichever prompt is on top of the stack. */
  const report = (prompt) => showConfirm(
    'Report this prompt?',
    'Prompts reported by several players are removed from every game.',
    async () => {
      const res = await gamePromptService.report(prompt.id, user?.uid, 'inappropriate');
      if (res.success) showToast('info', 'Reported', 'Thanks for flagging it');
      else showError('Could Not Report', res.error);
    },
  );

  // Season 0 is the pre-launch beta, but it is shown as Season 1: it IS
  // Season 1 being built, and a player has no reason to see "0" or be
  // told they are in a beta.
  const displaySeason = Math.max(season, 1);

  return (
    <View style={styles.wrap}>
      <View style={styles.seasonRow}>
        {/* Help lives on the screen's tab row, not here - one "?" in one
            place for both tabs beats each panel growing its own. */}
        <Text style={styles.season}>{`SEASON ${displaySeason}`}</Text>
      </View>

      {/* Same card the Snapple tab opens on. Full width, so unlike the
          pill that sat beside the season title it can't run off the
          side of a narrow screen. */}
      <CreatePromptCard
        label="Suggest a Game Prompt"
        height={96}
        onPress={() => setComposing(true)}
        accessory={(
          <View style={styles.costChip}>
            {cost > 0 ? <CurrencyIcon name="tickets" size={16} /> : null}
            <Text style={styles.costText}>{cost > 0 ? cost : 'FREE'}</Text>
          </View>
        )}
      />

      {user?.uid ? (
        <PromptSortDeck
          userId={user.uid}
          target="gamePrompts"
          title="RANK GAME PROMPTS"
          subtitle={null}
          onReport={report}
        />
      ) : null}

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
  wrap: { paddingHorizontal: 20, paddingBottom: 24 },
  seasonRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    marginTop: 4, marginBottom: 14,
  },
  season: { color: theme.colors.vibeYellow, fontSize: 18, fontWeight: '900', letterSpacing: 2 },
  costChip: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: 10, paddingVertical: 3, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  costText: { color: '#fff', fontSize: 12, fontWeight: '900', letterSpacing: 1 },
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
