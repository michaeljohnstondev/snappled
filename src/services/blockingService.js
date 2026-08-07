// blockingService.js
// Symmetric block: writes to BOTH users' docs in one batch so every
// fan-out check (feeds, notifications, follows, game invites) can read
// a single field on a single doc — no cross-user query.
//
// Schema:
//   user.social.blockedUsers  — people this user blocked
//   user.social.blockedBy     — people who blocked this user
//
// Blocking a user should:
//   1. Unfollow in both directions (kills the follow relationship)
//   2. Add each side of the 2-way index
//   3. Prevent future notifications, follows, game invites, feed visibility
//
// The inverse action (unblock) removes from both indexes but does NOT
// restore the follow — users have to re-follow deliberately.

import { doc, updateDoc, arrayUnion, arrayRemove, writeBatch, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

const USERS_COLLECTION = 'users';

export const blockingService = {
  // blockUser — Alice blocks Bob. Writes both indexes AND tears down
  // any follow relationship in either direction. Idempotent — safe to
  // call twice.
  async blockUser(blockerId, blockedId) {
    if (!blockerId || !blockedId) return { success: false, error: 'Missing ids' };
    if (blockerId === blockedId) return { success: false, error: 'Cannot block yourself' };
    try {
      const batch = writeBatch(db);
      const blockerRef = doc(db, USERS_COLLECTION, blockerId);
      const blockedRef = doc(db, USERS_COLLECTION, blockedId);

      batch.update(blockerRef, {
        'social.blockedUsers': arrayUnion(blockedId),
        // Also unfollow in both directions so the block is a clean cut.
        'social.following': arrayRemove(blockedId),
        'social.followers': arrayRemove(blockedId),
        updatedAt: serverTimestamp(),
      });
      batch.update(blockedRef, {
        'social.blockedBy': arrayUnion(blockerId),
        'social.following': arrayRemove(blockerId),
        'social.followers': arrayRemove(blockerId),
        updatedAt: serverTimestamp(),
      });

      await batch.commit();
      return { success: true };
    } catch (error) {
      console.error('[blockingService] blockUser failed:', error);
      return { success: false, error: error.message };
    }
  },

  // unblockUser — Alice unblocks Bob. Removes both sides of the
  // 2-way index. Does NOT re-establish the previous follow — that's a
  // deliberate action Alice/Bob would need to take themselves.
  async unblockUser(blockerId, blockedId) {
    if (!blockerId || !blockedId) return { success: false, error: 'Missing ids' };
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, USERS_COLLECTION, blockerId), {
        'social.blockedUsers': arrayRemove(blockedId),
        updatedAt: serverTimestamp(),
      });
      batch.update(doc(db, USERS_COLLECTION, blockedId), {
        'social.blockedBy': arrayRemove(blockerId),
        updatedAt: serverTimestamp(),
      });
      await batch.commit();
      return { success: true };
    } catch (error) {
      console.error('[blockingService] unblockUser failed:', error);
      return { success: false, error: error.message };
    }
  },

  // isBlocked — quick either-side check. True if EITHER user has
  // blocked the other. Callers use this to gate follow attempts,
  // feed visibility, game invites, notification fan-outs, etc.
  async isBlocked(userA, userB) {
    if (!userA || !userB) return false;
    try {
      const [aDoc, bDoc] = await Promise.all([
        getDoc(doc(db, USERS_COLLECTION, userA)),
        getDoc(doc(db, USERS_COLLECTION, userB)),
      ]);
      const aBlocked = aDoc.exists() ? (aDoc.data().social?.blockedUsers || []) : [];
      const bBlocked = bDoc.exists() ? (bDoc.data().social?.blockedUsers || []) : [];
      return aBlocked.includes(userB) || bBlocked.includes(userA);
    } catch (error) {
      console.error('[blockingService] isBlocked failed:', error);
      return false;
    }
  },

  // getBlockedList — list of userIds this user has blocked. Used by
  // the Manage Blocked screen to render the unblock list.
  async getBlockedList(userId) {
    if (!userId) return [];
    try {
      const snap = await getDoc(doc(db, USERS_COLLECTION, userId));
      if (!snap.exists()) return [];
      return snap.data().social?.blockedUsers || [];
    } catch (error) {
      console.error('[blockingService] getBlockedList failed:', error);
      return [];
    }
  },
};
