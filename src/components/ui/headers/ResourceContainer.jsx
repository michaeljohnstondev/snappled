import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../../theme/themes';

export default function ResourceContainer({ userStats }) {
  return (
    <View style={styles.statsRow}>
      <View style={styles.statItem}>
        <Ionicons name="diamond" size={16} color={theme.colors.vibeYellow} />
        <Text style={styles.statText}>{userStats.coins.toLocaleString()}</Text>
      </View>
      
      <View style={styles.statItem}>
        <Ionicons name="trophy" size={16} color={theme.colors.vibeOrange} />
        <Text style={styles.statText}>{userStats.trophies}</Text>
      </View>
      
      <View style={styles.statItem}>
        <Ionicons name="star" size={16} color={theme.colors.vibeBlue} />
        <Text style={styles.statText}>Lvl {userStats.level}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  statsRow: {
    flexDirection: 'row',
    gap: 16,
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
  },
  statText: {
    color: theme.colors.textPrimary,
    fontSize: 12,
    fontWeight: theme.fontWeights.semiBold,
  },
});