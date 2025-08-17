import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import theme from "../../../theme/themes";

export default function ResourceContainer({ userStats, onTokenPress }) {
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
        <Text style={styles.statText}>{userStats.coins.toLocaleString()}</Text>
      </View>

      <View style={styles.statItem}>
        <Text style={styles.iconText}>🏆</Text>
        <Text style={styles.statText}>{userStats.trophies}</Text>
      </View>

      <View style={styles.statItem}>
        <Text style={styles.iconText}>⭐</Text>
        <Text style={styles.statText}>Lvl {userStats.level}</Text>
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
});
