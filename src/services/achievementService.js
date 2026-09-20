import { doc, getDoc } from 'firebase/firestore';
import { db } from './firebase';

const GROUPS = [
  { key: 'creation', label: 'Creation' },
  { key: 'likes', label: 'Likes' },
  { key: 'rounds', label: 'Rounds' },
  { key: 'games', label: 'Games' },
  { key: 'sales', label: 'Sales' },
  { key: 'levels', label: 'Levels' },
  { key: 'trophies', label: 'Trophies' },
  { key: 'social', label: 'Social' },
  { key: 'ranking', label: 'Ranking' },
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
  { id: 'rounds_10', group: 'rounds', name: 'On A Roll', desc: 'Win 10 rounds', icon: '🎯', coins: 100, xp: 50, mulligans: 1 },
  { id: 'rounds_50', group: 'rounds', name: 'Round Master', desc: 'Win 50 rounds', icon: '💪', coins: 300, xp: 200 },
  { id: 'rounds_100', group: 'rounds', name: 'Dominator', desc: 'Win 100 rounds', icon: '⚡', coins: 600, xp: 400, mulligans: 1 },
  // Paid swaps only - the free one each game is an allowance and
  // never reaches the server to be counted.
  { id: 'swaps_5', group: 'rounds', name: 'Second Thoughts', desc: 'Use 5 swaps', icon: '🔀', coins: 100, xp: 50 },
  { id: 'swaps_25', group: 'rounds', name: 'Picky', desc: 'Use 25 swaps', icon: '♻️', coins: 300, xp: 150 },
  { id: 'swaps_100', group: 'rounds', name: 'Never Satisfied', desc: 'Use 100 swaps', icon: '🌀', coins: 800, xp: 400 },
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
  // Ranking. Pays tickets, since ranking is what decides which prompts
  // make a season and tickets are what prompts are bought with.
  { id: 'ranked_10', group: 'ranking', name: 'Tastemaker', desc: 'Rank 10 prompts', icon: '👍', coins: 50, xp: 25, tickets: 5 },
  { id: 'ranked_50', group: 'ranking', name: 'Critic', desc: 'Rank 50 prompts', icon: '🧐', coins: 150, xp: 75, tickets: 15 },
  { id: 'ranked_250', group: 'ranking', name: 'Season Shaper', desc: 'Rank 250 prompts', icon: '🗳️', coins: 500, xp: 250, tickets: 50 },

  { id: 'trophies_25', group: 'trophies', name: 'Bronze', desc: 'Earn 25 trophies', icon: '🥉', coins: 200, xp: 100, mulligans: 1 },
  { id: 'trophies_50', group: 'trophies', name: 'Silver', desc: 'Earn 50 trophies', icon: '🥈', coins: 400, xp: 200 },
  { id: 'trophies_100', group: 'trophies', name: 'Gold', desc: 'Earn 100 trophies', icon: '🥇', coins: 750, xp: 400, mulligans: 1 },
  { id: 'trophies_250', group: 'trophies', name: 'Platinum', desc: 'Earn 250 trophies', icon: '💠', coins: 1500, xp: 750 },
  { id: 'trophies_500', group: 'trophies', name: 'Diamond', desc: 'Earn 500 trophies', icon: '💎', coins: 3000, xp: 1500, mulligans: 2 },

  // Social. Both sides of a follow are worth marking, and they are not
  // the same thing: being followed is other people rating you, while
  // following is you building the feed that makes the app worth
  // opening. The following tiers stay small on purpose - it should not
  // pay to follow everyone.
  { id: 'followers_1', group: 'social', name: 'Noticed', desc: 'Get your first follower', icon: '👀', coins: 50, xp: 25 },
  { id: 'followers_10', group: 'social', name: 'Circle', desc: 'Reach 10 followers', icon: '🫂', coins: 150, xp: 75 },
  { id: 'followers_50', group: 'social', name: 'Crowd', desc: 'Reach 50 followers', icon: '📣', coins: 400, xp: 200 },
  { id: 'followers_100', group: 'social', name: 'Draw', desc: 'Reach 100 followers', icon: '🎪', coins: 800, xp: 400 },
  { id: 'followers_500', group: 'social', name: 'Household Name', desc: 'Reach 500 followers', icon: '🌍', coins: 2500, xp: 1200, trophies: 25 },
  { id: 'following_5', group: 'social', name: 'Curious', desc: 'Follow 5 people', icon: '🔭', coins: 50, xp: 25 },
  { id: 'following_25', group: 'social', name: 'Regular', desc: 'Follow 25 people', icon: '🧭', coins: 150, xp: 75 },
  { id: 'mutual_10', group: 'social', name: 'Mutuals', desc: 'Have 10 people you follow follow you back', icon: '🤝', coins: 300, xp: 150 },
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

  /**
   * checkAndAward - award anything newly earned.
   *
   * `userId` and `stats` are ignored. They used to BE the check: each
   * caller assembled its own stats object and this paid out against
   * whatever arrived, onto whatever account was named. The server
   * derives both now, from the caller's own token. The arguments stay
   * in the signature because four screens pass them and removing them
   * would be a rename, not a fix.
   */
  async checkAndAward(userId, stats) {
    try {
      const { httpsCallable } = await import('firebase/functions');
      const { functions } = await import('./firebase');
      const fn = httpsCallable(functions, 'checkAchievements');
      const res = await fn({});
      return res.data?.earned || [];
    } catch (e) {
      console.error('[Achievements] Check error:', e);
      return [];
    }
  },
};

export default achievementService;
