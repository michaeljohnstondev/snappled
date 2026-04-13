// Exponential leveling system
// Level 100 is extremely hard to reach (~10,000+ game wins)
// XP needed for each level = floor(50 * level^1.5)

export const levelService = {
  // XP required to go from level N-1 to level N
  // Starts at 100, grows ~1.15x per level
  xpForLevel(level) {
    if (level <= 1) return 0;
    return Math.floor(100 * Math.pow(1.15, level - 2));
  },

  // Total XP required to reach a given level
  totalXpForLevel(level) {
    let total = 0;
    for (let i = 2; i <= level; i++) {
      total += this.xpForLevel(i);
    }
    return total;
  },

  // Get current level from total XP
  getLevelFromXP(totalXP) {
    let level = 1;
    let xpUsed = 0;
    while (true) {
      const needed = this.xpForLevel(level + 1);
      if (xpUsed + needed > totalXP) break;
      xpUsed += needed;
      level++;
    }
    return level;
  },

  // Get progress to next level (0-1)
  getProgress(totalXP) {
    const level = this.getLevelFromXP(totalXP);
    const currentLevelTotal = this.totalXpForLevel(level);
    const nextLevelXP = this.xpForLevel(level + 1);
    const progressXP = totalXP - currentLevelTotal;
    return nextLevelXP > 0 ? progressXP / nextLevelXP : 0;
  },

  // Get full level info
  getLevelInfo(totalXP) {
    const level = this.getLevelFromXP(totalXP);
    const currentLevelTotal = this.totalXpForLevel(level);
    const nextLevelXP = this.xpForLevel(level + 1);
    const progressXP = totalXP - currentLevelTotal;

    return {
      level,
      totalXP,
      progressXP,
      nextLevelXP,
      progress: nextLevelXP > 0 ? progressXP / nextLevelXP : 1,
      color: this.getLevelColor(level),
    };
  },

  // Visual level color progression
  getLevelColor(level) {
    if (level >= 76) return '#FFD700'; // Gold glow
    if (level >= 51) return '#8B00FF'; // Purple
    if (level >= 26) return '#00C6FF'; // Cyan
    if (level >= 11) return '#00FF41'; // Green
    return '#778DA9'; // Gray (starter)
  },

  // Calculate XP earned from a game
  calculateGameXP(placement, opponentLevels = [], myLevel = 1) {
    const baseXP = [100, 80, 60, 40, 20, 10];
    let xp = baseXP[placement - 1] || 5;

    // Opponent bonus: beating higher level players = more XP
    if (opponentLevels.length > 0) {
      const avgOpponent = opponentLevels.reduce((a, b) => a + b, 0) / opponentLevels.length;
      if (avgOpponent > myLevel) {
        const ratio = Math.min(avgOpponent / myLevel, 2);
        xp = Math.floor(xp * ratio);
      }
    }

    return xp;
  },

  // Trophies from ranked games only
  calculateTrophies(placement) {
    const trophies = [5, 3, 1, 0, -1, -2];
    return trophies[placement - 1] || 0;
  },

  // Creator royalty — flat 70% for everyone
  getCreatorRoyalty() {
    return 0.70;
  },
};

export default levelService;
