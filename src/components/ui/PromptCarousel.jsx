import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, FlatList, Dimensions, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../../theme/themes';

const { width: screenWidth } = Dimensions.get('window');
const CARD_WIDTH = screenWidth - 40;
const CARD_SPACING = 20;
const SNAP_INTERVAL = CARD_WIDTH + CARD_SPACING;

const getPromptGradient = (index) => {
  const gradients = [
    [theme.colors.vibeBlue, theme.colors.vibeGreen],
    [theme.colors.vibePurple, theme.colors.vibePink],
    [theme.colors.vibeOrange, theme.colors.vibeYellow],
    [theme.colors.vibePink, theme.colors.vibeBlue],
    [theme.colors.vibeGreen, theme.colors.vibeOrange],
  ];
  return gradients[index % gradients.length];
};

export default function PromptCarousel({ prompts, selectedPrompt, onPromptSelect, onPromptPress, rightAccessory }) {
  const flatListRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const isScrolling = useRef(false);

  // Triple the data for infinite scroll
  const tripled = prompts.length > 1
    ? [...prompts, ...prompts, ...prompts]
    : prompts;
  const offset = prompts.length; // Start of the middle set

  const getInitialOffset = () => offset * SNAP_INTERVAL;

  const getRealIndex = (index) => {
    if (prompts.length === 0) return 0;
    return ((index % prompts.length) + prompts.length) % prompts.length;
  };

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0 && !isScrolling.current) {
      const idx = viewableItems[0].index;
      const realIdx = getRealIndex(idx);
      if (realIdx !== currentIndex) {
        setCurrentIndex(realIdx);
        onPromptSelect?.(prompts[realIdx]);
      }
    }
  }, [currentIndex, prompts]);

  // Scroll to selected prompt when it changes externally
  useEffect(() => {
    if (!selectedPrompt || prompts.length === 0) return;
    const realIdx = prompts.findIndex(p => p.id === selectedPrompt.id);
    if (realIdx >= 0 && realIdx !== currentIndex) {
      // Delay to ensure FlatList has rendered
      setTimeout(() => {
        const targetIndex = offset + realIdx;
        isScrolling.current = true;
        flatListRef.current?.scrollToOffset({
          offset: targetIndex * SNAP_INTERVAL,
          animated: false,
        });
        setCurrentIndex(realIdx);
        setTimeout(() => { isScrolling.current = false; }, 50);
      }, 100);
    }
  }, [selectedPrompt?.id, prompts.length]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 60 }).current;

  const handleMomentumEnd = (event) => {
    if (prompts.length <= 1) return;

    const scrollX = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollX / SNAP_INTERVAL);
    const realIdx = getRealIndex(index);

    setCurrentIndex(realIdx);
    onPromptSelect?.(prompts[realIdx]);

    // If we've scrolled into the first or last copy, silently jump to the middle
    if (index < offset || index >= offset + prompts.length) {
      const middleIndex = offset + realIdx;
      isScrolling.current = true;
      flatListRef.current?.scrollToOffset({
        offset: middleIndex * SNAP_INTERVAL,
        animated: false,
      });
      setTimeout(() => { isScrolling.current = false; }, 50);
    }
  };

  const renderItem = ({ item, index }) => {
    const realIdx = getRealIndex(index);
    return (
      <Pressable
        style={styles.promptCard}
        onPress={() => {
          if (onPromptPress) {
            onPromptPress(item);
          } else {
            onPromptSelect?.(item);
          }
        }}
      >
        <LinearGradient
          colors={getPromptGradient(realIdx)}
          style={styles.cardGradient}
        >
          <View style={styles.cardContent}>
            <Text style={styles.promptText} numberOfLines={3}>
              {item.text || item.prompt || 'Create something amazing!'}
            </Text>
          </View>
        </LinearGradient>
      </Pressable>
    );
  };

  if (!prompts || prompts.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>No prompts available</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <FlatList
        ref={flatListRef}
        data={tripled}
        keyExtractor={(item, index) => `${item.id || 'p'}-${index}`}
        renderItem={renderItem}
        horizontal
        showsHorizontalScrollIndicator={false}
        decelerationRate={0.85}
        snapToInterval={SNAP_INTERVAL}
        snapToAlignment="start"
        contentContainerStyle={styles.scrollContainer}
        onMomentumScrollEnd={handleMomentumEnd}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, index) => ({
          length: SNAP_INTERVAL,
          offset: SNAP_INTERVAL * index,
          index,
        })}
        initialScrollIndex={prompts.length > 1 ? offset : 0}
      />

      {/* Pagination Dots + Right Accessory */}
      <View style={styles.paginationRow}>
        <View style={styles.accessorySpacer} />
        <View style={styles.pagination}>
          {(() => {
            const total = prompts.length;
            if (total <= 4) {
              return prompts.map((_, index) => (
                <View
                  key={index}
                  style={[styles.paginationDot, currentIndex === index && styles.activeDot]}
                />
              ));
            }
            const last = total - 1;
            const mid1 = Math.round(last * 1/3);
            const mid2 = Math.round(last * 2/3);
            const dots = [0, mid1, mid2, last];

            let closestDot = 0;
            let minDist = total;
            dots.forEach((d, i) => {
              const dist = Math.abs(currentIndex - d);
              if (dist < minDist) { minDist = dist; closestDot = i; }
            });

            return dots.map((dotIndex, i) => (
              <View
                key={dotIndex}
                style={[styles.paginationDot, i === closestDot && styles.activeDot]}
              />
            ));
          })()}
        </View>
        <View style={styles.accessorySpacer}>
          {rightAccessory}
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 180,
    marginBottom: 16,
  },
  scrollContainer: {
    paddingHorizontal: 20,
  },
  promptCard: {
    width: CARD_WIDTH,
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
    marginRight: CARD_SPACING,
  },
  cardGradient: {
    flex: 1,
    padding: 16,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  promptText: {
    color: 'white',
    fontSize: 16,
    fontWeight: theme.fontWeights.medium,
    lineHeight: 20,
    textAlign: 'center',
  },
  paginationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    marginTop: 12,
  },
  accessorySpacer: {
    width: 80,
    alignItems: 'flex-end',
  },
  pagination: {
    flex: 1,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
  },
  paginationDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: 'rgba(255,255,255,0.3)',
  },
  activeDot: {
    backgroundColor: theme.colors.vibeBlue,
    width: 20,
    height: 6,
    borderRadius: 3,
  },
  emptyContainer: {
    height: 140,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: 16,
    margin: 20,
  },
  emptyText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontWeight: theme.fontWeights.medium,
  },
});
