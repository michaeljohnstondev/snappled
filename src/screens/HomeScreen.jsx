import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, View, Text, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PromptCarousel from '../components/ui/PromptCarousel';
import SnappleGrid from '../components/ui/snapples/SnappleGrid';
import EmptySnappleList from '../components/ui/snapples/EmptySnappleList';
import SnappleOverlay from '../components/ui/modals/SnappleOverlay';
import SortModal from '../components/ui/modals/SortModal';
import PromptInfoOverlay from '../components/ui/modals/PromptInfoOverlay';
import AppLayout from '../components/ui/layout/AppLayout';
import { useAuth } from '../store/AuthContext';
import { promptService } from '../services/promptService';
import { promptRotationService } from '../services/promptRotationService';
import { snappleService } from '../services/snappleService';
import { userService } from '../services/userService';
import theme from '../theme/themes';

export default function HomeScreen({ navigation, route }) {
  const { user, userCurrency } = useAuth();
  
  // State
  const [prompts, setPrompts] = useState([]);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [snapples, setSnapples] = useState([]);
  const [selectedSnapple, setSelectedSnapple] = useState(null);
  const [selectedPromptForInfo, setSelectedPromptForInfo] = useState(null);
  const [showTokenModal, setShowTokenModal] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sortBy, setSortBy] = useState('time');
  const [ascending, setAscending] = useState(false);
  const [showSortModal, setShowSortModal] = useState(false);

  // Load prompts on mount / user change
  useEffect(() => {
    if (!user?.uid) return;
    loadPrompts();
  }, [user?.uid]);

  // Reload prompts on focus (in case a new one was created)
  useEffect(() => {
    const unsubscribe = navigation.addListener('focus', () => {
      loadPrompts();
      if (selectedPrompt?.id) loadSnapplesForPrompt(selectedPrompt);
    });
    return unsubscribe;
  }, [navigation, selectedPrompt?.id]);

  // Fetch snapples whenever selected prompt changes
  useEffect(() => {
    if (selectedPrompt?.id) {
      loadSnapplesForPrompt(selectedPrompt);
    } else {
      setSnapples([]);
    }
  }, [selectedPrompt?.id]);

  const loadPrompts = async () => {
    setIsLoading(true);
    try {
      const { prompts: allPrompts } = await promptRotationService.getActivePrompts();

      if (allPrompts.length > 0) {
        setPrompts(allPrompts);
        const targetId = route?.params?.promptId;
        const targetIndex = route?.params?.promptIndex;
        let match = null;
        if (targetId) {
          match = allPrompts.find(p => p.id === targetId);
        }
        if (!match && targetIndex != null && allPrompts[targetIndex]) {
          match = allPrompts[targetIndex];
        }
        setSelectedPrompt(match || allPrompts[0]);
      }
    } catch (error) {
      console.error('[HomeScreen] Error loading prompts:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSnapplesForPrompt = async (prompt) => {
    try {
      // Pass both id and text so snapples carry over when a prompt is recycled.
      const result = await snappleService.getSnapplesByPrompt(prompt?.id, prompt?.text, 100);
      if (result.success) setSnapples(result.snapples);
    } catch (error) {
      console.error('[HomeScreen] Error loading snapples for prompt:', error);
    }
  };

  const handlePromptSelect = (prompt) => {
    setSelectedPrompt(prompt);
  };

  const handleSnapplePress = (snapple) => {
    setSelectedSnapple(snapple);
  };

  const handleSnappleOverlayClose = () => {
    setSelectedSnapple(null);
  };

  const handlePromptPress = (prompt) => {
    setSelectedPromptForInfo(prompt);
  };

  const handlePromptInfoClose = () => {
    setSelectedPromptForInfo(null);
  };

  const handleLike = async (snappleId) => {
    if (!user?.uid) return;
    return await snappleService.likeSnapple(snappleId, user.uid);
  };

  const handleDislike = async (snappleId) => {
    if (!user?.uid) return;
    return await snappleService.dislikeSnapple(snappleId, user.uid);
  };

  const handleBuy = async (snappleId) => {
    if (!user?.uid) return;
    return await snappleService.purchaseSnapple(snappleId, user.uid);
  };

  const handleReport = async (snappleId, reason) => {
    if (!user?.uid) return;
    return await snappleService.reportSnapple(snappleId, user.uid, reason);
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
    const result = await promptService.reportPrompt(promptId, user.uid, reason);
    
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
      console.error('[HomeScreen] Error tracking view:', error);
    }
  };

  const handleProfilePress = () => {
    navigation.navigate('UserProfile', { userId: user?.uid });
  };

  const handleVisitProfile = (userId) => {
    navigation.navigate('UserProfile', { userId });
  };

  const handleFollowUser = async (userId) => {
    console.log('[HomeScreen] handleFollowUser called', {
      currentUser: user?.uid,
      targetUser: userId,
      userAuthenticated: !!user?.uid
    });

    if (!user?.uid) {
      console.error('[HomeScreen] User not authenticated');
      return {
        success: false,
        error: 'User not authenticated'
      };
    }

    try {
      console.log('[HomeScreen] Calling userService.toggleFollow');
      const result = await userService.toggleFollow(user.uid, userId);
      console.log('[HomeScreen] toggleFollow result:', result);
      
      if (result.success) {
        console.log(`[HomeScreen] ${result.isFollowing ? 'Followed' : 'Unfollowed'} user:`, userId);
      } else {
        console.error('[HomeScreen] Follow operation failed:', result.error);
      }
      return result;
    } catch (error) {
      console.error('[HomeScreen] Error in follow operation:', error);
      return {
        success: false,
        error: 'Failed to update follow status'
      };
    }
  };

  const handleTokenPress = () => {
    setShowTokenModal(true);
  };

  const handleCreatePrompt = () => {
    navigation.navigate('CreatePrompt');
  };

  const handleTokenModalClose = () => {
    setShowTokenModal(false);
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadPrompts();
    if (selectedPrompt?.id) await loadSnapplesForPrompt(selectedPrompt);
    setRefreshing(false);
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
    <AppLayout navigation={navigation} active="prompts">

        {showLoadingState ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.vibeBlue} />
            <Text style={styles.loadingText}>Loading snapples...</Text>
          </View>
        ) : (
        <>
        {/* Prompt Carousel */}
        <PromptCarousel
          prompts={prompts}
          selectedPrompt={selectedPrompt}
          onPromptSelect={handlePromptSelect}
          onPromptPress={handlePromptPress}
          rightAccessory={
            <Pressable style={styles.sortButton} onPress={() => setShowSortModal(true)}>
              <Ionicons name="swap-vertical" size={14} color={theme.colors.vibeBlue} />
              <Text style={styles.sortButtonText}>
                {{ time: 'New', likes: 'Likes', views: 'Views', price: 'Price' }[sortBy]}
              </Text>
              <Ionicons name={ascending ? 'arrow-up' : 'arrow-down'} size={12} color={theme.colors.vibeBlue} />
            </Pressable>
          }
        />

        {/* Snapples Grid */}
        {snapples.length > 0 ? (
          <SnappleGrid
            snapples={snapples.filter(Boolean)}
            onSnapplePress={handleSnapplePress}
            refreshing={refreshing}
            onRefresh={handleRefresh}
            sortBy={sortBy}
            ascending={ascending}
            hideSort
          />
        ) : (
          <EmptySnappleList onCreateSnapple={() => navigation.navigate('Record', { prompt: selectedPrompt })} />
        )}
        </>
        )}

        {/* Snapple Overlay */}
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
          onClose={handleSnappleOverlayClose}
          onLike={handleLike}
          onDislike={handleDislike}
          onBuy={handleBuy}
          onReport={handleReport}
          navigation={navigation}
        />

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
          onRefresh={loadPrompts}
        />

    </AppLayout>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center', gap: 12,
  },
  loadingText: {
    color: theme.colors.textSecondary, fontSize: 14,
  },
  safeArea: {
    flex: 1,
    paddingBottom: 80,
  },
  sortButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderWidth: 1,
    borderColor: theme.colors.vibeBlue,
  },
  sortButtonText: {
    color: theme.colors.vibeBlue,
    fontSize: 11,
    fontWeight: theme.fontWeights.semiBold,
  },
});