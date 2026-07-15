// Creator action row attached to the bottom of preview modals. Shows the
// snapple's creator and instant follow / wishlist / buy buttons. Hidden
// entirely when the snapple belongs to the current user — those actions
// don't make sense as self-targets.

import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { userService } from '../../services/userService';
import { snappleService } from '../../services/snappleService';
import { useModal } from '../../store/ModalContext';
import theme from '../../theme/themes';

// Renders the creator credit line + action buttons. Each button is
// optimistic locally and reverts on service failure (silently — toasts
// surface the win/lose state).
export default function CreatorActionRow({ submission, currentUser, ownedSnappleIds, wishlistedSnappleIds, showToast, showError }) {
  const snappleId = submission?.snappleId || submission?.id;
  const creatorId = submission?.creatorId;
  const isMine = creatorId && creatorId === currentUser?.uid;
  // Private snapples played in-game can be seen + voted on but never
  // bought (and there's no point wishlisting something that can't be
  // purchased). Hide both buttons when the creator played a private.
  const isPrivate = submission?.isPrivate === true;

  const { showConfirm } = useModal();
  const [following, setFollowing] = useState(false);
  // Initial wishlist state derived from BOTH sides of the 2-way index:
  // the passed-in user array (fast, live) plus the snapple's own
  // wishlistedBy (if this component was handed a full snapple doc).
  // Either matching = show as saved.
  const [wishlisted, setWishlisted] = useState(
    (!!snappleId && (wishlistedSnappleIds || []).includes(snappleId))
    || (!!currentUser?.uid && (submission?.wishlistedBy || []).includes(currentUser.uid))
  );
  const [owned, setOwned] = useState(!!snappleId && (ownedSnappleIds || []).includes(snappleId));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!currentUser?.uid || !creatorId || isMine) return;
    userService.isFollowing(currentUser.uid, creatorId)
      .then(setFollowing)
      .catch(() => {});
  }, [currentUser?.uid, creatorId, isMine]);

  // Toggle follow on the snapple's creator. No-op if it's the current user.
  const handleFollow = async () => {
    if (busy || !creatorId || isMine) return;
    setBusy(true);
    try {
      const r = await userService.toggleFollow(currentUser.uid, creatorId);
      if (r.success) setFollowing(r.isFollowing);
    } finally { setBusy(false); }
  };

  // Toggle wishlist for this snapple. Batched 2-way write updates
  // BOTH user.wishlistedSnapples AND snapple.wishlistedBy atomically.
  // Shows a toast on add.
  const handleWishlist = async () => {
    if (busy || !snappleId || isMine) return;
    setBusy(true);
    try {
      const result = await snappleService.setSnappleWishlist(
        snappleId, currentUser.uid, !wishlisted, wishlisted,
      );
      if (result?.success) {
        setWishlisted(!wishlisted);
        if (!wishlisted) {
          showToast?.('reward', 'Added to Wishlist', `@${submission?.creatorUsername || ''}`);
        }
      }
    } finally { setBusy(false); }
  };

  // Confirm + submit a report against this snapple. Non-destructive:
  // the snapple keeps playing for everyone else; moderators review
  // reports out of band. Kept generic ("Inappropriate") for now —
  // we can add a reason picker later if reports need triage.
  const handleReport = async () => {
    if (busy || !snappleId || isMine) return;
    showConfirm?.(
      'Report Snapple',
      'Send this to the moderation queue? You won\'t see the video removed instantly, but the team will review it.',
      async () => {
        setBusy(true);
        try {
          const r = await snappleService.reportSnapple(snappleId, currentUser.uid, 'Inappropriate');
          if (r?.success) {
            showToast?.('info', 'Report Sent', 'Thanks — we\'ll take a look.');
          } else {
            showError?.('Report Failed', r?.error || 'Something went wrong.');
          }
        } finally { setBusy(false); }
      },
    );
  };

  // Spend coins to add this snapple to the user's collection.
  const handleBuy = async () => {
    if (busy || !snappleId || isMine || owned) return;
    setBusy(true);
    try {
      const r = await snappleService.purchaseSnapple(snappleId, currentUser.uid);
      if (r?.success) {
        setOwned(true);
        showToast?.('reward', 'Purchased!', `Snapple added to your collection`);
      } else {
        showError?.('Purchase Failed', r?.error || 'Something went wrong');
      }
    } finally { setBusy(false); }
  };

  // Creator name hidden in-phase per user request — all snapples are
  // currently the user's own anyway, so showing "by @me" everywhere is
  // confusing. Will return once the pool is more diverse.
  // Bail entirely when there'd be no buttons to render (own snapple
  // or missing creatorId). Otherwise the wrap's semi-transparent
  // black bg shows through as a mystery rectangle over the video.
  const hasActions = !isMine && !!creatorId;
  if (!hasActions) return null;
  return (
    <View style={styles.rail}>
      <Pressable
        style={styles.railBtn}
        onPress={handleFollow}
        disabled={busy}
      >
        <View style={[styles.railIcon, following && styles.railIconActive]}>
          <Ionicons
            name={following ? 'person' : 'person-add'}
            size={22}
            color={following ? theme.colors.vibeBlue : 'white'}
          />
        </View>
        <Text style={styles.railLabel}>{following ? 'Following' : 'Follow'}</Text>
      </Pressable>
      {!isPrivate && (
        <Pressable
          style={styles.railBtn}
          onPress={handleWishlist}
          disabled={busy}
        >
          <View style={[styles.railIcon, wishlisted && styles.railIconActive]}>
            <Ionicons
              name={wishlisted ? 'heart' : 'heart-outline'}
              size={22}
              color={wishlisted ? theme.colors.vibeRed : 'white'}
            />
          </View>
          <Text style={styles.railLabel}>{wishlisted ? 'Saved' : 'Save'}</Text>
        </Pressable>
      )}
      {!isPrivate && (
        <Pressable
          style={styles.railBtn}
          onPress={handleBuy}
          disabled={busy || owned}
        >
          <View style={[styles.railIcon, owned && styles.railIconActive]}>
            <Ionicons name="diamond" size={22} color={theme.colors.vibeBlue} />
          </View>
          <Text style={styles.railLabel}>{owned ? 'Owned' : 'Buy'}</Text>
        </Pressable>
      )}
      <Pressable
        style={styles.railBtn}
        onPress={handleReport}
        disabled={busy}
      >
        <View style={styles.railIcon}>
          <Ionicons name="flag-outline" size={22} color="white" />
        </View>
        <Text style={styles.railLabel}>Report</Text>
      </Pressable>
    </View>
  );
}

// TikTok-style right-side rail. Circular icon buttons stacked
// vertically with a small caption below each. Backgrounds are
// darkened just enough to keep the icons legible over any video
// frame without turning into a full opaque bar.
const styles = StyleSheet.create({
  rail: {
    flexDirection: 'column',
    alignItems: 'center',
    gap: 14,
  },
  railBtn: {
    alignItems: 'center',
    gap: 4,
  },
  railIcon: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: 'rgba(0,0,0,0.55)',
    borderWidth: 2,
    borderColor: 'rgba(255,255,255,0.25)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  railIconActive: {
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,198,255,0.18)',
  },
  railLabel: {
    color: 'white',
    fontSize: 10,
    fontWeight: '700',
    letterSpacing: 0.5,
    textShadowColor: 'rgba(0,0,0,0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
});
