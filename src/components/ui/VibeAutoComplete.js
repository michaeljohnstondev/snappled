import React from 'react';
import { View, Text, StyleSheet, Pressable } from 'react-native';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

const VibeAutoComplete = React.memo(
  ({ suggestions, onSelect, visible, showCount = false }) => {
    const styles = useThemedStyles(makeStyles);
    if (!visible || !suggestions.length) return null;

    return (
      <View style={styles.autocompleteContainer}>
        {suggestions.map((item, index) => {
          // Handle both string and object suggestions
          const text = typeof item === 'string' ? item : item.text;
          const count = typeof item === 'object' ? item.count : null;

          return (
            <Pressable
              key={`${text}-${index}`}
              style={({ pressed }) => [
                styles.suggestionItem,
                { opacity: pressed ? 0.7 : 1 },
              ]}
              onPress={() => onSelect(text)}
            >
              <View style={styles.suggestionContent}>
                <Text style={styles.suggestionText} numberOfLines={1}>
                  {text}
                </Text>
                {showCount && count && typeof count === 'number' && (
                  <Text style={styles.suggestionCount}>Used {count}x</Text>
                )}
              </View>
            </Pressable>
          );
        })}
      </View>
    );
  }
);

const makeStyles = (t) => ({
  autocompleteContainer: {
    position: 'absolute',
    top: '100%',
    left: 0,
    right: 0,
    zIndex: 1000,
    backgroundColor: t.colors.background,
    borderRadius: theme.sizes.borderRadius,
    borderWidth: 1,
    borderColor: t.colors.inputBorder,
    maxHeight: 240,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
    elevation: 5,
  },
  suggestionItem: {
    padding: 12,
    borderBottomWidth: 1,
    borderBottomColor: t.colors.inputBorder,
  },
  suggestionContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  suggestionText: {
    color: t.colors.textPrimary,
    fontSize: 16,
    fontFamily: theme.fonts.main,
    flex: 1,
  },
  suggestionCount: {
    color: t.colors.textSecondary,
    fontSize: 12,
    fontFamily: theme.fonts.main,
    marginLeft: 8,
  },
});

VibeAutoComplete.displayName = 'VibeAutoComplete';

export default VibeAutoComplete;
