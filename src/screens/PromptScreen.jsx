import { View, Text, StyleSheet, Alert } from 'react-native';
import { useState, useEffect } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import VibeButton from '../components/ui/VibeButton';
import theme from '../theme/themes';

// Time-based prompts that change every hour
const hourlyPrompts = [
  "What's the weirdest thing you've ever eaten?",
  "Show your best dance move in 10 seconds.",
  "Impersonate your favorite celebrity.",
  "Describe Monday in one word (but dramatically).",
  "If you were a superhero, what would be your most useless power?",
  "What's your most embarrassing autocorrect moment?",
  "Pitch a terrible movie idea in 10 seconds.",
  "React to finding $100 on the ground.",
  "Describe your dream vacation using only food names.",
  "Which animal would be the rudest if they could talk?",
  "Show us your worst cooking disaster story.",
  "Demonstrate your most embarrassing habit.",
  "What would you do if gravity stopped working?",
  "Recreate your worst school picture pose.",
  "Show your reaction to Monday morning.",
  "What's your weirdest flex?",
  "Demonstrate how you'd explain TikTok to aliens.",
  "Show your best 'I'm fine' when you're not fine.",
  "What's your most irrational fear?",
  "Demonstrate your worst pickup line.",
  "Show how you'd survive a zombie apocalypse.",
  "What's your most useless talent?",
  "Recreate your favorite childhood commercial.",
  "Show your reaction to seeing your ex at the store."
];

export default function PromptScreen({ navigation }) {
  const [currentPrompt, setCurrentPrompt] = useState('');
  const [timeUntilNext, setTimeUntilNext] = useState('');
  const [promptNumber, setPromptNumber] = useState(0);
  const [videoCount, setVideoCount] = useState(0);

  // Get current hour-based prompt
  function getCurrentPrompt() {
    const now = new Date();
    const hourIndex = now.getHours(); // 0-23
    const promptIndex = hourIndex % hourlyPrompts.length;
    return {
      prompt: hourlyPrompts[promptIndex],
      number: hourIndex + 1
    };
  }

  // Calculate time until next prompt
  function getTimeUntilNext() {
    const now = new Date();
    const nextHour = new Date(now);
    nextHour.setHours(now.getHours() + 1, 0, 0, 0);
    
    const diff = nextHour.getTime() - now.getTime();
    const minutes = Math.floor(diff / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);
    
    return `${minutes}:${seconds.toString().padStart(2, '0')}`;
  }

  // Initialize prompt data
  useEffect(() => {
    const updatePromptData = () => {
      const { prompt, number } = getCurrentPrompt();
      setCurrentPrompt(prompt);
      setPromptNumber(number);
      setTimeUntilNext(getTimeUntilNext());
      // Simulate video count (would come from API)
      setVideoCount(Math.floor(Math.random() * 150) + 10);
    };

    updatePromptData();
    
    // Update timer every second
    const timer = setInterval(() => {
      setTimeUntilNext(getTimeUntilNext());
    }, 1000);

    // Update prompt every hour
    const hourTimer = setInterval(updatePromptData, 60 * 60 * 1000);

    return () => {
      clearInterval(timer);
      clearInterval(hourTimer);
    };
  }, []);

  function handleCreateVideo() {
    navigation.navigate('VideoRecord');
  }

  function handleWatchVideos() {
    navigation.navigate('Feed');
  }

  function handleGoHome() {
    navigation.navigate('Home');
  }

  return (
    <LinearGradient
      colors={theme.colors.backgroundGradient}
      style={styles.container}
    >
      <View style={styles.header}>
        <Text style={styles.title}>🍏 Today&apos;s Snapple Prompt</Text>
        <View style={styles.promptMeta}>
          <Text style={styles.promptNumber}>Prompt #{promptNumber}</Text>
          <View style={styles.timerContainer}>
            <Ionicons name="time-outline" size={16} color={theme.colors.textSecondary} />
            <Text style={styles.timer}>Next in {timeUntilNext}</Text>
          </View>
        </View>
      </View>

      <View style={styles.promptCard}>
        <View style={styles.promptContainer}>
          <Text style={styles.promptText}>{currentPrompt}</Text>
        </View>
        
        <View style={styles.statsContainer}>
          <View style={styles.statItem}>
            <Ionicons name="videocam" size={20} color={theme.colors.vibeBlue} />
            <Text style={styles.statText}>{videoCount} videos created</Text>
          </View>
          <View style={styles.statItem}>
            <Ionicons name="timer-outline" size={20} color={theme.colors.vibeOrange} />
            <Text style={styles.statText}>10 second limit</Text>
          </View>
        </View>
      </View>

      <View style={styles.buttonGroup}>
        <VibeButton
          label="🎥 Create Video"
          onPress={handleCreateVideo}
          style={styles.createButton}
        />
        
        <VibeButton
          label={`👀 Watch Videos (${videoCount})`}
          onPress={handleWatchVideos}
          style={styles.watchButton}
        />
        
        <VibeButton
          label="🏠 Back to Home"
          onPress={handleGoHome}
          style={styles.homeButton}
        />
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: theme.sizes.spacing?.lg || 24,
    justifyContent: 'space-between',
  },
  header: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: 40,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: 16,
    textAlign: 'center',
    ...theme.shadows?.textGlow,
  },
  promptMeta: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 20,
  },
  promptNumber: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  timerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    gap: 6,
  },
  timer: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '600',
  },
  promptCard: {
    flex: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: theme.sizes.borderRadius || 12,
    padding: theme.sizes.spacing?.xl || 32,
    marginVertical: theme.sizes.spacing?.lg || 24,
    justifyContent: 'space-between',
    borderWidth: 1,
    borderColor: 'rgba(0, 198, 255, 0.3)',
  },
  promptContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  promptText: {
    fontSize: 22,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    textAlign: 'center',
    lineHeight: 30,
    letterSpacing: 0.5,
  },
  statsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginTop: theme.sizes.spacing?.xl || 32,
    paddingTop: theme.sizes.spacing?.lg || 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
  },
  statItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  statText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  buttonGroup: {
    gap: theme.sizes.spacing?.md || 16,
  },
  createButton: {
    backgroundColor: theme.colors.vibeGreen,
  },
  watchButton: {
    backgroundColor: theme.colors.vibeBlue,
  },
  homeButton: {
    opacity: 0.8,
  },
});