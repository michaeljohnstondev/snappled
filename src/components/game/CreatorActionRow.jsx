// Creator action row attached to the bottom of preview modals. Shows the
// snapple's creator and instant follow / wishlist / buy buttons. Hidden
// entirely when the snapple belongs to the current user — those actions
// don't make sense as self-targets.

import React, { useState, useEffect } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { userService } from '../../services/userService';
import { snappleService } from '../../services/snappleService';
import theme from '../../theme/themes';

// Renders the creator credit line + action buttons. Each button is
// optimistic locally and reverts on service failure (silently — toasts
// surface the win/lose state).
export default function CreatorActionRow({ submission, currentUser, ownedSnappleIds, showToast, showError }) {
  const snappleId = submission?.snappleId || submission?.id;
  const creatorId = submission?.creatorId;
  const isMine = creatorId && creatorId === currentUser?.uid;
  // Private snapples played in-game can be seen + voted on but never
  // bought (and there's no point wishlisting something that can't be
  // purchased). Hide both buttons when the creator played a private.
  const isPrivate = submission?.isPrivate === true;

  const [following, setFollowing] = useState(false);
  const [wishlisted, setWishlisted] = useState(false);
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

  // Toggle wishlist for this snapple. Shows a toast on add.
  const handleWishlist = async () => {
    if (busy || !snappleId || isMine) return;
    setBusy(true);
    try {
      if (wishlisted) {
        await snappleService.removeFromWishlist(snappleId, currentUser.uid);
        setWishlisted(false);
      } else {
        await snappleService.addToWishlist(snappleId, currentUser.uid);
        setWishlisted(true);
        showToast?.('reward', 'Added to Wishlist', `@${submission?.creatorUsername || ''}`);
      }
    } finally { setBusy(false); }
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
    <View style={styles.wrap}>
      <View style={{ flex: 1 }} />
      <View style={styles.actions}>
        <Pressable
          style={[styles.btn, following && styles.btnActive]}
          onPress={handleFollow}
          disabled={busy}
        >
          <Ionicons
            name={following ? 'person' : 'person-add'}
            size={13}
            color={following ? theme.colors.vibeBlue : 'white'}
          />
        </Pressable>
        {!isPrivate && (
          <Pressable
            style={[styles.btn, wishlisted && styles.btnActive]}
            onPress={handleWishlist}
            disabled={busy}
          >
            <Ionicons
              name={wishlisted ? 'heart' : 'heart-outline'}
              size={13}
              color={wishlisted ? theme.colors.vibeRed : 'white'}
            />
          </Pressable>
        )}
        {!isPrivate && (
          <Pressable
            style={[styles.btn, owned && styles.btnActive, { paddingHorizontal: 10 }]}
            onPress={handleBuy}
            disabled={busy || owned}
          >
            <Ionicons name="diamond" size={13} color={theme.colors.vibeBlue} />
            <Text style={styles.btnText}>{owned ? 'Owned' : 'Buy'}</Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    backgroundColor: 'rgba(0,0,0,0.3)',
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
  },
  creator: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    flexShrink: 1,
  },
  actions: {
    flexDirection: 'row',
    gap: 6,
  },
  btn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 6,
    paddingHorizontal: 8,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.15)',
  },
  btnActive: {
    borderColor: theme.colors.vibeBlue,
    backgroundColor: 'rgba(0,198,255,0.12)',
  },
  btnText: {
    color: 'white',
    fontSize: 11,
    fontWeight: '600',
  },
});
