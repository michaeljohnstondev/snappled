// promptAdminService.js
// Firestore CRUD for admin prompt curation. Reads/writes the two
// collections the curator screen cares about: gamePrompts (round
// prompts) and promptPool (snapple submission prompts). Kept lean —
// only the operations the curator actually uses.

import {
  collection,
  getDocs,
  doc,
  updateDoc,
  deleteDoc,
  serverTimestamp,
} from 'firebase/firestore';
import { db } from './firebase';

const VALID_COLLECTIONS = new Set(['gamePrompts', 'promptPool']);

// Throw early on a bad collection name so a typo at a call site can't
// silently target the wrong collection.
function assertCollection(name) {
  if (!VALID_COLLECTIONS.has(name)) {
    throw new Error(`[promptAdmin] Unknown collection: ${name}`);
  }
}

// Pull every prompt from the given collection, sorted alphabetically
// by text so the curator's deck is predictable across sessions.
export async function listAllPrompts(collectionName) {
  assertCollection(collectionName);
  const snap = await getDocs(collection(db, collectionName));
  const docs = [];
  snap.forEach(d => docs.push({ id: d.id, ...d.data() }));
  docs.sort((a, b) => (a.text || '').localeCompare(b.text || ''));
  return docs;
}

// Update the text on an existing prompt. Keeps the doc id and any
// lifecycle fields (usageCount, lifetime stats, etc.) — only the
// human-facing text changes.
export async function updatePromptText(collectionName, promptId, newText) {
  assertCollection(collectionName);
  const trimmed = String(newText || '').trim();
  if (!trimmed) throw new Error('[promptAdmin] Prompt text cannot be empty');

  await updateDoc(doc(db, collectionName, promptId), {
    text: trimmed,
    updatedAt: serverTimestamp(),
  });
  return { success: true };
}

// Hard-delete a prompt. Used by the curator's left-swipe. No
// soft-delete state on these collections, and the rotation system
// reads them every cycle, so removing the doc takes immediate effect.
export async function deletePrompt(collectionName, promptId) {
  assertCollection(collectionName);
  await deleteDoc(doc(db, collectionName, promptId));
  return { success: true };
}
