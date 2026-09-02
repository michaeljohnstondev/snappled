// Loading phase — sits between LOBBY and REVIEW so every client has a
// chance to pre-download every video AND thumbnail in the drawn hand
// before the warmup timer starts. Shows a big percentage counter (no
// per-video status text) with a rotating tip from loadingTips.js —
// tap the screen to cycle to another tip.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { prefetchVideo } from '../../../services/videoCache';
import { thumbnailService } from '../../../services/thumbnailService';
import { pickRandomTip } from '../../../lib/loadingTips';
import theme from '../../../theme/themes';
import { useTheme, useThemedStyles } from '../../../theme/ThemeContext';

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
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
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

  // Cycling tip. Start with one random tip; tapping the backdrop
  // swaps it. Keep a small "seen" set to avoid repeating the last
  // few tips back-to-back.
  const seenRef = useRef(new Set());
  const [tip, setTip] = useState(() => {
    const picked = pickRandomTip(seenRef.current);
    seenRef.current.add(picked.index);
    return picked.tip;
  });
  const nextTip = useCallback(() => {
    const picked = pickRandomTip(seenRef.current);
    seenRef.current.add(picked.index);
    // Keep the "seen" cap small so the pool refreshes as the user
    // taps through it.
    if (seenRef.current.size > 6) seenRef.current = new Set([picked.index]);
    setTip(picked.tip);
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

    // For each card we kick off BOTH the video prefetch and the
    // thumbnail extraction in parallel, then wait for both to
    // settle before counting the card done. Without preloading
    // thumbnails, SnappleThumbnail would show its own loading
    // spinner on mount even though the video is cached — user
    // sees a "twirl" on every card on the picking screen.
    hand.forEach((card) => {
      const url = card?.videoUrl;
      if (!url) {
        completed += 1;
        if (!cancelled) setDoneCount(completed);
        return;
      }
      Promise.allSettled([
        prefetchVideo(url),
        thumbnailService.getThumbnail(url),
      ]).then(() => {
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

  // Percentage — capped at 100 and blended with a soft floor so the
  // display never stays at 0 forever if a slow network is dragging
  // the first prefetch.
  const pct = total > 0 ? Math.min(100, Math.round((doneCount / total) * 100)) : 0;

  return (
    <Pressable style={styles.container} onPress={nextTip}>
      <LinearGradient
        colors={t.colors.gameBackgroundGradient}
        style={StyleSheet.absoluteFill}
      />
      <View style={styles.pctBlock}>
        <Text style={styles.pctText}>{pct}%</Text>
        <View style={styles.progressBarWrap}>
          <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
        </View>
      </View>

      <View style={styles.tipBlock}>
        <Text style={styles.tipTitle}>{tip.title}</Text>
        <Text style={styles.tipBody}>{tip.body}</Text>
        <Text style={styles.tipHint}>tap for another tip</Text>
      </View>
    </Pressable>
  );
}

const makeStyles = (t) => ({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 32,
  },
  pctBlock: {
    alignItems: 'center',
    marginBottom: 36,
    width: '100%',
  },
  pctText: {
    color: theme.colors.vibeBlue,
    fontSize: 64,
    fontWeight: '900',
    letterSpacing: 2,
    fontVariant: ['tabular-nums'],
    marginBottom: 14,
  },
  progressBarWrap: {
    width: '70%',
    height: 6,
    borderRadius: 3,
    backgroundColor: t.colors.inputBackground,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.vibeBlue,
    borderRadius: 3,
  },
  tipBlock: {
    alignItems: 'center',
    maxWidth: 340,
  },
  tipTitle: {
    color: t.colors.textPrimary,
    fontSize: 16,
    fontWeight: '900',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
    textAlign: 'center',
  },
  tipBody: {
    color: t.colors.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    textAlign: 'center',
    marginBottom: 14,
  },
  tipHint: {
    color: theme.colors.vibeBlue,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    opacity: 0.6,
  },
});
