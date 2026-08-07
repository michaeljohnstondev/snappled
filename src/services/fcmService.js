// fcmService.js — Firebase Cloud Messaging service for push notifications.
//
// ⚠️  DO NOT USE expo-notifications IN THIS PROJECT.
// ⚠️  All push flow: NotificationEngine → Cloud Functions → FCM → Device.
// ⚠️  @react-native-firebase/messaging is the ONLY approved push transport.
//
// Handles:
//   - Permission request (contextual — call requestPermission() from
//     the settings screen or first-follow flow, not on cold-start)
//   - FCM token get + register on the user doc (deviceInfo.fcmToken)
//   - Token cleanup on logout (removeTokenForUser) so a device that
//     logs out doesn't keep receiving pushes for the old account
//   - Foreground message → notificationDisplayService toast
//   - Background tap → notification-tap navigation (via nav ref)
//   - Cold-start from tap → replay after navigation ref is ready
//
// Wraps @react-native-firebase/messaging. Loaded via fcmServiceWrapper
// which falls back to a silent no-op class when running in Expo Go
// (no native module available). See fcmServiceWrapper.js.

import { Platform } from 'react-native';
import messaging from '@react-native-firebase/messaging';
import * as Device from 'expo-device';
import * as SecureStore from 'expo-secure-store';
import { doc, getDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { notificationDisplayService } from './notificationDisplayService';

const STORAGE_KEYS = {
  FCM_TOKEN: 'snappled_fcm_token',
  PERMISSION_REQUESTED: 'snappled_notif_permission_requested',
  PENDING_NOTIFICATION: 'snappled_pending_notification',
  CURRENT_USER_ID: 'snappled_fcm_current_user_id',
};

// Background message handler. Fires when a push lands while the app
// is quit or backgrounded. We ONLY stash the notification payload so
// the tap handler can replay it after the app opens — actual display
// is FCM's job (notification tray). Cloud Functions own the write to
// users/{uid}/notifications, so no client write needed here.
try {
  messaging().setBackgroundMessageHandler(async (remoteMessage) => {
    if (remoteMessage?.data) {
      try {
        await SecureStore.setItemAsync(
          STORAGE_KEYS.PENDING_NOTIFICATION,
          JSON.stringify({ data: remoteMessage.data, timestamp: Date.now() }),
        );
      } catch (error) {
        console.error('[fcmService] Failed to stash background push:', error);
      }
    }
  });
} catch (error) {
  console.warn('[fcmService] Could not register background handler:', error);
}

class FCMService {
  constructor() {
    this.isInitialized = false;
    this.currentToken = null;
    this.currentUserId = null;
    this.navigationRef = null;
    this.pendingNavigation = null;
    this.initialNotification = null;
    this.foregroundListener = null;
    this.notificationOpenedListener = null;
    this.lastNavigationTime = 0;
  }

  // initialize — sets up FCM listeners. Does NOT request permission
  // (that's contextual — first-follow flow, settings screen toggle,
  // etc.). Safe to call multiple times.
  async initialize() {
    if (this.isInitialized) return true;
    try {
      this.setupFirebaseListeners();
      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('[fcmService] initialize failed:', error);
      return false;
    }
  }

  // setupFirebaseListeners — wires foreground / tap / cold-start
  // listeners. Called once in initialize().
  setupFirebaseListeners() {
    // Foreground push → toast banner via notificationDisplayService.
    this.foregroundListener = messaging().onMessage(async (remoteMessage) => {
      this.handleForegroundMessage(remoteMessage);
    });

    // Background push tap (app already running, user tapped tray).
    this.notificationOpenedListener = messaging().onNotificationOpenedApp(
      (remoteMessage) => {
        if (remoteMessage?.data) this.navigateFromNotification(remoteMessage.data);
      },
    );

    // Cold-start from tap (app was quit, tapping the tray opens app).
    messaging().getInitialNotification()
      .then(async (remoteMessage) => {
        if (remoteMessage?.data) {
          // Stash — will fire once nav ref + auth are ready.
          this.initialNotification = remoteMessage.data;
        } else {
          // Fallback: pending notification stashed by background handler.
          // Only replay if <5 min old to avoid resurfacing stale taps
          // from previous sessions.
          try {
            const stored = await SecureStore.getItemAsync(STORAGE_KEYS.PENDING_NOTIFICATION);
            if (stored) {
              const parsed = JSON.parse(stored);
              const ageMs = Date.now() - (parsed.timestamp || 0);
              if (parsed.timestamp && ageMs <= 5 * 60 * 1000) {
                this.initialNotification = parsed.data;
              }
            }
          } catch (error) {
            console.warn('[fcmService] Pending notification read failed:', error);
          }
        }
        try { await SecureStore.deleteItemAsync(STORAGE_KEYS.PENDING_NOTIFICATION); } catch (e) {}
      })
      .catch((error) => {
        console.error('[fcmService] getInitialNotification failed:', error);
      });
  }

  // requestPermission — pops the OS permission dialog. Contextual —
  // call from settings screen or first-follow flow. Returns
  // { granted, status, provisional }.
  async requestPermission() {
    try {
      if (!Device.isDevice) {
        return { granted: false, error: 'Physical device required' };
      }
      const authStatus = await messaging().requestPermission();
      const granted =
        authStatus === messaging.AuthorizationStatus.AUTHORIZED
        || authStatus === messaging.AuthorizationStatus.PROVISIONAL;
      try {
        await SecureStore.setItemAsync(STORAGE_KEYS.PERMISSION_REQUESTED, 'true');
      } catch (e) {}
      return {
        granted,
        status: authStatus,
        provisional: authStatus === messaging.AuthorizationStatus.PROVISIONAL,
      };
    } catch (error) {
      console.error('[fcmService] requestPermission failed:', error);
      return { granted: false, error: error.message };
    }
  }

  // getPermissionStatus — synchronous check of current permission.
  // Used by the settings screen to show the toggle state.
  async getPermissionStatus() {
    try {
      const authStatus = await messaging().hasPermission();
      return {
        granted: authStatus === messaging.AuthorizationStatus.AUTHORIZED,
        status: authStatus,
        provisional: authStatus === messaging.AuthorizationStatus.PROVISIONAL,
        denied: authStatus === messaging.AuthorizationStatus.DENIED,
        notDetermined: authStatus === messaging.AuthorizationStatus.NOT_DETERMINED,
      };
    } catch (error) {
      console.error('[fcmService] getPermissionStatus failed:', error);
      return { granted: false, error: error.message };
    }
  }

  // getFCMToken — fetches the FCM registration token from Firebase.
  // iOS requires registerDeviceForRemoteMessages first. Caches the
  // token on the instance + in SecureStore.
  async getFCMToken() {
    try {
      if (!Device.isDevice) return null;
      if (Platform.OS === 'ios') {
        await messaging().registerDeviceForRemoteMessages();
      }
      const token = await messaging().getToken();
      if (token) {
        this.currentToken = token;
        try {
          await SecureStore.setItemAsync(STORAGE_KEYS.FCM_TOKEN, token);
        } catch (e) {}
      }
      return token;
    } catch (error) {
      console.error('[fcmService] getFCMToken failed:', error);
      return null;
    }
  }

  // registerTokenForUser — full pipeline: request permission → get
  // token → write to user doc's deviceInfo.fcmToken. Called from
  // AuthContext right after login, and again if the user toggles
  // notifications on in settings.
  async registerTokenForUser(userId) {
    if (!userId) return false;
    try {
      this.currentUserId = userId;
      try {
        await SecureStore.setItemAsync(STORAGE_KEYS.CURRENT_USER_ID, userId);
      } catch (e) {}

      const perm = await this.requestPermission();
      if (!perm.granted) return false;

      const token = this.currentToken || (await this.getFCMToken());
      if (!token) return false;

      // Skip the write if the token hasn't actually changed — avoids a
      // Firestore write on every cold start.
      const userRef = doc(db, 'users', userId);
      const snap = await getDoc(userRef);
      if (snap.exists()) {
        const info = snap.data().deviceInfo || {};
        if (info.fcmToken === token && info.platform === Platform.OS) {
          return true;
        }
      }

      await updateDoc(userRef, {
        'deviceInfo.fcmToken': token,
        'deviceInfo.platform': Platform.OS,
        'deviceInfo.lastTokenUpdate': serverTimestamp(),
        'deviceInfo.notificationsEnabled': true,
      });
      return true;
    } catch (error) {
      console.error('[fcmService] registerTokenForUser failed:', error);
      return false;
    }
  }

  // removeTokenForUser — logout cleanup. Clears the token from the
  // user doc AND local storage so a re-login gets a fresh registration
  // and a subsequent login as a DIFFERENT user doesn't inherit the
  // previous user's push subscription.
  async removeTokenForUser(userId) {
    if (!userId) return false;
    try {
      await updateDoc(doc(db, 'users', userId), {
        'deviceInfo.fcmToken': null,
        'deviceInfo.lastTokenUpdate': serverTimestamp(),
        'deviceInfo.notificationsEnabled': false,
      });
      this.currentUserId = null;
      this.currentToken = null;
      try {
        await SecureStore.deleteItemAsync(STORAGE_KEYS.FCM_TOKEN);
        await SecureStore.deleteItemAsync(STORAGE_KEYS.CURRENT_USER_ID);
      } catch (e) {}
      return true;
    } catch (error) {
      console.error('[fcmService] removeTokenForUser failed:', error);
      return false;
    }
  }

  // handleForegroundMessage — hand off to notificationDisplayService
  // which renders a toast via the app's ModalContext. Also stashes
  // for potential app-restart replay within the 5-min window.
  async handleForegroundMessage(remoteMessage) {
    try {
      await SecureStore.setItemAsync(
        STORAGE_KEYS.PENDING_NOTIFICATION,
        JSON.stringify({ data: remoteMessage?.data || {}, timestamp: Date.now() }),
      );
    } catch (e) {}
    try {
      notificationDisplayService.displayWithNavigation(
        remoteMessage,
        (data) => this.navigateFromNotification(data),
      );
    } catch (error) {
      console.error('[fcmService] handleForegroundMessage failed:', error);
    }
  }

  // navigateFromNotification — routes a notification payload to the
  // right screen. Called from both foreground toast tap AND background
  // tap. Supported types map to Snappled's actual routes.
  async navigateFromNotification(data) {
    if (!data || Object.keys(data).length === 0) return;
    if (!this.navigationRef) {
      this.pendingNavigation = { data };
      return;
    }
    // Debounce rapid taps — prevents double-navigate resets.
    const now = Date.now();
    if (now - this.lastNavigationTime < 1000) return;
    this.lastNavigationTime = now;

    const { type, userId, snappleId, promptId, gameId } = data;
    try {
      switch (type) {
        case 'new_follower':
        case 'mutual_follow':
          if (userId) this.navigationRef.navigate('OtherPersonsProfile', { userId });
          break;
        case 'followed_user_snapple':
          // Land on the creator's profile — user can tap the specific
          // snapple from their created grid. Deep-linking directly to
          // a single snapple would need a dedicated route.
          if (userId) this.navigationRef.navigate('OtherPersonsProfile', { userId });
          break;
        case 'game_invite':
          if (gameId) this.navigationRef.navigate('Game', { gameId });
          break;
        case 'new_prompt_digest':
          if (promptId) this.navigationRef.navigate('Prompt', { promptId });
          else this.navigationRef.navigate('Main');
          break;
        default:
          console.log('[fcmService] Unknown notification type:', type);
          break;
      }
    } catch (error) {
      console.error('[fcmService] navigateFromNotification failed:', error);
    }
  }

  // setNavigationRef — wired from App.js once the NavigationContainer
  // mounts. Flushes any pending navigation stashed during cold-start.
  setNavigationRef(navigationRef) {
    this.navigationRef = navigationRef;
    if (this.pendingNavigation) {
      const { data } = this.pendingNavigation;
      this.pendingNavigation = null;
      this.navigateFromNotification(data);
    }
    // If a cold-start notification was stashed before auth landed,
    // fire it now that nav is ready.
    if (this.initialNotification) {
      const data = this.initialNotification;
      this.initialNotification = null;
      setTimeout(() => this.navigateFromNotification(data), 400);
    }
  }

  // cleanup — kill listeners. Called from App.js unmount (rare in
  // practice but keeps the wrapper honest).
  cleanup() {
    if (this.foregroundListener) { this.foregroundListener(); this.foregroundListener = null; }
    if (this.notificationOpenedListener) { this.notificationOpenedListener(); this.notificationOpenedListener = null; }
  }

  // getCurrentToken — expose the cached token for debugging / manual
  // test-push flows in the admin screen.
  getCurrentToken() {
    return this.currentToken;
  }

  // isReady — true once initialize() has run successfully.
  isReady() {
    return this.isInitialized;
  }
}

export const fcmService = new FCMService();
export default fcmService;
