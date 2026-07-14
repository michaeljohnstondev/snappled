// UploadQueueContext — central background upload queue for snapples.
//
// Screens enqueue uploads and get an item id back immediately, then
// navigate wherever they want. The queue owns the upload lifecycle:
// progress tracking, auto-retry (3x w/ backoff), and firing the
// caller's onSuccess / onFailure callbacks when the upload settles.
//
// This is the Phase 1 "foreground background" implementation. The
// upload keeps running while the app is foregrounded and while the
// user navigates around, but the OS may pause the JS thread when the
// phone is locked or the app is backgrounded. True OS-background
// uploads (Snapchat pattern) come in Phase 2 via
// react-native-background-upload, which requires a new EAS build.

import React, { createContext, useCallback, useContext, useRef, useState } from 'react';
import { uploadVideo } from '../services/videoStorage';

const UploadQueueContext = createContext(null);

const MAX_AUTO_RETRIES = 3;
// Exponential backoff between auto-retries. Keep short — long
// backoffs make the "3rd retry finally succeeded" case feel worse
// than just letting the user hit retry themselves.
const RETRY_DELAYS_MS = [1500, 4000, 10000];

// Statuses the toast + retry chip react to.
export const UPLOAD_STATUS = {
  UPLOADING: 'uploading',
  FINALIZING: 'finalizing', // upload done, running onSuccess callback
  DONE: 'done',
  FAILED: 'failed',
};

// Runs a single upload job, calls the caller's onSuccess when the
// file lands. Returns nothing; state mutations happen via the
// updateItem callback so the provider can re-render.
async function runUploadJob(item, updateItem) {
  updateItem(item.id, { status: UPLOAD_STATUS.UPLOADING, progress: 0, error: null });

  try {
    const uploadResult = await uploadVideo(
      item.uri,
      item.promptText,
      item.userId,
      (pct) => updateItem(item.id, { progress: pct }),
    );

    // Upload landed. Hand off to the caller's onSuccess for the
    // downstream Firestore writes (createSnapple + XP + etc).
    updateItem(item.id, { status: UPLOAD_STATUS.FINALIZING, progress: 100 });

    if (typeof item.onSuccess === 'function') {
      await item.onSuccess(uploadResult);
    }

    updateItem(item.id, { status: UPLOAD_STATUS.DONE });
    return { ok: true };
  } catch (err) {
    console.error('[UploadQueue] job failed', item.id, err);
    return { ok: false, error: err };
  }
}

// Retry with backoff. Resolves { ok, error } after all retries.
async function runWithRetries(item, updateItem) {
  let lastError = null;
  for (let attempt = 0; attempt <= MAX_AUTO_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt - 1] || 10000;
      updateItem(item.id, { retries: attempt, status: UPLOAD_STATUS.UPLOADING });
      await new Promise((r) => setTimeout(r, delay));
    }
    const result = await runUploadJob(item, updateItem);
    if (result.ok) return result;
    lastError = result.error;
  }
  return { ok: false, error: lastError };
}

export function UploadQueueProvider({ children }) {
  const [items, setItems] = useState([]);
  // Ref mirror so async job code can read latest without stale
  // closure issues (updateItem/dismiss race conditions).
  const itemsRef = useRef([]);
  itemsRef.current = items;

  // Immutable patch helper.
  const updateItem = useCallback((id, patch) => {
    setItems((prev) => prev.map((it) => (it.id === id ? { ...it, ...patch } : it)));
  }, []);

  // Kick off the retry loop for a single item and settle it into
  // its terminal state (DONE or FAILED, and fire onFailure).
  const startItem = useCallback(async (item) => {
    const result = await runWithRetries(item, updateItem);
    if (!result.ok) {
      updateItem(item.id, {
        status: UPLOAD_STATUS.FAILED,
        error: result.error?.message || 'Upload failed',
      });
      if (typeof item.onFailure === 'function') {
        try { item.onFailure(result.error); } catch (e) {}
      }
    }
  }, [updateItem]);

  // enqueueUpload — screens call this and get an id back so they
  // can navigate away instantly. onSuccess / onFailure fire later
  // when the upload settles.
  const enqueueUpload = useCallback(({
    uri,
    promptText,
    userId,
    label,
    onSuccess,
    onFailure,
  }) => {
    const id = `up_${Date.now()}_${Math.floor(Math.random() * 1e6)}`;
    const item = {
      id,
      uri,
      promptText,
      userId,
      label: label || promptText || 'Snapple',
      status: UPLOAD_STATUS.UPLOADING,
      progress: 0,
      retries: 0,
      error: null,
      onSuccess,
      onFailure,
    };
    setItems((prev) => [...prev, item]);
    // Fire-and-forget; startItem awaits its own promise.
    startItem(item);
    return id;
  }, [startItem]);

  // Manual retry from the failed-chip tap. Reset attempts back to 0
  // so the user gets a fresh 3-strike window.
  const retryUpload = useCallback((id) => {
    const item = itemsRef.current.find((it) => it.id === id);
    if (!item) return;
    updateItem(id, { retries: 0, status: UPLOAD_STATUS.UPLOADING, error: null, progress: 0 });
    startItem(item);
  }, [startItem, updateItem]);

  // Dismiss removes a completed or failed item from the queue.
  // Called by the toast's X button and auto-fired ~2s after DONE.
  const dismissUpload = useCallback((id) => {
    setItems((prev) => prev.filter((it) => it.id !== id));
  }, []);

  const value = {
    items,
    enqueueUpload,
    retryUpload,
    dismissUpload,
  };

  return (
    <UploadQueueContext.Provider value={value}>
      {children}
    </UploadQueueContext.Provider>
  );
}

// useUploadQueue — hook consumers use to enqueue / retry / read state.
export function useUploadQueue() {
  const ctx = useContext(UploadQueueContext);
  if (!ctx) {
    throw new Error('useUploadQueue must be used inside <UploadQueueProvider>');
  }
  return ctx;
}
