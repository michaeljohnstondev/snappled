import React from 'react';
import { createStackNavigator } from '@react-navigation/stack';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { useAuth } from './src/store/AuthContext';
import theme from './src/theme/themes';

// Import working screens only
import LandingScreen from './src/screens/LandingScreen';
import SignupScreen from './src/screens/SignupScreen';
import FeedScreen from './src/screens/FeedScreen/index.jsx';
import PromptScreen from './src/screens/PromptScreen/index.jsx';
import HomeScreen from './src/screens/HomeScreen/index.jsx';
import RecordScreen from './src/screens/RecordScreen/index.jsx';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

function AuthStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Landing" component={LandingScreen} />
      <Stack.Screen name="Signup" component={SignupScreen} />
    </Stack.Navigator>
  );
}

function MainTabs() {
  return (
    <Tab.Navigator 
      screenOptions={({ route }) => ({
        headerShown: false,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;
          
          if (route.name === 'Home') {
            iconName = focused ? 'home' : 'home-outline';
          } else if (route.name === 'Play') {
            iconName = focused ? 'game-controller' : 'game-controller-outline';
          } else if (route.name === 'MyDeck') {
            iconName = focused ? 'albums' : 'albums-outline';
          } else if (route.name === 'Leaderboard') {
            iconName = focused ? 'trophy' : 'trophy-outline';
          }
          
          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: theme.colors.vibeBlue,
        tabBarInactiveTintColor: theme.colors.textSecondary,
        tabBarStyle: {
          backgroundColor: theme.colors.background,
          borderTopColor: 'rgba(255, 255, 255, 0.1)',
          borderTopWidth: 1,
          paddingTop: 8,
          paddingBottom: 8,
          height: 80,
        },
        tabBarLabelStyle: {
          fontSize: 12,
          fontWeight: theme.fontWeights.medium,
        },
      })}
    >
      <Tab.Screen 
        name="Home" 
        component={HomeScreen}
        options={{ tabBarLabel: 'Home' }}
      />
      <Tab.Screen 
        name="Play" 
        component={FeedScreen}
        options={{ tabBarLabel: 'Play Game' }}
      />
      <Tab.Screen 
        name="MyDeck" 
        component={PromptScreen}
        options={{ tabBarLabel: 'My Deck' }}
      />
      <Tab.Screen 
        name="Leaderboard" 
        component={RecordScreen}
        options={{ tabBarLabel: 'Leaderboard' }}
      />
    </Tab.Navigator>
  );
}

export default function Navigation() {
  const { isAuthenticated, isLoading } = useAuth();
  
  if (isLoading) {
    return null; // Or a loading screen
  }
  
  return isAuthenticated ? <MainTabs /> : <AuthStack />;
}