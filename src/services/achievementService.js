import { doc, getDoc, updateDoc, arrayUnion, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

const ACHIEVEMENTS = [
  // Creation
  { id: 'first_snapple', name: 'First Snap', desc: 'Create your first snapple', icon: '📹', coins: 10 },
  { id: 'snapple_10', name: 'Content Creator', desc: 'Create 10 snapples', icon: '🎬', coins: 25 },
  { id: 'snapple_50', name: 'Prolific', desc: 'Create 50 snapples', icon: '🌟', coins: 100 },
  { id: 'first_prompt', name: 'Topic Starter', desc: 'Create your first prompt', icon: '💡', coins: 10 },

  // Social
  { id: 'first_follow', name: 'Social Butterfly', desc: 'Follow your first user', icon: '🦋', coins: 5 },
  { id: 'followers_10', name: 'Rising Star', desc: 'Get 10 followers', icon: '⭐', coins: 25 },
  { id: 'followers_100', name: 'Influencer', desc: 'Get 100 followers', icon: '👑', coins: 100 },

  // Game
  { id: 'first_game', name: 'Player One', desc: 'Play your first game', icon: '🎮', coins: 10 },
  { id: 'first_win', name: 'Winner', desc: 'Win your first game', icon: '🏆', coins: 25 },
  { id: 'wins_10', name: 'Champion', desc: 'Win 10 games', icon: '🥇', coins: 50 },
  { id: 'wins_50', name: 'Legend', desc: 'Win 50 games', icon: '🔥', coins: 200 },

  // Collection
  { id: 'first_buy', name: 'Collector', desc: 'Buy your first snapple', icon: '💎', coins: 5 },
  { id: 'collection_25', name: 'Hoarder', desc: 'Own 25 snapples', icon: '📦', coins: 50 },
  { id: 'deck_full', name: 'Deck Master', desc: 'Fill your deck to 100', icon: '🃏', coins: 100 },

  // Engagement
  { id: 'likes_100', name: 'Crowd Pleaser', desc: 'Get 100 total likes on your snapples', icon: '❤️', coins: 50 },
  { id: 'views_1000', name: 'Viral', desc: 'Get 1000 total views on your snapples', icon: '👁', coins: 100 },

  // Currency
  { id: 'coins_1000', name: 'Rich', desc: 'Accumulate 1000 coins', icon: '🪙', coins: 0 },
  { id: 'first_sell', name: 'Entrepreneur', desc: 'Have someone buy your snapple', icon: '💰', coins: 25 },
];

export const achievementService = {
  getAll() {
    return ACHIEVEMENTS;
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
          case 'first_snapple': earned = (stats.videosCreated || 0) >= 1; break;
          case 'snapple_10': earned = (stats.videosCreated || 0) >= 10; break;
          case 'snapple_50': earned = (stats.videosCreated || 0) >= 50; break;
          case 'first_prompt': earned = (stats.promptsCreated || 0) >= 1; break;
          case 'first_follow': earned = (stats.following || 0) >= 1; break;
          case 'followers_10': earned = (stats.followers || 0) >= 10; break;
          case 'followers_100': earned = (stats.followers || 0) >= 100; break;
          case 'first_game': earned = (stats.gamesPlayed || 0) >= 1; break;
          case 'first_win': earned = (stats.gamesWon || 0) >= 1; break;
          case 'wins_10': earned = (stats.gamesWon || 0) >= 10; break;
          case 'wins_50': earned = (stats.gamesWon || 0) >= 50; break;
          case 'first_buy': earned = (stats.snapplesPurchased || 0) >= 1; break;
          case 'collection_25': earned = (stats.ownedCount || 0) >= 25; break;
          case 'deck_full': earned = (stats.deckCount || 0) >= 100; break;
          case 'likes_100': earned = (stats.totalLikes || 0) >= 100; break;
          case 'views_1000': earned = (stats.totalViews || 0) >= 1000; break;
          case 'coins_1000': earned = (stats.coins || 0) >= 1000; break;
          case 'first_sell': earned = (stats.snapplesSold || 0) >= 1; break;
        }

        if (earned) {
          newAchievements.push({
            ...achievement,
            earnedAt: new Date().toISOString(),
          });
        }
      }

      if (newAchievements.length > 0) {
        // Award achievements + bonus coins
        const totalBonus = newAchievements.reduce((sum, a) => sum + (a.coins || 0), 0);
        const updates = {
          achievements: [...existing, ...newAchievements],
          updatedAt: serverTimestamp(),
        };
        if (totalBonus > 0) {
          updates['resources.coins'] = (userData.resources?.coins || 0) + totalBonus;
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
