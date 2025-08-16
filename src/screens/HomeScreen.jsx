import React, { useState, useEffect } from 'react';
import { StyleSheet, SafeAreaView } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import PromptCarousel from '../components/ui/PromptCarousel';
// import SnappleGrid from '../components/ui/snapples/SnappleGrid';
import EmptySnappleList from '../components/ui/snapples/EmptySnappleList';
import SnappleOverlay from '../components/ui/SnappleOverlay';
import ButtonContainer from '../components/ui/navigation/ButtonContainer';
import NavButton from '../components/ui/navigation/NavButton';
import HomeHeader from '../components/ui/headers/HomeHeader';
import { useAuth } from '../store/AuthContext';
import { promptService } from '../services/promptService';
import { snappleService } from '../services/snappleService';
import theme from '../theme/themes';

export default function HomeScreen({ navigation }) {
  const { user, userCurrency } = useAuth();
  
  // State
  const [prompts, setPrompts] = useState([]);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [snapples, setSnapples] = useState([]);
  const [selectedSnapple, setSelectedSnapple] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Load initial data
  useEffect(() => {
    loadData();
  }, []);

  // Load snapples when prompt changes
  useEffect(() => {
    if (selectedPrompt) {
      loadSnapplesForPrompt(selectedPrompt.id);
    }
  }, [selectedPrompt]);

  const loadData = async () => {
    setIsLoading(true);
    try {
      // Load recent prompts
      const promptsResult = await promptService.getRecentPrompts(10);
      if (promptsResult.success && promptsResult.prompts?.length > 0) {
        setPrompts(promptsResult.prompts);
        setSelectedPrompt(promptsResult.prompts[0]); // Select first prompt by default
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
        setSelectedPrompt(fallbackPrompts[0]);
      }
    } catch (error) {
      console.error('[HomeScreen] Error loading data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadSnapplesForPrompt = async (promptId) => {
    try {
      // For now, load all active snapples and filter by prompt later
      // You might want to add a method to snappleService to filter by promptId
      const result = await snappleService.getActiveSnapples(20);
      if (result.success) {
        // Filter snapples for this prompt or show all if none match
        const filteredSnapples = result.snapples.filter(s => s.promptId === promptId);
        setSnapples(filteredSnapples.length > 0 ? filteredSnapples : result.snapples.slice(0, 6));
      }
    } catch (error) {
      console.error('[HomeScreen] Error loading snapples:', error);
      setSnapples([]);
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

  const handleRefresh = async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  };

  const userStats = {
    coins: userCurrency.coins || 0,
    trophies: userCurrency.trophies || 0,
    level: Math.floor((userCurrency.coins || 0) / 100) + 1,
    username: user?.username || user?.email?.split('@')[0] || 'Player'
  };

  return (
    <LinearGradient
      colors={theme.colors.backgroundGradient}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <HomeHeader userStats={userStats} />

        {/* Prompt Carousel */}
        <PromptCarousel
          prompts={prompts}
          selectedPrompt={selectedPrompt}
          onPromptSelect={handlePromptSelect}
        />

        {/* Snapples Grid */}
        {/* <SnappleGrid
          snapples={snapples}
          onSnapplePress={handleSnapplePress}
          refreshing={refreshing}
          onRefresh={handleRefresh}
        /> */}
        
        <EmptySnappleList onCreateSnapple={() => navigation.navigate('Record', { prompt: selectedPrompt })} />

        {/* Snapple Overlay */}
        <SnappleOverlay
          visible={!!selectedSnapple}
          snapple={selectedSnapple}
          onClose={handleSnappleOverlayClose}
          onLike={handleLike}
          onDislike={handleDislike}
          onBuy={handleBuy}
          onReport={handleReport}
        />
      </SafeAreaView>
      
      <ButtonContainer>
        <NavButton title="Home" onPress={() => navigation.navigate('Home')} />
        <NavButton title="Play" />
        <NavButton title="Deck" />
        <NavButton title="Test" />
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
});