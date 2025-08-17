/**
 * PromptMetrics.jsx
 * 
 * Purpose: Displays various metrics for a prompt in a structured container
 * Shows views, total votes, and report count with icons and labels
 */

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../theme/themes';

/**
 * Component to display prompt metrics in a card layout
 * @param {Object} props - Component props
 * @param {number} props.views - Number of views
 * @param {number} props.likeCount - Number of likes
 * @param {number} props.dislikeCount - Number of dislikes
 * @param {number} props.reportCount - Number of reports
 * @param {number} props.followerCount - Number of followers for the creator
 */
export default function PromptMetrics({ views, likeCount, dislikeCount, reportCount, followerCount }) {
  /**
   * Formats large numbers with K/M suffixes
   * @param {number} count - The number to format
   * @returns {string} Formatted count string
   */
  const formatCount = (count) => {
    if (count >= 1000000) return `${(count / 1000000).toFixed(1)}M`;
    if (count >= 1000) return `${(count / 1000).toFixed(1)}K`;
    return count?.toString() || '0';
  };

  return (
    <View style={styles.container}>
      <View style={styles.metricsCard}>
        <Text style={styles.header}>Metrics</Text>
        
        <View style={styles.metricItem}>
          <Text style={styles.metricText}>{formatCount(views)}</Text>
          <Text style={styles.metricLabel}>views</Text>
        </View>
        
        <View style={styles.metricItem}>
          <Text style={styles.metricText}>{formatCount(likeCount + dislikeCount)}</Text>
          <Text style={styles.metricLabel}>total votes</Text>
        </View>
        
        <View style={styles.metricItem}>
          <Text style={styles.metricText}>{formatCount(reportCount)}</Text>
          <Text style={styles.metricLabel}>reports</Text>
        </View>
        
        <View style={styles.metricItem}>
          <Text style={styles.metricText}>{formatCount(followerCount || 0)}</Text>
          <Text style={styles.metricLabel}>followers</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    paddingLeft: 8,
  },
  metricsCard: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    gap: 8,
    maxWidth: 140,
  },
  header: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: theme.fontWeights.bold,
    marginBottom: 4,
    textAlign: 'center',
  },
  metricItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  metricText: {
    color: theme.colors.textPrimary,
    fontSize: 14,
    fontWeight: theme.fontWeights.bold,
  },
  metricLabel: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    fontWeight: theme.fontWeights.medium,
  },
});