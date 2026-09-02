import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  Modal, 
  Alert,
  ScrollView,
  TouchableOpacity 
} from 'react-native';
import VibeButton from '../ui/VibeButton';
import VibeInput from '../ui/VibeInput';
import CurrencyDisplay from './CurrencyDisplay';
import theme from '../../theme/themes';
import { currencyService } from '../../services/currencyService';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

export default function PurchaseModal({ 
  visible, 
  onClose, 
  type, // 'tokens', 'tickets', 'snapple'
  snappleData = null,
  userCurrency = {},
  onPurchaseComplete
}) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [quantity, setQuantity] = useState('1');
  const [isLoading, setIsLoading] = useState(false);
  const [pricing, setPricing] = useState(null);
  const [useTickets, setUseTickets] = useState(false);

  useEffect(() => {
    loadPricing();
  }, []);

  async function loadPricing() {
    const result = await currencyService.getCurrentPricing();
    if (result.success) {
      setPricing(result.pricing);
    }
  }

  function calculateCost() {
    if (!pricing) return { totalCost: 0, discount: 0 };

    const qty = parseInt(quantity) || 1;
    
    if (type === 'snapple' && snappleData) {
      return {
        totalCost: snappleData.currentPrice || 10,
        discount: 0,
        quantity: 1
      };
    }

    const config = type === 'tokens' ? pricing.topicToken : pricing.ticket;
    return currencyService.calculateBulkPrice(config.price, qty, config.bulkDiscounts);
  }

  function getAvailableQuantityPresets() {
    if (type === 'tokens') {
      return [1, 5, 10, 25];
    }
    if (type === 'tickets') {
      return [25, 50, 100, 200];
    }
    return [1];
  }

  async function handlePurchase() {
    setIsLoading(true);
    
    try {
      const qty = parseInt(quantity) || 1;
      let result;

      if (type === 'snapple') {
        result = await currencyService.purchaseSnapple(userCurrency.userId, snappleData.id);
      } else if (type === 'tokens') {
        result = await currencyService.purchaseTopicTokens(userCurrency.userId, qty, useTickets);
      } else if (type === 'tickets') {
        result = await currencyService.purchaseTickets(userCurrency.userId, qty);
      }

      if (result.success) {
        Alert.alert(
          'Purchase Successful! 🎉',
          getPurchaseSuccessMessage(result),
          [{ text: 'OK', onPress: () => {
            onPurchaseComplete?.(result);
            onClose();
          }}]
        );
      } else {
        Alert.alert('Purchase Failed', result.error);
      }
    } catch (error) {
      Alert.alert('Purchase Failed', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  function getPurchaseSuccessMessage(result) {
    if (type === 'snapple') {
      return `Snapple added to your collection!\nPaid: ${result.pricePaid} coins\nNew price: ${result.newPrice} coins`;
    } else if (type === 'tokens') {
      return `Received ${result.tokensReceived} topic tokens!\nCost: ${result.totalCost} ${result.currency}`;
    } else if (type === 'tickets') {
      return `Received ${result.ticketsReceived} tickets!\nCost: ${result.totalCost} coins`;
    }
    return 'Purchase completed!';
  }

  const cost = calculateCost();
  const canAfford = type === 'snapple' 
    ? userCurrency.coins >= cost.totalCost
    : useTickets 
      ? userCurrency.tickets >= cost.totalCost
      : userCurrency.coins >= cost.totalCost;

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>
            {type === 'snapple' ? 'Purchase Snapple' : 
             type === 'tokens' ? 'Buy Topic Tokens' : 'Buy Tickets'}
          </Text>
          <TouchableOpacity onPress={onClose} style={styles.closeButton}>
            <Text style={styles.closeText}>✕</Text>
          </TouchableOpacity>
        </View>

        <ScrollView style={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.currencySection}>
            <Text style={styles.sectionTitle}>Your Currency</Text>
            <CurrencyDisplay
              coins={userCurrency.coins || 0}
              tickets={userCurrency.tickets || 0}
              topicTokens={userCurrency.topicTokens || 0}
              layout="horizontal"
            />
          </View>

          {type === 'snapple' && snappleData && (
            <View style={styles.snappleSection}>
              <Text style={styles.sectionTitle}>Snapple Details</Text>
              <View style={styles.snappleInfo}>
                <Text style={styles.snappleTitle}>{snappleData.prompt}</Text>
                <Text style={styles.snappleCreator}>by {snappleData.creatorName}</Text>
                <Text style={styles.snappleStats}>
                  👍 {snappleData.likes} | 👎 {snappleData.dislikes} | 🛒 {snappleData.buyCount} purchased
                </Text>
              </View>
            </View>
          )}

          {type !== 'snapple' && (
            <View style={styles.quantitySection}>
              <Text style={styles.sectionTitle}>Quantity</Text>
              
              <View style={styles.presetButtons}>
                {getAvailableQuantityPresets().map(preset => (
                  <TouchableOpacity
                    key={preset}
                    style={[
                      styles.presetButton,
                      quantity === preset.toString() && styles.presetButtonSelected
                    ]}
                    onPress={() => setQuantity(preset.toString())}
                  >
                    <Text style={[
                      styles.presetButtonText,
                      quantity === preset.toString() && styles.presetButtonTextSelected
                    ]}>
                      {preset}
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>

              <VibeInput
                value={quantity}
                onChangeText={setQuantity}
                placeholder="Enter quantity"
                keyboardType="numeric"
                style={styles.quantityInput}
              />

              {type === 'tokens' && userCurrency.tickets > 0 && (
                <TouchableOpacity
                  style={styles.paymentOption}
                  onPress={() => setUseTickets(!useTickets)}
                >
                  <View style={styles.checkbox}>
                    {useTickets && <Text style={styles.checkmark}>✓</Text>}
                  </View>
                  <Text style={styles.paymentOptionText}>
                    Pay with Tickets instead of Coins
                  </Text>
                </TouchableOpacity>
              )}
            </View>
          )}

          <View style={styles.costSection}>
            <Text style={styles.sectionTitle}>Cost Breakdown</Text>
            <View style={styles.costDetails}>
              {type !== 'snapple' && cost.discount > 0 && (
                <View style={styles.costRow}>
                  <Text style={styles.costLabel}>Subtotal:</Text>
                  <Text style={styles.costValue}>{cost.subtotal} {useTickets ? 'tickets' : 'coins'}</Text>
                </View>
              )}
              {type !== 'snapple' && cost.discount > 0 && (
                <View style={styles.costRow}>
                  <Text style={styles.costLabel}>Bulk Discount ({Math.round(cost.discount * 100)}%):</Text>
                  <Text style={[styles.costValue, styles.discount]}>-{cost.discountAmount}</Text>
                </View>
              )}
              <View style={[styles.costRow, styles.totalRow]}>
                <Text style={styles.totalLabel}>Total:</Text>
                <Text style={styles.totalValue}>
                  {cost.totalCost} {type === 'snapple' ? 'coins' : useTickets ? 'tickets' : 'coins'}
                </Text>
              </View>
            </View>
          </View>

          {!canAfford && (
            <View style={styles.warningSection}>
              <Text style={styles.warningText}>
                ⚠️ Insufficient {type === 'snapple' ? 'coins' : useTickets ? 'tickets' : 'coins'}
              </Text>
            </View>
          )}
        </ScrollView>

        <View style={styles.footer}>
          <VibeButton
            label="Cancel"
            onPress={onClose}
            style={[styles.button, styles.cancelButton]}
          />
          <VibeButton
            label={isLoading ? "Processing..." : "Purchase"}
            onPress={handlePurchase}
            style={[styles.button, styles.purchaseButton]}
            disabled={isLoading || !canAfford}
          />
        </View>
      </View>
    </Modal>
  );
}

const makeStyles = (t) => ({
  container: {
    flex: 1,
    backgroundColor: t.colors.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.sizes.spacing?.lg || 24,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border || 'rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: t.colors.textPrimary,
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 20,
    color: t.colors.textSecondary,
  },
  content: {
    flex: 1,
    padding: theme.sizes.spacing?.lg || 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: t.colors.textPrimary,
    marginBottom: theme.sizes.spacing?.md || 16,
  },
  currencySection: {
    marginBottom: theme.sizes.spacing?.xl || 32,
  },
  snappleSection: {
    marginBottom: theme.sizes.spacing?.xl || 32,
  },
  snappleInfo: {
    backgroundColor: t.colors.inputBackground,
    padding: theme.sizes.spacing?.md || 16,
    borderRadius: theme.sizes.borderRadius || 12,
  },
  snappleTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: t.colors.textPrimary,
    marginBottom: 4,
  },
  snappleCreator: {
    fontSize: 14,
    color: t.colors.textSecondary,
    marginBottom: 8,
  },
  snappleStats: {
    fontSize: 12,
    color: t.colors.textSecondary,
  },
  quantitySection: {
    marginBottom: theme.sizes.spacing?.xl || 32,
  },
  presetButtons: {
    flexDirection: 'row',
    gap: theme.sizes.spacing?.sm || 8,
    marginBottom: theme.sizes.spacing?.md || 16,
  },
  presetButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: theme.sizes.borderRadius || 12,
    borderWidth: 1,
    borderColor: theme.colors.border || 'rgba(255,255,255,0.2)',
  },
  presetButtonSelected: {
    backgroundColor: theme.colors.primary,
    borderColor: theme.colors.primary,
  },
  presetButtonText: {
    color: t.colors.textSecondary,
    fontWeight: '500',
  },
  presetButtonTextSelected: {
    color: t.colors.background,
  },
  quantityInput: {
    marginBottom: theme.sizes.spacing?.md || 16,
  },
  paymentOption: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.sizes.spacing?.sm || 8,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderWidth: 2,
    borderColor: theme.colors.primary,
    borderRadius: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkmark: {
    color: theme.colors.primary,
    fontWeight: 'bold',
  },
  paymentOptionText: {
    color: t.colors.textPrimary,
    fontSize: 14,
  },
  costSection: {
    marginBottom: theme.sizes.spacing?.xl || 32,
  },
  costDetails: {
    backgroundColor: t.colors.inputBackground,
    padding: theme.sizes.spacing?.md || 16,
    borderRadius: theme.sizes.borderRadius || 12,
  },
  costRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  totalRow: {
    borderTopWidth: 1,
    borderTopColor: theme.colors.border || 'rgba(255,255,255,0.2)',
    paddingTop: 8,
    marginTop: 8,
    marginBottom: 0,
  },
  costLabel: {
    color: t.colors.textSecondary,
    fontSize: 14,
  },
  costValue: {
    color: t.colors.textPrimary,
    fontSize: 14,
  },
  discount: {
    color: theme.colors.success || '#4ade80',
  },
  totalLabel: {
    color: t.colors.textPrimary,
    fontSize: 16,
    fontWeight: '600',
  },
  totalValue: {
    color: t.colors.textPrimary,
    fontSize: 16,
    fontWeight: 'bold',
  },
  warningSection: {
    backgroundColor: 'rgba(239, 68, 68, 0.1)',
    padding: theme.sizes.spacing?.md || 16,
    borderRadius: theme.sizes.borderRadius || 12,
    marginBottom: theme.sizes.spacing?.lg || 24,
  },
  warningText: {
    color: '#ef4444',
    textAlign: 'center',
    fontWeight: '500',
  },
  footer: {
    flexDirection: 'row',
    gap: theme.sizes.spacing?.md || 16,
    padding: theme.sizes.spacing?.lg || 24,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border || 'rgba(255,255,255,0.1)',
  },
  button: {
    flex: 1,
  },
  cancelButton: {
    backgroundColor: 'transparent',
    borderColor: t.colors.textSecondary,
    borderWidth: 1,
  },
  purchaseButton: {
    backgroundColor: theme.colors.primary,
  },
});