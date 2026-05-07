import React, { useEffect, useRef } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { levelService } from "../../../services/levelService";
import TickingNumber from "../TickingNumber";
import theme from "../../../theme/themes";

// Resource bar at the top of the app. Each numeric stat ticks rather than
// snaps when its value changes. The trophy slot also flashes white when the
// trophy count goes DOWN (e.g. ranked loss) so the user gets a quick
// notification without going as loud as red.
export default function ResourceContainer({ userStats, onTokenPress }) {
  const xp = userStats.xp || 0;
  const levelInfo = levelService.getLevelInfo(xp);
  const levelColor = levelService.getLevelColor(levelInfo.level);

  return (
    <View style={styles.statsRow}>
      <Pressable style={styles.statItem} onPress={onTokenPress}>
        <Text style={styles.iconText}>🎫</Text>
        <TickingNumber value={userStats.tokens || 0} style={styles.statText} />
      </Pressable>

      <View style={styles.statItem}>
        <Text style={styles.iconText}>💰</Text>
        <TickingNumber
          value={userStats.coins || 0}
          format={(n) => n.toLocaleString()}
          style={styles.statText}
        />
      </View>

      <FlashOnDecreaseSlot value={userStats.trophies || 0}>
        <Text style={styles.iconText}>🏆</Text>
        <TickingNumber value={userStats.trophies || 0} style={styles.statText} />
      </FlashOnDecreaseSlot>

      <View style={styles.levelItem}>
        <View style={styles.levelBg}>
          <View
            style={[
              styles.levelFill,
              {
                width: `${Math.min(levelInfo.progress * 100, 100)}%`,
                backgroundColor: levelColor,
              },
            ]}
          />
        </View>
        <Text style={styles.levelText}>Lvl {levelInfo.level}</Text>
      </View>
    </View>
  );
}

// Wraps a stat slot so its background flashes white briefly when `value` goes
// down. Used for trophy losses — soft notification, not punitive red.
function FlashOnDecreaseSlot({ value, children }) {
  const flash = useRef(new Animated.Value(0)).current;
  const lastRef = useRef(value);
  useEffect(() => {
    if (value < lastRef.current) {
      Animated.sequence([
        Animated.timing(flash, { toValue: 1, duration: 180, useNativeDriver: false }),
        Animated.timing(flash, { toValue: 0, duration: 600, useNativeDriver: false }),
      ]).start();
    }
    lastRef.current = value;
  }, [value]);

  const bg = flash.interpolate({
    inputRange: [0, 1],
    outputRange: ['rgba(255, 255, 255, 0.1)', 'rgba(255, 255, 255, 0.55)'],
  });

  return (
    <Animated.View style={[styles.statItem, { backgroundColor: bg }]}>
      {children}
    </Animated.View>
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
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
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
  tokenButton: {},
  levelItem: {
    position: 'relative',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
    minWidth: 55,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  levelBg: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 12,
  },
  levelFill: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    borderRadius: 4,
    opacity: 0.65,
  },
  levelText: {
    fontSize: 12,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
    color: theme.colors.textPrimary,
  },
});
