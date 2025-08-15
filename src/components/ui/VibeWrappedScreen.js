import React from 'react';
import VibeScreen from './VibeScreen';
import { StatusBar } from 'expo-status-bar';

export default function VibeWrappedScreen(Component) {
  return (props) => (
    <VibeScreen>
      <StatusBar style="light" />
      <Component {...props} />
    </VibeScreen>
  );
}
