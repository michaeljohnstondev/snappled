import React from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from './src/store/AuthContext';
import theme from './src/theme/themes';

// Screen imports
import LandingScreen from './src/screens/LandingScreen';
import LoginScreen from './src/screens/LoginScreen';
import SignupScreen from './src/screens/SignupScreen';
import HomeScreen from './src/screens/HomeScreen';
import PromptsScreen from './src/screens/PromptsScreen';
import PromptScreen from './src/screens/PromptScreen';
import CreatePromptScreen from './src/screens/CreatePromptScreen';
import RecordScreen from './src/screens/RecordScreen';
import VideoPreviewScreen from './src/screens/VideoPreviewScreen';
import UserProfileScreen from './src/screens/UserProfileScreen';
import DeckBuilderScreen from './src/screens/DeckBuilderScreen';
import AdminScreen from './src/screens/AdminScreen';
import GameScreen from './src/screens/GameScreen';

const Stack = createStackNavigator();

const screenOptions = {
  headerShown: false,
  cardStyle: { backgroundColor: 'transparent' },
  animationEnabled: false,
};

class ErrorBoundary extends React.Component {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#001020' }}>
          <Text style={{ color: '#00C6FF', fontSize: 16, marginBottom: 16 }}>Something went wrong</Text>
          <Text
            style={{ color: '#778DA9', fontSize: 14 }}
            onPress={() => this.setState({ hasError: false })}
          >
            Tap to retry
          </Text>
        </View>
      );
    }
    return this.props.children;
  }
}

export default function Navigation() {
  const { isAuthenticated, isLoading } = useAuth();

  if (isLoading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: theme.colors.background }}>
        <ActivityIndicator size="large" color={theme.colors.vibeBlue} />
      </View>
    );
  }

  return (
    <ErrorBoundary>
      {!isAuthenticated ? (
        <Stack.Navigator initialRouteName="Landing" screenOptions={screenOptions}>
          <Stack.Screen name="Landing" component={LandingScreen} />
          <Stack.Screen name="Login" component={LoginScreen} />
          <Stack.Screen name="Signup" component={SignupScreen} />
        </Stack.Navigator>
      ) : (
        <Stack.Navigator initialRouteName="Home" screenOptions={screenOptions}>
          <Stack.Screen name="Home" component={HomeScreen} />
          <Stack.Screen name="Prompts" component={PromptsScreen} />
          <Stack.Screen name="Prompt" component={PromptScreen} />
          <Stack.Screen name="CreatePrompt" component={CreatePromptScreen} />
          <Stack.Screen name="Record" component={RecordScreen} />
          <Stack.Screen name="VideoPreview" component={VideoPreviewScreen} />
          <Stack.Screen name="UserProfile" component={UserProfileScreen} />
          <Stack.Screen name="DeckBuilder" component={DeckBuilderScreen} />
          <Stack.Screen name="Game" component={GameScreen} />
          <Stack.Screen name="Admin" component={AdminScreen} />
        </Stack.Navigator>
      )}
    </ErrorBoundary>
  );
}
