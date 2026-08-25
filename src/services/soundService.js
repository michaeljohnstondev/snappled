/**
 * soundService.js — game SFX playback.
 *
 * Owns every sound the game makes. Screens call soundService.play('voteLock')
 * and never touch expo-audio directly, so swapping the audio backend or the
 * asset files is a one-file change.
 *
 * Players are created once and reused. Creating an AudioPlayer per trigger
 * leaks native handles fast in a game that fires a tick every second.
 *
 * Every entry point is failure-tolerant on purpose: audio is a garnish, and
 * a codec hiccup must never take down a round in progress.
 */

import { createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Haptics from 'expo-haptics';
import AsyncStorage from '@react-native-async-storage/async-storage';

const ENABLED_KEY = '@snappled:sfxEnabled';

// Static requires — Metro needs these resolvable at build time, so they
// can't be built from a template string.
const SOURCES = {
  cardPick: require('../../assets/sounds/card-pick.wav'),
  voteLock: require('../../assets/sounds/vote-lock.wav'),
  countdownTick: require('../../assets/sounds/countdown-tick.wav'),
  roundWinner: require('../../assets/sounds/round-winner.wav'),
  gameOver: require('../../assets/sounds/game-over.wav'),
};

// Per-sound mix. The generator normalises loudness roughly, but ticks fire
// ten times in a row and shouldn't sit as loud as a one-off win sting.
const VOLUME = {
  cardPick: 0.5,
  voteLock: 0.8,
  countdownTick: 0.35,
  roundWinner: 0.9,
  gameOver: 1.0,
};

// Haptic paired with each sound, so feel and audio stay in sync and a
// user with SFX off still gets feedback.
const HAPTIC = {
  cardPick: 'light',
  voteLock: 'medium',
  countdownTick: null, // too frequent — would buzz constantly
  roundWinner: 'success',
  gameOver: 'success',
};

const players = {};
let enabled = true;
let initialised = false;

async function fireHaptic(kind) {
  if (!kind) return;
  try {
    if (kind === 'success') {
      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (kind === 'medium') {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } else {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    }
  } catch {
    // Haptics are unavailable on some Android hardware. Non-fatal.
  }
}

export const soundService = {
  /**
   * Preload every player and restore the user's on/off preference.
   * Safe to call more than once — later calls are no-ops.
   */
  async init() {
    if (initialised) return;
    initialised = true;

    try {
      const stored = await AsyncStorage.getItem(ENABLED_KEY);
      if (stored !== null) enabled = stored === 'true';
    } catch {
      // Keep the default (on) if storage is unreadable.
    }

    try {
      // playsInSilentMode is on because the app's core content is video
      // with audio — a muted feed reads as broken, not as respectful.
      // shouldPlayInBackground stays off so SFX can't outlive the screen.
      await setAudioModeAsync({
        playsInSilentMode: true,
        shouldPlayInBackground: false,
      });
    } catch (error) {
      console.warn('[SoundService] audio mode failed:', error?.message);
    }

    for (const [key, source] of Object.entries(SOURCES)) {
      try {
        const player = createAudioPlayer(source);
        player.volume = VOLUME[key] ?? 1;
        players[key] = player;
      } catch (error) {
        console.warn(`[SoundService] failed to load "${key}":`, error?.message);
      }
    }
  },

  /**
   * Fire a sound by key. Restarts from the top if it's already playing so
   * rapid repeats (tick, tick, tick) don't get swallowed.
   * @param {keyof SOURCES} key
   */
  play(key) {
    fireHaptic(HAPTIC[key]);
    if (!enabled) return;

    const player = players[key];
    if (!player) return;

    try {
      // seekTo is async but we deliberately don't await — waiting on it
      // adds latency to a sound whose whole job is to feel instant.
      player.seekTo(0).catch(() => {});
      player.play();
    } catch (error) {
      console.warn(`[SoundService] play "${key}" failed:`, error?.message);
    }
  },

  isEnabled() {
    return enabled;
  },

  async setEnabled(next) {
    enabled = !!next;
    try {
      await AsyncStorage.setItem(ENABLED_KEY, String(enabled));
    } catch {
      // Preference just won't survive a restart. Not worth surfacing.
    }
  },

  /** Release native players. Call on sign-out / teardown. */
  unload() {
    for (const key of Object.keys(players)) {
      try {
        players[key].remove();
      } catch {
        // Already released.
      }
      delete players[key];
    }
    initialised = false;
  },
};

export default soundService;
