import React, { useEffect, useRef, useState } from 'react';
import { Text } from 'react-native';

// Animates from the previous value to the new value over `duration` ms whenever
// `value` changes. Used for resource-bar style numbers that should tick rather
// than snap (game-over rewards, level-up XP, snapple creation XP, etc.).
export default function TickingNumber({ value, format, style, duration = 700 }) {
  const [displayed, setDisplayed] = useState(value || 0);
  const lastValueRef = useRef(value || 0);

  useEffect(() => {
    const target = value || 0;
    if (target === lastValueRef.current) return;
    const start = lastValueRef.current;
    const startTime = Date.now();
    let frameId;
    const tick = () => {
      const elapsed = Date.now() - startTime;
      const t = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      setDisplayed(Math.round(start + (target - start) * eased));
      if (t < 1) {
        frameId = requestAnimationFrame(tick);
      } else {
        lastValueRef.current = target;
      }
    };
    frameId = requestAnimationFrame(tick);
    return () => { if (frameId) cancelAnimationFrame(frameId); };
  }, [value, duration]);

  return <Text style={style}>{format ? format(displayed) : displayed}</Text>;
}
