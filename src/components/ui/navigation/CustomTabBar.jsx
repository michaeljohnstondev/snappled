import React from 'react';
import { View, Pressable, Text, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import theme from '../../../theme/themes';

export default function CustomTabBar({ state, descriptors, navigation }) {
  const insets = useSafeAreaInsets();
  // Lift the tab bar above the Android gesture-nav home-swipe zone (~16-32px)
  // so taps near the bottom of the tab don't fight with the system gesture.
  const liftAbove = Math.max(insets.bottom, 16);

  // Honor tabBarStyle.display === 'none' from the focused screen so screens
  // can hide the bar (e.g. inside an active game).
  const focusedDescriptor = descriptors[state.routes[state.index].key];
  if (focusedDescriptor?.options?.tabBarStyle?.display === 'none') return null;

  return (
    <View style={[styles.container, { height: 54 + liftAbove }]}>
      {state.routes.map((route, index) => {
        const focused = state.index === index;
        const isRecord = route.name === 'RecordTab';

        const onPress = () => {
          if (isRecord) {
            navigation.navigate('Record', { prompt: null });
            return;
          }
          const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
          if (!focused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        if (isRecord) {
          return (
            <View key={route.key} style={[styles.recordSlot, { paddingBottom: liftAbove }]}>
              <Pressable onPress={onPress} style={({ pressed }) => [styles.recordBtn, { opacity: pressed ? 0.85 : 1 }]}>
                <LinearGradient
                  colors={[theme.colors.vibeBlue, theme.colors.vibePurple]}
                  style={styles.recordGradient}
                  start={{ x: 0, y: 0 }}
                  end={{ x: 1, y: 1 }}
                >
                  <Ionicons name="videocam" size={28} color="white" />
                </LinearGradient>
              </Pressable>
            </View>
          );
        }

        return (
          <Pressable key={route.key} style={[styles.tabBtn, focused && styles.tabBtnActive]} onPress={onPress}>
            <Text style={[styles.tabText, focused && styles.tabTextActive]}>{route.name}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    backgroundColor: theme.colors.background,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.1)',
    overflow: 'visible',
  },
  tabBtn: {
    flex: 1,
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  tabBtnActive: {
    backgroundColor: 'rgba(0, 198, 255, 0.15)',
    marginTop: -1,
    borderTopWidth: 3,
    borderTopColor: theme.colors.vibeBlue,
  },
  tabText: {
    color: 'rgba(255, 255, 255, 0.95)',
    fontSize: 13,
    fontWeight: 'bold',
  },
  tabTextActive: {
    color: theme.colors.vibeBlue,
  },
  recordSlot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  recordBtn: {
    width: 64,
    height: 64,
    borderRadius: 32,
    marginTop: -12,
    shadowColor: theme.colors.vibeBlue,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 12,
  },
  recordGradient: {
    flex: 1,
    borderRadius: 32,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 3,
    borderColor: theme.colors.background,
  },
});
