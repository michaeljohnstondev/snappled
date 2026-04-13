import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { levelService } from "../../../services/levelService";
import theme from "../../../theme/themes";

export default function ResourceContainer({ userStats, onTokenPress }) {
  const xp = userStats.xp || 0;
  const levelInfo = levelService.getLevelInfo(xp);
  const levelColor = levelService.getLevelColor(levelInfo.level);

  return (
    <View style={styles.statsRow}>
      <Pressable
        style={[styles.statItem, styles.tokenButton]}
        onPress={onTokenPress}
        disabled={!userStats.tokens || userStats.tokens <= 0}
      >
        <Text style={styles.iconText}>🎫</Text>
        <Text style={styles.statText}>{userStats.tokens || 0}</Text>
      </Pressable>

      <View style={styles.statItem}>
        <Text style={styles.iconText}>💰</Text>
        <Text style={styles.statText}>{(userStats.coins || 0).toLocaleString()}</Text>
      </View>

      <View style={styles.statItem}>
        <Text style={styles.iconText}>🏆</Text>
        <Text style={styles.statText}>{userStats.trophies || 0}</Text>
      </View>

      <View style={styles.levelItem}>
        {/* XP progress background */}
        <View style={styles.levelBg}>
          <View style={[styles.levelFill, { width: `${Math.min(levelInfo.progress * 100, 100)}%`, backgroundColor: levelColor }]} />
        </View>
        <Text style={[styles.levelText, { color: levelColor }]}>Lvl {levelInfo.level}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  statItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(255, 255, 255, 0.05)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: theme.fontWeights.semiBold,
    textAlign: "center",
  },
  iconText: {
    fontSize: 14,
  },
  tokenButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
    transform: [{ scale: 1.05 }],
  },
  levelItem: {
    position: 'relative',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
    minWidth: 55,
    alignItems: 'center',
  },
  levelBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
  },
  levelFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 12,
    opacity: 0.3,
  },
  levelText: {
    fontSize: 12,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
  },
});
