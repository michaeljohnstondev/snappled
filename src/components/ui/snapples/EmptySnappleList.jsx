import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import VibeButton from '../VibeButton';
import theme from '../../../theme/themes';
import { useTheme, useThemedStyles } from '../../../theme/ThemeContext';

export default function EmptySnappleList({ onCreateSnapple }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.container}>
      <Ionicons name="videocam-off" size={48} color={t.colors.textSecondary} />
      <Text style={styles.title}>No Snapples Yet</Text>
      <Text style={styles.subtitle}>
        Be the first to create a Snapple for this prompt!
      </Text>
      
      <VibeButton
        label="Create Snapple"
        onPress={onCreateSnapple}
        style={styles.createButton}
      />
    </View>
  );
}

const makeStyles = (t) => ({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 60,
    paddingHorizontal: 40,
    paddingBottom: 120, // Account for nav bar space to center properly
  },
  title: {
    color: t.colors.textPrimary,
    fontSize: 18,
    fontWeight: theme.fontWeights.semiBold,
    textAlign: 'center',
    marginTop: 16,
    marginBottom: 8,
  },
  subtitle: {
    color: t.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  createButton: {
    marginTop: 24,
  },
});