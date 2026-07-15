// Resource bar at the top of the app. Each stat pill is press-and-
// hold: tap-and-hold on a resource to see a brief popup explaining
// what it is / how to get it / what it's for. Tickets stat retains
// its tap-to-open-token-modal behavior; the popup fires on press-in
// so a real tap still triggers the modal on press-out (short holds
// show the tooltip and dismiss without opening).
//
// The level pill uses a shades-of-blue LinearGradient behind the
// XP fill so the resource bar feels alive without the extreme
// purple/pink energy of the CTA gradients.

import React, { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { levelService } from "../../../services/levelService";
import TickingNumber from "../TickingNumber";
import ResourceInfoPopup from "./ResourceInfoPopup";
import theme from "../../../theme/themes";

// Copy for each resource popup. Keep bullets short — this is a
// glance-and-release tooltip, not a manual.
const RESOURCE_INFO = {
  tickets: {
    title: 'Tickets',
    bullets: [
      'Used to create your own prompts',
      'Earn from the store, leveling up, achievements, and winning games',
    ],
  },
  coins: {
    title: 'Coins',
    bullets: [
      'Used to buy snapples and items',
      'Earn from leveling up, achievements, winning games, and selling snapples',
    ],
  },
  trophies: {
    title: 'Trophies',
    bullets: [
      'Your competitive rank across ranked games',
      'Earn trophies by winning ranked games',
    ],
  },
  // level's bullets get an inline XP-progress line prepended at render.
  level: {
    title: 'Level',
    bullets: [
      'Earn XP by creating snapples and playing games',
      'Leveling up unlocks coin, ticket, and trophy rewards',
    ],
  },
};

export default function ResourceContainer({ userStats, onTokenPress }) {
  const xp = userStats.xp || 0;
  const levelInfo = levelService.getLevelInfo(xp);
  const [popup, setPopup] = useState(null);

  const openPopup = (key) => setPopup(key);
  const closePopup = () => setPopup(null);

  // Level popup bullets get the live XP progress prepended so the
  // player sees exactly how far they are from the next level.
  const popupContent = popup === 'level'
    ? {
        title: `Level ${levelInfo.level}`,
        bullets: [
          `${levelInfo.progressXP} / ${levelInfo.nextLevelXP} XP to Level ${levelInfo.level + 1}`,
          ...RESOURCE_INFO.level.bullets,
        ],
      }
    : popup
      ? RESOURCE_INFO[popup]
      : null;

  return (
    <View style={styles.statsRow}>
      <Pressable
        style={styles.statItem}
        onPress={onTokenPress}
        onPressIn={() => openPopup('tickets')}
        onPressOut={closePopup}
      >
        <Text style={styles.iconText}>🎫</Text>
        <TickingNumber value={userStats.tokens || 0} style={styles.statText} />
      </Pressable>

      <Pressable
        style={styles.statItem}
        onPressIn={() => openPopup('coins')}
        onPressOut={closePopup}
      >
        <Text style={styles.iconText}>💰</Text>
        <TickingNumber
          value={userStats.coins || 0}
          format={(n) => n.toLocaleString()}
          style={styles.statText}
        />
      </Pressable>

      <FlashOnDecreaseSlot value={userStats.trophies || 0}>
        <Pressable
          style={styles.trophyPressable}
          onPressIn={() => openPopup('trophies')}
          onPressOut={closePopup}
        >
          <Text style={styles.iconText}>🏆</Text>
          <TickingNumber value={userStats.trophies || 0} style={styles.statText} />
        </Pressable>
      </FlashOnDecreaseSlot>

      <Pressable
        style={styles.levelItem}
        onPressIn={() => openPopup('level')}
        onPressOut={closePopup}
      >
        {/* Base gradient (two shades of blue) — sits under the fill
            so even 0% progress reads as "alive" chrome, not a dead
            grey pill. */}
        <LinearGradient
          colors={['rgba(0, 100, 160, 0.35)', 'rgba(0, 198, 255, 0.28)']}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={StyleSheet.absoluteFill}
        />
        {/* XP progress fill — brighter gradient overlay that grows
            left-to-right as XP accumulates. Same blue family but
            more saturated so the fill line is unmissable. */}
        <View style={[styles.levelFillWrap, { width: `${Math.min(levelInfo.progress * 100, 100)}%` }]}>
          <LinearGradient
            colors={['rgba(0, 198, 255, 0.9)', 'rgba(90, 230, 255, 0.9)']}
            start={{ x: 0, y: 0.5 }}
            end={{ x: 1, y: 0.5 }}
            style={StyleSheet.absoluteFill}
          />
        </View>
        <Text style={styles.levelText}>Lvl {levelInfo.level}</Text>
      </Pressable>

      <ResourceInfoPopup
        visible={!!popupContent}
        title={popupContent?.title}
        bullets={popupContent?.bullets}
      />
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
    outputRange: ['rgba(0, 198, 255, 0.12)', 'rgba(255, 255, 255, 0.55)'],
  });

  return (
    <Animated.View style={[styles.statItem, { backgroundColor: bg, padding: 0 }]}>
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
    backgroundColor: "rgba(0, 198, 255, 0.12)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0, 198, 255, 0.35)",
  },
  // Pressable inside FlashOnDecreaseSlot's Animated.View — takes on
  // the parent's padding so the flash bg still covers the whole pill.
  trophyPressable: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "rgba(0, 198, 255, 0.35)",
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
  // Level pill — same footprint as the other resources but with a
  // gradient base + brighter gradient XP fill. Border retained so it
  // reads as part of the same resource row.
  levelItem: {
    position: 'relative',
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    overflow: 'hidden',
    minWidth: 60,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(0, 198, 255, 0.6)',
  },
  levelFillWrap: {
    position: 'absolute',
    top: 0,
    left: 0,
    bottom: 0,
    overflow: 'hidden',
    borderRadius: 12,
  },
  levelText: {
    fontSize: 12,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
    color: '#fff',
    // Text shadow so the label reads on both the dim base and the
    // brighter fill without a color swap mid-pill.
    textShadowColor: 'rgba(0,0,0,0.6)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
