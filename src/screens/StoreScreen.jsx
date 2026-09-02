import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AppLayout from '../components/ui/layout/AppLayout';
import { useAuth } from '../store/AuthContext';
import { useModal } from '../store/ModalContext';
import { doc, updateDoc, increment, arrayUnion } from 'firebase/firestore';
import { db } from '../services/firebase';
import theme from '../theme/themes';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

const BOOST_DURATION = 24 * 60 * 60 * 1000; // 24 hours

const COIN_PACKS = [
  { id: 'coins_100', coins: 100, price: '$0.99', tag: null },
  { id: 'coins_500', coins: 500, price: '$3.99', tag: null },
  { id: 'coins_1000', coins: 1000, price: '$6.99', tag: 'Popular' },
  { id: 'coins_5000', coins: 5000, price: '$29.99', tag: 'Best Value' },
];

const TICKET_PACKS = [
  { id: 'tickets_5', tickets: 5, price: '$1.99', tag: null },
  { id: 'tickets_10', tickets: 10, price: '$2.99', tag: null },
  { id: 'tickets_25', tickets: 25, price: '$5.99', tag: 'Best Value' },
];

const BUNDLES = [
  { id: 'starter', name: 'Starter Pack', coins: 500, tickets: 10, price: '$4.99', tag: 'Save 25%', gradient: ['#00C6FF', '#0072FF'] },
  { id: 'creator', name: 'Creator Pack', coins: 2000, tickets: 25, price: '$14.99', tag: 'Save 30%', gradient: ['#FFD700', '#FF8C00'] },
  { id: 'whale', name: 'Mega Pack', coins: 10000, tickets: 50, price: '$49.99', tag: 'Save 40%', gradient: ['#6B00CC', '#FF00FF'] },
];

const BOOSTS = [
  { id: 'trophy_boost', name: 'Trophy Boost', description: '2x trophies from games for 24 hours', coinPrice: 3000, icon: 'trophy' },
  { id: 'xp_boost', name: 'XP Boost', description: '2x XP from all actions for 24 hours', coinPrice: 3000, icon: 'flash' },
];

const GAME_ITEMS = [
  { id: 'mulligan', name: 'Mulligan', description: 'Discard a card and draw a new one during pick phase', coinPrice: 500, icon: 'refresh' },
  { id: 'shield', name: 'Shield', description: 'Block all trophy loss from one game', coinPrice: 5000, icon: 'shield' },
];

const DECK_SIZE_START = 50;
const DECK_SIZE_INCREMENT = 10;
const DECK_SIZE_MAX = 500;
// 50→60: 500, 60→70: 1000, 70→80: 2500, 80→90: 5000, 90→100: 7500
// 100→125: 10000, then 5000 per +25 up to 500
const DECK_UPGRADE_PRICES = [500, 1000, 2500, 5000, 7500];
const DECK_BIG_INCREMENT = 25;
const DECK_BIG_PRICE = 10000;

export default function StoreScreen({ navigation }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user, userCurrency } = useAuth();
  const { showConfirm, showAlert } = useModal();
  const [activeSection, setActiveSection] = useState('bundles');

  const handleRealMoneyPurchase = (item) => {
    Alert.alert('Coming Soon', 'In-app purchases will be available at launch!');
  };

  const handleCoinPurchase = (item) => {
    const balance = userCurrency.coins || 0;
    if (balance < item.coinPrice) {
      showAlert('Not Enough Coins', `You need ${item.coinPrice.toLocaleString()} coins but only have ${balance.toLocaleString()}.`);
      return;
    }
    showConfirm('Confirm Purchase', `Buy ${item.name} for ${item.coinPrice.toLocaleString()} coins?`, async () => {
      try {
        const userRef = doc(db, 'users', user.uid);
        const updates = {
          'resources.coins': increment(-item.coinPrice),
        };

        // Boosts — set expiry timestamp
        if (item.id === 'trophy_boost') {
          updates['boosts.trophyBoost'] = new Date(Date.now() + BOOST_DURATION).toISOString();
        } else if (item.id === 'xp_boost') {
          updates['boosts.xpBoost'] = new Date(Date.now() + BOOST_DURATION).toISOString();
        }

        // Game items — increment quantity
        else if (item.id === 'mulligan') {
          updates['inventory.mulligans'] = increment(1);
        } else if (item.id === 'shield') {
          updates['inventory.shields'] = increment(1);
        }

        // Upgrades — permanent
        else if (item.id === 'deck_size_up') {
          const current = user?.upgrades?.maxDeckSize || DECK_SIZE_START;
          const inc = current < 100 ? DECK_SIZE_INCREMENT : DECK_BIG_INCREMENT;
          updates['upgrades.maxDeckSize'] = current + inc;
        } else if (item.id === 'spotlight') {
          updates['inventory.spotlights'] = increment(1);
        }

        // Log purchase
        updates['purchases'] = arrayUnion({
          itemId: item.id,
          name: item.name,
          coinPrice: item.coinPrice,
          purchasedAt: new Date().toISOString(),
        });

        await updateDoc(userRef, updates);
        showAlert('Purchased!', `You got ${item.name}!`);
      } catch (e) {
        showAlert('Error', 'Purchase failed. Try again.');
      }
    });
  };

  const sections = [
    { key: 'bundles', label: 'Bundles' },
    { key: 'coins', label: 'Coins' },
    { key: 'tickets', label: 'Tickets' },
    { key: 'game', label: 'Game' },
    { key: 'boosts', label: 'Boosts' },
    { key: 'upgrades', label: 'Upgrades' },
  ];

  return (
    <AppLayout navigation={navigation} active="store">
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Store</Text>
      </View>

        {/* Section Tabs */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabScroll} contentContainerStyle={styles.tabRow}>
          {sections.map(s => (
            <Pressable
              key={s.key}
              style={[styles.tab, activeSection === s.key && styles.tabActive]}
              onPress={() => setActiveSection(s.key)}
            >
              <Text style={[styles.tabText, activeSection === s.key && styles.tabTextActive]}>{s.label}</Text>
            </Pressable>
          ))}
        </ScrollView>

        <ScrollView style={styles.scrollArea} contentContainerStyle={styles.scrollContent}>

          {/* Bundles */}
          {activeSection === 'bundles' && (
            <>
              {BUNDLES.map(bundle => (
                <Pressable key={bundle.id} onPress={() => handleRealMoneyPurchase(bundle)}>
                  <LinearGradient colors={bundle.gradient} style={styles.bundleCard} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }}>
                    {bundle.tag && <View style={styles.tagBadge}><Text style={styles.tagText}>{bundle.tag}</Text></View>}
                    <Text style={styles.bundleName}>{bundle.name}</Text>
                    <View style={styles.bundleDetails}>
                      <Text style={styles.bundleItem}>{bundle.coins.toLocaleString()} coins</Text>
                      <Text style={styles.bundleItem}>{bundle.tickets} tickets</Text>
                    </View>
                    <View style={styles.priceBtn}>
                      <Text style={styles.priceBtnText}>{bundle.price}</Text>
                    </View>
                  </LinearGradient>
                </Pressable>
              ))}
            </>
          )}

          {/* Coins */}
          {activeSection === 'coins' && (
            <>
              {COIN_PACKS.map(pack => (
                <Pressable key={pack.id} style={styles.packCard} onPress={() => handleRealMoneyPurchase(pack)}>
                  <View style={styles.packLeft}>
                    <Text style={styles.packEmoji}>coins</Text>
                    <Text style={styles.packAmount}>{pack.coins.toLocaleString()} Coins</Text>
                  </View>
                  <View style={styles.packRight}>
                    {pack.tag && <Text style={styles.packTag}>{pack.tag}</Text>}
                    <View style={styles.priceBtn}>
                      <Text style={styles.priceBtnText}>{pack.price}</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </>
          )}

          {/* Tickets */}
          {activeSection === 'tickets' && (
            <>
              {TICKET_PACKS.map(pack => (
                <Pressable key={pack.id} style={styles.packCard} onPress={() => handleRealMoneyPurchase(pack)}>
                  <View style={styles.packLeft}>
                    <Text style={styles.packEmoji}>tickets</Text>
                    <Text style={styles.packAmount}>{pack.tickets} Tickets</Text>
                  </View>
                  <View style={styles.packRight}>
                    {pack.tag && <Text style={styles.packTag}>{pack.tag}</Text>}
                    <View style={styles.priceBtn}>
                      <Text style={styles.priceBtnText}>{pack.price}</Text>
                    </View>
                  </View>
                </Pressable>
              ))}
            </>
          )}

          {/* Game Items */}
          {activeSection === 'game' && (
            <>
              {GAME_ITEMS.map(item => (
                <Pressable key={item.id} style={styles.cosmeticCard} onPress={() => handleCoinPurchase(item)}>
                  <View style={[styles.cosmeticIcon, { backgroundColor: 'rgba(0,255,65,0.1)' }]}>
                    <Ionicons name={item.icon} size={28} color={theme.colors.vibeGreen} />
                  </View>
                  <View style={styles.cosmeticInfo}>
                    <Text style={styles.cosmeticName}>{item.name}</Text>
                    <Text style={styles.cosmeticDesc}>{item.description}</Text>
                  </View>
                  <View style={styles.cosmeticPrice}>
                    <Text style={styles.cosmeticPriceText}>{item.coinPrice.toLocaleString()} coins</Text>
                  </View>
                </Pressable>
              ))}
            </>
          )}

          {/* Boosts */}
          {activeSection === 'boosts' && (
            <>
              {BOOSTS.map(item => (
                <Pressable key={item.id} style={styles.cosmeticCard} onPress={() => handleCoinPurchase(item)}>
                  <View style={[styles.cosmeticIcon, { backgroundColor: 'rgba(0,198,255,0.1)' }]}>
                    <Ionicons name={item.icon} size={28} color={theme.colors.vibeBlue} />
                  </View>
                  <View style={styles.cosmeticInfo}>
                    <Text style={styles.cosmeticName}>{item.name}</Text>
                    <Text style={styles.cosmeticDesc}>{item.description}</Text>
                  </View>
                  <View style={styles.cosmeticPrice}>
                    <Text style={styles.cosmeticPriceText}>{item.coinPrice.toLocaleString()} coins</Text>
                  </View>
                </Pressable>
              ))}
            </>
          )}

          {/* Upgrades */}
          {activeSection === 'upgrades' && (() => {
            const currentMax = user?.upgrades?.maxDeckSize || DECK_SIZE_START;
            const atMax = currentMax >= DECK_SIZE_MAX;
            let nextInc, nextPrice;
            if (currentMax < 100) {
              const upgradeCount = Math.round((currentMax - DECK_SIZE_START) / DECK_SIZE_INCREMENT);
              nextPrice = DECK_UPGRADE_PRICES[upgradeCount] || 7500;
              nextInc = DECK_SIZE_INCREMENT;
            } else {
              nextPrice = DECK_BIG_PRICE;
              nextInc = DECK_BIG_INCREMENT;
            }

            return (
              <>
                {/* Deck Size Upgrade */}
                <Pressable
                  style={[styles.cosmeticCard, atMax && { opacity: 0.4 }]}
                  disabled={atMax}
                  onPress={() => handleCoinPurchase({
                    id: 'deck_size_up',
                    name: `Deck Size +${nextInc}`,
                    coinPrice: nextPrice,
                  })}
                >
                  <View style={styles.cosmeticIcon}>
                    <Ionicons name="add-circle" size={28} color={theme.colors.vibeYellow} />
                  </View>
                  <View style={styles.cosmeticInfo}>
                    <Text style={styles.cosmeticName}>Deck Size +{nextInc}</Text>
                    <Text style={styles.cosmeticDesc}>
                      {atMax ? `Max deck size reached (${DECK_SIZE_MAX})` : `Current: ${currentMax} → ${currentMax + nextInc}`}
                    </Text>
                  </View>
                  <View style={styles.cosmeticPrice}>
                    <Text style={styles.cosmeticPriceText}>{atMax ? 'MAXED' : `${nextPrice.toLocaleString()} coins`}</Text>
                  </View>
                </Pressable>

                {/* Spotlight */}
                <Pressable
                  style={styles.cosmeticCard}
                  onPress={() => handleCoinPurchase({ id: 'spotlight', name: 'Spotlight', coinPrice: 1500 })}
                >
                  <View style={styles.cosmeticIcon}>
                    <Ionicons name="flashlight" size={28} color={theme.colors.vibeYellow} />
                  </View>
                  <View style={styles.cosmeticInfo}>
                    <Text style={styles.cosmeticName}>Spotlight</Text>
                    <Text style={styles.cosmeticDesc}>Pin your snapple to top of a prompt for 1 hour</Text>
                  </View>
                  <View style={styles.cosmeticPrice}>
                    <Text style={styles.cosmeticPriceText}>1,500 coins</Text>
                  </View>
                </Pressable>
              </>
            );
          })()}

        </ScrollView>
    </AppLayout>
  );
}

const makeStyles = (t) => ({
  container: { flex: 1 },
  safeArea: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  backBg: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: 'rgba(0,0,0,0.3)',
    justifyContent: 'center', alignItems: 'center', marginBottom: 8,
    borderWidth: 3, borderColor: theme.colors.vibeBlue,
  },
  headerTitle: {
    fontSize: 24, fontWeight: theme.fontWeights.bold,
    color: t.colors.textPrimary, marginBottom: 4,
  },
  balanceRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
  },
  balanceText: {
    fontSize: 14, fontWeight: theme.fontWeights.bold, color: theme.colors.vibeYellow,
  },
  balanceIcon: {
    fontSize: 12, color: t.colors.textSecondary,
  },
  balanceDivider: {
    fontSize: 12, color: t.colors.textSecondary, marginHorizontal: 4,
  },
  tabScroll: {
    flexGrow: 0, marginBottom: 12,
  },
  tabRow: {
    flexDirection: 'row', paddingHorizontal: 16, gap: 8,
  },
  tab: {
    paddingVertical: 8, paddingHorizontal: 16, borderRadius: 10,
    backgroundColor: 'rgba(0,0,0,0.3)', borderWidth: 2, borderColor: t.colors.divider,
  },
  tabActive: {
    backgroundColor: 'rgba(0,198,255,0.15)', borderColor: theme.colors.vibeBlue,
  },
  tabText: {
    fontSize: 13, fontWeight: theme.fontWeights.bold, color: t.colors.textSecondary,
  },
  tabTextActive: {
    color: theme.colors.vibeBlue,
  },
  scrollArea: { flex: 1 },
  scrollContent: { paddingHorizontal: 16, paddingBottom: 20, gap: 12 },

  // Bundles
  bundleCard: {
    borderRadius: 16, padding: 20, marginBottom: 4,
    position: 'relative', overflow: 'hidden',
    borderWidth: 3, borderColor: theme.colors.vibeBlue,
  },
  bundleName: {
    fontSize: 20, fontWeight: theme.fontWeights.bold, color: t.colors.textPrimary, marginBottom: 8,
  },
  bundleDetails: {
    flexDirection: 'row', gap: 16, marginBottom: 14,
  },
  bundleItem: {
    fontSize: 15, color: 'rgba(255,255,255,0.9)', fontWeight: theme.fontWeights.semiBold,
  },
  tagBadge: {
    position: 'absolute', top: 12, right: 12,
    backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 10, paddingVertical: 4,
    borderRadius: 8,
  },
  tagText: {
    fontSize: 11, fontWeight: theme.fontWeights.bold, color: t.colors.textPrimary,
  },

  // Packs
  packCard: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 14,
    padding: 16, borderWidth: 3, borderColor: theme.colors.vibeBlue,
  },
  packLeft: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
  },
  packEmoji: {
    fontSize: 12, color: theme.colors.vibeYellow, fontWeight: theme.fontWeights.bold,
  },
  packAmount: {
    fontSize: 16, fontWeight: theme.fontWeights.bold, color: t.colors.textPrimary,
  },
  packRight: {
    flexDirection: 'row', alignItems: 'center', gap: 10,
  },
  packTag: {
    fontSize: 11, fontWeight: theme.fontWeights.bold, color: theme.colors.vibeGreen,
  },
  priceBtn: {
    backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 16, paddingVertical: 8,
    borderRadius: 10, borderWidth: 2, borderColor: theme.colors.vibeBlue,
  },
  priceBtnText: {
    fontSize: 14, fontWeight: theme.fontWeights.bold, color: t.colors.textPrimary,
  },

  // Cosmetics
  cosmeticCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)', borderRadius: 14,
    padding: 14, borderWidth: 3, borderColor: theme.colors.vibeBlue,
  },
  cosmeticIcon: {
    width: 48, height: 48, borderRadius: 12,
    backgroundColor: 'rgba(255,215,0,0.1)', justifyContent: 'center', alignItems: 'center',
  },
  cosmeticInfo: {
    flex: 1, marginLeft: 12,
  },
  cosmeticName: {
    fontSize: 15, fontWeight: theme.fontWeights.bold, color: t.colors.textPrimary,
  },
  cosmeticDesc: {
    fontSize: 12, color: t.colors.textSecondary, marginTop: 2,
  },
  cosmeticPrice: {
    backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 8, borderWidth: 2, borderColor: theme.colors.vibeYellow,
  },
  cosmeticPriceText: {
    fontSize: 12, fontWeight: theme.fontWeights.bold, color: theme.colors.vibeYellow,
  },
});
