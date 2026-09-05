// Looping video player used inside preview modals (tap-to-watch on hand,
// vote, and wait screens). Plays automatically and loops; muted is
// driven by the snapple's own setting.

import React, { useEffect, useRef } from 'react';
import { StyleSheet, View, Text, ActivityIndicator } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import {
  useCachedVideoUri, invalidateCachedVideo, useDownloadProgress,
} from '../../services/videoCache';
import theme from '../../theme/themes';
import { useAuth } from '../../store/AuthContext';
import { useModal } from '../../store/ModalContext';

// Renders an autoplay/looping VideoView. Source defers to the cached URI
// once a download has resolved so previews open instantly on repeat views.
// On playback error (corrupt cache / bad source) the cache entry is
// dropped so a re-open pulls fresh from the remote URL — fixes the
// "black rectangle that never plays" case.

// Same list as PromptInfoOverlay / SnappleOverlay.
const ADMIN_UIDS = ['SrB8T1TmftQzu90H7phQkRJXkRn2'];

// Streaming disabled for now. A half-downloaded clip played off the
// network competes with its own download for the same connection, so on
// a weak link it makes things worse, not better - and it hid whether
// downloads were working at all. Set this back to a number of ms to
// re-enable the fallback.
const WAIT_FOR_CACHE_MS = Infinity;

export default function PreviewPlayer({ videoUrl, muted = false, loop = true }) {
  // Hold out briefly for the downloaded file. Clips you watch in a game
  // are OTHER players' submissions, which the loading screen never
  // covered - it only prefetches your own hand - so they are often
  // still arriving when the big player opens. Three seconds is enough
  // for one clip on a normal connection and short enough not to feel
  // like a hang; past that it streams, since a stuttering clip beats
  // no clip.
  const cachedUri = useCachedVideoUri(videoUrl, WAIT_FOR_CACHE_MS);
  const { user } = useAuth();

  // useCachedVideoUri hands back the REMOTE url until the download
  // lands, so an unprefetched clip doesn't fail - it quietly streams,
  // which on a weak connection is the stutter that reads as "it didn't
  // play right". There was no way to tell that apart from a genuinely
  // broken clip, because the only signal was a console.warn nobody sees
  // on a phone. Admin-only, since it means nothing to a player.
  const streaming = !!videoUrl && cachedUri === videoUrl;
  const waiting = !!videoUrl && !cachedUri;
  const pct = useDownloadProgress(waiting ? videoUrl : null);
  const isAdmin = ADMIN_UIDS.includes(user?.uid);
  const { showToast } = useModal();

  // One toast per clip, not per render - the streaming flag flips the
  // moment a download lands, and a player reopened mid-round would
  // otherwise announce itself again and again.
  const toldRef = useRef(null);
  useEffect(() => {
    if (!videoUrl || !streaming || !isAdmin) return;
    if (toldRef.current === videoUrl) return;
    toldRef.current = videoUrl;
    showToast?.('warning', 'Streaming', 'Not downloaded yet - may stutter');
  }, [videoUrl, streaming, isAdmin, showToast]);
  const player = useVideoPlayer(cachedUri, (p) => {
    p.loop = loop;
    p.muted = muted;
    p.play();
  });

  // The player is constructed while cachedUri is still null, so the real
  // source has to be pushed in when the download lands. Relying on
  // useVideoPlayer to notice the prop change is not safe - it takes the
  // source at creation - and without this the wait would end in a
  // permanently blank player instead of a playing clip.
  // Only swap when the source ACTUALLY changed. useVideoPlayer already
  // loads whatever cachedUri held at creation, so replacing it again on
  // mount reloaded the same file and restarted playback - a hitch on
  // every open, including the second view of a clip already on disk.
  // The ref starts at the creation-time value so that first render is a
  // no-op, and only the null -> file swap after a wait does any work.
  const appliedRef = useRef(cachedUri);
  useEffect(() => {
    if (!player || !cachedUri) return;
    if (appliedRef.current === cachedUri) return;
    appliedRef.current = cachedUri;
    try {
      player.replace(cachedUri);
      player.play();
    } catch (e) { /* best-effort; the source may already match */ }
  }, [player, cachedUri]);

  useEffect(() => {
    if (!player) return;
    const sub = player.addListener?.('statusChange', (event) => {
      if (event?.status === 'error' && videoUrl) {
        console.warn('[PreviewPlayer] playback error — invalidating cache', {
          url: videoUrl,
          error: event?.error?.message,
        });
        invalidateCachedVideo(videoUrl);
        // Everyone gets this one, not just admins: a clip that won't
        // play is the player's problem too, and a console.warn on a
        // phone is the same as saying nothing at all.
        showToast?.('problem', 'Video trouble', 'Reloading that snapple');
      }
    });
    return () => { try { sub?.remove?.(); } catch (e) {} };
  }, [player, videoUrl, showToast]);

  if (waiting) {
    return (
      <View style={[StyleSheet.absoluteFill, styles.waiting]}>
        <ActivityIndicator size="large" color={theme.colors.vibeBlue} />
        <Text style={styles.waitingPct}>{Math.round(pct * 100)}%</Text>
      </View>
    );
  }

  return (
    <VideoView
      player={player}
      style={StyleSheet.absoluteFill}
      contentFit="cover"
      fullscreenOptions={{ enabled: false }}
      showsPlaybackControls={false}
      nativeControls={false}
    />
  );
}

const styles = StyleSheet.create({
  waiting: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#000',
    gap: 10,
  },
  waitingPct: {
    color: 'white',
    fontSize: 13,
    fontWeight: '800',
    letterSpacing: 1,
    fontVariant: ['tabular-nums'],
  },
});
