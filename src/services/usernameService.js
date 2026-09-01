// usernameService.js — changing a user's handle, everywhere it appears.
//
// The handle is denormalised on purpose: snapples, prompts and comments
// each store a COPY of the creator's name at write time so a feed can
// render without an extra read per row. That copy is what makes a
// rename a fan-out rather than a single field update — writing
// users/{uid}.username alone would leave the old name on every post
// the user has already made.
//
// This file owns that fan-out and nothing else. Everything it touches
// is a doc the user already owns, which is what the existing Firestore
// rules allow an authed client to update.
//
// Comments are included: they store `userId` alongside the cached
// `username`, so they're queryable by author like everything else.

import { collection, query, where, getDocs, writeBatch, doc } from 'firebase/firestore';
import { updateProfile } from 'firebase/auth';
import { db, auth } from './firebase';
import { userService } from './userService';

// Every place a copy of the handle lives, and how to find this user's
// rows in it. Adding a collection that denormalises the name = add an
// entry here, and the rename picks it up.
// `displayCase` picks which spelling of the handle a collection caches.
// snapples and prompts stamp `user.username` (lowercased) at create
// time; comments stamp the auth profile's displayName. Writing the
// wrong one would leave a renamed user cased differently from everyone
// who hasn't renamed.
const FANOUT_TARGETS = [
  { name: 'snapples', ownerField: 'creatorId', nameField: 'creatorUsername' },
  { name: 'activePrompts', ownerField: 'createdBy', nameField: 'creatorUsername' },
  { name: 'onDeckPrompts', ownerField: 'createdBy', nameField: 'creatorUsername' },
  { name: 'promptPool', ownerField: 'createdBy', nameField: 'creatorUsername' },
  { name: 'comments', ownerField: 'userId', nameField: 'username', displayCase: true },
];

// Firestore hard-caps a batch at 500 writes. 400 leaves headroom and
// keeps each round trip small enough to stay responsive.
const BATCH_SIZE = 400;

// renameInCollection — rewrite the cached handle on every doc one user
// owns in a single collection. Returns how many docs it touched.
// Throws on failure so the caller can report a partial rename.
async function renameInCollection(target, userId, names) {
  const nextName = target.displayCase ? names.display : names.lower;
  const q = query(collection(db, target.name), where(target.ownerField, '==', userId));
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  const docs = snap.docs;
  for (let i = 0; i < docs.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    docs.slice(i, i + BATCH_SIZE).forEach((d) => {
      batch.update(doc(db, target.name, d.id), { [target.nameField]: nextName });
    });
    await batch.commit();
  }
  return docs.length;
}

export const usernameService = {
  /**
   * changeUsername — rename a user and fan the new handle out to their
   * existing snapples and prompts.
   *
   * Order matters: the user doc is the source of truth, so it lands
   * first. If a later fan-out batch fails the rename still stands and
   * we report which surfaces are stale rather than rolling back into
   * a half-renamed state.
   *
   * @param {string} userId
   * @param {string} nextUsername raw input, as typed
   * @returns {Promise<{success: boolean, error?: string, updated?: number,
   *                    staleCollections?: string[]}>}
   */
  async changeUsername(userId, nextUsername) {
    if (!userId) return { success: false, error: 'Not signed in.' };

    const next = (nextUsername || '').trim();
    const nextLower = next.toLowerCase();

    try {
      const current = await userService.getUserData(userId);
      const currentLower = (current?.username || '').toLowerCase();

      if (nextLower === currentLower && next === current?.displayName) {
        return { success: false, error: "That's already your username." };
      }

      // Only check availability when the handle itself is changing —
      // validateUsername matches the user's OWN doc otherwise and
      // would reject a pure capitalisation change as "taken".
      if (nextLower !== currentLower) {
        await userService.validateUsername(next);
      }

      // Handle is stored lowercase (every lookup query lowercases);
      // displayName keeps the capitalisation the user typed.
      const written = await userService.updateUserData(userId, {
        username: nextLower,
        displayName: next,
      });
      if (!written?.success) {
        return { success: false, error: written?.error || 'Could not save your username.' };
      }

      // Keeps NEW comments correct — commentService reads the name
      // straight off the auth profile.
      if (auth.currentUser?.uid === userId) {
        await updateProfile(auth.currentUser, { displayName: next }).catch((e) => {
          console.warn('[UsernameService] auth displayName update failed:', e?.message);
        });
      }

      // Each target picks its own casing via `displayCase` — see
      // FANOUT_TARGETS. Both spellings go down so neither is guessed at.
      const { updated, staleCollections } = await this.fanOutHandle(userId, {
        lower: nextLower,
        display: next,
      });
      return { success: true, updated, staleCollections };
    } catch (error) {
      // validateUsername throws user-facing copy ("Username is already
      // taken", length / character rules) — pass it straight through.
      console.error('[UsernameService] changeUsername failed:', error);
      return { success: false, error: error.message || 'Could not change your username.' };
    }
  },

  /**
   * fanOutHandle — push the new name onto every cached copy. Each
   * collection is independent: one failing doesn't stop the rest, it
   * just comes back in staleCollections so the UI can say which
   * surfaces still show the old name.
   *
   * @param {string} userId
   * @param {{lower: string, display: string}} names both spellings of
   *   the new handle; each target picks one via `displayCase`
   */
  async fanOutHandle(userId, names) {
    let updated = 0;
    const staleCollections = [];

    for (const target of FANOUT_TARGETS) {
      try {
        updated += await renameInCollection(target, userId, names);
      } catch (error) {
        console.warn(`[UsernameService] fan-out to ${target.name} failed:`, error?.message);
        staleCollections.push(target.name);
      }
    }

    return { updated, staleCollections };
  },
};

export default usernameService;
