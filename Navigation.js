import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { useAuth } from './src/store/AuthContext';

// Import working screens only
import LandingScreen from './src/screens/LandingScreen';
import SignupScreen from './src/screens/SignupScreen';
import PromptScreen from './src/screens/PromptScreen.jsx';
import PromptsScreen from './src/screens/PromptsScreen.jsx';
import HomeScreen from './src/screens/HomeScreen.jsx';
import RecordScreen from './src/screens/RecordScreen.jsx';
import VideoPreviewScreen from './src/screens/VideoPreviewScreen.jsx';
import CreatePromptScreen from './src/screens/CreatePromptScreen.jsx';

const Stack = createStackNavigator();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Landing" component={LandingScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
    </Stack.Navigator>
  );
}

function MainStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Home" component={HomeScreen} />
      <Stack.Screen name="Prompts" component={PromptsScreen} />
      <Stack.Screen name="Record" component={RecordScreen} />
      <Stack.Screen name="VideoPreview" component={VideoPreviewScreen} />
      <Stack.Screen name="CreatePrompt" component={CreatePromptScreen} />
    </Stack.Navigator>
  );
}

export default function Navigation() {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return null; // Or a loading screen
  }
  
  return isAuthenticated ? <MainStack /> : <AuthStack />;
}