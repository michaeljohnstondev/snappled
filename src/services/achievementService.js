import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

const GROUPS = [
  { key: 'creation', label: 'Creation' },
  { key: 'likes', label: 'Likes' },
  { key: 'rounds', label: 'Rounds' },
  { key: 'games', label: 'Games' },
  { key: 'sales', label: 'Sales' },
  { key: 'levels', label: 'Levels' },
  { key: 'trophies', label: 'Trophies' },
];

const ACHIEVEMENTS = [
  // Creation milestones
  { id: 'first_snapple', group: 'creation', name: 'First Snap', desc: 'Create your first snapple', icon: '📹', coins: 50, xp: 25 },
  { id: 'snapple_5', group: 'creation', name: 'Getting Started', desc: 'Create 5 snapples', icon: '🎬', coins: 100, xp: 50 },
  { id: 'snapple_25', group: 'creation', name: 'Content Creator', desc: 'Create 25 snapples', icon: '🌟', coins: 250, xp: 150 },
  { id: 'snapple_50', group: 'creation', name: 'Prolific', desc: 'Create 50 snapples', icon: '🎥', coins: 500, xp: 300 },
  { id: 'snapple_100', group: 'creation', name: 'Machine', desc: 'Create 100 snapples', icon: '🏭', coins: 1000, xp: 500 },
  { id: 'multi_prompt', group: 'creation', name: 'Versatile', desc: 'Create snapples for 10 different prompts', icon: '🎨', coins: 200, xp: 100 },

  // Likes received
  { id: 'likes_10', group: 'likes', name: 'Likeable', desc: 'Get 10 total likes on your snapples', icon: '👍', coins: 50, xp: 25 },
  { id: 'likes_50', group: 'likes', name: 'Crowd Pleaser', desc: 'Get 50 total likes', icon: '❤️', coins: 150, xp: 75 },
  { id: 'likes_100', group: 'likes', name: 'Fan Favorite', desc: 'Get 100 total likes', icon: '🔥', coins: 300, xp: 150 },
  { id: 'likes_500', group: 'likes', name: 'Beloved', desc: 'Get 500 total likes', icon: '💖', coins: 750, xp: 400 },
  { id: 'likes_1000', group: 'likes', name: 'Icon', desc: 'Get 1000 total likes', icon: '👑', coins: 1500, xp: 750 },
  { id: 'single_like_25', group: 'likes', name: 'Banger', desc: 'Get 25 likes on a single snapple', icon: '💥', coins: 200, xp: 100 },

  // Winning rounds
  { id: 'rounds_1', group: 'rounds', name: 'Round Winner', desc: 'Win your first round', icon: '✋', coins: 25, xp: 15 },
  { id: 'rounds_10', group: 'rounds', name: 'On A Roll', desc: 'Win 10 rounds', icon: '🎯', coins: 100, xp: 50 },
  { id: 'rounds_50', group: 'rounds', name: 'Round Master', desc: 'Win 50 rounds', icon: '💪', coins: 300, xp: 200 },
  { id: 'rounds_100', group: 'rounds', name: 'Dominator', desc: 'Win 100 rounds', icon: '⚡', coins: 600, xp: 400 },
  { id: 'sweep', group: 'rounds', name: 'Clean Sweep', desc: 'Win every round in a game', icon: '🧹', coins: 500, xp: 250 },
  { id: 'comeback', group: 'rounds', name: 'Comeback Kid', desc: 'Win a game after losing the first round', icon: '🔄', coins: 250, xp: 150 },

  // Winning games
  { id: 'first_win', group: 'games', name: 'Winner', desc: 'Win your first game', icon: '🏆', coins: 100, xp: 50 },
  { id: 'wins_5', group: 'games', name: 'Competitor', desc: 'Win 5 games', icon: '🥊', coins: 200, xp: 100 },
  { id: 'wins_10', group: 'games', name: 'Champion', desc: 'Win 10 games', icon: '🥇', coins: 400, xp: 200 },
  { id: 'wins_25', group: 'games', name: 'Veteran', desc: 'Win 25 games', icon: '🎖️', coins: 750, xp: 400 },
  { id: 'wins_50', group: 'games', name: 'Legend', desc: 'Win 50 games', icon: '🔥', coins: 1500, xp: 750 },
  { id: 'wins_100', group: 'games', name: 'GOAT', desc: 'Win 100 games', icon: '🐐', coins: 3000, xp: 1500 },
  { id: 'win_streak_3', group: 'games', name: 'Hot Streak', desc: 'Win 3 games in a row', icon: '🔥', coins: 300, xp: 150 },
  { id: 'win_streak_5', group: 'games', name: 'Unstoppable', desc: 'Win 5 games in a row', icon: '💎', coins: 750, xp: 400 },

  // Sales
  { id: 'first_sale', group: 'sales', name: 'Entrepreneur', desc: 'Have someone buy your snapple', icon: '💰', coins: 50, xp: 25 },
  { id: 'sales_10', group: 'sales', name: 'Salesman', desc: 'Sell 10 snapples', icon: '🤝', coins: 200, xp: 100 },
  { id: 'sales_50', group: 'sales', name: 'Hustler', desc: 'Sell 50 snapples', icon: '📈', coins: 500, xp: 300 },
  { id: 'sales_100', group: 'sales', name: 'Mogul', desc: 'Sell 100 snapples', icon: '🏦', coins: 1000, xp: 500 },
  { id: 'revenue_10k', group: 'sales', name: 'Big Money', desc: 'Earn 10,000 coins from sales', icon: '💎', coins: 1000, xp: 500 },

  // Levels
  { id: 'level_5', group: 'levels', name: 'Warming Up', desc: 'Reach level 5', icon: '🌱', coins: 100, xp: 0, trophies: 2 },
  { id: 'level_10', group: 'levels', name: 'Double Digits', desc: 'Reach level 10', icon: '🟢', coins: 250, xp: 0, trophies: 5 },
  { id: 'level_25', group: 'levels', name: 'Seasoned', desc: 'Reach level 25', icon: '🔵', coins: 500, xp: 0, trophies: 10 },
  { id: 'level_50', group: 'levels', name: 'Elite', desc: 'Reach level 50', icon: '🟣', coins: 1000, xp: 0, trophies: 20 },
  { id: 'level_75', group: 'levels', name: 'Master', desc: 'Reach level 75', icon: '🟡', coins: 2000, xp: 0, trophies: 35 },
  { id: 'level_100', group: 'levels', name: 'Max Level', desc: 'Reach level 100', icon: '✨', coins: 5000, xp: 0, trophies: 50 },

  // Trophy ranks
  { id: 'trophies_25', group: 'trophies', name: 'Bronze', desc: 'Earn 25 trophies', icon: '🥉', coins: 200, xp: 100 },
  { id: 'trophies_50', group: 'trophies', name: 'Silver', desc: 'Earn 50 trophies', icon: '🥈', coins: 400, xp: 200 },
  { id: 'trophies_100', group: 'trophies', name: 'Gold', desc: 'Earn 100 trophies', icon: '🥇', coins: 750, xp: 400 },
  { id: 'trophies_250', group: 'trophies', name: 'Platinum', desc: 'Earn 250 trophies', icon: '💠', coins: 1500, xp: 750 },
  { id: 'trophies_500', group: 'trophies', name: 'Diamond', desc: 'Earn 500 trophies', icon: '💎', coins: 3000, xp: 1500 },
];

export const achievementService = {
  getAll() {
    return ACHIEVEMENTS;
  },

  getGroups() {
    return GROUPS;
  },

  async getUserAchievements(userId) {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) return [];
      return userDoc.data().achievements || [];
    } catch (e) {
      console.error('[Achievements] Error:', e);
      return [];
    }
  },

  async checkAndAward(userId, stats) {
    try {
      const userDoc = await getDoc(doc(db, 'users', userId));
      if (!userDoc.exists()) return [];

      const userData = userDoc.data();
      const existing = userData.achievements || [];
      const existingIds = new Set(existing.map(a => a.id));
      const newAchievements = [];

      for (const achievement of ACHIEVEMENTS) {
        if (existingIds.has(achievement.id)) continue;

        let earned = false;

        switch (achievement.id) {
          // Creation
          case 'first_snapple': earned = (stats.videosCreated || 0) >= 1; break;
          case 'snapple_5': earned = (stats.videosCreated || 0) >= 5; break;
          case 'snapple_25': earned = (stats.videosCreated || 0) >= 25; break;
          case 'snapple_50': earned = (stats.videosCreated || 0) >= 50; break;
          case 'snapple_100': earned = (stats.videosCreated || 0) >= 100; break;
          case 'multi_prompt': earned = (stats.uniquePromptsUsed || 0) >= 10; break;

          // Likes
          case 'likes_10': earned = (stats.totalLikesReceived || stats.totalLikes || 0) >= 10; break;
          case 'likes_50': earned = (stats.totalLikesReceived || stats.totalLikes || 0) >= 50; break;
          case 'likes_100': earned = (stats.totalLikesReceived || stats.totalLikes || 0) >= 100; break;
          case 'likes_500': earned = (stats.totalLikesReceived || stats.totalLikes || 0) >= 500; break;
          case 'likes_1000': earned = (stats.totalLikesReceived || stats.totalLikes || 0) >= 1000; break;
          case 'single_like_25': earned = (stats.maxLikesOnOne || 0) >= 25; break;

          // Rounds
          case 'rounds_1': earned = (stats.roundsWon || 0) >= 1; break;
          case 'rounds_10': earned = (stats.roundsWon || 0) >= 10; break;
          case 'rounds_50': earned = (stats.roundsWon || 0) >= 50; break;
          case 'rounds_100': earned = (stats.roundsWon || 0) >= 100; break;
          case 'sweep': earned = (stats.cleanSweeps || 0) >= 1; break;
          case 'comeback': earned = (stats.comebacks || 0) >= 1; break;

          // Games
          case 'first_win': earned = (stats.gamesWon || 0) >= 1; break;
          case 'wins_5': earned = (stats.gamesWon || 0) >= 5; break;
          case 'wins_10': earned = (stats.gamesWon || 0) >= 10; break;
          case 'wins_25': earned = (stats.gamesWon || 0) >= 25; break;
          case 'wins_50': earned = (stats.gamesWon || 0) >= 50; break;
          case 'wins_100': earned = (stats.gamesWon || 0) >= 100; break;
          case 'win_streak_3': earned = (stats.winStreak || 0) >= 3; break;
          case 'win_streak_5': earned = (stats.winStreak || 0) >= 5; break;

          // Sales
          case 'first_sale': earned = (stats.snapplesSold || 0) >= 1; break;
          case 'sales_10': earned = (stats.snapplesSold || 0) >= 10; break;
          case 'sales_50': earned = (stats.snapplesSold || 0) >= 50; break;
          case 'sales_100': earned = (stats.snapplesSold || 0) >= 100; break;
          case 'revenue_10k': earned = (stats.totalRevenue || 0) >= 10000; break;

          // Levels
          case 'level_5': earned = (stats.level || 1) >= 5; break;
          case 'level_10': earned = (stats.level || 1) >= 10; break;
          case 'level_25': earned = (stats.level || 1) >= 25; break;
          case 'level_50': earned = (stats.level || 1) >= 50; break;
          case 'level_75': earned = (stats.level || 1) >= 75; break;
          case 'level_100': earned = (stats.level || 1) >= 100; break;

          // Trophy ranks
          case 'trophies_25': earned = (stats.trophies || 0) >= 25; break;
          case 'trophies_50': earned = (stats.trophies || 0) >= 50; break;
          case 'trophies_100': earned = (stats.trophies || 0) >= 100; break;
          case 'trophies_250': earned = (stats.trophies || 0) >= 250; break;
          case 'trophies_500': earned = (stats.trophies || 0) >= 500; break;
        }

        if (earned) {
          newAchievements.push({
            ...achievement,
            earnedAt: new Date().toISOString(),
          });
        }
      }

      if (newAchievements.length > 0) {
        const totalCoins = newAchievements.reduce((sum, a) => sum + (a.coins || 0), 0);
        const totalXP = newAchievements.reduce((sum, a) => sum + (a.xp || 0), 0);
        const totalTrophies = newAchievements.reduce((sum, a) => sum + (a.trophies || 0), 0);
        const updates = {
          achievements: [...existing, ...newAchievements],
          updatedAt: serverTimestamp(),
        };
        if (totalCoins > 0) {
          updates['resources.coins'] = (userData.resources?.coins || 0) + totalCoins;
        }
        if (totalXP > 0) {
          updates['profile.xp'] = (userData.profile?.xp || 0) + totalXP;
        }
        if (totalTrophies > 0) {
          updates['resources.trophies'] = (userData.resources?.trophies || 0) + totalTrophies;
        }
        await updateDoc(doc(db, 'users', userId), updates);
      }

      return newAchievements;
    } catch (e) {
      console.error('[Achievements] Check error:', e);
      return [];
    }
  },
};

export default achievementService;
