import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { collection, query, where, getDocs, doc, getDoc } from 'firebase/firestore';
import { db } from '../services/firebase';
import { useAuth } from '../store/AuthContext';
import { useModal } from '../store/ModalContext';
import { achievementService } from '../services/achievementService';
import { levelService } from '../services/levelService';
import theme from '../theme/themes';

export default function AchievementsScreen({ navigation }) {
  const { user } = useAuth();
  const { showToast } = useModal();
  const [earnedIds, setEarnedIds] = useState(new Set());
  const allAchievements = achievementService.getAll();

  useEffect(() => {
    checkAll();
  }, []);

  const checkAll = async () => {
    if (!user?.uid) return;

    // Build live stats from actual data
    const userSnap = await getDoc(doc(db, 'users', user.uid));
    const userData = userSnap.data() || {};
    const savedStats = userData.stats || {};

    // Tally likes across all user's snapples
    let totalLikes = 0;
    let maxLikesOnOne = 0;
    let uniquePrompts = new Set();
    try {
      const snapQ = query(collection(db, 'snapples'), where('creatorId', '==', user.uid));
      const snapSnap = await getDocs(snapQ);
      snapSnap.forEach(d => {
        const s = d.data();
        const likes = s.likes || s.likeCount || 0;
        totalLikes += likes;
        if (likes > maxLikesOnOne) maxLikesOnOne = likes;
        if (s.promptId) uniquePrompts.add(s.promptId);
      });
    } catch (e) {}

    const stats = {
      ...savedStats,
      totalLikesReceived: totalLikes,
      maxLikesOnOne,
      uniquePromptsUsed: uniquePrompts.size,
      level: levelService.getLevelFromXP(userData.profile?.xp || userData.profile?.experience || 0),
      trophies: userData.resources?.trophies || 0,
    };

    // Check and award
    const newAchievements = await achievementService.checkAndAward(user.uid, stats);
    newAchievements.forEach((a, i) => {
      const rewards = [];
      if (a.coins) rewards.push(`+${a.coins}c`);
      if (a.xp) rewards.push(`+${a.xp}xp`);
      if (a.trophies) rewards.push(`+${a.trophies}t`);
      setTimeout(() => showToast('achievement', a.name, rewards.join(' ')), 500 + i * 1500);
    });

    // Refresh earned list
    const earned = await achievementService.getUserAchievements(user.uid);
    setEarnedIds(new Set(earned.map(a => a.id)));
  };

  const earnedCount = allAchievements.filter(a => earnedIds.has(a.id)).length;

  const renderItem = ({ item }) => {
    const isEarned = earnedIds.has(item.id);
    return (
      <View style={[styles.card, !isEarned && styles.cardLocked]}>
        <Text style={styles.icon}>{isEarned ? item.icon : '?'}</Text>
        <View style={styles.info}>
          <Text style={[styles.name, !isEarned && styles.nameLocked]}>{item.name}</Text>
          <Text style={styles.desc}>{item.desc}</Text>
        </View>
        <View style={styles.reward}>
          {isEarned ? (
            <Ionicons name="checkmark-circle" size={24} color={theme.colors.vibeGreen} />
          ) : (
            <View style={styles.rewardList}>
              {item.coins > 0 && <Text style={styles.rewardCoins}>+{item.coins}c</Text>}
              {item.xp > 0 && <Text style={styles.rewardXP}>+{item.xp}xp</Text>}
              {item.trophies > 0 && <Text style={styles.rewardTrophies}>+{item.trophies}t</Text>}
            </View>
          )}
        </View>
      </View>
    );
  };

  return (
    <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <View style={styles.backBg}>
            <Ionicons name="arrow-back" size={20} color="white" />
          </View>
        </Pressable>
        <Text style={styles.headerTitle}>Achievements</Text>
        <Text style={styles.counter}>{earnedCount}/{allAchievements.length}</Text>
      </View>

      {/* Progress bar */}
      <View style={styles.progressContainer}>
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${(earnedCount / allAchievements.length) * 100}%` }]} />
        </View>
      </View>

      <FlatList
        data={allAchievements}
        keyExtractor={item => item.id}
        renderItem={renderItem}
        contentContainerStyle={styles.list}
        ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
      />
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
    paddingHorizontal: 16, paddingTop: 50, paddingBottom: 12,
  },
  backBg: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)', justifyContent: 'center', alignItems: 'center',
    borderWidth: 3, borderColor: theme.colors.vibeBlue,
  },
  headerTitle: {
    fontSize: 20, fontWeight: theme.fontWeights.bold, color: theme.colors.textPrimary,
  },
  counter: {
    fontSize: 14, fontWeight: theme.fontWeights.bold, color: theme.colors.vibeYellow,
  },
  progressContainer: {
    paddingHorizontal: 16, paddingBottom: 16,
  },
  progressBg: {
    height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden',
  },
  progressFill: {
    height: '100%', borderRadius: 3, backgroundColor: theme.colors.vibeYellow,
  },
  list: {
    paddingHorizontal: 16, paddingBottom: 40,
  },
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)', borderRadius: 14,
    padding: 14, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)',
  },
  cardLocked: {
    opacity: 0.5,
  },
  icon: {
    fontSize: 28, width: 44, textAlign: 'center',
  },
  info: {
    flex: 1, marginLeft: 10,
  },
  name: {
    fontSize: 15, fontWeight: theme.fontWeights.bold, color: theme.colors.textPrimary,
  },
  nameLocked: {
    color: theme.colors.textSecondary,
  },
  desc: {
    fontSize: 12, color: theme.colors.textSecondary, marginTop: 2,
  },
  reward: {
    marginLeft: 10, alignItems: 'center',
  },
  rewardList: {
    alignItems: 'flex-end', gap: 2,
  },
  rewardCoins: {
    fontSize: 11, fontWeight: theme.fontWeights.bold, color: theme.colors.vibeYellow,
  },
  rewardXP: {
    fontSize: 11, fontWeight: theme.fontWeights.bold, color: theme.colors.vibeBlue,
  },
  rewardTrophies: {
    fontSize: 11, fontWeight: theme.fontWeights.bold, color: theme.colors.vibeGreen,
  },
});
