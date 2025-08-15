import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import theme from '../../theme/themes';

export default function CurrencyDisplay({ 
  coins = 0, 
  tickets = 0, 
  topicTokens = 0, 
  receivedCoins = 0,
  style,
  showReceived = false,
  layout = 'horizontal' // 'horizontal' or 'vertical'
}) {
  const containerStyle = layout === 'vertical' ? styles.verticalContainer : styles.horizontalContainer;

  return (
    <View style={[containerStyle, style]}>
      <View style={styles.currencyItem}>
        <Text style={styles.currencyEmoji}>🪙</Text>
        <View style={styles.currencyInfo}>
          <Text style={styles.currencyAmount}>{coins.toLocaleString()}</Text>
          <Text style={styles.currencyLabel}>Coins</Text>
        </View>
      </View>

      <View style={styles.currencyItem}>
        <Text style={styles.currencyEmoji}>🏆</Text>
        <View style={styles.currencyInfo}>
          <Text style={styles.currencyAmount}>{tickets.toLocaleString()}</Text>
          <Text style={styles.currencyLabel}>Trophies</Text>
        </View>
      </View>

      <View style={styles.currencyItem}>
        <Text style={styles.currencyEmoji}>✨</Text>
        <View style={styles.currencyInfo}>
          <Text style={styles.currencyAmount}>{topicTokens}</Text>
          <Text style={styles.currencyLabel}>Tokens</Text>
        </View>
      </View>

      {showReceived && receivedCoins > 0 && (
        <View style={styles.currencyItem}>
          <Text style={styles.currencyEmoji}>🎁</Text>
          <View style={styles.currencyInfo}>
            <Text style={styles.currencyAmount}>{receivedCoins.toLocaleString()}</Text>
            <Text style={styles.currencyLabel}>Gifted</Text>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  horizontalContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
  },
  verticalContainer: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: theme.sizes.spacing?.sm || 8,
  },
  currencyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    justifyContent: 'center',
  },
  currencyEmoji: {
    fontSize: 18,
    marginRight: 6,
  },
  currencyInfo: {
    alignItems: 'flex-start',
  },
  currencyAmount: {
    fontSize: 14,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    lineHeight: 16,
  },
  currencyLabel: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    lineHeight: 12,
  },
});