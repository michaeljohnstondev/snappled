import React, { useEffect, useRef } from 'react';
import { View, Text, StyleSheet, Pressable, Animated } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../theme/themes';

const TOAST_TYPES = {
  level_up: { icon: 'arrow-up-circle', color: '#00C6FF', label: 'LEVEL UP!' },
  achievement: { icon: 'trophy', color: '#FFD700', label: 'ACHIEVEMENT!' },
  reward: { icon: 'gift', color: '#00FF41', label: 'REWARD!' },
  streak: { icon: 'flame', color: '#FF6B00', label: 'WIN STREAK!' },
  rank_up: { icon: 'shield-checkmark', color: '#8B00FF', label: 'RANK UP!' },
};

export default function RewardToast({ visible, type = 'reward', title, subtitle, onDismiss, autoDismiss = 4000 }) {
  const slideAnim = useRef(new Animated.Value(-150)).current;
  const opacityAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;

  const config = TOAST_TYPES[type] || TOAST_TYPES.reward;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.spring(slideAnim, { toValue: 0, tension: 80, friction: 10, useNativeDriver: true }),
        Animated.timing(opacityAnim, { toValue: 1, duration: 200, useNativeDriver: true }),
        Animated.spring(scaleAnim, { toValue: 1, tension: 80, friction: 8, useNativeDriver: true }),
      ]).start();

      if (autoDismiss && onDismiss) {
        const timer = setTimeout(() => dismiss(), autoDismiss);
        return () => clearTimeout(timer);
      }
    }
  }, [visible]);

  const dismiss = () => {
    Animated.parallel([
      Animated.timing(slideAnim, { toValue: -150, duration: 250, useNativeDriver: true }),
      Animated.timing(opacityAnim, { toValue: 0, duration: 250, useNativeDriver: true }),
    ]).start(() => onDismiss?.());
  };

  if (!visible) return null;

  return (
    <Animated.View
      style={[
        styles.container,
        {
          transform: [{ translateY: slideAnim }, { scale: scaleAnim }],
          opacity: opacityAnim,
        },
      ]}
    >
      <Pressable style={[styles.toast, { borderColor: config.color }]} onPress={dismiss}>
        <View style={[styles.iconCircle, { backgroundColor: config.color + '20' }]}>
          <Ionicons name={config.icon} size={28} color={config.color} />
        </View>
        <View style={styles.textArea}>
          <Text style={[styles.label, { color: config.color }]}>{config.label}</Text>
          <Text style={styles.title}>{title}</Text>
          {subtitle && <Text style={styles.subtitle}>{subtitle}</Text>}
        </View>
        <Text style={styles.tapHint}>TAP</Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 50,
    left: 16,
    right: 16,
    zIndex: 9999,
  },
  toast: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(10,15,30,0.95)',
    borderRadius: 16,
    borderWidth: 2,
    padding: 14,
    gap: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },
  iconCircle: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
  textArea: {
    flex: 1,
  },
  label: {
    fontSize: 11,
    fontWeight: theme.fontWeights.bold,
    letterSpacing: 1,
  },
  title: {
    fontSize: 16,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginTop: 2,
  },
  subtitle: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    marginTop: 2,
  },
  tapHint: {
    fontSize: 9,
    color: 'rgba(255,255,255,0.3)',
    fontWeight: theme.fontWeights.bold,
    letterSpacing: 1,
  },
});
