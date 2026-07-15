// firebaseAuthService.js (kept at googleAuthService.js path so existing
// imports don't break — the file now handles Google + Apple + the
// new-user document bootstrap, not just Google).
//
// Pattern mirrors bvs-app's FirebaseAuthService.js:
//   - Google uses @react-native-google-signin/google-signin for the
//     native account picker, then exchanges the ID token for a Firebase
//     credential via GoogleAuthProvider.
//   - Apple uses expo-apple-authentication with a hashed nonce so
//     Firebase can verify the identity token; bridged via OAuthProvider.
//   - ensureUserDocument creates a Snappled-shaped user doc if one
//     doesn't exist yet. Auto-generates a username (needsUsernameSetup
//     flag set so the app can prompt to pick one later).

import { Platform } from 'react-native';
import {
  GoogleAuthProvider,
  OAuthProvider,
  signInWithCredential,
} from 'firebase/auth';
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  getDocs,
  serverTimestamp,
} from 'firebase/firestore';
import { GoogleSignin } from '@react-native-google-signin/google-signin';
import * as AppleAuthentication from 'expo-apple-authentication';
import * as Crypto from 'expo-crypto';
import { auth, db } from './firebase';

// Web client ID for Firebase Google sign-in. Get from Firebase Console
// → Project Settings → Your apps → SDK setup → config.webClientId, or
// from Google Cloud Console → Credentials → "Web client (auto created
// by Google Service)". Required even on iOS/Android — the native libs
// use it to issue the ID token Firebase will accept.
const WEB_CLIENT_ID = '107855342657-aq98f0ke1n9ac45celh0tjbn3s57bf53.apps.googleusercontent.com';

const USERS_COLLECTION = 'users';

// Configure once at module load. The native sign-in sheet won't open
// until this has run with a valid webClientId.
GoogleSignin.configure({ webClientId: WEB_CLIENT_ID });

// Pop the native Google account picker → exchange ID token for a
// Firebase credential → sign in. Returns { userCredential, isNewUser }.
export async function signInWithGoogle() {
  await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
  // Clear any cached session so the picker always shows (lets users
  // switch accounts without going through device settings).
  try { await GoogleSignin.signOut(); } catch (_) { /* no cached session */ }

  const signInResult = await GoogleSignin.signIn();
  const idToken = signInResult.data?.idToken ?? signInResult.idToken;
  if (!idToken) throw new Error('No ID token returned from Google Sign-In');

  const credential = GoogleAuthProvider.credential(idToken);
  const userCredential = await signInWithCredential(auth, credential);
  const isNewUser = userCredential._tokenResponse?.isNewUser ?? false;
  return { userCredential, isNewUser };
}

// Pop the native Apple sheet → exchange for a Firebase credential.
// iOS-only. Required by App Store guideline 4.8 when any third-party
// login (Google) is offered. Apple returns the user's full name only
// on the FIRST authorization — we surface it so the caller can pre-fill
// profile data.
export async function signInWithApple() {
  if (Platform.OS !== 'ios') {
    throw new Error('Apple Sign-In is only available on iOS');
  }
  const available = await AppleAuthentication.isAvailableAsync();
  if (!available) {
    throw new Error('Apple Sign-In is not available on this device');
  }

  // Apple gets the HASHED nonce so it can stamp it into the identity
  // token. Firebase gets the RAW nonce to re-hash and verify the token
  // wasn't replayed. Skipping this causes auth/invalid-credential
  // failures for some users on first sign-in.
  const rawNonce = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
  const hashedNonce = await Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    rawNonce,
  );

  const credential = await AppleAuthentication.signInAsync({
    requestedScopes: [
      AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
      AppleAuthentication.AppleAuthenticationScope.EMAIL,
    ],
    nonce: hashedNonce,
  });

  if (!credential.identityToken) {
    throw new Error('No identity token returned from Apple Sign-In');
  }

  const provider = new OAuthProvider('apple.com');
  const firebaseCredential = provider.credential({
    idToken: credential.identityToken,
    rawNonce,
  });
  const userCredential = await signInWithCredential(auth, firebaseCredential);

  const firstName = credential.fullName?.givenName || null;
  const lastName = credential.fullName?.familyName || null;
  const isNewUser = userCredential._tokenResponse?.isNewUser ?? false;
  return { userCredential, isNewUser, firstName, lastName };
}

// Build a Snappled-shaped username from a Firebase user. Strips non-
// alphanumerics from the email prefix or display name, lowercases, and
// suffixes with random digits to keep new social-login users from
// colliding with existing usernames. Caller still validates uniqueness.
async function generateUsername(user) {
  const seed =
    (user.displayName && user.displayName.split(' ')[0]) ||
    (user.email && user.email.split('@')[0]) ||
    'user';
  const cleaned = seed.replace(/[^a-zA-Z0-9]/g, '').toLowerCase().slice(0, 12) || 'user';
  // Try the bare slug first, then add 4-digit suffixes until we find
  // an unused one. Cap at 5 tries to avoid an infinite loop.
  for (let i = 0; i < 5; i++) {
    const candidate = i === 0 ? cleaned : `${cleaned}${Math.floor(1000 + Math.random() * 9000)}`;
    const safe = candidate.slice(0, 20);
    const q = query(
      collection(db, USERS_COLLECTION),
      where('username', '==', safe.toLowerCase()),
    );
    const snap = await getDocs(q);
    if (snap.empty) return safe;
  }
  // Fallback: append the first 6 chars of the uid (always unique).
  return `${cleaned}${user.uid.slice(0, 6)}`.slice(0, 20);
}

// Create a Snappled user doc if one doesn't exist yet. Matches the
// shape userService.createUser writes for email signups so the rest
// of the app doesn't need to know which sign-in path was used.
export async function ensureUserDocument(user, options = {}) {
  const userRef = doc(db, USERS_COLLECTION, user.uid);
  const snap = await getDoc(userRef);
  if (snap.exists()) return { created: false };

  const username = await generateUsername(user);
  const displayName =
    (options.firstName && options.lastName && `${options.firstName} ${options.lastName}`) ||
    user.displayName ||
    username;

  const userDoc = {
    uid: user.uid,
    username: username.toLowerCase(),
    displayName,
    email: (user.email || '').toLowerCase(),
    authProvider: options.authProvider || 'unknown',
    // Auto-generated usernames flag so the app can prompt for a real
    // pick later. userService.changeUsername (or a setup screen) clears it.
    needsUsernameSetup: true,
    resources: {
      coins: 100,
      tokens: 10,
      trophies: 0,
      receivedCoins: 0,
    },
    ownedSnapples: [],
    wishlistedSnapples: [],
    likedSnapples: [],
    dislikedSnapples: [],
    activeDeck: null,
    profile: {
      avatarUrl: user.photoURL || null,
      photoURL: user.photoURL || null,
      bio: '',
      level: 1,
      xp: 0,
      experience: 0,
      achievements: [],
    },
    stats: {
      totalVideosCreated: 0,
      totalSnapplesPurchased: 0,
      totalCoinsSpent: 0,
      totalTokensSpent: 0,
      totalTicketsSpent: 0,
      totalLikesGiven: 0,
      totalLikesReceived: 0,
      totalWishlistItems: 0,
      topicsSubmitted: 0,
      favoritePrompts: [],
    },
    preferences: {
      notifications: true,
      emailUpdates: false,
      publicProfile: true,
    },
    moderation: {
      strikes: 0,
      isBanned: false,
      banRelease: null,
      reports: [],
      warnings: [],
    },
    social: {
      snappleOpinion: {},
      following: [],
      followers: [],
      blockedUsers: [],
    },
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
    lastLoginAt: serverTimestamp(),
  };

  await setDoc(userRef, userDoc);
  return { created: true };
}

// Legacy default export — keeps existing imports working.
export const googleAuthService = {
  signInWithGoogle,
  signInWithApple,
  ensureUserDocument,
};

export default googleAuthService;
