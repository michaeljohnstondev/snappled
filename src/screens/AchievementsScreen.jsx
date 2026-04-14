import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable } from 'react-native';
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
  const groups = achievementService.getGroups();

  useEffect(() => {
    checkAll();
  }, []);

  const checkAll = async () => {
    if (!user?.uid) return;

    const userSnap = await getDoc(doc(db, 'users', user.uid));
    const userData = userSnap.data() || {};
    const savedStats = userData.stats || {};

    let totalLikes = 0, maxLikesOnOne = 0, uniquePrompts = new Set();
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

    const newAchievements = await achievementService.checkAndAward(user.uid, stats);
    newAchievements.forEach((a, i) => {
      const rewards = [];
      if (a.coins) rewards.push(`+${a.coins}c`);
      if (a.xp) rewards.push(`+${a.xp}xp`);
      if (a.trophies) rewards.push(`+${a.trophies}t`);
      setTimeout(() => showToast('achievement', a.name, rewards.join(' ')), 500 + i * 1500);
    });

    const earned = await achievementService.getUserAchievements(user.uid);
    setEarnedIds(new Set(earned.map(a => a.id)));
  };

  const earnedCount = allAchievements.filter(a => earnedIds.has(a.id)).length;

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

      <View style={styles.progressContainer}>
        <View style={styles.progressBg}>
          <View style={[styles.progressFill, { width: `${(earnedCount / allAchievements.length) * 100}%` }]} />
        </View>
      </View>

      <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>
        {groups.map(group => {
          const groupAchievements = allAchievements.filter(a => a.group === group.key);
          const earned = groupAchievements.filter(a => earnedIds.has(a.id));
          const nextUp = groupAchievements.find(a => !earnedIds.has(a.id));
          const allDone = earned.length === groupAchievements.length;

          return (
            <View key={group.key} style={styles.groupContainer}>
              {/* Group header */}
              <View style={styles.groupHeader}>
                <Text style={styles.groupLabel}>{group.label}</Text>
                <Text style={styles.groupCount}>{earned.length}/{groupAchievements.length}</Text>
              </View>

              {/* Earned achievements */}
              {earned.map(item => (
                <View key={item.id} style={styles.card}>
                  <Text style={styles.icon}>{item.icon}</Text>
                  <View style={styles.info}>
                    <Text style={styles.name}>{item.name}</Text>
                    <Text style={styles.desc}>{item.desc}</Text>
                  </View>
                  <Ionicons name="checkmark-circle" size={24} color={theme.colors.vibeGreen} />
                </View>
              ))}

              {/* Next achievement in group */}
              {nextUp && (
                <View style={[styles.card, styles.cardNext]}>
                  <Text style={styles.icon}>?</Text>
                  <View style={styles.info}>
                    <Text style={styles.nameNext}>{nextUp.name}</Text>
                    <Text style={styles.desc}>{nextUp.desc}</Text>
                  </View>
                  <View style={styles.rewardList}>
                    {nextUp.coins > 0 && <Text style={styles.rewardCoins}>+{nextUp.coins}c</Text>}
                    {nextUp.xp > 0 && <Text style={styles.rewardXP}>+{nextUp.xp}xp</Text>}
                    {nextUp.trophies > 0 && <Text style={styles.rewardTrophies}>+{nextUp.trophies}t</Text>}
                  </View>
                </View>
              )}

              {allDone && (
                <View style={styles.completedBadge}>
                  <Ionicons name="trophy" size={16} color={theme.colors.vibeYellow} />
                  <Text style={styles.completedText}>All completed!</Text>
                </View>
              )}
            </View>
          );
        })}
      </ScrollView>
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
    paddingHorizontal: 16, paddingBottom: 12,
  },
  progressBg: {
    height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.08)', overflow: 'hidden',
  },
  progressFill: {
    height: '100%', borderRadius: 3, backgroundColor: theme.colors.vibeYellow,
  },
  scrollArea: { flex: 1 },
  scrollContent: {
    paddingHorizontal: 16, paddingBottom: 40, gap: 20,
  },

  // Group
  groupContainer: {
    gap: 8,
  },
  groupHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingBottom: 4,
  },
  groupLabel: {
    fontSize: 16, fontWeight: theme.fontWeights.bold, color: theme.colors.vibeBlue,
  },
  groupCount: {
    fontSize: 13, fontWeight: theme.fontWeights.bold, color: theme.colors.textSecondary,
  },

  // Cards
  card: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 14,
    padding: 14, borderWidth: 3, borderColor: theme.colors.vibeBlue,
  },
  cardNext: {
    borderColor: 'rgba(255,255,255,0.15)', opacity: 0.7,
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
  nameNext: {
    fontSize: 15, fontWeight: theme.fontWeights.bold, color: theme.colors.textSecondary,
  },
  desc: {
    fontSize: 12, color: theme.colors.textSecondary, marginTop: 2,
  },
  rewardList: {
    alignItems: 'flex-end', gap: 2, marginLeft: 10,
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
  completedBadge: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 6, paddingVertical: 8,
  },
  completedText: {
    fontSize: 13, fontWeight: theme.fontWeights.bold, color: theme.colors.vibeYellow,
  },
});
