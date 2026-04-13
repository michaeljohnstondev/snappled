import React from 'react';
import VibeScreen from './VibeScreen';

export default function VibeWrappedScreen(Component) {
  return (props) => (
    <VibeScreen>
      <Component {...props} />
    </VibeScreen>
  );
}
