// DeleteAccountModal.jsx — the confirmation for deleting an account.
//
// The one screen in the app where a vague warning is not good enough.
// "This cannot be undone" is true of almost everything and tells you
// nothing, so this states the actual numbers first: how many snapples
// go, how many people get refunded, what the balance was. They come
// from the server, because working out the refund total means summing
// every purchase ever made on every snapple they posted.
//
// THE CHOICE
//
// A snapple is somebody's face and voice, so keeping one after they
// leave needs their explicit say-so, asked here, never assumed. The
// toggle only appears when there is something to keep - offering it to
// someone whose snapples nobody bought is a decision about nothing.
//
// It is framed around the people who bought them, because that is who
// it is really about: deleting refunds their coins and takes the card,
// keeping means they still have the thing they chose.
//
// THE GATE
//
// Typing the username is the deliberate friction. Re-authenticating is
// the security: the button lives inside an app that is already signed
// in, so the threat is a phone left unlocked on a table, and a password
// prompt or a fresh Face ID check is what answers that.

import React, { useState, useEffect, useCallback } from 'react';
import {
  View, Text, Modal, Pressable, TextInput, Switch, ActivityIndicator,
  ScrollView,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
  previewDeletion, reauthenticate, deleteAccount, authProvider,
} from '../../../services/accountService';
import theme from '../../../theme/themes';
import { useTheme, useThemedStyles } from '../../../theme/ThemeContext';

/** Thousands separators, so 2400 coins does not read as 24. */
function num(n) {
  return (n || 0).toLocaleString();
}

/**
 * @param {boolean} visible
 * @param {Function} onClose
 * @param {string} username  what they have to type to confirm
 */
export default function DeleteAccountModal({ visible, onClose, username }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const [preview, setPreview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [keepPurchased, setKeepPurchased] = useState(false);
  const [typed, setTyped] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');

  const provider = authProvider();
  const needsPassword = provider === 'password';

  // Fresh numbers every time it opens. They change whenever somebody
  // buys one of your snapples, and a stale count on this screen is a
  // promise about what is being destroyed.
  useEffect(() => {
    if (!visible) return undefined;
    let cancelled = false;
    setLoading(true);
    setTyped('');
    setPassword('');
    setProblem('');
    setKeepPurchased(false);
    previewDeletion().then((res) => {
      if (cancelled) return;
      setPreview(res.success ? res : null);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [visible]);

  const confirmed = typed.trim().toLowerCase() === (username || '').toLowerCase();

  const handleDelete = useCallback(async () => {
    if (!confirmed) {
      setProblem(`Type ${username} to confirm.`);
      return;
    }
    setProblem('');
    setBusy(true);

    const auth = await reauthenticate(password);
    if (!auth.success) {
      setBusy(false);
      // Backing out of the Face ID sheet is not an error worth a red
      // line - they changed their mind, which is allowed.
      if (!auth.cancelled) setProblem(auth.error);
      return;
    }

    const res = await deleteAccount(keepPurchased);
    setBusy(false);
    if (!res.success) {
      setProblem(res.error || 'Could not delete your account.');
      return;
    }
    // No success message. The account is gone and so is the session, so
    // the app is already on its way back to the login screen - telling
    // them it worked would be talking to somebody who no longer exists.
    onClose?.();
  }, [confirmed, username, password, keepPurchased, onClose]);

  const deleting = preview
    ? (keepPurchased ? preview.snappleCount - preview.purchasedCount : preview.snappleCount)
    : 0;
  const refunding = keepPurchased ? 0 : (preview?.refundCoins || 0);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={styles.sheet}>
          <ScrollView>
            <View style={styles.titleRow}>
              <Ionicons name="warning" size={20} color={theme.colors.vibeRed} />
              <Text style={styles.title}>DELETE ACCOUNT</Text>
            </View>

            {loading ? (
              <ActivityIndicator color={theme.colors.vibeRed} style={styles.loader} />
            ) : !preview ? (
              <Text style={styles.problem}>
                Could not load your account. Try again in a minute.
              </Text>
            ) : (
              <>
                <Text style={styles.lead}>
                  {'This erases your account and everything on it. There is no '
                    + 'undo and no way to get any of it back.'}
                </Text>

                <View style={styles.facts}>
                  <Fact
                    styles={styles}
                    label={`${num(deleting)} ${deleting === 1 ? 'snapple' : 'snapples'} deleted`}
                  />
                  {refunding > 0 ? (
                    <Fact
                      styles={styles}
                      label={`${num(preview.buyerCount)} ${preview.buyerCount === 1
                        ? 'buyer refunded' : 'buyers refunded'} ${num(refunding)} coins`}
                    />
                  ) : null}
                  <Fact styles={styles} label={`${num(preview.coins)} coins gone`} />
                  <Fact styles={styles} label={`${num(preview.tickets)} tickets gone`} />
                  <Fact
                    styles={styles}
                    label="Anything bought with real money is not refunded"
                  />
                </View>

                {/* Only when there is something to keep. */}
                {preview.purchasedCount > 0 ? (
                  <View style={styles.keepBox}>
                    <View style={styles.keepRow}>
                      <Text style={styles.keepTitle}>
                        {`Leave the ${preview.purchasedCount} `
                          + `${preview.purchasedCount === 1 ? 'snapple' : 'snapples'} `
                          + 'people bought'}
                      </Text>
                      <Switch
                        value={keepPurchased}
                        onValueChange={setKeepPurchased}
                        trackColor={{ true: theme.colors.vibeGreen, false: '#333' }}
                      />
                    </View>
                    <Text style={styles.keepDesc}>
                      {keepPurchased
                        ? 'They stay playable in the decks of the people who paid '
                          + 'for them, with your name taken off. Your profile and '
                          + 'everything else still goes.'
                        : 'Off, they are deleted and everyone who bought one gets '
                          + 'their coins back instead of the card.'}
                    </Text>
                  </View>
                ) : null}

                <Text style={styles.gate}>{`Type ${username} to confirm`}</Text>
                <TextInput
                  value={typed}
                  onChangeText={(v) => { setTyped(v); if (problem) setProblem(''); }}
                  placeholder={username}
                  placeholderTextColor={t.colors.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  style={styles.input}
                />

                {needsPassword ? (
                  <TextInput
                    value={password}
                    onChangeText={(v) => { setPassword(v); if (problem) setProblem(''); }}
                    placeholder="Your password"
                    placeholderTextColor={t.colors.textSecondary}
                    secureTextEntry
                    autoCapitalize="none"
                    style={[styles.input, styles.inputSpaced]}
                  />
                ) : (
                  <Text style={styles.reauthNote}>
                    {provider === 'apple.com'
                      ? 'Apple will ask you to confirm it is you.'
                      : 'Google will ask you to confirm it is you.'}
                  </Text>
                )}

                {!!problem && <Text style={styles.problem}>{problem}</Text>}
              </>
            )}
          </ScrollView>

          <View style={styles.actions}>
            <Pressable style={styles.cancel} onPress={onClose} disabled={busy}>
              <Text style={styles.cancelText}>KEEP MY ACCOUNT</Text>
            </Pressable>
            <Pressable
              style={({ pressed }) => [
                styles.destroy,
                !confirmed && styles.destroyOff,
                pressed && styles.destroyPressed,
              ]}
              onPress={handleDelete}
              disabled={busy || loading}
            >
              <View style={styles.destroyRow}>
                {busy ? <ActivityIndicator color="#fff" size="small" /> : null}
                <Text style={styles.destroyText}>
                  {busy ? 'DELETING' : 'DELETE FOREVER'}
                </Text>
              </View>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

/** One line of what is about to happen, with a bullet you can scan. */
function Fact({ styles, label }) {
  return (
    <View style={styles.factRow}>
      <Ionicons name="remove" size={14} color={theme.colors.vibeRed} />
      <Text style={styles.factText}>{label}</Text>
    </View>
  );
}

const makeStyles = (t) => ({
  backdrop: {
    flex: 1, backgroundColor: 'rgba(0,0,0,0.85)',
    justifyContent: 'center', paddingHorizontal: 20,
  },
  sheet: {
    maxHeight: '88%',
    padding: 20, borderRadius: 18,
    borderWidth: 3, borderColor: theme.colors.vibeRed,
    backgroundColor: 'rgba(14, 6, 10, 0.98)',
  },
  titleRow: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    justifyContent: 'center', marginBottom: 14,
  },
  title: {
    color: theme.colors.vibeRed, fontSize: 18, fontWeight: '900',
    letterSpacing: 2,
  },
  loader: { marginVertical: 30 },
  lead: { color: t.colors.textPrimary, fontSize: 14, lineHeight: 20 },

  facts: { marginTop: 14, gap: 6 },
  factRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  factText: { color: t.colors.textSecondary, fontSize: 13, flex: 1 },

  keepBox: {
    marginTop: 18, padding: 12, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(0,255,65,0.35)',
    backgroundColor: 'rgba(0,0,0,0.35)',
  },
  keepRow: {
    flexDirection: 'row', alignItems: 'center',
    justifyContent: 'space-between', gap: 12,
  },
  keepTitle: { color: t.colors.textPrimary, fontSize: 14, fontWeight: '700', flex: 1 },
  keepDesc: { color: t.colors.textSecondary, fontSize: 12, lineHeight: 17, marginTop: 6 },

  gate: {
    color: t.colors.textSecondary, fontSize: 12, fontWeight: '700',
    letterSpacing: 1, marginTop: 20, marginBottom: 6,
  },
  input: {
    color: '#fff', fontSize: 16,
    borderWidth: 2, borderColor: 'rgba(255,68,68,0.45)',
    borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10,
  },
  inputSpaced: { marginTop: 10 },
  reauthNote: {
    color: t.colors.textSecondary, fontSize: 12, marginTop: 10, lineHeight: 17,
  },
  problem: {
    color: theme.colors.vibeRed, fontSize: 13, fontWeight: '600', marginTop: 12,
  },

  actions: { marginTop: 18, gap: 10 },
  cancel: { paddingVertical: 12, alignItems: 'center' },
  cancelText: {
    color: theme.colors.vibeBlue, fontSize: 14, fontWeight: '900', letterSpacing: 1.5,
  },
  destroy: {
    minHeight: 48, borderRadius: 12,
    backgroundColor: '#8B0000',
    borderWidth: 2, borderColor: theme.colors.vibeRed,
    alignItems: 'center', justifyContent: 'center',
  },
  // Dimmed until the username matches. Unlike the prompt composer this
  // one SHOULD look unavailable: there the dimming hid why, here the
  // line above the field says exactly what is missing.
  destroyOff: { opacity: 0.45 },
  destroyPressed: { opacity: 0.85 },
  destroyRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  destroyText: { color: '#fff', fontSize: 15, fontWeight: '900', letterSpacing: 1.5 },
});
