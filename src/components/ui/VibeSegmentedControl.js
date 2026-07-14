import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import theme from '../../theme/themes';

const VibeSegmentedControl = ({ options, selectedValue, onSelect, style }) => {
  return (
    <View style={[styles.container, style]}>
      {options.map((option, index) => (
        <Pressable
          key={option.value}
          style={({ pressed }) => [
            styles.segment,
            index === 0 && styles.firstSegment,
            index === options.length - 1 && styles.lastSegment,
            selectedValue === option.value && styles.selectedSegment,
            { opacity: pressed ? 0.7 : 1 },
          ]}
          onPress={() => onSelect(option.value)}
        >
          <Text
            style={[
              styles.segmentText,
              selectedValue === option.value && styles.selectedSegmentText,
            ]}
            numberOfLines={1}
            adjustsFontSizeToFit
            minimumFontScale={0.75}
          >
            {option.icon && `${option.icon} `}
            {option.label}
          </Text>
        </Pressable>
      ))}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: 'transparent',
    borderRadius: theme.sizes.borderRadius,
    gap: 2,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    paddingHorizontal: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.sizes.borderRadius,
    borderWidth: 1,
    borderColor: theme.colors.inputBorder,
    backgroundColor: theme.colors.background,
    minWidth: 60,
  },
  firstSegment: {
    // No longer needed since we're using gap instead of connected segments
  },
  lastSegment: {
    // No longer needed since we're using gap instead of connected segments
  },
  selectedSegment: {
    borderWidth: 3,
    borderColor: theme.colors.vibeGreen,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  segmentText: {
    fontSize: 15,
    fontWeight: '500',
    color: theme.colors.textSecondary,
    fontFamily: theme.fonts.main,
  },
  selectedSegmentText: {
    color: theme.colors.textPrimary,
    fontWeight: '600',
  },
});

export default VibeSegmentedControl;
