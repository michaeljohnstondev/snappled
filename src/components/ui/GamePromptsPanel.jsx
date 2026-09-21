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
import MySubmissions from './MySubmissions';
import CurrencyIcon from './CurrencyIcon';
import {
  gamePromptService, costForSeason, GAME_PROMPT_MAX_LEN,
} from '../../services/gamePromptService';
import { useModal } from '../../store/ModalContext';
import { isAdminUid } from '../../lib/admin';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

/**
 * @param {object} user
 * @param {number} tickets  current balance, shown before someone pays
 */
export default function GamePromptsPanel({ user, tickets = 0 }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { showConfirm, showError, showToast, showAlert } = useModal();
  // What is wrong with the draft, shown under the field when they try
  // to submit. Empty string means nothing is wrong yet.
  const [problem, setProblem] = useState('');
  // Non-null when the composer is editing an existing prompt rather
  // than writing a new one. The sheet is the same either way; only what
  // submit does with it changes.
  const [editing, setEditing] = useState(null);

  const [season, setSeason] = useState(0);
  const [composing, setComposing] = useState(false);
  const [draft, setDraft] = useState('');
  const [submitting, setSubmitting] = useState(false);
  // Bumped after anything that changes what you have submitted, so the
  // receipt below the deck re-reads instead of going stale until the
  // tab is left and come back to.
  const [submissionsKey, setSubmissionsKey] = useState(0);

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
  const submit = async () => {
    const text = draft.trim();
    // A dimmed button tells you it will not work and nothing about
    // why. This one always presses and says what is missing.
    if (!text) {
      setProblem('Write a prompt first.');
      return;
    }
    if (text.length < 10) {
      setProblem('A bit longer - give the room something to answer.');
      return;
    }
    setProblem('');

    // Editing an existing prompt costs nothing and skips the confirm:
    // it is an admin correcting wording, not a player spending tickets
    // on a submission that goes up for a vote.
    if (editing) {
      setSubmitting(true);
      const res = await gamePromptService.adminUpdateText(editing.id, text);
      setSubmitting(false);
      if (!res.success) { showError('Could Not Save', res.error); return; }
      setSubmissionsKey(k => k + 1);
      setDraft('');
      setEditing(null);
      setComposing(false);
      return;
    }

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
        // Nothing after. The confirm you just accepted said what would
        // happen, the composer closing says it happened, and the ticket
        // count in the resource bar says what it cost - so a toast is
        // the third telling of the same thing. It was also type
        // 'reward', reading "REWARD!" over a gift icon, for an action
        // that SPENDS a hundred tickets.
        setSubmissionsKey(k => k + 1);
        setDraft('');
        setComposing(false);
      },
    );
  };

  /**
   * Admin: edit, retire or delete the prompt on top of the stack.
   *
   * The rules let isAdmin() write gamePrompts directly, so these are
   * plain client writes rather than callables - the enforcement is in
   * Firestore, not in whether this button is drawn. create() is the
   * exception because it charges, and a price cannot come from the
   * buyer.
   *
   * Retire is offered above delete because it is almost always the
   * right one: list() reads only live and candidate, so retiring takes
   * a prompt out of circulation while keeping the votes cast on it.
   */
  const manage = (prompt) => {
    showAlert(
      'Manage Prompt',
      `"${prompt.text}"`,
      [
        {
          text: 'Edit Text',
          onPress: () => {
            setEditing(prompt);
            setDraft(prompt.text);
            setComposing(true);
          },
        },
        {
          text: 'Retire',
          onPress: async () => {
            const res = await gamePromptService.adminSetStatus(prompt.id, 'retired');
            if (!res.success) showError('Could Not Retire', res.error);
          },
        },
        {
          text: 'Delete',
          onPress: () => showConfirm(
            'Delete this prompt?',
            'Gone for good. Votes cast on it are orphaned rather than '
            + 'undone - Retire keeps them.',
            async () => {
              const res = await gamePromptService.adminDelete(prompt.id);
              if (!res.success) showError('Could Not Delete', res.error);
            },
          ),
        },
        { text: 'Cancel' },
      ],
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
          onAdmin={isAdminUid(user.uid) ? manage : undefined}
          emptyTitle="No new prompts to rank"
          emptySub={'You have ranked every game prompt in the season. New '
            + 'ones land here as players submit them.'}
        />
      ) : null}

      {/* Under the deck, because the deck is the job and this is the
          receipt. Draws nothing until you have actually submitted one. */}
      <MySubmissions userId={user?.uid} refreshKey={submissionsKey} />

      <Modal visible={composing} transparent animationType="fade"
        onRequestClose={() => { setComposing(false); setEditing(null); }}>
        <Pressable style={styles.backdrop} onPress={() => { setComposing(false); setEditing(null); }}>
          <Pressable style={styles.sheet} onPress={() => {}}>
            <Text style={styles.sheetTitle}>NEW GAME PROMPT</Text>
            <TextInput
              value={draft}
              onChangeText={(t) => {
                setDraft(t);
                // Clears the moment they start fixing it, rather than
                // sitting there in red while they type the answer.
                if (problem) setProblem('');
              }}
              placeholder="Worst poker face"
              placeholderTextColor={t.colors.textSecondary}
              maxLength={GAME_PROMPT_MAX_LEN}
              style={styles.input}
              autoFocus
            />
            <Text style={styles.counter}>{draft.length}/{GAME_PROMPT_MAX_LEN}</Text>
            {!!problem && <Text style={styles.problem}>{problem}</Text>}
            {cost > 0 && (
              <View style={styles.balanceRow}>
                <CurrencyIcon name="tickets" size={18} />
                <Text style={styles.balance}>{`You have ${tickets}`}</Text>
              </View>
            )}
            {/* Keeps its label and its full colour while it works. It
                used to drop to 40% opacity and swap the text for a
                spinner, which reads as "this button is disabled and
                something went wrong" rather than "this is in progress" -
                the two states a button can be in that look most alike
                and mean the least alike. */}
            <Pressable
              style={({ pressed }) => [styles.submit, pressed && styles.submitPressed]}
              onPress={submit}
              disabled={submitting}
            >
              <View style={styles.submitRow}>
                {submitting ? <ActivityIndicator color="#fff" size="small" /> : null}
                <Text style={styles.submitText}>
                  {submitting
                    ? (editing ? 'SAVING' : 'SUBMITTING')
                    : (editing ? 'SAVE' : (cost > 0 ? `SUBMIT FOR ${cost}` : 'SUBMIT'))}
                </Text>
              </View>
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
  // The house green button: deep fill, neon border, white label. The
  // fill used to be vibeGreen (#00FF41) itself, which is bright enough
  // that only black text is legible on it - so white was not a colour
  // swap, it needed the darker fill VibeButton's green variant already
  // uses everywhere else in the app.
  submit: {
    marginTop: 16, minHeight: 48, borderRadius: 12,
    backgroundColor: '#228B22',
    borderWidth: 2, borderColor: theme.colors.vibeGreen,
    alignItems: 'center', justifyContent: 'center',
  },
  submitPressed: { opacity: 0.8 },
  submitRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  problem: {
    color: theme.colors.vibeRed,
    fontSize: 12,
    fontWeight: '600',
    marginTop: 6,
  },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 1.5 },
});
