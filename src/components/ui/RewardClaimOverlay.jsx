import React, { useEffect, useRef, useState } from 'react';
import {
  View, Text, StyleSheet, Pressable, Animated, Dimensions, Modal,
} from 'react-native';
import theme from '../../theme/themes';

const { width: screenWidth, height: screenHeight } = Dimensions.get('window');

// Approximate X positions of each slot in the resource bar (% of screen width).
// Bar layout: profile button on left (~76dp), then 4 stat slots space-around
// across the rest. Token ≈ 0.30, coin ≈ 0.50, trophy ≈ 0.70, level ≈ 0.88.
const SLOT_X = {
  tokens: 0.30,
  tickets: 0.30,
  coins: 0.50,
  trophies: 0.70,
  xp: 0.88,
};

const ICON = {
  coins: '💰',
  tokens: '🎫',
  tickets: '🎫',
  trophies: '🏆',
  xp: '✨',
};

// Renders the modal (when mode='modal') and/or the flying icons. Calls onDone
// once the entire animation completes (so the provider can resolve and pop the
// next item off the queue).
export default function RewardClaimOverlay({ mode, rewards, title, subtitle, commit, onDone }) {
  const cardOpacity = useRef(new Animated.Value(0)).current;
  const [phase, setPhase] = useState(mode === 'modal' ? 'modal' : 'flying');

  // Build flyable items — coins, tickets, trophies fly. XP doesn't fly,
  // it just ticks up on the resource bar (which TickingNumber handles when
  // userCurrency updates). Lost trophies (negative) also don't fly.
  const flyables = [];
  if (rewards?.coins && rewards.coins > 0) flyables.push({ type: 'coins', amount: rewards.coins });
  if (rewards?.tickets && rewards.tickets > 0) flyables.push({ type: 'tickets', amount: rewards.tickets });
  if (rewards?.tokens && rewards.tokens > 0) flyables.push({ type: 'tokens', amount: rewards.tokens });
  if (rewards?.trophies && rewards.trophies > 0) flyables.push({ type: 'trophies', amount: rewards.trophies });

  useEffect(() => {
    if (mode === 'modal') {
      Animated.timing(cardOpacity, { toValue: 1, duration: 280, useNativeDriver: true }).start();
    }
  }, []);

  // Auto-start fly when in fly mode (no modal step).
  useEffect(() => {
    if (mode === 'fly') {
      // Brief delay so caller's setState batching settles before animation.
      const t = setTimeout(() => startFly(), 50);
      return () => clearTimeout(t);
    }
  }, []);

  const handleDismissModal = () => {
    if (phase !== 'modal') return;
    Animated.timing(cardOpacity, { toValue: 0, duration: 220, useNativeDriver: true }).start(() => {
      startFly();
    });
  };

  const startFly = () => {
    setPhase('flying');
    // No flyables → just commit and done. Still tick the bar.
    if (flyables.length === 0) {
      commit?.();
      setTimeout(() => onDone?.(), 600);
      return;
    }
    // Fire commit at the apex (~50% through the fly) so resource bar values
    // tick up roughly as the icons land.
    setTimeout(() => commit?.(), 350);
    // Done callback after the fly + a small buffer for the bar tick.
    setTimeout(() => onDone?.(), 1200);
  };

  return (
    <Modal visible transparent animationType="none" statusBarTranslucent>
      <Pressable
        style={[styles.fullscreen, phase === 'flying' && styles.fullscreenTransparent]}
        onPress={phase === 'modal' ? handleDismissModal : undefined}
      >
        {phase === 'modal' && (
          <Animated.View style={[styles.modalCard, { opacity: cardOpacity }]}>
            {title && <Text style={styles.modalTitle}>{title}</Text>}
            {subtitle && <Text style={styles.modalSubtitle}>{subtitle}</Text>}
            <View style={styles.modalRewards}>
              {rewards?.coins != null && rewards.coins !== 0 && (
                <RewardLine icon={ICON.coins} amount={rewards.coins} />
              )}
              {rewards?.trophies != null && rewards.trophies !== 0 && (
                <RewardLine icon={ICON.trophies} amount={rewards.trophies} />
              )}
              {rewards?.tickets != null && rewards.tickets !== 0 && (
                <RewardLine icon={ICON.tickets} amount={rewards.tickets} />
              )}
              {rewards?.xp != null && rewards.xp !== 0 && (
                <RewardLine icon={ICON.xp} amount={rewards.xp} suffix=" XP" />
              )}
            </View>
            <Text style={styles.modalHint}>Tap anywhere to claim</Text>
          </Animated.View>
        )}

        {phase === 'flying' && flyables.map((f, i) => (
          <FlyingIcon
            key={`${f.type}-${i}`}
            type={f.type}
            amount={f.amount}
            indexInRow={i}
            total={flyables.length}
          />
        ))}
      </Pressable>
    </Modal>
  );
}

function RewardLine({ icon, amount, suffix = '' }) {
  const isLoss = amount < 0;
  return (
    <View style={styles.rewardLine}>
      <Text style={styles.rewardIcon}>{icon}</Text>
      <Text style={[styles.rewardAmount, isLoss && styles.rewardAmountLoss]}>
        {amount > 0 ? '+' : ''}{amount}{suffix}
      </Text>
    </View>
  );
}

// Single flying icon — arcs from screen center up to its target slot in the
// resource bar.
function FlyingIcon({ type, amount, indexInRow, total }) {
  const startX = screenWidth * (0.5 + (indexInRow - (total - 1) / 2) * 0.08);
  const startY = screenHeight * 0.5;
  const targetX = screenWidth * (SLOT_X[type] || 0.5);
  const targetY = 60; // approximate Y of the resource bar slots

  const translateX = useRef(new Animated.Value(startX)).current;
  const translateY = useRef(new Animated.Value(startY)).current;
  const opacity = useRef(new Animated.Value(0)).current;
  const scale = useRef(new Animated.Value(0.6)).current;

  useEffect(() => {
    Animated.sequence([
      Animated.parallel([
        Animated.timing(opacity, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scale, { toValue: 1, tension: 70, friction: 8, useNativeDriver: true }),
      ]),
      Animated.parallel([
        Animated.timing(translateX, { toValue: targetX, duration: 700, useNativeDriver: true }),
        Animated.timing(translateY, { toValue: targetY, duration: 700, useNativeDriver: true }),
        Animated.timing(scale, { toValue: 0.5, duration: 700, useNativeDriver: true }),
      ]),
      Animated.timing(opacity, { toValue: 0, duration: 150, useNativeDriver: true }),
    ]).start();
  }, []);

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        styles.flyIcon,
        {
          opacity,
          transform: [
            { translateX: Animated.subtract(translateX, 24) },
            { translateY: Animated.subtract(translateY, 24) },
            { scale },
          ],
        },
      ]}
    >
      <Text style={styles.flyEmoji}>{ICON[type]}</Text>
      <Text style={styles.flyAmount}>+{amount}</Text>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fullscreen: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fullscreenTransparent: {
    backgroundColor: 'transparent',
  },
  modalCard: {
    width: '78%',
    maxWidth: 360,
    paddingVertical: 28,
    paddingHorizontal: 24,
    borderRadius: 20,
    backgroundColor: 'rgba(10, 16, 32, 0.95)',
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
    alignItems: 'center',
  },
  modalTitle: {
    color: theme.colors.vibeBlue,
    fontSize: 22,
    fontWeight: 'bold',
    letterSpacing: 1,
    textAlign: 'center',
  },
  modalSubtitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    marginTop: 4,
    textAlign: 'center',
  },
  modalRewards: {
    marginTop: 18,
    gap: 8,
    alignSelf: 'stretch',
  },
  rewardLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  rewardIcon: {
    fontSize: 24,
  },
  rewardAmount: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  rewardAmountLoss: {
    color: 'rgba(255,255,255,0.85)',
  },
  modalHint: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    marginTop: 18,
    letterSpacing: 1,
  },
  flyIcon: {
    position: 'absolute',
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  flyEmoji: {
    fontSize: 28,
  },
  flyAmount: {
    color: 'white',
    fontSize: 11,
    fontWeight: 'bold',
    marginTop: -2,
  },
});
