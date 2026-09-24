// accountService.js — deleting your own account.
//
// Required by both stores: Google Play for any app that lets you make
// an account, Apple under 5.1.1(v). Neither accepts "email us" as the
// only route.
//
// The work happens server-side in functions/accountDeletion.js. This
// file is the three things that can only happen on the device:
//
//   preview          what the confirmation screen has to state before
//                    anyone presses the button. Real numbers, not a
//                    vague warning.
//   reauthenticate   proving it is still you. Deleting is irreversible
//                    and the button lives inside an app that is already
//                    signed in, so the threat is a phone left unlocked,
//                    not a stolen password.
//   deleteAccount    the call itself, and signing out after it.

import {
  reauthenticateWithCredential,
  EmailAuthProvider,
  signOut,
} from 'firebase/auth';
import { httpsCallable } from 'firebase/functions';
import { auth, functions } from './firebase';
import { googleCredential, appleCredential } from './googleAuthService';

/**
 * Which sign-in this account uses: 'password', 'google.com', 'apple.com'.
 *
 * Read off providerData rather than remembered anywhere, because it
 * decides which re-authentication the screen can even offer.
 */
export function authProvider() {
  const user = auth.currentUser;
  if (!user) return null;
  const provider = (user.providerData || [])[0];
  return (provider && provider.providerId) || 'password';
}

/**
 * What deleting would actually do, counted on the server.
 *
 * The confirmation says "3 snapples, 11 buyers refunded 2,400 coins"
 * rather than "this cannot be undone", because the second one is true
 * of everything and tells you nothing.
 */
export async function previewDeletion() {
  try {
    const fn = httpsCallable(functions, 'previewAccountDeletion');
    const res = await fn({});
    return { success: true, ...res.data };
  } catch (error) {
    console.error('[AccountService] preview failed:', error);
    return { success: false, error: error?.message || 'Could not load your account.' };
  }
}

/**
 * Prove it is still the person who owns this account.
 *
 * reauthenticateWithCredential, not a second signInWithCredential:
 * signing in again would accept a credential for a DIFFERENT account
 * and quietly switch to it, so picking the wrong row in the Google
 * account picker would delete somebody else's account. Re-auth rejects
 * a credential that does not belong to the current user.
 *
 * @param {string} password  email/password accounts only; ignored by
 *   the social providers, which re-run their own native sheet.
 */
export async function reauthenticate(password) {
  const user = auth.currentUser;
  if (!user) return { success: false, error: 'You are not signed in.' };

  try {
    const provider = authProvider();

    if (provider === 'google.com') {
      await reauthenticateWithCredential(user, await googleCredential());
    } else if (provider === 'apple.com') {
      const { credential } = await appleCredential();
      await reauthenticateWithCredential(user, credential);
    } else {
      if (!password) return { success: false, error: 'Enter your password.' };
      await reauthenticateWithCredential(
        user, EmailAuthProvider.credential(user.email, password));
    }

    // The server checks auth_time on the ID token, and the cached token
    // still carries the OLD one until it is reissued. Without this the
    // callable rejects a re-authentication that just succeeded.
    await user.getIdToken(true);
    return { success: true };
  } catch (error) {
    const code = error?.code || '';
    if (code === 'auth/wrong-password' || code === 'auth/invalid-credential') {
      return { success: false, error: 'That password is not right.' };
    }
    if (code === 'auth/user-mismatch') {
      return { success: false, error: 'That is a different account.' };
    }
    // The native sheets throw their own cancellation shapes; none of
    // them is worth an error message, the person just backed out.
    if (/cancel/i.test(error?.message || '') || code === 'ERR_REQUEST_CANCELED') {
      return { success: false, cancelled: true };
    }
    console.error('[AccountService] reauth failed:', error);
    return { success: false, error: 'Could not confirm it was you.' };
  }
}

/**
 * Delete the account. Irreversible from the moment it returns.
 *
 * The callable locks the account out immediately and hands the data
 * sweep to a background trigger, so this comes back in a second or two
 * however much there was to erase. Signing out afterwards is belt and
 * braces - the Auth user is already gone, so the session is dead - but
 * it is what puts the app back on the login screen.
 *
 * @param {boolean} keepPurchased  leave the snapples other people
 *   bought in the game, orphaned and anonymous, instead of deleting
 *   them and refunding everybody.
 */
export async function deleteAccount(keepPurchased = false) {
  try {
    const fn = httpsCallable(functions, 'requestAccountDeletion');
    await fn({ keepPurchased });
    try {
      await signOut(auth);
    } catch (_) {
      // Already signed out by the account ceasing to exist.
    }
    return { success: true };
  } catch (error) {
    const message = error?.message || '';
    // The server refuses a stale sign-in. Worth its own answer, because
    // the fix is "confirm again", not "something went wrong".
    if (/sign in again/i.test(message)) {
      return { success: false, needsReauth: true, error: message };
    }
    console.error('[AccountService] delete failed:', error);
    return { success: false, error: message || 'Could not delete your account.' };
  }
}
