import React from 'react';
import { View, StyleSheet } from 'react-native';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

export default function VibeScreen({ children }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return <View style={styles.container}>{children}</View>;
}

const makeStyles = (t) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
});
