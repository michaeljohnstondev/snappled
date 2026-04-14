import React, { useState, useEffect } from 'react';
import { View, Text, StyleSheet, Pressable, FlatList, Dimensions, ActivityIndicator, Alert } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from '../store/AuthContext';
import { snappleService } from '../services/snappleService';
import VibeSegmentedControl from '../components/ui/VibeSegmentedControl';
import VibeInput from '../components/ui/VibeInput';
import SnappleThumbnail from '../components/ui/SnappleThumbnail';
import SnappleOverlay from '../components/ui/modals/SnappleOverlay';
import SortModal from '../components/ui/modals/SortModal';
import ButtonContainer from '../components/ui/navigation/ButtonContainer';
import NavButton from '../components/ui/navigation/NavButton';
import theme from '../theme/themes';

const { width: screenWidth } = Dimensions.get('window');
const ITEM_SIZE = (screenWidth - 56) / 3;
const MAX_DECK_SIZE = 100;

export default function DeckBuilderScreen({ navigation }) {
  const { user, userCurrency, updateUserCurrency } = useAuth();
  const [activeTab, setActiveTab] = useState('deck');
  const [ownedSnapples, setOwnedSnapples] = useState([]);
  const [deck, setDeck] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [replacingSnapple, setReplacingSnapple] = useState(null);
  const [selectedSnapple, setSelectedSnapple] = useState(null);
  const [sortBy, setSortBy] = useState('time');
  const [ascending, setAscending] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);

  const deckIds = new Set(deck.map(s => s.id));
  const isFull = deck.length >= MAX_DECK_SIZE;

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setIsLoading(true);
    try {
      const result = await snappleService.getActiveSnapples(200);
      if (result.success) {
        const purchasedIds = userCurrency.ownedSnapples || [];
        const discardedIds = userCurrency.discardedSnapples || [];
        const mine = result.snapples.filter(
          s => !discardedIds.includes(s.id) && (s.creatorId === user?.uid || purchasedIds.includes(s.id))
        );
        setOwnedSnapples(mine);

        const deckSnappleIds = userCurrency.ownedCards || [];
        if (deckSnappleIds.length > 0) {
          const deckItems = mine.filter(s => deckSnappleIds.includes(s.id));
          setDeck(deckItems);
        }
      }
    } catch (error) {
      console.error('[DeckBuilder] Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const saveDeck = async (newDeck) => {
    setDeck(newDeck);
    await updateUserCurrency({ ownedCards: newDeck.map(s => s.id) });
  };

  const addToDeck = async (snapple) => {
    if (isFull) {
      // Start replace flow
      setReplacingSnapple(snapple);
      setActiveTab('deck');
      return;
    }
    await saveDeck([...deck, snapple]);
  };

  const removeFromDeck = async (snapple) => {
    const newDeck = deck.filter(s => s.id !== snapple.id);

    // If we're in replace flow, add the new snapple
    if (replacingSnapple) {
      newDeck.push(replacingSnapple);
      setReplacingSnapple(null);
    }

    await saveDeck(newDeck);
  };

  const cancelReplace = () => {
    setReplacingSnapple(null);
  };

  const tabOptions = [
    { label: `Deck (${deck.length}/${MAX_DECK_SIZE})`, value: 'deck' },
    { label: 'Owned', value: 'owned' },
  ];

  // Filter by search and tab
  const getDisplayedSnapples = () => {
    let items = activeTab === 'deck'
      ? deck
      : ownedSnapples.filter(s => !deckIds.has(s.id));

    if (search.trim()) {
      const q = search.toLowerCase();
      items = items.filter(s =>
        (s.prompt || '').toLowerCase().includes(q) ||
        (s.creatorUsername || '').toLowerCase().includes(q)
      );
    }

    // Sort
    items = [...items].sort((a, b) => {
      let result;
      switch (sortBy) {
        case 'hot': {
          const getHot = (s) => {
            const likes = s.likes || 0;
            const views = s.views || 0;
            const created = s.createdAt?.toDate ? s.createdAt.toDate() : new Date(s.createdAt || 0);
            const hoursAge = (Date.now() - created.getTime()) / (1000 * 60 * 60);
            return likes * 10 + views + Math.max(0, 100 - hoursAge * 4);
          };
          result = getHot(b) - getHot(a); break;
        }
        case 'likes': result = (b.likes || 0) - (a.likes || 0); break;
        case 'views': result = (b.views || 0) - (a.views || 0); break;
        case 'price': result = (b.currentPrice || 10) - (a.currentPrice || 10); break;
        case 'time':
        default:
          const aTime = a.createdAt?.toDate ? a.createdAt.toDate() : new Date(a.createdAt || 0);
          const bTime = b.createdAt?.toDate ? b.createdAt.toDate() : new Date(b.createdAt || 0);
          result = bTime - aTime;
      }
      return ascending ? -result : result;
    });

    return items;
  };

  const displayedSnapples = getDisplayedSnapples();

  const renderSnappleItem = ({ item }) => {
    const inDeck = deckIds.has(item.id);

    return (
      <View style={styles.snappleItem}>
        <Pressable style={styles.videoContainer} onPress={() => setSelectedSnapple(item)}>
          {item.videoUrl ? (
            <SnappleThumbnail videoUrl={item.videoUrl} />
          ) : (
            <View style={styles.thumbnailPlaceholder}>
              <Ionicons name="play-circle" size={24} color="white" />
            </View>
          )}

          {/* Action overlay */}
          <Pressable
            style={styles.actionOverlay}
            onPress={() => inDeck ? removeFromDeck(item) : addToDeck(item)}
          >
            <Text style={[styles.pillText, inDeck && styles.pillTextRemove]}>
              {inDeck ? 'Remove' : 'Add'}
            </Text>
          </Pressable>
        </Pressable>
      </View>
    );
  };

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>
        {search.trim() ? 'No matches found' :
          activeTab === 'deck' ? 'Your deck is empty' : 'No snapples to add'}
      </Text>
    </View>
  );

  const renderHeader = () => (
    <View style={styles.headerSection}>
      {/* Replace banner */}
      {replacingSnapple && (
        <View style={styles.replaceBanner}>
          <Text style={styles.replaceText}>
            Deck full — tap a snapple to replace it
          </Text>
          <Pressable onPress={cancelReplace}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </View>
      )}
    </View>
  );

  return (
    <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()}>
          <View style={styles.backBg}>
            <Ionicons name="arrow-back" size={20} color="white" />
          </View>
        </Pressable>
        <Text style={styles.headerTitle}>Deck Builder</Text>
        <View style={{ width: 36 }} />
      </View>

      {/* Tabs + Search - outside FlatList to keep keyboard open */}
      <View style={styles.fixedControls}>
        <VibeSegmentedControl
          options={tabOptions}
          selectedValue={activeTab}
          onSelect={setActiveTab}
        />
        <VibeInput
          placeholder="Search snapples..."
          value={search}
          onChangeText={setSearch}
          style={styles.searchInput}
        />
        <View style={styles.sortRow}>
          <Pressable style={styles.sortButton} onPress={() => setShowSortModal(true)}>
            <Ionicons name="swap-vertical" size={14} color={theme.colors.vibeBlue} />
            <Text style={styles.sortButtonText}>
              {{ time: 'Newest', likes: 'Likes', views: 'Views', price: 'Price' }[sortBy]}
            </Text>
            <Ionicons name={ascending ? 'arrow-up' : 'arrow-down'} size={12} color={theme.colors.vibeBlue} />
          </Pressable>
        </View>
      </View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.vibeBlue} />
        </View>
      ) : (
        <FlatList
          data={displayedSnapples}
          keyExtractor={(item, index) => item?.id || `snapple-${index}`}
          renderItem={renderSnappleItem}
          numColumns={3}
          columnWrapperStyle={styles.row}
          ListHeaderComponent={renderHeader}
          ListEmptyComponent={renderEmpty}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={{ height: 8 }} />}
        />
      )}

      <SortModal
        visible={showSortModal}
        onClose={() => setShowSortModal(false)}
        sortBy={sortBy}
        ascending={ascending}
        onSelect={(value, asc) => {
          setSortBy(value);
          setAscending(asc);
        }}
      />

      <SnappleOverlay
        visible={!!selectedSnapple}
        snapple={selectedSnapple}
        onClose={() => setSelectedSnapple(null)}
        onLike={(id) => snappleService.likeSnapple(id, user?.uid)}
        onDislike={(id) => snappleService.dislikeSnapple(id, user?.uid)}
        onBuy={(id) => snappleService.purchaseSnapple(id, user?.uid)}
        onReport={(id, reason) => snappleService.reportSnapple(id, user?.uid, reason)}
        navigation={navigation}
      />

      <ButtonContainer>
        <NavButton title="Prompts" onPress={() => navigation.navigate('Home')} />
        <NavButton title="Deck" onPress={() => navigation.navigate('DeckBuilder')} active />
        <NavButton title="Play" onPress={() => navigation.navigate('Game')} />
        <NavButton title="Profile" onPress={() => navigation.navigate('UserProfile', { userId: user?.uid })} />
        <NavButton title="Store" onPress={() => navigation.navigate('Store')} />
      </ButtonContainer>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingTop: 50,
    paddingBottom: 16,
  },
  backBg: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: theme.fontWeights.bold,
  },
  fixedControls: {
    paddingHorizontal: 16,
    gap: 12,
    paddingBottom: 12,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  listContent: {
    paddingHorizontal: 16,
    paddingBottom: 100,
  },
  headerSection: {
    paddingBottom: 12,
    gap: 12,
  },
  replaceBanner: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 68, 68, 0.15)',
    borderWidth: 2,
    borderColor: theme.colors.vibeRed,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  replaceText: {
    color: theme.colors.vibeRed,
    fontSize: 13,
    fontWeight: theme.fontWeights.semiBold,
    flex: 1,
  },
  cancelText: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    fontWeight: theme.fontWeights.semiBold,
    marginLeft: 12,
  },
  searchInput: {
    marginTop: 4,
  },
  sortRow: {
    flexDirection: 'row',
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 16,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: theme.colors.vibeBlue,
  },
  sortButtonText: {
    color: theme.colors.vibeBlue,
    fontSize: 12,
    fontWeight: theme.fontWeights.semiBold,
  },
  row: {
    gap: 8,
  },
  snappleItem: {
    width: ITEM_SIZE,
    borderRadius: 10,
    overflow: 'hidden',
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  videoContainer: {
    aspectRatio: 9 / 16,
    position: 'relative',
  },
  thumbnailPlaceholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  actionOverlay: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    paddingVertical: 6,
    alignItems: 'center',
  },
  pillText: {
    color: theme.colors.vibeBlue,
    fontSize: 11,
    fontWeight: theme.fontWeights.bold,
  },
  pillTextRemove: {
    color: theme.colors.vibeRed,
  },
  emptyContainer: {
    paddingVertical: 60,
    alignItems: 'center',
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
});
