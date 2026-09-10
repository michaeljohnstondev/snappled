// Resource bar at the top of the app. TAP a stat pill for a popup
// explaining what it is and where it comes from; tap anywhere to
// dismiss. It was press-and-hold, released to dismiss, which nothing on
// screen suggested and which could not carry an action - your finger
// being down is the only reason the popup exists, so there is nothing
// free to press. Latched, it can offer the store for the thing you just
// found you were out of.
//
// The level pill uses a shades-of-blue LinearGradient behind the
// XP fill so the resource bar feels alive without the extreme
// purple/pink energy of the CTA gradients.

import React, { useEffect, useRef, useState } from "react";
import CurrencyIcon from '../CurrencyIcon';
import { View, Text, StyleSheet, Pressable, Animated } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { useNavigation } from "@react-navigation/native";
import { levelService } from "../../../services/levelService";
import TickingNumber from "../TickingNumber";
import ResourceInfoPopup from "./ResourceInfoPopup";
import theme from "../../../theme/themes";

// Copy for each resource popup. Keep bullets short - this is a glance,
// not a manual.
//
// Checked against what the code actually pays out, because most of this
// was wrong. Every "leveling up" claim was false: levelService is pure
// XP maths with no payout in it at all, so levels currently buy you the
// number and nothing else. Achievements pay coins, XP, trophies and
// mulligans - never tickets. And trophies come from finishing a game,
// not from levelling.
const RESOURCE_INFO = {
  tickets: {
    title: 'Tickets',
    bullets: [
      'Used to create your own prompts',
      'Earn one when someone keeps a snapple you made',
      'Or buy them in the store',
    ],
  },
  coins: {
    title: 'Coins',
    bullets: [
      'Used to buy snapples and items',
      'Earn from placing well in games, achievements, and selling snapples',
    ],
  },
  trophies: {
    title: 'Trophies',
    bullets: [
      'Your competitive rank',
      // The payout table is [5, 3, 1, 0, -1, -2] by placement, so the
      // bottom two lose them. Worth saying: a rank you can only gain is
      // not a rank.
      'Won by placing in the top three - the bottom two lose them',
    ],
  },
  // level's bullets get an inline XP-progress line prepended at render.
  level: {
    title: 'Level',
    bullets: [
      'Earn XP by creating snapples and playing games',
      'Shows how much you have played',
    ],
  },
};

export default function ResourceContainer({ userStats }) {
  const navigation = useNavigation();
  const xp = userStats.xp || 0;
  const levelInfo = levelService.getLevelInfo(xp);
  const [popup, setPopup] = useState(null);

  // Toggle: tapping the pill that is already open closes it, so the
  // pill you pressed is never a dead press.
  const togglePopup = (key) => setPopup(prev => (prev === key ? null : key));
  const closePopup = () => setPopup(null);

  // Only the two you can actually buy. A trophy has no store shelf and
  // a level is not a thing you purchase, so offering a button there
  // would send someone to look for something that isn't sold.
  const goToStore = (section) => () => navigation.navigate('Store', { section });
  const popupAction = popup === 'tickets'
    ? { label: 'Get Tickets', onPress: goToStore('tickets') }
    : popup === 'coins'
      ? { label: 'Get Coins', onPress: goToStore('coins') }
      : null;

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
        onPress={() => togglePopup('tickets')}
      >
        {/* A touch larger than the coin and trophy either side of it,
            for the same reason as the store: a wide, short shape fits
            by width and reads smaller at an equal nominal size. */}
        <CurrencyIcon name="tickets" size={25} />
        <TickingNumber value={userStats.tokens || 0} style={styles.statText} />
      </Pressable>

      <Pressable
        style={styles.statItem}
        onPress={() => togglePopup('coins')}
      >
        <CurrencyIcon name="coins" size={24} />
        <TickingNumber
          value={userStats.coins || 0}
          format={(n) => n.toLocaleString()}
          style={styles.statText}
        />
      </Pressable>

      <Pressable
        style={styles.statItem}
        onPress={() => togglePopup('trophies')}
      >
        <FlashOverlay value={userStats.trophies || 0} />
        <CurrencyIcon name="trophies" size={24} />
        <TickingNumber value={userStats.trophies || 0} style={styles.statText} />
      </Pressable>

      <Pressable
        style={styles.levelItem}
        onPress={() => togglePopup('level')}
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
        action={popupAction}
        onClose={closePopup}
      />
    </View>
  );
}

// FlashOverlay — absolute-positioned Animated.View that briefly
// flashes white when `value` drops. Used for trophy losses — soft
// notification without turning the whole pill red. Rendered INSIDE
// the trophy Pressable (as an overlay under the icon+number) so we
// don't need a second visual container.
function FlashOverlay({ value }) {
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
    outputRange: ['rgba(255, 255, 255, 0)', 'rgba(255, 255, 255, 0.55)'],
  });

  return (
    <Animated.View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: bg, borderRadius: 12 }]}
    />
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
