import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import CurrencyIcon from '../components/ui/CurrencyIcon';
import AppLayout from '../components/ui/layout/AppLayout';
import { useAuth } from '../store/AuthContext';
import { useModal } from '../store/ModalContext';
import { doc, updateDoc, increment, arrayUnion } from 'firebase/firestore';
import { db } from '../services/firebase';
import theme from '../theme/themes';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

const BOOST_DURATION = 24 * 60 * 60 * 1000; // 24 hours

// ids are the store product ids from src/lib/products.js. They were
// local strings matching nothing; Apple will not let a product id be
// renamed once created, so they are settled before anything is made.
const COIN_PACKS = [
  { id: 'snappled_coins_100', coins: 100, price: '$0.99', tag: null },
  { id: 'snappled_coins_500', coins: 500, price: '$3.99', tag: null },
  { id: 'snappled_coins_1000', coins: 1000, price: '$6.99', tag: 'Popular' },
  { id: 'snappled_coins_5000', coins: 5000, price: '$29.99', tag: 'Best Value' },
];

const TICKET_PACKS = [
  { id: 'snappled_tickets_5', tickets: 5, price: '$1.99', tag: null },
  { id: 'snappled_tickets_10', tickets: 10, price: '$2.99', tag: null },
  { id: 'snappled_tickets_25', tickets: 25, price: '$5.99', tag: 'Best Value' },
];

const BUNDLES = [
  // Impulse tier. Priced under the psychological two-dollar line and
  // sized so it is a taste rather than a substitute for the Starter -
  // 100 coins buys two snapples, not a habit.
  //
  // Its per-dollar value is deliberately the best on the board: bought
  // separately this is $2.98 ($0.99 + $1.99), so $1.99 is a third off,
  // against 25-30% higher up. That inverts the usual "bigger is better
  // value" ladder on purpose, because the hard step is the FIRST
  // purchase, not the third.
  { id: 'snappled_bundle_taster', name: 'Taster Pack', coins: 100, tickets: 5, price: '$1.99', tag: 'Save 33%', gradient: ['#00FF41', '#00C6FF'] },
  { id: 'snappled_bundle_starter', name: 'Starter Pack', coins: 500, tickets: 10, price: '$4.99', tag: 'Save 25%', gradient: ['#00C6FF', '#0072FF'] },
  // Candy apple red into orange. It was gold into orange, and the coin
  // art is gold - so the icon vanished into the card it was sitting on,
  // on the one bundle where the coin count is the selling point.
  { id: 'snappled_bundle_creator', name: 'Creator Pack', coins: 2000, tickets: 25, price: '$14.99', tag: 'Save 30%', gradient: ['#FF0800', '#FF8C00'] },
  { id: 'snappled_bundle_mega', name: 'Mega Pack', coins: 10000, tickets: 50, price: '$49.99', tag: 'Save 40%', gradient: ['#6B00CC', '#FF00FF'] },
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

export default function StoreScreen({ navigation, route }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user, userCurrency } = useAuth();
  const { showConfirm, showAlert } = useModal();
  // Opens on whichever shelf the caller asked for - the resource bar's
  // popup sends people here for the exact currency they just ran out
  // of, and landing them on Bundles would make them go looking for it.
  const [activeSection, setActiveSection] = useState(route?.params?.section || 'bundles');

  // The Store is a TAB, so it stays mounted: navigating to it again
  // updates params without remounting, and the initial state above
  // would never run a second time.
  useEffect(() => {
    const section = route?.params?.section;
    if (section) setActiveSection(section);
  }, [route?.params?.section]);

  const handleRealMoneyPurchase = (item) => {
    Alert.alert('Coming Soon', 'In-app purchases will be available at launch!');
  };

  const handleCoinPurchase = (item) => {
    const balance = userCurrency.coins || 0;
    if (balance < item.coinPrice) {
      // Offers the way out rather than just naming the problem. This
      // told you that you were short and then dropped you back on the
      // same screen with nothing to press - in a store, of all places,
      // where the fix is two taps away.
      showAlert(
        'Not Enough Coins',
        `You need ${item.coinPrice.toLocaleString()} coins and have `
        + `${balance.toLocaleString()}.`,
        [
          { text: 'Get Coins', onPress: () => setActiveSection('coins') },
          { text: 'Not now' },
        ],
      );
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
    // 'Game' named where the items are used rather than what they
    // are, which put it in a different category from every other
    // tab on the row. The key stays so nothing else has to move.
    { key: 'game', label: 'Items' },
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
                      <View style={styles.bundleLine}>
                        <CurrencyIcon name="coins" size={20} />
                        <Text style={styles.bundleItem}>
                          {bundle.coins.toLocaleString()}
                        </Text>
                      </View>
                      <View style={styles.bundleLine}>
                        {/* Bigger than the coin beside it, not equal.
                            The ticket is a wide, short shape, so
                            `contain` fits it by WIDTH and it sits far
                            shorter than a round coin at the same
                            nominal size - matching the numbers made it
                            look like the lesser of the two. Bundles
                            only; the ticket section's own icons are
                            large already. */}
                        <CurrencyIcon name="tickets" size={24} />
                        <Text style={styles.bundleItem}>{bundle.tickets}</Text>
                      </View>
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
                    {/* Was the literal word "coins" rendered in the slot
                        an emoji used to fill - visible on the card as
                        text. */}
                    <CurrencyIcon name="coins" size={38} />
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
                    <CurrencyIcon name="tickets" size={38} />
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
                    <View style={styles.priceLine}>
                      <CurrencyIcon name="coins" size={16} />
                      <Text style={styles.cosmeticPriceText}>
                        {item.coinPrice.toLocaleString()}
                      </Text>
                    </View>
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
                    <View style={styles.priceLine}>
                      <CurrencyIcon name="coins" size={16} />
                      <Text style={styles.cosmeticPriceText}>
                        {item.coinPrice.toLocaleString()}
                      </Text>
                    </View>
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
                    <View style={styles.priceLine}>
                      {/* No coin beside MAXED - there is no
                          price left to pay. */}
                      {!atMax && <CurrencyIcon name="coins" size={16} />}
                      <Text style={styles.cosmeticPriceText}>
                        {atMax ? 'MAXED' : nextPrice.toLocaleString()}
                      </Text>
                    </View>
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
  priceLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  bundleLine: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
