// Loading phase — sits between LOBBY and REVIEW so every client has a
// chance to pre-download every video in the drawn hand before the
// warmup timer starts. Prevents the "warmup opens but thumbnails are
// blank while videos stream in" glitch on slow networks.
//
// Behavior:
// - Renders a spinner + progress ("Loading 3/6").
// - Kicks off videoCache.prefetchVideo on every hand URL in parallel.
// - Reports completion up to GameScreen, which is the only client with
//   authority to advance the game phase (host).

import React, { useEffect, useRef, useState } from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { prefetchVideo } from '../../../services/videoCache';
import theme from '../../../theme/themes';

// Max time we'll sit on the loading screen before advancing anyway.
// A stuck CDN request or a bad URL shouldn't be able to hold the
// whole game hostage — 12s covers slow LTE and still feels snappy.
const MAX_WAIT_MS = 12000;

// Minimum time the screen stays up even when every prefetch was
// already cached. Without this the loading screen flashes for a
// frame and users think it never rendered.
const MIN_DISPLAY_MS = 1500;

// Render the loading UI. `hand` is the array of drawn snapples;
// `onLoaded` fires exactly once when every URL has resolved (or the
// per-video attempt has settled — a failing prefetch still counts as
// "done" so a broken URL doesn't stall the whole flow). A parallel
// timeout fires onLoaded regardless after MAX_WAIT_MS.
export default function LoadingPhase({ hand, onLoaded }) {
  const total = hand?.length || 0;
  const [doneCount, setDoneCount] = useState(0);
  const [firedOnce, setFiredOnce] = useState(false);
  // Guarantees the loading screen renders long enough to actually
  // be seen — flips true after MIN_DISPLAY_MS.
  const [minElapsed, setMinElapsed] = useState(false);
  useEffect(() => {
    const id = setTimeout(() => setMinElapsed(true), MIN_DISPLAY_MS);
    return () => clearTimeout(id);
  }, []);
  // Callers often pass a fresh arrow function each render — snapshot
  // the latest into a ref so effect deps stay stable and the fallback
  // timer doesn't reset every parent render.
  const onLoadedRef = useRef(onLoaded);
  useEffect(() => { onLoadedRef.current = onLoaded; }, [onLoaded]);

  useEffect(() => {
    if (!hand || hand.length === 0) return;
    let cancelled = false;
    let completed = 0;

    // Each snapple's prefetch settles independently — we count settled
    // (not just successful) so a bad URL can't hold up the round.
    hand.forEach((card) => {
      const url = card?.videoUrl;
      if (!url) {
        completed += 1;
        if (!cancelled) setDoneCount(completed);
        return;
      }
      prefetchVideo(url).finally(() => {
        if (cancelled) return;
        completed += 1;
        setDoneCount(completed);
      });
    });

    return () => { cancelled = true; };
  }, [hand]);

  // Fire onLoaded when either every prefetch has settled OR the
  // fallback timer expires. `firedOnce` guards against firing twice
  // if both conditions land in the same tick.
  useEffect(() => {
    if (firedOnce) return;
    // Wait for BOTH the minimum display window AND the prefetch
    // completion. Prevents the flash-and-gone case when every
    // video is already cached.
    if (minElapsed && total > 0 && doneCount >= total) {
      setFiredOnce(true);
      onLoadedRef.current?.();
    }
  }, [doneCount, total, firedOnce, minElapsed]);

  useEffect(() => {
    const id = setTimeout(() => {
      if (!firedOnce) {
        setFiredOnce(true);
        onLoadedRef.current?.();
      }
    }, MAX_WAIT_MS);
    return () => clearTimeout(id);
  }, [firedOnce]);

  return (
    <LinearGradient colors={theme.colors.backgroundGradient} style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color={theme.colors.vibeBlue} />
        <Text style={styles.title}>Loading Snapples</Text>
        <Text style={styles.progress}>
          {total > 0 ? `${doneCount} of ${total}` : 'Drawing hand...'}
        </Text>
        <Text style={styles.hint}>
          Downloading videos so the round runs smooth.
        </Text>
      </View>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  content: { alignItems: 'center', gap: 14, paddingHorizontal: 32 },
  title: {
    color: theme.colors.vibeBlue,
    fontSize: 22,
    fontWeight: theme.fontWeights.bold,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 8,
  },
  progress: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: theme.fontWeights.bold,
  },
  hint: {
    color: theme.colors.textSecondary,
    fontSize: 13,
    textAlign: 'center',
    marginTop: 4,
  },
});
