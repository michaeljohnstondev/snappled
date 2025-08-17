import React, { useState, useEffect } from 'react';
import { StyleSheet, SafeAreaView, ScrollView, View, Text, Pressable, RefreshControl } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import ButtonContainer from '../components/ui/navigation/ButtonContainer';
import NavButton from '../components/ui/navigation/NavButton';
import PromptInfoOverlay from '../components/ui/modals/PromptInfoOverlay';
import TokenPromptModal from '../components/ui/modals/TokenPromptModal';
import { useAuth } from '../store/AuthContext';
import { promptService } from '../services/promptService';
import { userService } from '../services/userService';
import theme from '../theme/themes';

export default function PromptsScreen({ navigation }) {
  const { user, userCurrency } = useAuth();
  
  // State
  const [prompts, setPrompts] = useState([]);
  const [selectedPromptForInfo, setSelectedPromptForInfo] = useState(null);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  // Refresh data when screen comes into focus
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadData();
    });

    return unsubscribe;
  }, [navigation]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load recent snapple prompts (user-generated)
      const promptsResult = await promptService.getRecentSnapplePrompts(20);
      if (promptsResult.success && promptsResult.prompts?.length > 0) {
        setPrompts(promptsResult.prompts);
      } else {
        // Fallback prompts if none exist
        const fallbackPrompts = [
          {
            id: 'fallback-1',
            text: 'Show us your morning routine in 10 seconds!',
            theme: 'Lifestyle',
            participantCount: 0,
            totalViews: 0
          },
          {
            id: 'fallback-2', 
            text: 'What makes you laugh? Share a funny moment!',
            theme: 'Comedy',
            participantCount: 0,
            totalViews: 0
          },
          {
            id: 'fallback-3',
            text: 'Create something beautiful with what\'s around you',
            theme: 'Creative',
            participantCount: 0,
            totalViews: 0
          }
        ];
        setPrompts(fallbackPrompts);
      }
    } catch (error) {
      console.error('[PromptsScreen] Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handlePromptPress = (prompt) => {
    setSelectedPromptForInfo(prompt);
  };

  const handlePromptInfoClose = () => {
    setSelectedPromptForInfo(null);
  };

  const handlePromptLike = async (promptId) => {
    if (!user?.uid) return;
    const result = await promptService.likePrompt(promptId, user.uid, 'snapplePrompts');
    
    // Update the prompt in local state if successful
    if (result?.success) {
      setPrompts(prevPrompts => 
        prevPrompts.map(prompt => {
          if (prompt.id === promptId) {
            const wasDisliked = prompt.dislikes?.includes(user.uid);
            return {
              ...prompt,
              likeCount: (prompt.likeCount || 0) + 1,
              dislikeCount: wasDisliked ? (prompt.dislikeCount || 0) - 1 : (prompt.dislikeCount || 0),
              likes: [...(prompt.likes || []), user.uid],
              dislikes: (prompt.dislikes || []).filter(id => id !== user.uid)
            };
          }
          return prompt;
        })
      );
    }
    
    return result;
  };

  const handlePromptDislike = async (promptId) => {
    if (!user?.uid) return;
    const result = await promptService.dislikePrompt(promptId, user.uid, 'snapplePrompts');
    
    // Update the prompt in local state if successful
    if (result?.success) {
      setPrompts(prevPrompts => 
        prevPrompts.map(prompt => {
          if (prompt.id === promptId) {
            const wasLiked = prompt.likes?.includes(user.uid);
            return {
              ...prompt,
              dislikeCount: (prompt.dislikeCount || 0) + 1,
              likeCount: wasLiked ? (prompt.likeCount || 0) - 1 : (prompt.likeCount || 0),
              dislikes: [...(prompt.dislikes || []), user.uid],
              likes: (prompt.likes || []).filter(id => id !== user.uid)
            };
          }
          return prompt;
        })
      );
    }
    
    return result;
  };

  const handlePromptReport = async (promptId, reason) => {
    if (!user?.uid) return;
    const result = await promptService.reportPrompt(promptId, user.uid, reason, 'snapplePrompts');
    
    // Update the prompt in local state if successful
    if (result?.success) {
      setPrompts(prevPrompts => 
        prevPrompts.map(prompt => {
          if (prompt.id === promptId) {
            return {
              ...prompt,
              reportCount: (prompt.reportCount || 0) + 1,
              reports: [...(prompt.reports || []), user.uid]
            };
          }
          return prompt;
        })
      );
    }
    
    return result;
  };

  const handlePromptView = async (promptId) => {
    try {
      await promptService.incrementViews(promptId, 'snapplePrompts');
      
      // Update local state optimistically
      setPrompts(prevPrompts => 
        prevPrompts.map(prompt => {
          if (prompt.id === promptId) {
            return {
              ...prompt,
              totalViews: (prompt.totalViews || 0) + 1
            };
          }
          return prompt;
        })
      );
    } catch (error) {
      console.error('[PromptsScreen] Error tracking view:', error);
    }
  };

  const handleVisitProfile = (userId) => {
    // TODO: Navigate to user profile screen
    console.log('Visit profile for user:', userId);
  };

  const handleFollowUser = async (userId) => {
    console.log('[PromptsScreen] handleFollowUser called', {
      currentUser: user?.uid,
      targetUser: userId,
      userAuthenticated: !!user?.uid
    });

    if (!user?.uid) {
      console.error('[PromptsScreen] User not authenticated');
      return {
        success: false,
        error: 'User not authenticated'
      };
    }

    try {
      console.log('[PromptsScreen] Calling userService.toggleFollow');
      const result = await userService.toggleFollow(user.uid, userId);
      console.log('[PromptsScreen] toggleFollow result:', result);
      
      if (result.success) {
        console.log(`[PromptsScreen] ${result.isFollowing ? 'Followed' : 'Unfollowed'} user:`, userId);
      } else {
        console.error('[PromptsScreen] Follow operation failed:', result.error);
      }
      return result;
    } catch (error) {
      console.error('[PromptsScreen] Error in follow operation:', error);
      return {
        success: false,
        error: 'Failed to update follow status'
      };
    }
  };

  const handleCreatePrompt = () => {
    navigation.navigate('CreatePrompt');
  };

  const handleTokenModalClose = () => {
    setShowTokenModal(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
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

  const userStats = {
    tokens: userCurrency.tokens || 0,
    coins: userCurrency.coins || 0,
    trophies: userCurrency.trophies || 0,
    level: userCurrency.level || 1,
    username: user?.username || user?.email?.split('@')[0] || 'Player'
  };

  return (
    <LinearGradient
      colors={theme.colors.backgroundGradient}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Prompts</Text>
          <Text style={styles.headerSubtitle}>
            {prompts.length} prompts available
          </Text>
        </View>

        {/* Prompt Cards List */}
        <ScrollView
          style={styles.scrollView}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              tintColor={theme.colors.vibeBlue}
            />
          }
        >
          <View style={styles.promptsList}>
            {prompts.map((prompt, index) => (
              <Pressable
                key={prompt.id || index}
                style={styles.promptCard}
                onPress={() => handlePromptPress(prompt)}
              >
                <LinearGradient
                  colors={getPromptGradient(index)}
                  style={styles.cardGradient}
                >
                  <View style={styles.cardContent}>
                    <Text style={styles.promptText} numberOfLines={3}>
                      {prompt.text || prompt.prompt || 'Create something amazing!'}
                    </Text>
                    
                    {/* Stats */}
                    <View style={styles.statsRow}>
                      <Text style={styles.statText}>
                        👁 {prompt.totalViews || 0}
                      </Text>
                      <Text style={styles.statText}>
                        👍 {prompt.likeCount || 0}
                      </Text>
                      <Text style={styles.statText}>
                        📹 {prompt.participantCount || 0}
                      </Text>
                    </View>
                  </View>
                </LinearGradient>
              </Pressable>
            ))}
          </View>
        </ScrollView>

        {/* Prompt Info Overlay */}
        <PromptInfoOverlay
          visible={!!selectedPromptForInfo}
          prompt={selectedPromptForInfo}
          onClose={handlePromptInfoClose}
          onLike={handlePromptLike}
          onDislike={handlePromptDislike}
          onReport={handlePromptReport}
          onCreateSnapple={(prompt) => navigation.navigate('Record', { prompt })}
          onCreatePrompt={handleCreatePrompt}
          onView={handlePromptView}
          onVisitProfile={handleVisitProfile}
          onFollowUser={handleFollowUser}
          navigation={navigation}
          onRefresh={loadData}
        />

        {/* Token Prompt Modal */}
        <TokenPromptModal
          visible={showTokenModal}
          onClose={handleTokenModalClose}
          onCreatePrompt={handleCreatePrompt}
          userTokens={userStats.tokens}
        />
      </SafeAreaView>
      
      <ButtonContainer>
        <NavButton title="Prompts" onPress={() => navigation.navigate('Prompts')} />
        <NavButton title="Snapples" onPress={() => navigation.navigate('Home')} />
        <NavButton title="Play" />
        <NavButton title="Deck" />
      </ButtonContainer>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
    paddingBottom: 80,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 16,
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: theme.fontWeights.bold,
    marginBottom: 4,
  },
  headerSubtitle: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    fontWeight: theme.fontWeights.medium,
  },
  scrollView: {
    flex: 1,
  },
  promptsList: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 16,
  },
  promptCard: {
    height: 140,
    borderRadius: 16,
    overflow: 'hidden',
  },
  cardGradient: {
    flex: 1,
    padding: 20,
    justifyContent: 'space-between',
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
    marginBottom: 16,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  statText: {
    color: 'rgba(255,255,255,0.8)',
    fontSize: 12,
    fontWeight: theme.fontWeights.medium,
  },
});