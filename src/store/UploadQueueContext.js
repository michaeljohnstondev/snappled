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

// Staging dir under the app's document directory. Files here
// survive component unmount / navigation, which the raw expo-camera
// cache path does NOT guarantee — Android in particular sweeps
// preview cache aggressively when the recording screen unmounts.
const STAGING_SUBDIR = 'snapple-uploads/';

// Copy the recorded video to a persistent app dir so the background
// upload can't race the source file's teardown. Also normalizes
// iOS `file:///private/var/...` to `file:///var/...` which some
// FS APIs choke on. Returns the staged URI (still `file://`).
async function stageForUpload(sourceUri) {
  const LegacyFS = require('expo-file-system/legacy');
  const normalized = (sourceUri || '').replace('file:///private/', 'file:///');

  // Verify the source still exists at stage time. If it's already
  // been swept, fail loudly here — a clear error beats a silent
  // "no data" from Firebase two retries deep.
  const info = await LegacyFS.getInfoAsync(normalized);
  if (!info.exists) {
    throw new Error(`Recorded video not found on disk: ${normalized}`);
  }
  if ((info.size || 0) === 0) {
    throw new Error('Recorded video file is empty (0 bytes).');
  }

  const dir = `${LegacyFS.documentDirectory}${STAGING_SUBDIR}`;
  await LegacyFS.makeDirectoryAsync(dir, { intermediates: true }).catch(() => {});
  const dest = `${dir}${Date.now()}_${Math.floor(Math.random() * 1e6)}.mp4`;
  await LegacyFS.copyAsync({ from: normalized, to: dest });
  return dest;
}

// Best-effort delete of a staged file. Called after DONE or after
// the final retry FAILS + user dismisses (or retries — retry reuses
// the staged copy so we only delete on terminal DONE / dismiss).
async function unstageFile(stagedUri) {
  if (!stagedUri) return;
  try {
    const LegacyFS = require('expo-file-system/legacy');
    await LegacyFS.deleteAsync(stagedUri, { idempotent: true });
  } catch (e) {
    // Not fatal — worst case a stale file sits in the staging dir.
  }
}

const UploadQueueContext = createContext(null);

const MAX_AUTO_RETRIES = 3;
// Exponential backoff between auto-retries. Keep short — long
// backoffs make the "3rd retry finally succeeded" case feel worse
// than just letting the user hit retry themselves.
const RETRY_DELAYS_MS = [1500, 4000, 10000];

// Statuses the toast + retry chip react to.
export const UPLOAD_STATUS = {
  STAGING: 'staging',       // copying the recorded file to a safe dir
  UPLOADING: 'uploading',
  FINALIZING: 'finalizing', // upload done, running onSuccess callback
  DONE: 'done',
  FAILED: 'failed',
};

// runUploadJob — one attempt at uploading `uploadUri` (already
// staged). Fires onSuccess on success. Returns { ok, error }.
async function runUploadJob(item, uploadUri, updateItem) {
  updateItem(item.id, { status: UPLOAD_STATUS.UPLOADING, progress: 0, error: null });

  try {
    const uploadResult = await uploadVideo(
      uploadUri,
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

// runWithRetries — retries runUploadJob up to MAX_AUTO_RETRIES with
// backoff, always using the same staged URI. Resolves { ok, error }.
async function runWithRetries(item, uploadUri, updateItem) {
  let lastError = null;
  for (let attempt = 0; attempt <= MAX_AUTO_RETRIES; attempt++) {
    if (attempt > 0) {
      const delay = RETRY_DELAYS_MS[attempt - 1] || 10000;
      updateItem(item.id, { retries: attempt, status: UPLOAD_STATUS.UPLOADING });
      await new Promise((r) => setTimeout(r, delay));
    }
    const result = await runUploadJob(item, uploadUri, updateItem);
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

  // startItem — full lifecycle for one queued item:
  //   1. Stage the source video to app doc dir (once).
  //   2. Run the retry loop against the staged copy.
  //   3. On DONE, delete the staged copy.
  //   4. On FAILED (all retries exhausted), leave the staged copy
  //      on disk so manual retry from the toast chip can reuse it.
  //      dismissUpload cleans it up when the user gives up.
  const startItem = useCallback(async (item) => {
    // Stage step. If we already have a staged URI (from a manual
    // retry), skip re-copying.
    let stagedUri = item.stagedUri;
    if (!stagedUri) {
      updateItem(item.id, { status: UPLOAD_STATUS.STAGING, error: null });
      try {
        stagedUri = await stageForUpload(item.uri);
        updateItem(item.id, { stagedUri });
      } catch (err) {
        console.error('[UploadQueue] staging failed', item.id, err);
        updateItem(item.id, {
          status: UPLOAD_STATUS.FAILED,
          error: err?.message || 'Could not save recording for upload.',
        });
        if (typeof item.onFailure === 'function') {
          try { item.onFailure(err); } catch (e) {}
        }
        return;
      }
    }

    const result = await runWithRetries(item, stagedUri, updateItem);
    if (result.ok) {
      // Success — staged copy is no longer needed.
      unstageFile(stagedUri);
      return;
    }

    updateItem(item.id, {
      status: UPLOAD_STATUS.FAILED,
      error: result.error?.message || 'Upload failed',
    });
    if (typeof item.onFailure === 'function') {
      try { item.onFailure(result.error); } catch (e) {}
    }
  }, [updateItem]);

  // enqueueUpload — screens call this and get an id back so they
  // can navigate away instantly. Staging + retry loop + onSuccess /
  // onFailure all run in the background.
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
      uri,             // original recorded uri (source of truth)
      stagedUri: null, // set after successful stage; retries reuse
      promptText,
      userId,
      label: label || promptText || 'Snapple',
      status: UPLOAD_STATUS.STAGING,
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

  // retryUpload — manual retry from the failed-chip tap. Reset
  // attempts back to 0 so the user gets a fresh 3-strike window.
  // Reuses stagedUri if we already have one from the initial run.
  const retryUpload = useCallback((id) => {
    const current = itemsRef.current.find((it) => it.id === id);
    if (!current) return;
    updateItem(id, { retries: 0, status: UPLOAD_STATUS.UPLOADING, error: null, progress: 0 });
    startItem(current);
  }, [startItem, updateItem]);

  // dismissUpload — removes an item from the queue. Also cleans up
  // any staged file left behind by a FAILED item the user gave up on.
  const dismissUpload = useCallback((id) => {
    const target = itemsRef.current.find((it) => it.id === id);
    if (target?.stagedUri && target.status === UPLOAD_STATUS.FAILED) {
      unstageFile(target.stagedUri);
    }
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
