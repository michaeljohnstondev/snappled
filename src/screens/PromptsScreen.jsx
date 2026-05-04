import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, ScrollView, View, Text, Pressable, RefreshControl, Animated, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import ButtonContainer from '../components/ui/navigation/ButtonContainer';
import NavButton from '../components/ui/navigation/NavButton';
import RecordNavButton from '../components/ui/navigation/RecordNavButton';
import PromptInfoOverlay from '../components/ui/modals/PromptInfoOverlay';
import TokenPromptModal from '../components/ui/modals/TokenPromptModal';
import { useAuth } from '../store/AuthContext';
import { useModal } from '../store/ModalContext';
import { promptService } from '../services/promptService';
import { promptRotationService } from '../services/promptRotationService';
import { userService } from '../services/userService';
import HomeHeader from '../components/ui/headers/HomeHeader';
import theme from '../theme/themes';

const AnimatedLinearGradient = Animated.createAnimatedComponent(LinearGradient);

export default function PromptsScreen({ navigation }) {
  const { user, userCurrency, pendingAchievements, clearPendingAchievements } = useAuth();
  const { showToast } = useModal();

  // Show pending achievements from login check
  useEffect(() => {
    if (pendingAchievements.length > 0) {
      pendingAchievements.forEach((a, i) => {
        const rewards = [];
        if (a.coins) rewards.push(`+${a.coins}c`);
        if (a.xp) rewards.push(`+${a.xp}xp`);
        if (a.trophies) rewards.push(`+${a.trophies}t`);
        setTimeout(() => showToast('achievement', a.name, rewards.join(' ')), 1000 + i * 1500);
      });
      clearPendingAchievements();
    }
  }, [pendingAchievements]);

  // Animated gradient for create card
  const gradientAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(gradientAnim, {
          toValue: 1,
          duration: 3000,
          useNativeDriver: false,
        }),
        Animated.delay(5000),
        Animated.timing(gradientAnim, {
          toValue: 0,
          duration: 0,
          useNativeDriver: false,
        }),
      ])
    );
    loop.start();
    return () => loop.stop();
  }, []);

  const animatedStart = {
    x: gradientAnim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 1, 0],
    }),
    y: gradientAnim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [0, 0.5, 0],
    }),
  };

  const animatedEnd = {
    x: gradientAnim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [1, 0, 1],
    }),
    y: gradientAnim.interpolate({
      inputRange: [0, 0.5, 1],
      outputRange: [1, 0.5, 1],
    }),
  };

  // State
  const [prompts, setPrompts] = useState([]);
  const [selectedPromptForInfo, setSelectedPromptForInfo] = useState(null);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [minutesLeft, setMinutesLeft] = useState(0);

  // Countdown timer — minutes until next hour
  useEffect(() => {
    const calcMinutes = () => {
      const now = new Date();
      return 59 - now.getMinutes();
    };
    setMinutesLeft(calcMinutes());
    const interval = setInterval(() => {
      const mins = calcMinutes();
      setMinutesLeft(mins);
      // Reload prompts when a new hour hits
      if (mins === 59) loadData();
    }, 60000);
    return () => clearInterval(interval);
  }, []);

  const formatTimer = () => {
    const m = minutesLeft;
    return `${m}m`;
  };

  const seededRef = useRef(false);

  // Real-time listener for prompts
  useEffect(() => {
    if (!seededRef.current) {
      seededRef.current = true;
      promptRotationService.seedPromptPool();
    }

    const unsubscribe = promptRotationService.subscribeToActivePrompts((livePrompts) => {
      setPrompts(livePrompts);
      setIsLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loadData = async () => {
    const { prompts: allPrompts } = await promptRotationService.getActivePrompts();
    setPrompts(allPrompts);
  };

  const handlePromptPress = (prompt, index) => {
    navigation.navigate('Snapples', { promptId: prompt.id, promptIndex: index });
  };

  const handlePromptLongPress = (prompt) => {
    setSelectedPromptForInfo(prompt);
  };

  const handlePromptInfoClose = () => {
    setSelectedPromptForInfo(null);
  };

  const handlePromptLike = async (promptId) => {
    if (!user?.uid) return;
    const result = await promptService.likePrompt(promptId, user.uid, 'activePrompts');
    
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
    const result = await promptService.dislikePrompt(promptId, user.uid, 'activePrompts');
    
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
    const result = await promptService.reportPrompt(promptId, user.uid, reason, 'activePrompts');
    
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
      await promptService.incrementViews(promptId, 'activePrompts');
      
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
    xp: user?.profile?.experience || 0,
    username: user?.username || user?.email?.split('@')[0] || 'Player'
  };

  const showLoadingState = isLoading && prompts.length === 0;

  return (
    <LinearGradient
      colors={theme.colors.backgroundGradient}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        {/* Resource Bar */}
        <HomeHeader userStats={userStats} onTokenPress={() => setShowTokenModal(true)} onAdminPress={() => navigation.navigate('Admin')} userId={user?.uid} />

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.headerTitle}>Prompts</Text>
          <View style={styles.timerPill}>
            <Ionicons name="time-outline" size={14} color={theme.colors.vibeBlue} />
            <Text style={styles.timerLabel}>Next prompt in</Text>
            <Text style={styles.timerText}>{formatTimer()}</Text>
          </View>
        </View>

        {showLoadingState ? (
          <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12 }}>
            <ActivityIndicator size="large" color={theme.colors.vibeBlue} />
            <Text style={{ color: theme.colors.textSecondary, fontSize: 14 }}>Loading prompts...</Text>
          </View>
        ) : (
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
            {/* Create Prompt Card */}
            <Pressable
              style={styles.promptCard}
              onPress={handleCreatePrompt}
              delayPressIn={0}
              delayPressOut={0}
            >
              {({ pressed }) => (
                <AnimatedLinearGradient
                  colors={[theme.colors.vibeRoyalBlue, theme.colors.vibeCyan, theme.colors.vibeRoyalBlue]}
                  start={animatedStart}
                  end={animatedEnd}
                  style={[styles.cardGradient, { opacity: pressed ? 0.8 : 1 }]}
                >
                  <View style={styles.cardContent}>
                    <Text style={styles.createCardText}>Create a Prompt</Text>
                  </View>
                </AnimatedLinearGradient>
              )}
            </Pressable>

            {prompts.map((prompt, index) => (
              <Pressable
                key={prompt.id || index}
                style={styles.promptCard}
                onPress={() => handlePromptPress(prompt, index)}
                onLongPress={() => handlePromptLongPress(prompt)}
              >
                <LinearGradient
                  colors={getPromptGradient(index)}
                  style={styles.cardGradient}
                >
                  <View style={styles.cardContent}>
                    {prompt.lockoutAt && new Date().toISOString() >= prompt.lockoutAt && (
                      <Text style={styles.lockoutBadge}>CLOSING SOON</Text>
                    )}
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
        )}

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
          navigation={navigation}
        />
      </SafeAreaView>
      
      <ButtonContainer>
        <NavButton title="Prompts" onPress={() => navigation.navigate('Home')} active />
        <NavButton title="Play" onPress={() => navigation.navigate('Game')} />
        <RecordNavButton onPress={() => navigation.navigate('Record', { prompt: null })} />
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
  safeArea: {
    flex: 1,
    paddingBottom: 80,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 12,
    paddingBottom: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerTitle: {
    color: theme.colors.textPrimary,
    fontSize: 28,
    fontWeight: theme.fontWeights.bold,
  },
  timerPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: 'rgba(0, 198, 255, 0.15)',
    borderWidth: 1,
    borderColor: theme.colors.vibeBlue,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  timerLabel: {
    color: theme.colors.textSecondary,
    fontSize: 11,
    fontWeight: theme.fontWeights.semiBold,
  },
  timerText: {
    color: theme.colors.vibeBlue,
    fontSize: 14,
    fontWeight: theme.fontWeights.bold,
  },
  createCardText: {
    color: 'white',
    fontSize: 16,
    fontWeight: theme.fontWeights.bold,
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
  lockoutBadge: {
    color: theme.colors.vibeRed,
    fontSize: 10,
    fontWeight: theme.fontWeights.bold,
    backgroundColor: 'rgba(0,0,0,0.5)',
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 8,
    overflow: 'hidden',
    marginBottom: 6,
    textAlign: 'center',
  },
});