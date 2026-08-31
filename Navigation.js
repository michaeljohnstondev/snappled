import React from 'react';
import { ActivityIndicator, View, Text } from 'react-native';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { useAuth } from './src/store/AuthContext';
import theme from './src/theme/themes';
import CustomTabBar from './src/components/ui/navigation/CustomTabBar';

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
import OtherPersonsProfile from './src/screens/OtherPersonsProfile';
import FollowingListScreen from './src/screens/FollowingListScreen';
import DeckBuilderScreen from './src/screens/DeckBuilderScreen';
import AdminScreen from './src/screens/AdminScreen';
import GameScreen from './src/screens/GameScreen';
import StoreScreen from './src/screens/StoreScreen';
import AchievementsScreen from './src/screens/AchievementsScreen';
import NotificationSettingsScreen from './src/screens/NotificationSettingsScreen';
import SettingsScreen from './src/screens/SettingsScreen';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

const screenOptions = {
  headerShown: false,
  animationEnabled: false,
};

function EmptyScreen() {
  return null;
}

// Inner stack for the Prompts tab — keeps the bottom tab bar visible when
// drilling into the per-prompt snapple grid (HomeScreen).
function PromptsStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="PromptsList" component={PromptsScreen} />
      <Stack.Screen name="Snapples" component={HomeScreen} />
    </Stack.Navigator>
  );
}

// Inner stack for the Profile tab — keeps the bottom tab bar visible
// when drilling into DeckBuilder / friend profiles / follower lists.
// OtherPersonsProfile + FollowingList are ALSO defined in the root
// stack for callers coming from screens outside the tab navigator
// (game, record, etc.). React Navigation resolves the closest match,
// so navigating from within the Profile tab lands on the tab-hosted
// versions and keeps the tab bar rendered.
function ProfileStack() {
  return (
    <Stack.Navigator screenOptions={screenOptions}>
      <Stack.Screen name="ProfileHome" component={UserProfileScreen} />
      <Stack.Screen name="DeckBuilder" component={DeckBuilderScreen} />
      <Stack.Screen name="OtherPersonsProfile" component={OtherPersonsProfile} />
      <Stack.Screen name="FollowingList" component={FollowingListScreen} />
      <Stack.Screen name="UserProfile" component={UserProfileScreen} />
      <Stack.Screen name="Settings" component={SettingsScreen} />
      <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator
      screenOptions={{ headerShown: false }}
      tabBar={(props) => <CustomTabBar {...props} />}
    >
      <Tab.Screen name="Prompts" component={PromptsStack} />
      <Tab.Screen name="Play" component={GameScreen} />
      <Tab.Screen name="RecordTab" component={EmptyScreen} />
      <Tab.Screen name="Profile" component={ProfileStack} />
      <Tab.Screen name="Store" component={StoreScreen} />
    </Tab.Navigator>
  );
}

// Top-level error boundary — surfaces the actual error message + first lines
// of the component stack on the screen so we can diagnose crashes without
// needing to wire up remote logging.
class ErrorBoundary extends React.Component {
  state = { hasError: false, error: null, info: null };
  static getDerivedStateFromError(error) { return { hasError: true, error }; }
  componentDidCatch(error, info) {
    console.error('[ErrorBoundary]', error, info);
    this.setState({ info });
  }
  render() {
    if (this.state.hasError) {
      const msg = this.state.error?.message || String(this.state.error || 'Unknown error');
      const stack = (this.state.error?.stack || '').split('\n').slice(0, 6).join('\n');
      const compStack = (this.state.info?.componentStack || '').split('\n').slice(0, 6).join('\n');
      return (
        <View style={{ flex: 1, padding: 16, justifyContent: 'center', backgroundColor: '#001020' }}>
          <Text style={{ color: '#00C6FF', fontSize: 16, marginBottom: 12, textAlign: 'center' }}>Something went wrong</Text>
          <Text selectable style={{ color: '#FF4D6D', fontSize: 12, marginBottom: 10 }}>{msg}</Text>
          {!!stack && (
            <Text selectable style={{ color: '#778DA9', fontSize: 10, marginBottom: 10 }}>{stack}</Text>
          )}
          {!!compStack && (
            <Text selectable style={{ color: '#778DA9', fontSize: 10, marginBottom: 12 }}>{compStack}</Text>
          )}
          <Text style={{ color: '#00C6FF', fontSize: 14, textAlign: 'center' }} onPress={() => this.setState({ hasError: false, error: null, info: null })}>
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
        <Stack.Navigator initialRouteName="Main" screenOptions={screenOptions}>
          <Stack.Screen name="Main" component={MainTabs} />
          <Stack.Screen name="Prompt" component={PromptScreen} />
          <Stack.Screen name="CreatePrompt" component={CreatePromptScreen} />
          <Stack.Screen name="Record" component={RecordScreen} />
          <Stack.Screen name="VideoPreview" component={VideoPreviewScreen} />
          <Stack.Screen name="UserProfile" component={UserProfileScreen} />
          <Stack.Screen name="OtherPersonsProfile" component={OtherPersonsProfile} />
          <Stack.Screen name="FollowingList" component={FollowingListScreen} />
          <Stack.Screen name="Game" component={GameScreen} />
          <Stack.Screen name="Achievements" component={AchievementsScreen} />
          <Stack.Screen name="Settings" component={SettingsScreen} />
          <Stack.Screen name="NotificationSettings" component={NotificationSettingsScreen} />
          <Stack.Screen name="Admin" component={AdminScreen} />
        </Stack.Navigator>
      )}
    </ErrorBoundary>
  );
}
