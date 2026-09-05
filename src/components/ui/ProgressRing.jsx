// A circular progress fill that closes around whatever sits inside it.
//
// Drawn with two clipped half-discs rather than an SVG arc, because
// react-native-svg isn't a dependency here and a progress ring is not
// worth adding one for. Each half is clipped to its side of the circle
// and rotated about the centre line, so between them they can sweep a
// full 360 degrees:
//
//   0-50%   the right half rotates from 0 to 180
//   50-100% the right half stays at 180 and the left half takes over
//
// It fills as a PIE rather than punching a hollow ring, deliberately:
// a hollow centre needs an opaque plug the colour of whatever is
// behind it, and this sits on a gradient, so the plug would show as a
// seam. A translucent fill behind the label reads the same and can't
// mismatch its background.

import React from 'react';
import { View } from 'react-native';

export default function ProgressRing({
  size = 30,
  progress = 0,
  color,
  children,
}) {
  const p = Math.max(0, Math.min(1, progress || 0));
  const half = size / 2;

  // Each half-disc is a rectangle of half the width, rounded on its
  // outer edge, pivoting about the circle's centre.
  const disc = (side, deg) => (
    <View
      style={{
        position: 'absolute',
        [side]: 0,
        width: half,
        height: size,
        overflow: 'hidden',
      }}
      pointerEvents="none"
    >
      <View
        style={{
          width: half,
          height: size,
          backgroundColor: color,
          borderTopLeftRadius: side === 'left' ? half : 0,
          borderBottomLeftRadius: side === 'left' ? half : 0,
          borderTopRightRadius: side === 'right' ? half : 0,
          borderBottomRightRadius: side === 'right' ? half : 0,
          transformOrigin: side === 'left' ? 'right center' : 'left center',
          transform: [{ rotate: `${deg}deg` }],
        }}
      />
    </View>
  );

  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: half,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {/* Right half sweeps the first 180 degrees, then holds. */}
      {p > 0 && disc('right', p <= 0.5 ? p * 360 : 180)}
      {/* Left half only starts once the right one is full. */}
      {p > 0.5 && disc('left', (p - 0.5) * 360)}
      {children}
    </View>
  );
}
