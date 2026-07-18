import { Platform } from 'react-native';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { storage, auth as firebaseAuth } from './firebase';
import { compressVideo } from './videoCompression';

// Firebase Storage bucket + REST upload host. Keep this in sync
// with firebase.js. Used by the Android native-upload path which
// bypasses `fetch(file:///…)` (that call throws "Network request
// failed" on many Android builds).
const STORAGE_BUCKET = 'snapplepark.firebasestorage.app';
const STORAGE_UPLOAD_HOST = 'https://firebasestorage.googleapis.com';

// iOS returns camera recordings under `file:///private/var/mobile/...`.
// Some file-system APIs choke on the `/private/` symlink prefix.
// Stripping it produces the canonical `file:///var/mobile/...` path
// which every fetch / expo-file-system version handles cleanly.
function normalizeIosFileUri(uri) {
  if (!uri) return uri;
  return uri.replace('file:///private/', 'file:///');
}

// Attempt to grab a valid auth ID token. Force-refresh if the cached
// one is null (happens briefly after cold-start or suspend/resume on
// iOS). Throws a clear error if the user isn't signed in at all.
async function getFreshIdToken(forceRefresh = false) {
  if (!firebaseAuth.currentUser) {
    throw new Error('Not signed in — please sign in again and retry.');
  }
  const token = await firebaseAuth.currentUser.getIdToken(forceRefresh);
  if (!token) {
    throw new Error('Auth token unavailable — please sign in again and retry.');
  }
  return token;
}

// uploadViaFileSystem — Android upload path. Bypasses the flaky
// `fetch(file:///…)` polyfill (which throws "Network request failed"
// on many Android builds) by POSTing the file straight to Firebase
// Storage's REST endpoint via expo-file-system's native uploader.
// Returns { downloadURL, size } like the resumable path.
async function uploadViaFileSystem(sourceUri, filename, onProgress) {
  const LegacyFS = require('expo-file-system/legacy');
  const { FileSystemUploadType } = LegacyFS;

  // Progress is best-effort; uploadAsync (non-Task) can't stream
  // pct. Fire a mid-upload tick so the pill doesn't look frozen.
  if (onProgress) onProgress(30);

  const token = await getFreshIdToken(false);
  const encodedName = encodeURIComponent(filename);
  const url = `${STORAGE_UPLOAD_HOST}/v0/b/${STORAGE_BUCKET}/o?name=${encodedName}&uploadType=media`;

  const doPost = async (tokenToUse) => LegacyFS.uploadAsync(url, sourceUri, {
    httpMethod: 'POST',
    uploadType: FileSystemUploadType.BINARY_CONTENT,
    headers: {
      'Content-Type': 'video/mp4',
      Authorization: `Firebase ${tokenToUse}`,
    },
  });

  let res = await doPost(token);
  // Token grace-period retry mirrors the resumable path.
  if (res.status === 401 || res.status === 403) {
    const fresh = await getFreshIdToken(true);
    res = await doPost(fresh);
  }
  if (res.status < 200 || res.status >= 300) {
    throw new Error(`Firebase Storage upload failed (${res.status}): ${res.body?.slice(0, 200)}`);
  }

  let payload;
  try {
    payload = JSON.parse(res.body);
  } catch (e) {
    throw new Error('Firebase Storage returned non-JSON response.');
  }
  const downloadToken = (payload.downloadTokens || '').split(',')[0];
  if (!downloadToken) {
    throw new Error('Firebase Storage response missing downloadTokens.');
  }
  const downloadURL = `${STORAGE_UPLOAD_HOST}/v0/b/${STORAGE_BUCKET}/o/${encodedName}?alt=media&token=${downloadToken}`;

  if (onProgress) onProgress(90);
  return { downloadURL, size: Number(payload.size) || 0 };
}

// uploadViaFirebaseSDK — iOS upload path. Reads the file into a
// Blob via fetch and hands it to the Firebase SDK's resumable
// uploader for real progress + retry. This path is known-good on
// iOS but breaks on Android (see uploadViaFileSystem for the fix).
async function uploadViaFirebaseSDK(sourceUri, filename, onProgress) {
  const storageRef = ref(storage, filename);

  if (onProgress) onProgress(6);
  const res = await fetch(sourceUri);
  const blob = await res.blob();

  await getFreshIdToken(false);
  if (onProgress) onProgress(10);

  const doUpload = () => new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, blob, { contentType: 'video/mp4' });
    task.on(
      'state_changed',
      (snapshot) => {
        if (!onProgress) return;
        const pct = 10 + Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 80);
        onProgress(Math.min(90, pct));
      },
      (err) => reject(err),
      () => resolve(task.snapshot),
    );
  });

  let snapshot;
  try {
    snapshot = await doUpload();
  } catch (err) {
    const code = err?.code || '';
    const authIssue = code === 'storage/unauthenticated' || code === 'storage/unauthorized';
    if (!authIssue) throw err;
    console.warn('[uploadVideo] auth error, refreshing token + retrying', code);
    await getFreshIdToken(true);
    snapshot = await doUpload();
  }

  const downloadURL = await getDownloadURL(snapshot.ref);
  return { downloadURL, size: blob.size };
}

/**
 * uploadRawToStorage — platform-dispatched raw upload with no
 * compression pass. Used by the compression-backfill admin utility
 * which needs to push an ALREADY-compressed file straight up to
 * Firebase Storage; also useful for any future flow that wants to
 * skip the built-in compression step in uploadVideo.
 *
 * @param {string} sourceUri - Local file:// URI of the file to upload
 * @param {string} filename - Firebase Storage object path (e.g. videos/{uid}/{ts}.mp4)
 * @param {(pct: number) => void} onProgress - 0-100 upload progress
 * @returns {Promise<{ downloadURL: string, size: number }>}
 */
export async function uploadRawToStorage(sourceUri, filename, onProgress) {
  return Platform.OS === 'android'
    ? uploadViaFileSystem(sourceUri, filename, onProgress)
    : uploadViaFirebaseSDK(sourceUri, filename, onProgress);
}

/**
 * uploadVideo — upload video to Firebase Storage and return the
 * metadata the caller needs to write onto the snapple doc.
 *
 * NO LONGER writes to a separate `videos` Firestore collection —
 * that collection was write-only bookkeeping nothing else read; the
 * caller (createSnapple) now stores `filename` / `fileSize` /
 * `mimeType` directly on the snapple doc so admin cleanup can locate
 * the Storage object without an extra join.
 *
 * Platform routing:
 * - Android → uploadViaFileSystem (native POST via expo-file-system).
 *   Bypasses `fetch(file:///…)` which throws "Network request failed"
 *   on many Android builds.
 * - iOS → uploadViaFirebaseSDK (fetch + Blob + uploadBytesResumable).
 *   Known-good on iOS; gives real streaming progress.
 *
 * Both paths do URI normalization + source-exists sanity check + a
 * force-token-refresh retry on auth failure.
 *
 * @param {string} videoUri - Local file URI of the video
 * @param {string} _promptText - (unused; kept for signature back-compat)
 * @param {string} userId - Uploader uid
 * @param {Function} onProgress - Progress callback (0..100) => void
 * @returns {Promise<{ id, downloadURL, filename, fileSize, mimeType }>}
 *   `id` is the storage-object timestamp — kept under the name `id`
 *   for back-compat with callers that pass `uploadResult.id` as the
 *   snapple's videoId.
 */
export async function uploadVideo(videoUri, _promptText, userId = 'anonymous', onProgress) {
  try {
    console.log('[uploadVideo] start', { videoUri, userId, platform: Platform.OS });

    const rawUri = normalizeIosFileUri(videoUri);
    const timestamp = Date.now();
    const filename = `videos/${userId}/${timestamp}.mp4`;

    // onProgress receives (pct, phase) — phase is 'compressing'
    // during the compression pass, 'uploading' during the network
    // upload. Callers (UploadQueueContext) map phase to toast copy.
    if (onProgress) onProgress(2, 'compressing');

    // Sanity-check the source before we spend CPU / network.
    const LegacyFS = require('expo-file-system/legacy');
    const rawInfo = await LegacyFS.getInfoAsync(rawUri);
    if (!rawInfo.exists || (rawInfo.size || 0) === 0) {
      throw new Error('Recorded video is missing or empty. Please retake and try again.');
    }
    console.log('[uploadVideo] source ok', { uri: rawUri, size: rawInfo.size });

    // Compress before upload. Native pass (react-native-compressor).
    // Progress allocation: 2-40% for compression, 40-100% for upload.
    // Files under the compressor's skip threshold return the raw URI
    // unchanged, so this branch is safe on any recording.
    const compression = await compressVideo(rawUri, (compressPct) => {
      if (!onProgress) return;
      onProgress(2 + Math.round((compressPct / 100) * 38), 'compressing');
    });
    if (onProgress) onProgress(40, 'uploading');

    const sourceUri = compression.uri;
    const info = { exists: true, size: compression.compressedSize || rawInfo.size };

    // Platform routes take their own 0-100 progress and get mapped
    // into the 40-100 outer range under the 'uploading' phase.
    const mapUploadProgress = (pct) => {
      if (!onProgress) return;
      onProgress(40 + Math.round((pct / 100) * 60), 'uploading');
    };
    const uploaded = Platform.OS === 'android'
      ? await uploadViaFileSystem(sourceUri, filename, mapUploadProgress)
      : await uploadViaFirebaseSDK(sourceUri, filename, mapUploadProgress);

    if (onProgress) onProgress(100, 'uploading');
    console.log('[uploadVideo] success', {
      ...uploaded,
      compressionRatio: compression.ratio,
      compressionSkipped: compression.skipped,
    });

    return {
      id: String(timestamp),
      downloadURL: uploaded.downloadURL,
      filename,
      fileSize: uploaded.size || info.size || 0,
      mimeType: 'video/mp4',
    };
  } catch (error) {
    console.error('[uploadVideo] failed', error);
    throw new Error(`Upload failed: ${error.message}`);
  }
}

// (Legacy `getVideosForPrompt` and `deleteVideo` removed — the
// `videos` Firestore collection they queried is dead. Snapples own
// their own video metadata now (filename / fileSize / mimeType);
// snappleService.deleteSnapple handles Storage file cleanup.)