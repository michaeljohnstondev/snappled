import React, { useState, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, Dimensions, Pressable } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import theme from '../../theme/themes';

const { width: screenWidth } = Dimensions.get('window');
const CARD_WIDTH = screenWidth - 40;
const CARD_SPACING = 20;

export default function PromptCarousel({ prompts, selectedPrompt, onPromptSelect }) {
  const scrollViewRef = useRef(null);
  const [currentIndex, setCurrentIndex] = useState(0);

  const handleScroll = (event) => {
    const scrollPosition = event.nativeEvent.contentOffset.x;
    const index = Math.round(scrollPosition / (CARD_WIDTH + CARD_SPACING));
    
    if (index !== currentIndex && index < prompts.length) {
      setCurrentIndex(index);
      onPromptSelect?.(prompts[index]);
    }
  };

  const scrollToIndex = (index) => {
    if (scrollViewRef.current && index >= 0 && index < prompts.length) {
      scrollViewRef.current.scrollTo({
        x: index * (CARD_WIDTH + CARD_SPACING),
        animated: true
      });
    }
  };

  const formatTimeRemaining = (expiresAt) => {
    if (!expiresAt) return 'Active';
    
    const now = new Date();
    const expiry = expiresAt.toDate ? expiresAt.toDate() : new Date(expiresAt);
    const diff = expiry - now;
    
    if (diff <= 0) return 'Expired';
    
    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    
    if (hours > 0) return `${hours}h ${minutes}m left`;
    return `${minutes}m left`;
  };

  const getPromptGradient = (index) => {
    const gradients = [
      [theme.colors.vibeBlue, theme.colors.vibeGreen],
      [theme.colors.vibePurple, theme.colors.vibePink],
      [theme.colors.vibeOrange, theme.colors.vibeYellow],
      [theme.colors.vibePink, theme.colors.vibeBlue],
      [theme.colors.vibeGreen, theme.colors.vibeOrange]
    ];
    return gradients[index % gradients.length];
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
      <ScrollView
        ref={scrollViewRef}
        horizontal
        showsHorizontalScrollIndicator={false}
        pagingEnabled={false}
        decelerationRate="fast"
        snapToInterval={CARD_WIDTH + CARD_SPACING}
        snapToAlignment="start"
        contentInset={{ left: 20, right: 20 }}
        contentContainerStyle={styles.scrollContainer}
        onMomentumScrollEnd={handleScroll}
      >
        {prompts.map((prompt, index) => (
          <Pressable
            key={prompt.id || index}
            style={styles.promptCard}
            onPress={() => {
              setCurrentIndex(index);
              onPromptSelect?.(prompt);
              scrollToIndex(index);
            }}
          >
            <LinearGradient
              colors={getPromptGradient(index)}
              style={styles.cardGradient}
            >
              <View style={styles.cardHeader}>
                <View style={styles.promptInfo}>
                  <Text style={styles.promptTheme}>{prompt.theme || 'Creative'}</Text>
                  <Text style={styles.timeRemaining}>
                    {formatTimeRemaining(prompt.expiresAt)}
                  </Text>
                </View>
                
                {currentIndex === index && (
                  <View style={styles.activeIndicator}>
                    <Ionicons name="radio-button-on" size={16} color="#fff" />
                  </View>
                )}
              </View>

              <View style={styles.cardContent}>
                <Text style={styles.promptText} numberOfLines={3}>
                  {prompt.text || prompt.prompt || 'Create something amazing!'}
                </Text>
                
                <View style={styles.cardFooter}>
                  <View style={styles.statsContainer}>
                    <View style={styles.stat}>
                      <Ionicons name="people" size={14} color="rgba(255,255,255,0.8)" />
                      <Text style={styles.statText}>
                        {prompt.participantCount || 0} responses
                      </Text>
                    </View>
                    
                    <View style={styles.stat}>
                      <Ionicons name="trending-up" size={14} color="rgba(255,255,255,0.8)" />
                      <Text style={styles.statText}>
                        {prompt.totalViews || 0} views
                      </Text>
                    </View>
                  </View>
                </View>
              </View>
            </LinearGradient>
          </Pressable>
        ))}
      </ScrollView>

      {/* Pagination Dots */}
      <View style={styles.pagination}>
        {prompts.map((_, index) => (
          <Pressable
            key={index}
            style={[
              styles.paginationDot,
              currentIndex === index && styles.activeDot
            ]}
            onPress={() => scrollToIndex(index)}
          />
        ))}
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
    gap: CARD_SPACING,
  },
  promptCard: {
    width: CARD_WIDTH,
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardGradient: {
    flex: 1,
    padding: 16,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  promptInfo: {
    flex: 1,
  },
  promptTheme: {
    color: 'white',
    fontSize: 12,
    fontWeight: theme.fontWeights.semiBold,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 2,
  },
  timeRemaining: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10,
    fontWeight: theme.fontWeights.medium,
  },
  activeIndicator: {
    marginLeft: 8,
  },
  cardContent: {
    flex: 1,
    justifyContent: 'space-between',
  },
  promptText: {
    color: 'white',
    fontSize: 16,
    fontWeight: theme.fontWeights.medium,
    lineHeight: 20,
    marginBottom: 12,
  },
  cardFooter: {
    marginTop: 'auto',
  },
  statsContainer: {
    flexDirection: 'row',
    gap: 16,
  },
  stat: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 10,
    fontWeight: theme.fontWeights.medium,
  },
  pagination: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 8,
    marginTop: 12,
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