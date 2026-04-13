// Google Sign-In Service for Snappled
// Requires: npx expo install expo-auth-session expo-crypto
// Also requires Google OAuth client IDs configured in app.json

import { GoogleAuthProvider, signInWithCredential } from 'firebase/auth';
import { auth } from './firebase';

// TODO: Replace with your actual Google OAuth client IDs
// Get these from: https://console.cloud.google.com/apis/credentials
const GOOGLE_WEB_CLIENT_ID = 'YOUR_WEB_CLIENT_ID.apps.googleusercontent.com';
const GOOGLE_ANDROID_CLIENT_ID = 'YOUR_ANDROID_CLIENT_ID.apps.googleusercontent.com';

export const googleAuthService = {
  async signInWithGoogle(idToken) {
    try {
      const credential = GoogleAuthProvider.credential(idToken);
      const result = await signInWithCredential(auth, credential);
      return { success: true, user: result.user };
    } catch (error) {
      console.error('[GoogleAuth] Error:', error);
      return { success: false, error: error.message };
    }
  },

  getClientIds() {
    return {
      webClientId: GOOGLE_WEB_CLIENT_ID,
      androidClientId: GOOGLE_ANDROID_CLIENT_ID,
    };
  },
};

export default googleAuthService;
