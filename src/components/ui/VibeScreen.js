import React from 'react';
import { View, StyleSheet } from 'react-native';
import theme from '../../theme/themes';

export default function VibeScreen({ children }) {
  return <View style={styles.container}>{children}</View>;
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme.colors.background,
  },
});
