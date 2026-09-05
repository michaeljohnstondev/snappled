// Loading phase — sits between LOBBY and REVIEW so every client has a
// chance to pre-download every video AND thumbnail in the drawn hand
// before the warmup timer starts. Shows a big percentage counter (no
// per-video status text) with a rotating tip from loadingTips.js —
// tap the screen to cycle to another tip.

import React, { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, StyleSheet, Image } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import {
  prefetchVideo, isVideoCached, getPrefetchError, getDownloadProgress,
  onDownloadProgress,
} from '../../../services/videoCache';
import ProgressRing from '../../ui/ProgressRing';
import { useAuth } from '../../../store/AuthContext';
import { useModal } from '../../../store/ModalContext';
import { thumbnailService } from '../../../services/thumbnailService';
import { pickRandomTip } from '../../../lib/loadingTips';
import theme from '../../../theme/themes';
import { useTheme, useThemedStyles } from '../../../theme/ThemeContext';

// Fallback only for when the game doc carries no deadline (an older
// client, or a game started before loadingDeadline existed).
//
// This was 12s, on the theory that it "covers slow LTE". It does not: a
// hand of eight clips off wifi is tens of megabytes, so the timer fired
// long before the downloads finished and the round started on top of
// them. The real budget now comes from the game doc, shared by everyone
// (LOADING_MAX_MS in gameService), so the room agrees on when to stop
// waiting instead of each phone deciding alone.
const FALLBACK_WAIT_MS = 60000;

// A flaky cellular download usually succeeds on a second attempt, so
// retry before giving up - but bounded, or a dead url spins forever.
const MAX_ATTEMPTS = 3;
const RETRY_MS = 1200;

// Same list as PromptInfoOverlay / PreviewPlayer.
const ADMIN_UIDS = ['SrB8T1TmftQzu90H7phQkRJXkRn2'];

// Minimum time the screen stays up even when every prefetch was
// already cached. Without this the loading screen flashes for a
// frame and users think it never rendered.
const MIN_DISPLAY_MS = 1500;

// Render the loading UI. `hand` is the array of drawn snapples;
// `onLoaded` fires exactly once when every URL has resolved (or the
// per-video attempt has settled — a failing prefetch still counts as
// "done" so a broken URL doesn't stall the whole flow). A parallel
// timeout fires onLoaded regardless after MAX_WAIT_MS.
export default function LoadingPhase({
  hand, onLoaded, deadline, players, readyMap, handPending,
}) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user } = useAuth();
  const { showToast } = useModal();
  // Admin only. A player can do nothing with "HTTP 403 on clip 4" - the
  // red pip already tells them what matters. While testing, the reason
  // is the whole point, and it was previously swallowed completely.
  const isAdmin = ADMIN_UIDS.includes(user?.uid);

  // Held in a ref so the prefetch effect can reach the current values
  // without taking them as dependencies and restarting every download.
  const alertRef = useRef({ isAdmin, showToast });
  useEffect(() => { alertRef.current = { isAdmin, showToast }; },
    [isAdmin, showToast]);
  const total = hand?.length || 0;
  // Which cards are done, not just how many. A bare percentage says
  // nothing about whether it is moving or wedged on one slow file -
  // per-snapple state makes a stall visible instead of leaving you
  // guessing whether anything downloaded at all.
  const [done, setDone] = useState([]);
  // Settled either way - the phase must not hang on a clip that will
  // never arrive. A failure is shown in red rather than counted as a win.
  const doneCount = done.filter(Boolean).length;

  // Per-card download progress, so a card that is moving slowly looks
  // different from one that is stuck. Subscribed rather than polled -
  // the cache pushes each chunk.
  // What each card is busy with. A stuck pip said nothing about
  // WHICH half was stuck - the download or the frame extraction that
  // follows it - and those have completely different causes.
  const [stage, setStage] = useState({});
  const [pcts, setPcts] = useState({});
  useEffect(() => {
    const offs = (hand || []).map((card, i) => {
      const url = card?.videoUrl;
      if (!url) return null;
      setPcts((prev) => ({ ...prev, [i]: getDownloadProgress(url) }));
      return onDownloadProgress(url, (v) => {
        setPcts((prev) => (prev[i] === v ? prev : { ...prev, [i]: v }));
      });
    });
    return () => offs.forEach((off) => off && off());
  }, [hand]);
  const failedCount = done.filter((d) => d === 'failed').length;
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
    setDone(new Array(hand.length).fill(false));

    // Mark by INDEX rather than incrementing a counter: these settle out
    // of order, so a counter can say "4 done" without being able to say
    // which four - and which one is stuck is the useful part.
    const mark = (i, ok) => setDone((prev) => {
      const next = prev.slice();
      next[i] = ok ? 'ok' : 'failed';
      return next;
    });

    // For each card we kick off BOTH the video prefetch and the
    // thumbnail extraction in parallel, then wait for both to
    // settle before counting the card done. Without preloading
    // thumbnails, SnappleThumbnail would show its own loading
    // spinner on mount even though the video is cached — user
    // sees a "twirl" on every card on the picking screen.
    // Attempt a card, then VERIFY. prefetchVideo resolves with the
    // remote url when a download fails instead of rejecting, so
    // allSettled reported success for files that never arrived - which
    // is how six cards could all go green while the clips were not
    // actually there. isVideoCached is the only honest signal.
    //
    // Retried because the common failure off wifi is a transient one,
    // and a second attempt usually lands. Bounded so a genuinely dead
    // url cannot spin: after the last try the card is marked failed,
    // which shows red rather than quietly claiming success.
    const attempt = async (card, i, tries = 0) => {
      const url = card?.videoUrl;
      if (!url) { if (!cancelled) mark(i, true); return; }

      // Sequential, not parallel. getThumbnail extracts from the
      // cached file when one exists, so running it alongside the
      // download meant it found nothing and fetched the same video a
      // second time, competing with the very download it was racing.
      setStage((prev) => ({ ...prev, [i]: 'video' }));
      await prefetchVideo(url);
      if (cancelled) return;
      // Only extract when the server made no tile for this clip. With
      // one, extraction is pure waste - it decodes a frame nothing will
      // ever draw, while the round waits on it.
      if (!card?.gridThumbUrl) {
        setStage((prev) => ({ ...prev, [i]: 'thumb' }));
        await thumbnailService.getThumbnail(url).catch(() => {});
        if (cancelled) return;
      }

      if (isVideoCached(url)) {
        setStage((prev) => ({ ...prev, [i]: null }));
        mark(i, true);
        return;
      }

      const why = getPrefetchError(url) || 'no reason reported';
      const { isAdmin: admin, showToast: toast } = alertRef.current;

      if (tries >= MAX_ATTEMPTS - 1) {
        mark(i, false);
        if (admin) toast?.('problem', `Snapple ${i + 1} failed`, why);
        return;
      }
      if (admin) {
        toast?.('warning', `Snapple ${i + 1} retry ${tries + 1}`, why);
      }
      setTimeout(() => { if (!cancelled) attempt(card, i, tries + 1); }, RETRY_MS);
    };

    hand.forEach((card, i) => { attempt(card, i); });

    return () => { cancelled = true; };
  }, [hand]);

  // Fire onLoaded when either every prefetch has settled OR the
  // fallback timer expires. `firedOnce` guards against firing twice
  // if both conditions land in the same tick.
  useEffect(() => {
    if (firedOnce) return;
    // An empty hand is only "complete" if it is genuinely empty. While
    // the pool is still loading there is nothing to prefetch YET, and
    // treating that as done is what let the phase finish before the
    // cards existed. The shared deadline still backstops this, so a
    // pool that never arrives cannot hang the round.
    if (handPending) return;
    if (minElapsed && doneCount >= total) {
      setFiredOnce(true);
      onLoadedRef.current?.();
    }
  }, [doneCount, total, firedOnce, minElapsed, handPending]);

  // Give-up timer, measured against the SHARED deadline so every client
  // stops waiting at the same moment rather than each running its own
  // stopwatch from whenever it happened to mount.
  useEffect(() => {
    const ms = deadline
      ? Math.max(0, Date.parse(deadline) - Date.now())
      : FALLBACK_WAIT_MS;
    const id = setTimeout(() => {
      // Deliberately NOT guarded on firedOnce. A client that finished
      // early has already reported and asked to advance, and was told
      // no because someone else was still downloading. If it then went
      // quiet, nobody would ever ask again and a single stuck player
      // would hang the room until it gave up on its own. Asking again
      // at the deadline is safe: markLoaded is idempotent and the
      // transition is a claim, so only the first caller lands it.
      setFiredOnce(true);
      onLoadedRef.current?.();
    }, ms);
    return () => clearTimeout(id);
  }, [deadline]);

  // Percentage — capped at 100 and blended with a soft floor so the
  // display never stays at 0 forever if a slow network is dragging
  // the first prefetch.
  const pct = total > 0 ? Math.min(100, Math.round((doneCount / total) * 100)) : 0;

  // Bots are excluded for the same reason finishLoading excludes them:
  // nothing downloads on their behalf, so they are never "ready" and
  // counting them would show a number that never reaches zero.
  // The one card currently working. With downloads serialised there is
  // only ever one, which is the point of serialising them.
  const busyIdx = Object.keys(stage).find((k) => stage[k]);
  const busy = busyIdx == null ? null : {
    n: Number(busyIdx) + 1,
    what: stage[busyIdx] === 'thumb' ? 'making thumbnail' : 'downloading video',
    pct: stage[busyIdx] === 'video'
      ? ` ${Math.round((pcts[busyIdx] || 0) * 100)}%`
      : '',
  };

  const myTurnDone = total > 0 && doneCount >= total;
  const waitingOn = (players || [])
    .filter(p => !String(p?.uid || '').startsWith('bot_'))
    .filter(p => !(readyMap || {})[p?.uid])
    .length;

  return (
    <Pressable style={styles.container} onPress={nextTip}>
      <LinearGradient
        colors={t.colors.gameBackgroundGradient}
        style={StyleSheet.absoluteFill}
      />
      {/* Same lockup as the play menu — the adaptive-icon asset is the
          S on transparency, so it sits on the gradient without a plate,
          and the name is typed rather than the splash's baked-in
          wordmark, which is white and would vanish in light theme. */}
      <View style={styles.brandBlock}>
        <Image
          source={require('../../../../assets/images/icon-android.png')}
          style={styles.brandMark}
          resizeMode="contain"
        />
        <Text style={styles.brandName}>Snappled</Text>
      </View>

      <View style={styles.pctBlock}>
        <Text style={styles.pctText}>{pct}%</Text>
        <View style={styles.progressBarWrap}>
          <View style={[styles.progressBarFill, { width: `${pct}%` }]} />
        </View>
      </View>

      {total > 0 && (
        <View style={styles.pipRow}>
          {Array.from({ length: total }, (_, i) => (
            <ProgressRing
              key={i}
              size={30}
              progress={done[i] === 'ok' ? 1 : (pcts[i] || 0)}
              color={done[i] === 'failed'
                ? 'rgba(255,68,68,0.30)'
                : 'rgba(0,255,65,0.30)'}
            >
            <View
              style={[
                styles.pip,
                done[i] === 'ok' && styles.pipDone,
                done[i] === 'failed' && styles.pipFailed,
              ]}
            >
              <Text
                style={[
                  styles.pipText,
                  done[i] === 'ok' && styles.pipTextDone,
                  done[i] === 'failed' && styles.pipTextFailed,
                ]}
              >
                {i + 1}
              </Text>
            </View>
            </ProgressRing>
          ))}
        </View>
      )}

      {busy && (
        <Text style={styles.stageLine}>
          {`Snapple ${busy.n} — ${busy.what}${busy.pct}`}
        </Text>
      )}

      {waitingOn > 0 && (
        <Text style={styles.waitingOn}>
          {failedCount > 0
            ? `${failedCount} couldn't download`
            : handPending
            ? 'drawing your hand'
            : myTurnDone
              ? `waiting on ${waitingOn} ${waitingOn === 1 ? 'player' : 'players'}`
              : 'downloading this round'}
        </Text>
      )}

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
  // Deliberately smaller than the play menu's 132/32: the percentage
  // is the thing you're watching here, so the logo sets the scene
  // without competing with it.
  brandBlock: {
    alignItems: 'center',
    marginBottom: 28,
  },
  brandMark: {
    width: 96,
    height: 96,
  },
  brandName: {
    color: theme.colors.vibeBlue,
    fontSize: 24,
    fontWeight: theme.fontWeights.bold,
    letterSpacing: 2,
    textTransform: 'uppercase',
    marginTop: 2,
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
  // The tip is a card, not loose text on the gradient — it's the one
  // thing here you can interact with, and a surface says so. Themed
  // surface + a vibeBlue edge, matching the scoreboard's treatment so
  // it reads as the same family of panel.
  pipRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 6,
    marginBottom: 18,
    maxWidth: 300,
  },
  pip: {
    width: 30,
    height: 30,
    borderRadius: 15,
    borderWidth: 1,
    borderColor: t.colors.textSecondary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pipDone: {
    borderColor: theme.colors.vibeGreen,
    backgroundColor: 'rgba(0,255,65,0.15)',
  },
  pipText: {
    color: t.colors.textSecondary,
    fontSize: 11,
    fontWeight: '800',
  },
  pipTextDone: { color: theme.colors.vibeGreen },
  pipFailed: {
    borderColor: theme.colors.vibeRed,
    backgroundColor: 'rgba(255,68,68,0.15)',
  },
  pipTextFailed: { color: theme.colors.vibeRed },
  stageLine: {
    color: theme.colors.vibeBlue,
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 8,
    fontVariant: ['tabular-nums'],
  },
  waitingOn: {
    color: t.colors.textSecondary,
    fontSize: 12,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 20,
  },
  tipBlock: {
    alignItems: 'center',
    maxWidth: 340,
    backgroundColor: t.colors.surface,
    borderRadius: 16,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    paddingHorizontal: 20,
    paddingTop: 18,
    paddingBottom: 14,
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
    marginBottom: 12,
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
