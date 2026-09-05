// Looping video player used inside preview modals (tap-to-watch on hand,
// vote, and wait screens). Plays automatically and loops; muted is
// driven by the snapple's own setting.

import React, { useEffect, useRef } from 'react';
import { StyleSheet } from 'react-native';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useCachedVideoUri, invalidateCachedVideo } from '../../services/videoCache';
import { useAuth } from '../../store/AuthContext';
import { useModal } from '../../store/ModalContext';

// Renders an autoplay/looping VideoView. Source defers to the cached URI
// once a download has resolved so previews open instantly on repeat views.
// On playback error (corrupt cache / bad source) the cache entry is
// dropped so a re-open pulls fresh from the remote URL — fixes the
// "black rectangle that never plays" case.

// Same list as PromptInfoOverlay / SnappleOverlay.
const ADMIN_UIDS = ['SrB8T1TmftQzu90H7phQkRJXkRn2'];

export default function PreviewPlayer({ videoUrl, muted = false, loop = true }) {
  const cachedUri = useCachedVideoUri(videoUrl);
  const { user } = useAuth();

  // useCachedVideoUri hands back the REMOTE url until the download
  // lands, so an unprefetched clip doesn't fail - it quietly streams,
  // which on a weak connection is the stutter that reads as "it didn't
  // play right". There was no way to tell that apart from a genuinely
  // broken clip, because the only signal was a console.warn nobody sees
  // on a phone. Admin-only, since it means nothing to a player.
  const streaming = !!videoUrl && cachedUri === videoUrl;
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
    showToast?.('info', 'Streaming', 'Not downloaded yet - may stutter');
  }, [videoUrl, streaming, isAdmin, showToast]);
  const player = useVideoPlayer(cachedUri, (p) => {
    p.loop = loop;
    p.muted = muted;
    p.play();
  });

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
        showToast?.('info', 'Video trouble', 'Reloading that snapple');
      }
    });
    return () => { try { sub?.remove?.(); } catch (e) {} };
  }, [player, videoUrl, showToast]);

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
