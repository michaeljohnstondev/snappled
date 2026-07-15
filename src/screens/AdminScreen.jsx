import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Pressable, FlatList, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, getDocs, doc, deleteDoc, updateDoc, addDoc, orderBy, limit, where, increment, setDoc, getDoc } from 'firebase/firestore';
import { normalizePromptText } from '../utils/promptKey';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../services/firebase';
import { useAuth } from '../store/AuthContext';
import { useModal } from '../store/ModalContext';
import VibeButton from '../components/ui/VibeButton';
import PromptCurator from '../components/admin/PromptCurator';
import theme from '../theme/themes';

function UtilButton({ label, desc, color, onPress }) {
  const [running, setRunning] = useState(false);
  return (
    <Pressable
      style={[utilStyles.btn, { borderColor: color }]}
      onPress={async () => {
        setRunning(true);
        try { await onPress(); } finally { setRunning(false); }
      }}
      disabled={running}
    >
      <Text style={[utilStyles.label, { color }]}>{running ? 'Running...' : label}</Text>
      <Text style={utilStyles.desc}>{desc}</Text>
    </Pressable>
  );
}

const utilStyles = StyleSheet.create({
  btn: {
    backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 2, borderRadius: 12,
    padding: 16, marginBottom: 12,
  },
  label: { fontSize: 16, fontWeight: 'bold', marginBottom: 4 },
  desc: { color: '#778DA9', fontSize: 12, lineHeight: 16 },
});

// Add or remove a permabanned prompt text. Banned texts are keyed by their
// normalized textKey so case/punctuation drift doesn't slip past the filter.
function BanPromptCard({ showAlert, showError }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const handleBan = async () => {
    if (!text.trim() || busy) return;
    const textKey = normalizePromptText(text);
    if (!textKey) return showError('Error', 'Empty text after normalization');
    setBusy(true);
    try {
      await setDoc(doc(db, 'bannedPromptTexts', textKey), {
        textKey,
        text: text.trim(),
        bannedAt: new Date().toISOString(),
      });
      showAlert('Banned', `"${text.trim()}" added to permaban list (key: ${textKey})`);
      setText('');
    } catch (e) { showError('Error', e.message); }
    finally { setBusy(false); }
  };

  const handleUnban = async () => {
    if (!text.trim() || busy) return;
    const textKey = normalizePromptText(text);
    if (!textKey) return;
    setBusy(true);
    try {
      const banRef = doc(db, 'bannedPromptTexts', textKey);
      const snap = await getDoc(banRef);
      if (!snap.exists()) {
        showAlert('Not banned', `No permaban found for key: ${textKey}`);
      } else {
        await deleteDoc(banRef);
        showAlert('Unbanned', `Removed permaban for key: ${textKey}`);
      }
      setText('');
    } catch (e) { showError('Error', e.message); }
    finally { setBusy(false); }
  };

  return (
    <View style={[utilStyles.btn, { borderColor: theme.colors.vibeRed }]}>
      <Text style={[utilStyles.label, { color: theme.colors.vibeRed }]}>Permaban / Unban Prompt Text</Text>
      <Text style={utilStyles.desc}>Adds the normalized text to bannedPromptTexts. Future creates / revives with that text are refused.</Text>
      <TextInput
        value={text}
        onChangeText={setText}
        placeholder="Type the prompt text..."
        placeholderTextColor="rgba(255,255,255,0.3)"
        style={banInputStyles.input}
      />
      <View style={banInputStyles.row}>
        <Pressable style={[banInputStyles.btn, { borderColor: theme.colors.vibeRed }]} onPress={handleBan} disabled={busy}>
          <Text style={[banInputStyles.btnText, { color: theme.colors.vibeRed }]}>Ban</Text>
        </Pressable>
        <Pressable style={[banInputStyles.btn, { borderColor: theme.colors.vibeBlue }]} onPress={handleUnban} disabled={busy}>
          <Text style={[banInputStyles.btnText, { color: theme.colors.vibeBlue }]}>Unban</Text>
        </Pressable>
      </View>
    </View>
  );
}

const banInputStyles = StyleSheet.create({
  input: {
    color: 'white', fontSize: 14, paddingHorizontal: 12, paddingVertical: 10,
    borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.15)', marginTop: 8,
  },
  row: { flexDirection: 'row', gap: 8, marginTop: 8 },
  btn: {
    flex: 1, borderWidth: 2, borderRadius: 8, paddingVertical: 10, alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  btnText: { fontSize: 13, fontWeight: 'bold' },
});

// Add your admin UIDs here
const ADMIN_UIDS = ['SrB8T1TmftQzu90H7phQkRJXkRn2'];

export default function AdminScreen({ navigation }) {
  const { user } = useAuth();
  const { showConfirm, showAlert, showError } = useModal();
  const [activeTab, setActiveTab] = useState('prompts');
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [editingId, setEditingId] = useState(null);
  const [editText, setEditText] = useState('');
  const [menuOpen, setMenuOpen] = useState(false);
  const [promptSubTab, setPromptSubTab] = useState('live');
  const [swapIndex, setSwapIndex] = useState(null);

  const isAdmin = ADMIN_UIDS.includes(user?.uid);

  useEffect(() => {
    if (isAdmin) loadTab();
  }, [activeTab]);

  useEffect(() => {
    if (isAdmin && activeTab === 'prompts') loadPrompts();
  }, [promptSubTab]);

  const loadTab = async () => {
    setIsLoading(true);
    try {
      switch (activeTab) {
        case 'prompts': await loadPrompts(); break;
        case 'reports': await loadReports(); break;
        case 'users': await loadUsers(); break;
        case 'games': await loadGames(); break;
      }
    } catch (e) {
      console.error('[Admin] Load error:', e);
    } finally {
      setIsLoading(false);
    }
  };

  const loadPrompts = async (overrideTab) => {
    const tab = overrideTab || promptSubTab;

    if (tab === 'ondeck') {
      // On deck is a single doc with an array
      const { getDoc: gd } = require('firebase/firestore');
      const snap = await gd(doc(db, 'system', 'onDeckQueue'));
      const prompts = snap.exists() ? (snap.data().prompts || []) : [];
      setData(prompts.map((text, i) => ({ id: String(i), text, index: i })));
      return;
    }

    let col;
    if (tab === 'live') col = 'activePrompts';
    else if (tab === 'pool') col = 'promptPool';
    else col = 'gamePrompts';

    const q = query(collection(db, col), orderBy('createdAt', 'desc'), limit(200));
    const snap = await getDocs(q);
    const items = [];
    snap.forEach(d => items.push({ id: d.id, collection: col, ...d.data() }));
    setData(items);
  };

  const loadReports = async () => {
    const q = query(collection(db, 'reports'), orderBy('createdAt', 'desc'), limit(50));
    const snap = await getDocs(q);
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    setData(items);
  };

  const loadUsers = async () => {
    const q = query(collection(db, 'users'), limit(50));
    const snap = await getDocs(q);
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    setData(items);
  };

  const loadGames = async () => {
    const q = query(collection(db, 'games'), limit(20));
    const snap = await getDocs(q);
    const items = [];
    snap.forEach(d => items.push({ id: d.id, ...d.data() }));
    setData(items);
  };

  const saveOnDeck = async (prompts) => {
    const { setDoc } = require('firebase/firestore');
    await setDoc(doc(db, 'system', 'onDeckQueue'), {
      prompts: prompts.map(p => p.text || p),
      updatedAt: new Date().toISOString(),
    });
  };

  const handleSwap = async (idx) => {
    if (swapIndex === null) {
      setSwapIndex(idx);
    } else {
      const newData = [...data];
      [newData[swapIndex], newData[idx]] = [newData[idx], newData[swapIndex]];
      setData(newData);
      setSwapIndex(null);
      await saveOnDeck(newData);
    }
  };

  const handleEditPrompt = (promptId, currentText) => {
    setEditingId(promptId);
    setEditText(currentText);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editText.trim()) return;
    try {
      const col = promptSubTab === 'live' ? 'activePrompts' : promptSubTab === 'game' ? 'gamePrompts' : promptSubTab === 'pool' ? 'promptPool' : 'activePrompts';
      await updateDoc(doc(db, col, editingId), { text: editText.trim() });
      setEditingId(null);
      setEditText('');
      loadTab();
    } catch (e) {
      showError('Error', 'Failed to update prompt');
    }
  };

  const handleDeletePrompt = (promptId) => {
    showConfirm('Delete Prompt', 'Remove this prompt?', async () => {
      await deleteDoc(doc(db, 'activePrompts', promptId));
      loadTab();
    });
  };

  const handleDeleteSnapple = (snappleId) => {
    showConfirm('Delete Snapple', 'Remove this snapple?', async () => {
      await deleteDoc(doc(db, 'snapples', snappleId));
      loadTab();
    });
  };

  const handleBanUser = (userId, username) => {
    showConfirm('Ban User', `Ban @${username}?`, async () => {
      await updateDoc(doc(db, 'users', userId), {
        isBanned: true,
        bannedAt: new Date().toISOString(),
      });
      showAlert('Banned', `@${username} has been banned`);
      loadTab();
    });
  };

  const [grantUserId, setGrantUserId] = useState(null);
  const [grantCoins, setGrantCoins] = useState('');
  const [grantTickets, setGrantTickets] = useState('');

  const handleGrant = async (userId, username) => {
    const coins = parseInt(grantCoins) || 0;
    const tickets = parseInt(grantTickets) || 0;
    if (coins === 0 && tickets === 0) return;
    const updates = {};
    if (coins !== 0) updates['resources.coins'] = increment(coins);
    if (tickets !== 0) updates['resources.tokens'] = increment(tickets);
    await updateDoc(doc(db, 'users', userId), updates);
    const parts = [];
    if (coins !== 0) parts.push(`${coins > 0 ? '+' : ''}${coins} coins`);
    if (tickets !== 0) parts.push(`${tickets > 0 ? '+' : ''}${tickets} tickets`);
    showAlert('Granted', `${parts.join(', ')} to @${username}`);
    setGrantUserId(null);
    setGrantCoins('');
    setGrantTickets('');
    loadTab();
  };

  const handleDismissReport = (reportId) => {
    showConfirm('Dismiss', 'Dismiss this report?', async () => {
      await updateDoc(doc(db, 'reports', reportId), {
        status: 'dismissed',
        reviewedAt: new Date().toISOString(),
      });
      loadTab();
    });
  };

  const [newPromptText, setNewPromptText] = useState('');
  const [promptType, setPromptType] = useState('snapple'); // 'snapple' or 'game'

  const handleAddPrompt = async () => {
    if (!newPromptText.trim()) return;

    try {
      if (promptType === 'snapple') {
        // Add to promptPool (will get rotated in by cloud function)
        await addDoc(collection(db, 'promptPool'), {
          text: newPromptText.trim(),
          category: 'admin',
          used: false,
          timesUsed: 0,
          createdAt: new Date().toISOString(),
        });
      } else {
        // Add to gamePrompts
        await addDoc(collection(db, 'gamePrompts'), {
          text: newPromptText.trim(),
          usageCount: 0,
          createdAt: new Date().toISOString(),
        });
      }
      showAlert('Added', `${promptType === 'snapple' ? 'Snapple' : 'Game'} prompt added!`);
      setNewPromptText('');
    } catch (e) {
      showError('Error', 'Failed to add prompt');
    }
  };

  const handleForceRotation = () => {
    showConfirm('Force Rotation', 'Run prompt rotation now?', async () => {
      try {
        const fn = httpsCallable(functions, 'manualPromptRotation');
        const result = await fn();
        showAlert('Done', `Rotated: ${result.data.rotated}, Expired: ${result.data.expired}`);
        loadTab();
      } catch (e) {
        showError('Error', e.message);
      }
    });
  };

  const handleDeleteGame = (gameId) => {
    showConfirm('Delete Game', 'Remove this game?', async () => {
      await deleteDoc(doc(db, 'games', gameId));
      loadTab();
    });
  };

  if (!isAdmin) {
    return (
      <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
        <View style={styles.center}>
          <Ionicons name="lock-closed" size={48} color={theme.colors.vibeRed} />
          <Text style={styles.deniedText}>Admin access required</Text>
          <VibeButton label="Go Back" onPress={() => navigation.goBack()} variant="toggle" color="blue" />
        </View>
      </LinearGradient>
    );
  }

  const tabOptions = [
    { label: 'Prompts', value: 'prompts' },
    { label: 'Curate', value: 'curate' },
    { label: 'Reports', value: 'reports' },
    { label: 'Users', value: 'users' },
    { label: 'Games', value: 'games' },
    { label: 'Create', value: 'create' },
    { label: 'Utils', value: 'utils' },
  ];

  const renderItem = ({ item }) => {
    switch (activeTab) {
      case 'prompts':
        const isEditing = editingId === item.id;
        return (
          <View style={styles.promptRow}>
            {isEditing ? (
              <TextInput
                style={styles.promptEditInput}
                value={editText}
                onChangeText={setEditText}
                autoFocus
              />
            ) : (
              <Text style={styles.promptTitle} numberOfLines={1}>{item.text}</Text>
            )}
            {isEditing ? (
              <View style={styles.promptActions}>
                <Pressable onPress={handleSaveEdit}>
                  <Ionicons name="checkmark" size={20} color={theme.colors.vibeGreen} />
                </Pressable>
                <Pressable onPress={() => setEditingId(null)}>
                  <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.promptActions}>
                {promptSubTab === 'pool' && (
                  <Pressable onPress={async () => {
                    await addDoc(collection(db, 'onDeckPrompts'), {
                      text: item.text, category: item.category || 'general',
                      createdAt: new Date().toISOString(), addedBy: 'admin',
                    });
                    await deleteDoc(doc(db, 'promptPool', item.id));
                    loadPrompts();
                  }}>
                    <Ionicons name="arrow-forward" size={16} color={theme.colors.vibeGreen} />
                  </Pressable>
                )}
                {promptSubTab === 'ondeck' && (
                  <Pressable onPress={async () => {
                    const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                    const lockoutAt = new Date(Date.now() + (24 * 60 - 10) * 60 * 1000).toISOString();
                    await addDoc(collection(db, 'activePrompts'), {
                      text: item.text, category: item.category || 'general',
                      expiresAt, lockoutAt, createdAt: new Date().toISOString(),
                      isSystem: true, likeCount: 0, dislikeCount: 0,
                      likes: [], dislikes: [], participantCount: 0, totalViews: 0,
                    });
                    await deleteDoc(doc(db, 'onDeckPrompts', item.id));
                    loadPrompts();
                  }}>
                    <Ionicons name="flash" size={16} color={theme.colors.vibeYellow} />
                  </Pressable>
                )}
                <Pressable onPress={() => handleEditPrompt(item.id, item.text)}>
                  <Ionicons name="pencil" size={16} color={theme.colors.vibeBlue} />
                </Pressable>
                <Pressable onPress={async () => {
                  const col = item.collection || 'activePrompts';
                  await deleteDoc(doc(db, col, item.id));
                  loadPrompts();
                }}>
                  <Ionicons name="close" size={18} color={theme.colors.vibeRed} />
                </Pressable>
              </View>
            )}
          </View>
        );

      case 'reports':
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Report: {item.reason}</Text>
            <Text style={styles.metaText}>Snapple: {item.snappleId}</Text>
            <Text style={styles.metaText}>Reporter: {item.reporterId}</Text>
            <Text style={styles.metaText}>Status: {item.status || 'pending'}</Text>
            <View style={styles.cardActions}>
              <Pressable style={styles.actionBtn} onPress={() => handleDeleteSnapple(item.snappleId)}>
                <Text style={styles.actionBtnTextRed}>Remove Content</Text>
              </Pressable>
              <Pressable style={styles.actionBtn} onPress={() => handleDismissReport(item.id)}>
                <Text style={styles.actionBtnText}>Dismiss</Text>
              </Pressable>
            </View>
          </View>
        );

      case 'users':
        const isGranting = grantUserId === item.id;
        return (
          <Pressable style={styles.card} onPress={() => navigation.navigate(item.id === user?.uid ? 'UserProfile' : 'OtherPersonsProfile', { userId: item.id })}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>@{item.username || item.email}</Text>
              {item.isBanned && <Text style={styles.badgeRed}>BANNED</Text>}
            </View>
            <Text style={styles.metaText}>UID: {item.id}</Text>
            <Text style={styles.metaText}>Coins: {item.resources?.coins || item.coins || 0}  Tickets: {item.resources?.tokens || 0}</Text>
            {isGranting ? (
              <View style={styles.grantRow}>
                <TextInput
                  style={styles.grantInput}
                  placeholder="Coins"
                  placeholderTextColor="#888"
                  keyboardType="number-pad"
                  value={grantCoins}
                  onChangeText={setGrantCoins}
                />
                <TextInput
                  style={styles.grantInput}
                  placeholder="Tickets"
                  placeholderTextColor="#888"
                  keyboardType="number-pad"
                  value={grantTickets}
                  onChangeText={setGrantTickets}
                />
                <Pressable style={styles.grantBtn} onPress={() => handleGrant(item.id, item.username)}>
                  <Ionicons name="checkmark" size={20} color={theme.colors.vibeGreen} />
                </Pressable>
                <Pressable style={styles.grantBtn} onPress={() => { setGrantUserId(null); setGrantCoins(''); setGrantTickets(''); }}>
                  <Ionicons name="close" size={20} color={theme.colors.textSecondary} />
                </Pressable>
              </View>
            ) : (
              <View style={styles.userActions}>
                <Pressable style={styles.actionBtn} onPress={() => setGrantUserId(item.id)}>
                  <Ionicons name="gift" size={18} color={theme.colors.vibeYellow} />
                  <Text style={styles.actionBtnLabel}>Grant</Text>
                </Pressable>
                {!item.isBanned && (
                  <Pressable style={styles.actionBtn} onPress={() => handleBanUser(item.id, item.username)}>
                    <Ionicons name="ban" size={18} color={theme.colors.vibeRed} />
                    <Text style={styles.actionBtnLabel}>Ban</Text>
                  </Pressable>
                )}
              </View>
            )}
          </Pressable>
        );

      case 'games':
        return (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>Phase: {item.phase} — Round {item.currentRound}/{item.totalRounds}</Text>
            <Text style={styles.metaText}>Players: {item.players?.length || 0}</Text>
            <Text style={styles.metaText}>{item.players?.map(p => `@${p.username}`).join(', ')}</Text>
            <Pressable style={styles.deleteBtn} onPress={() => handleDeleteGame(item.id)}>
              <Text style={styles.deleteBtnText}>Delete</Text>
            </Pressable>
          </View>
        );

      default:
        return null;
    }
  };

  return (
    <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <View style={styles.backBg}>
            <Ionicons name="arrow-back" size={20} color="white" />
          </View>
        </Pressable>
        <Pressable style={styles.menuTrigger} onPress={() => setMenuOpen(!menuOpen)}>
          <Text style={styles.headerTitle}>{tabOptions.find(t => t.value === activeTab)?.label || 'Admin'}</Text>
          <Ionicons name={menuOpen ? "chevron-up" : "chevron-down"} size={16} color={theme.colors.vibeBlue} />
        </Pressable>
        <View style={{ width: 36 }} />
      </View>

      {menuOpen && (
        <View style={styles.dropdown}>
          {tabOptions.map(opt => (
            <Pressable
              key={opt.value}
              style={[styles.dropdownItem, activeTab === opt.value && styles.dropdownItemActive]}
              onPress={() => {
                setActiveTab(opt.value);
                setMenuOpen(false);
                if (opt.value !== 'create' && opt.value !== 'curate') loadTab();
              }}
            >
              <Text style={[styles.dropdownText, activeTab === opt.value && styles.dropdownTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {activeTab === 'curate' ? (
        <PromptCurator />
      ) : activeTab === 'utils' ? (
        <ScrollView style={styles.utilsSection} contentContainerStyle={{ paddingBottom: 40 }}>
          <UtilButton
            label="Force Rotation"
            desc="Pop oldest live prompt, add new one from on deck, replenish on deck"
            color={theme.colors.vibeGreen}
            onPress={async () => {
              try {
                const fn = httpsCallable(functions, 'manualPromptRotation');
                const result = await fn();
                showAlert('Done', `Rotated: ${result.data.rotated}, Expired: ${result.data.expired}`);
              } catch (e) { showError('Error', e.message); }
            }}
          />
          <UtilButton
            label="Refresh Live Prompts"
            desc="Delete all live prompts and pull 24 fresh from on deck"
            color={theme.colors.vibeBlue}
            onPress={async () => {
              try {
                // Delete all active system prompts
                const snap = await getDocs(query(collection(db, 'activePrompts'), limit(200)));
                for (const d of snap.docs) {
                  if (d.data().isSystem) await deleteDoc(doc(db, 'activePrompts', d.id));
                }
                // Force fill will trigger via onPromptDeleted, but also call manual
                const fn = httpsCallable(functions, 'manualPromptRotation');
                await fn();
                showAlert('Done', 'Live prompts refreshed');
              } catch (e) { showError('Error', e.message); }
            }}
          />
          <UtilButton
            label="Refresh On Deck"
            desc="Clear on deck and pull 30 fresh from pool"
            color={theme.colors.vibeGreen}
            onPress={async () => {
              try {
                // Clear on deck array
                await saveOnDeck([]);
                const fn = httpsCallable(functions, 'manualPromptRotation');
                await fn();
                showAlert('Done', 'On deck refreshed');
              } catch (e) { showError('Error', e.message); }
            }}
          />
          <UtilButton
            label="Clean Pool Duplicates"
            desc="Remove duplicate prompts and ensure all are system prompts"
            color={theme.colors.vibeOrange}
            onPress={async () => {
              try {
                const snap = await getDocs(query(collection(db, 'promptPool'), limit(500)));
                const seen = new Map();
                let deleted = 0;
                for (const d of snap.docs) {
                  const text = d.data().text?.toLowerCase().trim();
                  if (seen.has(text)) {
                    await deleteDoc(doc(db, 'promptPool', d.id));
                    deleted++;
                  } else {
                    seen.set(text, d.id);
                  }
                }
                showAlert('Done', `Removed ${deleted} duplicates from pool`);
              } catch (e) { showError('Error', e.message); }
            }}
          />
          <UtilButton
            label="Clean Expired Prompts"
            desc="Delete activePrompts whose expiresAt is in the past. Stuck prompts from old bug get cleared and rotation can restock them."
            color={theme.colors.vibeOrange}
            onPress={async () => {
              try {
                const now = new Date().toISOString();
                const snap = await getDocs(query(collection(db, 'activePrompts'), limit(500)));
                let removed = 0;
                for (const d of snap.docs) {
                  const data = d.data();
                  if (data.expiresAt && data.expiresAt < now) {
                    await deleteDoc(doc(db, 'activePrompts', d.id));
                    removed++;
                  }
                }
                showAlert('Done', `Removed ${removed} expired prompts`);
              } catch (e) { showError('Error', e.message); }
            }}
          />
          <UtilButton
            label="Backfill textKey on prompts"
            desc="Compute normalized textKey for every doc in activePrompts / onDeckPrompts / promptPool that doesn't have one yet. Required for revive / dupe-check to work."
            color={theme.colors.vibeBlue}
            onPress={async () => {
              try {
                let touched = 0;
                for (const collName of ['activePrompts', 'onDeckPrompts', 'promptPool']) {
                  const snap = await getDocs(query(collection(db, collName), limit(500)));
                  for (const d of snap.docs) {
                    const data = d.data();
                    if (data.textKey) continue;
                    const tk = normalizePromptText(data.text || '');
                    if (!tk) continue;
                    await updateDoc(doc(db, collName, d.id), { textKey: tk });
                    touched++;
                  }
                }
                showAlert('Done', `Backfilled textKey on ${touched} docs`);
              } catch (e) { showError('Error', e.message); }
            }}
          />
          <BanPromptCard showAlert={showAlert} showError={showError} />
          <UtilButton
            label="Diagnose Snapple Pool"
            desc="Count docs in /snapples and report how many pass the active+notBanned filter that game-screen uses. Helps find why the bot pool is small."
            color={theme.colors.vibeYellow}
            onPress={async () => {
              try {
                const snap = await getDocs(query(collection(db, 'snapples'), limit(2000)));
                let total = 0;
                let active = 0;
                let inactive = 0;
                let banned = 0;
                let missingActive = 0;
                for (const d of snap.docs) {
                  total++;
                  const data = d.data();
                  if (data.isActive === false) inactive++;
                  if (data.isBanned === true) banned++;
                  if (data.isActive === undefined) missingActive++;
                  if (data.isActive !== false && data.isBanned !== true) active++;
                }
                showAlert(
                  'Snapple Pool',
                  `Total: ${total}\nPasses filter: ${active}\nisActive=false: ${inactive}\nisBanned=true: ${banned}\nisActive missing: ${missingActive}`,
                );
              } catch (e) { showError('Error', e.message); }
            }}
          />
          <UtilButton
            label="Reconcile Inactive Snapples"
            desc="For every snapple with isActive=false: reactivate if it still has owners, fully delete (doc + video + metadata) if it doesn't. One-shot cleanup of legacy archives."
            color={theme.colors.vibeGreen}
            onPress={async () => {
              try {
                const snap = await getDocs(query(collection(db, 'snapples'), limit(2000)));
                let reactivated = 0;
                let deleted = 0;
                const { ref: sRef, deleteObject } = await import('firebase/storage');
                const { storage } = await import('../services/firebase');
                for (const d of snap.docs) {
                  const data = d.data();
                  if (data.isActive !== false) continue;
                  const owners = data.owners || [];
                  if (owners.length > 0) {
                    await updateDoc(doc(db, 'snapples', d.id), {
                      isActive: true,
                      isBanned: false,
                    });
                    reactivated++;
                  } else {
                    // Delete Storage file — prefer stored filename
                    // (full path) on the snapple, fall back to the
                    // legacy path convention for older docs.
                    const path = data.filename
                      || (data.videoId && data.creatorId ? `videos/${data.creatorId}/${data.videoId}.mp4` : null);
                    if (path) {
                      const videoRef = sRef(storage, path);
                      await deleteObject(videoRef).catch(() => {});
                    }
                    await deleteDoc(doc(db, 'snapples', d.id)).catch(() => {});
                    deleted++;
                  }
                }
                showAlert('Done', `Reactivated ${reactivated}, deleted ${deleted}`);
              } catch (e) { showError('Error', e.message); }
            }}
          />
          <UtilButton
            label="Reset Snapple Game Stats"
            desc="Zero out gamesPlayed and gamesWon on every snapple. Use this when the pool is small enough that the same handful of snapples are getting boosted unfairly."
            color={theme.colors.vibeOrange}
            onPress={async () => {
              try {
                const snap = await getDocs(query(collection(db, 'snapples'), limit(1000)));
                let reset = 0;
                for (const d of snap.docs) {
                  const data = d.data();
                  if (!data.gamesPlayed && !data.gamesWon) continue;
                  await updateDoc(doc(db, 'snapples', d.id), {
                    gamesPlayed: 0,
                    gamesWon: 0,
                  });
                  reset++;
                }
                showAlert('Done', `Reset game stats on ${reset} snapples`);
              } catch (e) { showError('Error', e.message); }
            }}
          />
          <UtilButton
            label="Reset Game Prompt Usage"
            desc="Set usageCount back to 0 on every gamePrompts doc — least-used rotation starts fresh"
            color={theme.colors.vibeBlue}
            onPress={async () => {
              try {
                const snap = await getDocs(query(collection(db, 'gamePrompts'), limit(500)));
                let reset = 0;
                for (const d of snap.docs) {
                  if ((d.data().usageCount || 0) === 0) continue;
                  await updateDoc(doc(db, 'gamePrompts', d.id), { usageCount: 0 });
                  reset++;
                }
                showAlert('Done', `Reset ${reset} prompts (${snap.size} total)`);
              } catch (e) { showError('Error', e.message); }
            }}
          />
          <UtilButton
            label="Reseed Game Prompts"
            desc="Add any prompts from the local DEFAULT_PROMPTS list that aren't already in gamePrompts (safe to repeat — dedupes by text)"
            color={theme.colors.vibeGreen}
            onPress={async () => {
              try {
                const { gameService } = await import('../services/gameService');
                const result = await gameService.seedGamePrompts();
                showAlert('Done', `Added ${result.added}, total ${result.total}`);
              } catch (e) { showError('Error', e.message); }
            }}
          />
          <UtilButton
            label="Clean Orphan Snapples"
            desc="Delete snapples with no owner and remove their video files"
            color={theme.colors.vibeRed}
            onPress={async () => {
              try {
                const snap = await getDocs(query(collection(db, 'snapples'), limit(500)));
                let deleted = 0;
                for (const d of snap.docs) {
                  const data = d.data();
                  const owners = data.owners || [];
                  if (owners.length === 0 && (!data.creatorId || data.creatorId === null)) {
                    // Delete Storage file — prefer stored filename
                    // (full path) on the snapple, fall back to legacy
                    // path convention for older docs.
                    const path = data.filename
                      || (data.videoId ? `videos/${data.creatorId || 'unknown'}/${data.videoId}.mp4` : null);
                    if (path) {
                      try {
                        const { ref: sRef, deleteObject } = require('firebase/storage');
                        const { storage } = require('../services/firebase');
                        await deleteObject(sRef(storage, path)).catch(() => {});
                      } catch (e) {}
                    }
                    await deleteDoc(doc(db, 'snapples', d.id));
                    deleted++;
                  }
                }
                showAlert('Done', `Deleted ${deleted} orphan snapples`);
              } catch (e) { showError('Error', e.message); }
            }}
          />
        </ScrollView>
      ) : activeTab === 'create' ? (
        <View style={styles.createSection}>
          <View style={styles.createTypeRow}>
            <Pressable
              style={[styles.createTypeBtn, promptType === 'snapple' && styles.createTypeBtnActive]}
              onPress={() => setPromptType('snapple')}
            >
              <Text style={[styles.createTypeText, promptType === 'snapple' && styles.createTypeTextActive]}>Snapple Prompt</Text>
            </Pressable>
            <Pressable
              style={[styles.createTypeBtn, promptType === 'game' && styles.createTypeBtnActive]}
              onPress={() => setPromptType('game')}
            >
              <Text style={[styles.createTypeText, promptType === 'game' && styles.createTypeTextActive]}>Game Prompt</Text>
            </Pressable>
          </View>
          <TextInput
            style={styles.createInput}
            value={newPromptText}
            onChangeText={setNewPromptText}
            placeholder={promptType === 'snapple' ? "Write a snapple creation prompt..." : "Write a game card prompt..."}
            placeholderTextColor={theme.colors.textSecondary}
            multiline
          />
          <Pressable style={styles.createBtn} onPress={handleAddPrompt}>
            <Text style={styles.createBtnText}>Add Prompt</Text>
          </Pressable>
          <Text style={styles.createHint}>
            {promptType === 'snapple'
              ? 'Snapple prompts go into the pool and rotate into the active feed hourly.'
              : 'Game prompts are used during card game rounds for judging.'}
          </Text>

        </View>
      ) : isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={theme.colors.vibeBlue} />
        </View>
      ) : (
        <>
          {activeTab === 'prompts' && (
            <View style={styles.subTabRow}>
              {[
                { label: 'Live', value: 'live' },
                { label: 'On Deck', value: 'ondeck' },
                { label: 'Pool', value: 'pool' },
                { label: 'Game', value: 'game' },
              ].map(tab => (
                <Pressable
                  key={tab.value}
                  style={[styles.subTab, promptSubTab === tab.value && styles.subTabActive]}
                  onPress={() => { setPromptSubTab(tab.value); setTimeout(() => loadPrompts(tab.value), 50); }}
                >
                  <Text style={[styles.subTabText, promptSubTab === tab.value && styles.subTabTextActive]}>{tab.label}</Text>
                </Pressable>
              ))}
            </View>
          )}
          {/* Inline create for prompts */}
          {activeTab === 'prompts' && (
            <View style={[styles.inlineCreate, { paddingHorizontal: 16 }]}>
              <TextInput
                style={styles.inlineInput}
                value={newPromptText}
                onChangeText={setNewPromptText}
                placeholder="Add new prompt..."
                placeholderTextColor={theme.colors.textSecondary}
                onSubmitEditing={async () => {
                  if (!newPromptText.trim()) return;
                  const cols = { live: 'activePrompts', ondeck: 'onDeckPrompts', pool: 'promptPool', game: 'gamePrompts' };
                  const col = cols[promptSubTab];
                  const docData = { text: newPromptText.trim(), createdAt: new Date().toISOString() };
                  if (promptSubTab === 'live') {
                    docData.isSystem = true;
                    docData.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                    docData.lockoutAt = new Date(Date.now() + (24 * 60 - 10) * 60 * 1000).toISOString();
                    docData.likeCount = 0; docData.dislikeCount = 0;
                    docData.likes = []; docData.dislikes = [];
                    docData.participantCount = 0; docData.totalViews = 0;
                  } else if (promptSubTab === 'ondeck') {
                    // Push to array instead of addDoc
                    const newData = [...data, { id: String(data.length), text: newPromptText.trim() }];
                    setData(newData);
                    await saveOnDeck(newData);
                    setNewPromptText('');
                    return;
                  } else if (promptSubTab === 'pool') {
                    docData.used = false; docData.timesUsed = 0;
                  } else if (promptSubTab === 'game') {
                    docData.usageCount = 0;
                  }
                  await addDoc(collection(db, cols[promptSubTab]), docData);
                  setNewPromptText('');
                  loadPrompts();
                }}
              />
              <Pressable onPress={async () => {
                if (!newPromptText.trim()) return;
                if (promptSubTab === 'ondeck') {
                  const newData = [...data, { id: String(data.length), text: newPromptText.trim() }];
                  setData(newData);
                  await saveOnDeck(newData);
                  setNewPromptText('');
                  return;
                }
                const cols = { live: 'activePrompts', pool: 'promptPool', game: 'gamePrompts' };
                const docData = { text: newPromptText.trim(), createdAt: new Date().toISOString() };
                if (promptSubTab === 'live') {
                  docData.isSystem = true;
                  docData.expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                  docData.lockoutAt = new Date(Date.now() + (24 * 60 - 10) * 60 * 1000).toISOString();
                  docData.likeCount = 0; docData.dislikeCount = 0;
                  docData.likes = []; docData.dislikes = [];
                  docData.participantCount = 0; docData.totalViews = 0;
                } else if (promptSubTab === 'pool') {
                  docData.used = false; docData.timesUsed = 0;
                } else if (promptSubTab === 'game') {
                  docData.usageCount = 0;
                }
                await addDoc(collection(db, cols[promptSubTab]), docData);
                setNewPromptText('');
                loadPrompts();
              }}>
                <Ionicons name="add-circle" size={28} color={theme.colors.vibeGreen} />
              </Pressable>
            </View>
          )}

          {/* On Deck: tap-to-swap with go-live times */}
          {promptSubTab === 'ondeck' && activeTab === 'prompts' ? (
            <FlatList
              data={data}
              keyExtractor={(item) => item.id}
              contentContainerStyle={styles.list}
              renderItem={({ item, index }) => {
                const now = new Date();
                const nextHour = new Date(now);
                nextHour.setMinutes(0, 0, 0);
                nextHour.setHours(nextHour.getHours() + 1 + index);
                const goLive = nextHour.toLocaleString('en-US', { timeZone: 'America/New_York', hour: 'numeric', minute: '2-digit', weekday: 'short' });
                const isSwapSelected = swapIndex === index;

                return (
                  <Pressable
                    style={[styles.deckCard, isSwapSelected && styles.deckCardSwapping]}
                    onPress={() => handleSwap(index)}
                  >
                    <View style={styles.deckContent}>
                      {editingId === item.id ? (
                        <TextInput
                          style={[styles.deckText, { borderBottomWidth: 1, borderColor: theme.colors.vibeBlue, paddingVertical: 2 }]}
                          value={editText}
                          onChangeText={setEditText}
                          autoFocus
                          multiline
                        />
                      ) : (
                        <Text style={styles.deckText}>{item.text}</Text>
                      )}
                      <Text style={styles.deckTime}>Est. live: {goLive} ET</Text>
                    </View>
                    <View style={styles.promptActions}>
                      <Pressable style={{ padding: 6 }} onPress={() => {
                        if (editingId === item.id) {
                          // Save edit
                          const newData = [...data];
                          newData[index] = { ...newData[index], text: editText };
                          setData(newData);
                          saveOnDeck(newData);
                          setEditingId(null);
                        } else {
                          setEditingId(item.id);
                          setEditText(item.text);
                        }
                      }}>
                        <Ionicons name={editingId === item.id ? "checkmark" : "pencil"} size={22} color={theme.colors.vibeBlue} />
                      </Pressable>
                      <Pressable style={{ padding: 6 }} onPress={async () => {
                        const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
                        const lockoutAt = new Date(Date.now() + (24 * 60 - 10) * 60 * 1000).toISOString();
                        await addDoc(collection(db, 'activePrompts'), {
                          text: item.text, category: 'general',
                          expiresAt, lockoutAt, createdAt: new Date().toISOString(),
                          isSystem: true, likeCount: 0, dislikeCount: 0,
                          likes: [], dislikes: [], participantCount: 0, totalViews: 0,
                        });
                        const newData = [...data];
                        newData.splice(index, 1);
                        setData(newData);
                        await saveOnDeck(newData);
                      }}>
                        <Ionicons name="flash" size={22} color={theme.colors.vibeYellow} />
                      </Pressable>
                      <Pressable style={{ padding: 6 }} onPress={async () => {
                        const newData = [...data];
                        newData.splice(index, 1);
                        setData(newData);
                        setSwapIndex(null);
                        await saveOnDeck(newData);
                      }}>
                        <Ionicons name="close" size={24} color={theme.colors.vibeRed} />
                      </Pressable>
                    </View>
                  </Pressable>
                );
              }}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={styles.emptyText}>On deck is empty</Text>
                </View>
              }
            />
          ) : (
            <FlatList
              data={data}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.list}
              ListEmptyComponent={
                <View style={styles.center}>
                  <Text style={styles.emptyText}>Nothing here</Text>
                </View>
              }
            />
          )}
        </>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: 16, paddingTop: 40, paddingBottom: 12,
  },
  backBg: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: theme.colors.vibeBlue,
  },
  headerTitle: {
    color: theme.colors.textPrimary, fontSize: 18, fontWeight: theme.fontWeights.bold,
  },
  menuTrigger: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 2, borderColor: theme.colors.vibeBlue,
  },
  dropdown: {
    marginHorizontal: 16, marginBottom: 12,
    backgroundColor: theme.colors.background, borderRadius: 12,
    borderWidth: 2, borderColor: theme.colors.vibeBlue,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingVertical: 14, paddingHorizontal: 16,
    borderBottomWidth: 1, borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  dropdownItemActive: {
    backgroundColor: 'rgba(0,198,255,0.1)',
  },
  dropdownText: {
    color: theme.colors.textSecondary, fontSize: 15, fontWeight: theme.fontWeights.semiBold,
  },
  dropdownTextActive: {
    color: theme.colors.vibeBlue,
  },
  subTabRow: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 8, marginBottom: 12,
  },
  subTab: {
    flex: 1, paddingVertical: 8, alignItems: 'center', borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  subTabActive: {
    borderColor: theme.colors.vibeBlue, backgroundColor: 'rgba(0,198,255,0.1)',
  },
  subTabText: {
    color: theme.colors.textSecondary, fontSize: 13, fontWeight: theme.fontWeights.semiBold,
  },
  subTabTextActive: {
    color: theme.colors.vibeBlue,
  },
  promptRow: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 10,
    borderWidth: 1, borderColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12, paddingVertical: 10, marginBottom: 6,
  },
  promptTitle: {
    flex: 1, color: theme.colors.textPrimary, fontSize: 13,
  },
  promptActions: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
  },
  promptEditInput: {
    flex: 1, color: theme.colors.textPrimary, fontSize: 13,
    borderWidth: 1, borderColor: theme.colors.vibeBlue, borderRadius: 6,
    paddingHorizontal: 8, paddingVertical: 4,
  },
  inlineCreate: {
    flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12,
  },
  inlineInput: {
    flex: 1, color: theme.colors.textPrimary, fontSize: 14,
    borderWidth: 2, borderColor: theme.colors.vibeBlue, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 12, paddingVertical: 8,
  },
  deckCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12,
    borderWidth: 2, borderColor: theme.colors.vibeBlue,
    paddingVertical: 14, paddingHorizontal: 12, marginBottom: 8, marginHorizontal: 16,
  },
  deckCardDragging: {
    backgroundColor: 'rgba(0,198,255,0.15)', borderColor: theme.colors.vibeCyan,
  },
  deckDragHandle: { paddingRight: 4 },
  deckContent: { flex: 1 },
  deckText: { color: theme.colors.textPrimary, fontSize: 14, fontWeight: theme.fontWeights.medium, marginBottom: 4 },
  deckTime: { color: theme.colors.vibeBlue, fontSize: 11 },
  deckCard: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12,
    borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 14, paddingHorizontal: 12, marginBottom: 8,
  },
  deckCardSwapping: {
    borderColor: theme.colors.vibeGreen, backgroundColor: 'rgba(0,255,65,0.1)',
  },
  deckIndex: {
    color: theme.colors.textSecondary, fontSize: 12, fontWeight: 'bold', width: 24,
  },
  deckContent: { flex: 1 },
  deckText: { color: theme.colors.textPrimary, fontSize: 14, marginBottom: 3 },
  deckTime: { color: theme.colors.vibeBlue, fontSize: 11 },
  utilsSection: { flex: 1, paddingHorizontal: 16, paddingTop: 8 },
  list: { paddingHorizontal: 16, paddingBottom: 40 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center', gap: 16 },
  deniedText: { color: theme.colors.textSecondary, fontSize: 16, marginTop: 12 },
  emptyText: { color: theme.colors.textSecondary, fontSize: 14 },
  card: {
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 12,
    borderWidth: 2, borderColor: theme.colors.vibeBlue,
    padding: 14, marginBottom: 10,
  },
  cardHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
  },
  cardTitle: {
    color: theme.colors.textPrimary, fontSize: 14, fontWeight: theme.fontWeights.semiBold, flex: 1,
  },
  badge: {
    color: theme.colors.vibeBlue, fontSize: 10, fontWeight: 'bold',
    backgroundColor: 'rgba(0,198,255,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
    marginLeft: 8,
  },
  badgeRed: {
    color: theme.colors.vibeRed, fontSize: 10, fontWeight: 'bold',
    backgroundColor: 'rgba(255,68,68,0.15)', paddingHorizontal: 8, paddingVertical: 2, borderRadius: 8,
    marginLeft: 8,
  },
  cardMeta: { gap: 2, marginBottom: 8 },
  metaText: { color: theme.colors.textSecondary, fontSize: 11 },
  cardActions: { flexDirection: 'row', gap: 10 },
  actionBtn: {
    paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 1, borderColor: 'rgba(255,255,255,0.1)',
  },
  actionBtnText: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: theme.fontWeights.semiBold },
  actionBtnTextGreen: { color: theme.colors.vibeGreen, fontSize: 12, fontWeight: theme.fontWeights.semiBold },
  actionBtnTextRed: { color: theme.colors.vibeRed, fontSize: 12, fontWeight: theme.fontWeights.semiBold },
  editInput: {
    flex: 1, color: theme.colors.textPrimary, fontSize: 14,
    borderWidth: 2, borderColor: theme.colors.vibeBlue, borderRadius: 8,
    backgroundColor: 'rgba(0,0,0,0.3)', padding: 10,
    fontFamily: theme.fonts.main,
  },
  createSection: {
    flex: 1, paddingHorizontal: 16, paddingTop: 16, gap: 16,
  },
  createTypeRow: {
    flexDirection: 'row', gap: 10,
  },
  createTypeBtn: {
    flex: 1, paddingVertical: 10, borderRadius: 10, alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 2, borderColor: 'rgba(255,255,255,0.1)',
  },
  createTypeBtnActive: {
    borderColor: theme.colors.vibeBlue, backgroundColor: 'rgba(0,198,255,0.1)',
  },
  createTypeText: {
    color: theme.colors.textSecondary, fontSize: 13, fontWeight: theme.fontWeights.semiBold,
  },
  createTypeTextActive: {
    color: theme.colors.vibeBlue,
  },
  createInput: {
    borderWidth: 3, borderColor: theme.colors.vibeBlue, borderRadius: 12,
    backgroundColor: 'rgba(0,0,0,0.3)', padding: 14,
    color: theme.colors.textPrimary, fontSize: 16, minHeight: 100,
    textAlignVertical: 'top',
  },
  createBtn: {
    backgroundColor: 'rgba(0,198,255,0.15)', borderWidth: 2, borderColor: theme.colors.vibeBlue,
    borderRadius: 12, paddingVertical: 14, alignItems: 'center',
  },
  createBtnText: {
    color: theme.colors.vibeBlue, fontSize: 16, fontWeight: theme.fontWeights.bold,
  },
  createHint: {
    color: theme.colors.textSecondary, fontSize: 12, textAlign: 'center', lineHeight: 18,
  },
  seedSection: {
    marginTop: 20, gap: 10, borderTopWidth: 1, borderTopColor: 'rgba(255,255,255,0.1)', paddingTop: 20,
  },
  deleteBtn: {
    alignSelf: 'flex-end', paddingVertical: 4, paddingHorizontal: 12, borderRadius: 8,
    backgroundColor: 'rgba(255,68,68,0.1)', borderWidth: 1, borderColor: theme.colors.vibeRed,
  },
  deleteBtnText: { color: theme.colors.vibeRed, fontSize: 12, fontWeight: 'bold' },
  userActions: { flexDirection: 'row', gap: 12, marginTop: 8 },
  actionBtn: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingVertical: 6, paddingHorizontal: 12, borderRadius: 8, backgroundColor: 'rgba(255,255,255,0.05)' },
  actionBtnLabel: { color: theme.colors.textSecondary, fontSize: 12, fontWeight: '600' },
  grantRow: { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 8 },
  grantInput: { flex: 1, backgroundColor: 'rgba(255,255,255,0.08)', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 6, color: theme.colors.textPrimary, fontSize: 13 },
  grantBtn: { padding: 6 },
});
