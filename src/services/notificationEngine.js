// notificationEngine.js
// Client-side helper for writing in-app notification records to
// users/{uid}/notifications. These entries power the in-app
// notification list (once we build that screen); Cloud Functions
// are the sole source of FCM push delivery.
//
// ⚠️  NEVER import expo-notifications anywhere in this project.
// FCM (@react-native-firebase/messaging) is the only approved push
// path. This file is for IN-APP notification records only — pushes
// are triggered from Cloud Functions after the trigger doc is
// written (follow, snapple create, etc.), not from here.

import { doc, setDoc, collection, Timestamp } from 'firebase/firestore';
import { db } from './firebase';

// 30-day TTL on in-app notifications. Keeps the collection bounded
// so the notification list stays fast without a scheduled cleanup.
const TTL_MS = 30 * 24 * 60 * 60 * 1000;

export const notificationEngine = {
  // storeInAppNotification — write one row to
  // users/{userId}/notifications. Used by FCMService when a push
  // arrives while the app is foregrounded so the notification list
  // still gets the record (Cloud Functions handle the write for
  // background/quit pushes to avoid duplicates).
  //
  // Priority tiers drive UI accent color: 'urgent' (red), 'high'
  // (orange), 'normal' (blue). Missing = normal.
  async storeInAppNotification({ userId, type, title, message, data = {}, priority = 'normal' }) {
    if (!userId || !type) {
      console.warn('[notificationEngine] Missing userId or type');
      return { success: false, error: 'Missing userId or type' };
    }
    try {
      const id = `notif_${Date.now()}_${Math.random().toString(36).slice(2, 11)}`;
      const notificationRef = doc(collection(db, 'users', userId, 'notifications'), id);
      await setDoc(notificationRef, {
        id,
        type,
        title: title || '',
        message: message || '',
        data,
        priority,
        read: false,
        createdAt: Timestamp.now(),
        expiresAt: Timestamp.fromDate(new Date(Date.now() + TTL_MS)),
      });
      return { success: true, id };
    } catch (error) {
      console.error('[notificationEngine] storeInAppNotification failed:', error);
      return { success: false, error: error.message };
    }
  },
};

export default notificationEngine;
