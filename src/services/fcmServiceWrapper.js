// fcmServiceWrapper.js
// Conditional loader for the FCM service. In Expo Go (no native
// modules), @react-native-firebase/messaging is unavailable — importing
// it there throws. This wrapper detects the environment and either
// returns the real fcmService (in dev/prod builds) or a silent no-op
// class (in Expo Go).
//
// Callers should ALWAYS import from this file, not from fcmService.js
// directly. That way development in Expo Go still runs without touching
// notification code, and production builds get the real thing.

// isFirebaseAvailable — returns true if the native messaging module
// can be required. False in Expo Go, true in dev-client / prod builds.
function isFirebaseAvailable() {
  try {
    require('@react-native-firebase/messaging');
    return true;
  } catch (error) {
    return false;
  }
}

// FallbackFCMService — silent no-op with the same interface as the
// real FCMService so any caller can invoke it without null-checks.
// Every method resolves cheerfully so the app's notification flows
// don't block or error while developing in Expo Go.
class FallbackFCMService {
  constructor() {
    this.isInitialized = false;
    this.currentToken = null;
    this.navigationRef = null;
  }
  async initialize() { this.isInitialized = true; return true; }
  async requestPermission() { return { granted: false, error: 'Expo Go — no FCM' }; }
  async getPermissionStatus() { return { granted: false, notDetermined: true }; }
  async getFCMToken() { return null; }
  async registerTokenForUser() { return false; }
  async removeTokenForUser() { return true; }
  setNavigationRef(ref) { this.navigationRef = ref; }
  getCurrentToken() { return null; }
  isReady() { return this.isInitialized; }
  cleanup() {}
}

// createFCMService — picks real or fallback based on environment.
// Result is a singleton for the app's lifetime.
function createFCMService() {
  if (isFirebaseAvailable()) {
    const { fcmService } = require('./fcmService');
    return fcmService;
  }
  return new FallbackFCMService();
}

export const fcmService = createFCMService();
export default fcmService;
export { isFirebaseAvailable };
