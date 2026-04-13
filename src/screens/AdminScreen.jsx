import React, { useState, useEffect, useCallback } from 'react';
import { View, Text, TextInput, ScrollView, StyleSheet, Pressable, FlatList, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, getDocs, doc, deleteDoc, updateDoc, addDoc, orderBy, limit, where } from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import { db, functions } from '../services/firebase';
import { useAuth } from '../store/AuthContext';
import { useModal } from '../store/ModalContext';
import VibeButton from '../components/ui/VibeButton';
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
        return (
          <View style={styles.card}>
            <View style={styles.cardHeader}>
              <Text style={styles.cardTitle}>@{item.username || item.email}</Text>
              {item.isBanned && <Text style={styles.badgeRed}>BANNED</Text>}
            </View>
            <Text style={styles.metaText}>UID: {item.id}</Text>
            <Text style={styles.metaText}>Coins: {item.resources?.coins || item.coins || 0}  Tickets: {item.resources?.tokens || 0}</Text>
            {!item.isBanned && (
              <Pressable style={styles.deleteBtn} onPress={() => handleBanUser(item.id, item.username)}>
                <Text style={styles.deleteBtnText}>Ban</Text>
              </Pressable>
            )}
          </View>
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
                if (opt.value !== 'create') loadTab();
              }}
            >
              <Text style={[styles.dropdownText, activeTab === opt.value && styles.dropdownTextActive]}>
                {opt.label}
              </Text>
            </Pressable>
          ))}
        </View>
      )}

      {activeTab === 'utils' ? (
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
                    // Delete video from storage
                    if (data.videoUrl) {
                      try {
                        const { ref: sRef, deleteObject } = require('firebase/storage');
                        const { storage } = require('../services/firebase');
                        const videoRef = sRef(storage, `videos/${data.creatorId || 'unknown'}/${data.videoId || ''}.mp4`);
                        await deleteObject(videoRef).catch(() => {});
                      } catch (e) {}
                    }
                    // Delete video metadata
                    if (data.videoId) {
                      await deleteDoc(doc(db, 'videos', data.videoId)).catch(() => {});
                    }
                    // Delete snapple
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
});
