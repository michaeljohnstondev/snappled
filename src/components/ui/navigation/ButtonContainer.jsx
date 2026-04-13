import React from "react";
import { View, StyleSheet } from "react-native";
import theme from "../../../theme/themes";

/**
 * ButtonContainer: Full-width nav bar with filled segments
 * Usage: <ButtonContainer>{buttons}</ButtonContainer>
 */
export default function ButtonContainer({ children, style, visible = true }) {
  if (!visible) return null;

  return (
    <View style={[styles.container, style]}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 64,
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
});
