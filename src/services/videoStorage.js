import { Platform } from 'react-native';
import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { storage, db, auth as firebaseAuth } from './firebase';

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
 * uploadVideo — upload video to Firebase Storage + save metadata to Firestore.
 *
 * Platform routing:
 * - Android → uploadViaFileSystem (native POST via expo-file-system).
 *   Bypasses `fetch(file:///…)` which throws "Network request failed"
 *   on many Android builds.
 * - iOS → uploadViaFirebaseSDK (fetch + Blob + uploadBytesResumable).
 *   Known-good on iOS; gives real streaming progress.
 *
 * Both paths do URI normalization + source-exists sanity check + a
 * force-token-refresh retry on auth failure. After the file lands,
 * we write the `videos` Firestore doc and return { id, downloadURL,
 * metadata } for the caller.
 *
 * @param {string} videoUri - Local file URI of the video
 * @param {string} promptText - The prompt the video responds to
 * @param {string} userId - Uploader uid
 * @param {Function} onProgress - Progress callback (0..100) => void
 */
export async function uploadVideo(videoUri, promptText, userId = 'anonymous', onProgress) {
  try {
    console.log('[uploadVideo] start', { videoUri, promptText, userId, platform: Platform.OS });

    const sourceUri = normalizeIosFileUri(videoUri);
    const timestamp = Date.now();
    const filename = `videos/${userId}/${timestamp}.mp4`;

    if (onProgress) onProgress(3);

    // Sanity-check the source before we spend a network round-trip.
    const LegacyFS = require('expo-file-system/legacy');
    const info = await LegacyFS.getInfoAsync(sourceUri);
    if (!info.exists || (info.size || 0) === 0) {
      throw new Error('Recorded video is missing or empty. Please retake and try again.');
    }
    console.log('[uploadVideo] source ok', { uri: sourceUri, size: info.size });

    const uploaded = Platform.OS === 'android'
      ? await uploadViaFileSystem(sourceUri, filename, onProgress)
      : await uploadViaFirebaseSDK(sourceUri, filename, onProgress);

    if (onProgress) onProgress(95);
    console.log('[uploadVideo] file landed', uploaded);

    const videoMetadata = {
      videoUrl: uploaded.downloadURL,
      filename,
      prompt: promptText,
      userId,
      createdAt: serverTimestamp(),
      fileSize: uploaded.size || info.size || 0,
      mimeType: 'video/mp4',
      status: 'active',
    };
    const docRef = await addDoc(collection(db, 'videos'), videoMetadata);
    if (onProgress) onProgress(100);
    console.log('[uploadVideo] metadata saved', docRef.id);

    return { id: docRef.id, downloadURL: uploaded.downloadURL, metadata: videoMetadata };
  } catch (error) {
    console.error('[uploadVideo] failed', error);
    throw new Error(`Upload failed: ${error.message}`);
  }
}

/**
 * Get all videos for a specific prompt
 * @param {string} promptText - The prompt to filter by
 * @returns {Promise<Array>} - Array of video objects
 */
export async function getVideosForPrompt(promptText) {
  try {
    const { query, where, getDocs } = await import('firebase/firestore');
    
    const videosQuery = query(
      collection(db, 'videos'),
      where('promptText', '==', promptText),
      where('status', '==', 'active')
    );
    
    const querySnapshot = await getDocs(videosQuery);
    const videos = [];
    
    querySnapshot.forEach((doc) => {
      videos.push({
        id: doc.id,
        ...doc.data()
      });
    });
    
    return videos;
  } catch (error) {
    console.error('Error fetching videos:', error);
    return [];
  }
}

/**
 * Delete a video from storage and database
 * @param {string} videoId - Document ID of video to delete
 * @param {string} filename - Storage filename to delete
 */
export async function deleteVideo(videoId, filename) {
  try {
    const { deleteObject } = await import('firebase/storage');
    const { doc, deleteDoc } = await import('firebase/firestore');
    
    // Delete from storage
    const fileRef = ref(storage, filename);
    await deleteObject(fileRef);
    
    // Delete from Firestore
    await deleteDoc(doc(db, 'videos', videoId));
    
    console.log('Video deleted successfully:', videoId);
  } catch (error) {
    console.error('Error deleting video:', error);
    throw error;
  }
}