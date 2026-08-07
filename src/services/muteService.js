// muteService.js
// One-way "shut up notifications from this person, but keep them in
// my feed." Silent — the muted user never knows. Distinct from block:
//
//   mute  = "still follow, still see their snapples, no push pings"
//   block = "hide them from me, hide me from them, no interaction"
//
// Schema: user.social.mutedNotifications  — array of userIds this
// user has muted push pings from. Read by every notification fan-out
// in Cloud Functions before sending FCM.

import { doc, updateDoc, arrayUnion, arrayRemove, getDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';

const USERS_COLLECTION = 'users';

export const muteService = {
  // muteUser — Alice mutes Bob's push notifications. Silent to Bob.
  async muteUser(muterId, mutedId) {
    if (!muterId || !mutedId) return { success: false, error: 'Missing ids' };
    if (muterId === mutedId) return { success: false, error: 'Cannot mute yourself' };
    try {
      await updateDoc(doc(db, USERS_COLLECTION, muterId), {
        'social.mutedNotifications': arrayUnion(mutedId),
        updatedAt: serverTimestamp(),
      });
      return { success: true };
    } catch (error) {
      console.error('[muteService] muteUser failed:', error);
      return { success: false, error: error.message };
    }
  },

  // unmuteUser — Alice unmutes Bob. Push notifications resume.
  async unmuteUser(muterId, mutedId) {
    if (!muterId || !mutedId) return { success: false, error: 'Missing ids' };
    try {
      await updateDoc(doc(db, USERS_COLLECTION, muterId), {
        'social.mutedNotifications': arrayRemove(mutedId),
        updatedAt: serverTimestamp(),
      });
      return { success: true };
    } catch (error) {
      console.error('[muteService] unmuteUser failed:', error);
      return { success: false, error: error.message };
    }
  },

  // isMuted — has Alice muted Bob? Client-side quick check; server
  // trusts its own read of the doc during fan-out.
  async isMuted(muterId, mutedId) {
    if (!muterId || !mutedId) return false;
    try {
      const snap = await getDoc(doc(db, USERS_COLLECTION, muterId));
      if (!snap.exists()) return false;
      return (snap.data().social?.mutedNotifications || []).includes(mutedId);
    } catch (error) {
      console.error('[muteService] isMuted failed:', error);
      return false;
    }
  },

  // getMutedList — userIds this user has muted. Powers the Manage
  // Muted screen.
  async getMutedList(userId) {
    if (!userId) return [];
    try {
      const snap = await getDoc(doc(db, USERS_COLLECTION, userId));
      if (!snap.exists()) return [];
      return snap.data().social?.mutedNotifications || [];
    } catch (error) {
      console.error('[muteService] getMutedList failed:', error);
      return [];
    }
  },
};
