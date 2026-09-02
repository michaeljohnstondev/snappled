import React from "react";
import { View, StyleSheet } from "react-native";
import theme from "../../../theme/themes";
import { useTheme, useThemedStyles } from '../../../theme/ThemeContext';

/**
 * ButtonContainer: Full-width nav bar with filled segments
 * Usage: <ButtonContainer>{buttons}</ButtonContainer>
 */
export default function ButtonContainer({ children, style, visible = true }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  if (!visible) return null;

  return (
    <View style={[styles.container, style]}>
      {children}
    </View>
  );
}

const makeStyles = (t) => ({
  container: {
    height: 64,
    flexDirection: 'row',
    backgroundColor: t.colors.background,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'visible',
  },
});
