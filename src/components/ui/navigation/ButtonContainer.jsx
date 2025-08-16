import React from "react";
import { View, StyleSheet } from "react-native";
import { LinearGradient } from 'expo-linear-gradient';
import theme from "../../../theme/themes";

/**
 * ButtonContainer: Container for groups of buttons with consistent spacing
 * Usage: <ButtonContainer>{buttons}</ButtonContainer>
 */
export default function ButtonContainer({ children, style, visible = true }) {
  if (!visible) return null;
  
  return (
    <View style={[styles.container, style]}>
      <LinearGradient
        colors={['#120330', '#0B1125', '#000000']}
        style={styles.gradient}
      >
        {children}
      </LinearGradient>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  gradient: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: 10,
  },
});
