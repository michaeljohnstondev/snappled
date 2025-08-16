import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ResourceContainer from './ResourceContainer';
import theme from '../../../theme/themes';

export default function HomeHeader({ userStats }) {
  return (
    <View style={styles.header}>
      <View style={styles.userInfo}>
        <Text style={styles.usernameText}>{userStats.username}</Text>
      </View>
      
      <ResourceContainer userStats={userStats} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.1)',
  },
  userInfo: {
    flex: 1,
  },
  usernameText: {
    fontSize: 20,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeights.bold,
    ...theme.shadows?.textGlow,
  },
});