// WelcomeOverlay.jsx — the first thing a new account sees.
//
// Snappled asks people to do something unusual before it explains
// itself: record a short video answering a prompt, then play it against
// somebody else's. Everything in the app assumes you already know that,
// and someone who has just signed in does not.
//
// Uses the same card the games use for a phase intro, so the first thing
// you read looks like every explanation that follows.
//
// Remembered PER ACCOUNT, not per device. A phone can sign a second
// person in, and that person has not seen this.

import React, { useState, useEffect } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RoundStartOverlay from '../game/RoundStartOverlay';

// Bumping this re-shows the welcome to everyone, which is the only way
// to reintroduce the app if what it does ever changes meaningfully.
const KEY_PREFIX = 'welcomeSeen:v1:';

const WELCOME = {
  title: 'Welcome to Snappled',
  bullets: [
    'A snapple is a short video answering a prompt',
    'Record your own, or collect ones other people made',
    'In a game, everyone plays a snapple for each round’s prompt',
    'The best one wins the round!',
    'Your deck is what you bring — build it before you play',
  ],
};

/** @param {string} userId  nothing is shown until this is known */
export default function WelcomeOverlay({ userId }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (!userId) return undefined;
    let cancelled = false;
    AsyncStorage.getItem(KEY_PREFIX + userId)
      .then((seen) => { if (!seen && !cancelled) setVisible(true); })
      // Storage unavailable just means it isn't shown. Better than
      // showing it on every launch on a device that cannot remember.
      .catch(() => {});
    return () => { cancelled = true; };
  }, [userId]);

  const dismiss = () => {
    setVisible(false);
    AsyncStorage.setItem(KEY_PREFIX + userId, '1').catch(() => {});
  };

  return (
    <RoundStartOverlay
      visible={visible}
      title={WELCOME.title}
      bullets={WELCOME.bullets}
      onDismiss={dismiss}
    />
  );
}
