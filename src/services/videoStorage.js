import { ref, uploadBytesResumable, getDownloadURL } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { storage, db, auth as firebaseAuth } from './firebase';

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

/**
 * Upload video to Firebase Storage and save metadata to Firestore.
 *
 * iOS pipeline notes:
 * - URI normalized so `/private/var/mobile` doesn't break fetch/blob.
 * - Firebase SDK's uploadBytesResumable is the primary path — it
 *   handles token attachment, retries, and Content-Length correctly.
 *   Legacy expo-file-system/legacy uploadAsync had known iOS 17+
 *   issues (silent 400s, missing Content-Length on files > 5MB).
 * - Token grace-period recovery: if the first upload fails auth,
 *   force-refresh the token and try once more before surfacing.
 *
 * @param {string} videoUri - Local file URI of the video
 * @param {string} promptText - The prompt the video responds to
 * @param {string} userId - Uploader uid
 * @param {Function} onProgress - Progress callback (0..100) => void
 */
export async function uploadVideo(videoUri, promptText, userId = 'anonymous', onProgress) {
  try {
    console.log('[uploadVideo] start', { videoUri, promptText, userId });

    // Normalize the iOS `/private/` prefix — safe on Android too
    // (it's a no-op for URIs that don't start with `file:///private/`).
    const sourceUri = normalizeIosFileUri(videoUri);

    // Filename in Firebase Storage
    const timestamp = Date.now();
    const filename = `videos/${userId}/${timestamp}.mp4`;
    const storageRef = ref(storage, filename);

    if (onProgress) onProgress(3);

    // Sanity-check the source before we even try to fetch it. iOS
    // occasionally purges the temp recording between capture and
    // upload (backgrounded app, low storage) — a clear error beats
    // a 4xx with a vague body.
    const LegacyFS = require('expo-file-system/legacy');
    const info = await LegacyFS.getInfoAsync(sourceUri);
    if (!info.exists || (info.size || 0) === 0) {
      throw new Error('Recorded video is missing or empty. Please retake and try again.');
    }
    console.log('[uploadVideo] source ok', { uri: sourceUri, size: info.size });

    // Fetch the file into a Blob so Firebase SDK can upload it.
    // fetch() on file:// URIs works on both iOS and Android; the
    // Blob is streamed under the hood so this doesn't OOM on
    // reasonable-length (< 60s) video clips.
    if (onProgress) onProgress(6);
    const res = await fetch(sourceUri);
    const blob = await res.blob();
    console.log('[uploadVideo] blob ready', { size: blob.size, type: blob.type });

    // Prime the auth token BEFORE the upload starts so Firebase SDK
    // doesn't try (and fail) with a stale one mid-stream.
    await getFreshIdToken(false);
    if (onProgress) onProgress(10);

    // Primary upload attempt — Firebase's own resumable uploader.
    // Wraps a real XMLHttpRequest with proper Content-Length and
    // retry, and reports progress natively.
    const doUpload = () => new Promise((resolve, reject) => {
      const task = uploadBytesResumable(storageRef, blob, {
        contentType: 'video/mp4',
      });
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
      // On auth error, force-refresh the token and try once more.
      const code = err?.code || '';
      const authIssue = code === 'storage/unauthenticated' || code === 'storage/unauthorized';
      if (!authIssue) throw err;
      console.warn('[uploadVideo] auth error, refreshing token + retrying', code);
      await getFreshIdToken(true);
      snapshot = await doUpload();
    }

    if (onProgress) onProgress(95);
    const downloadURL = await getDownloadURL(snapshot.ref);
    const fileSize = info.size || 0;
    if (onProgress) onProgress(100);
    console.log('[uploadVideo] success', { downloadURL, size: fileSize });

    const videoMetadata = {
      videoUrl: downloadURL,
      filename,
      prompt: promptText,
      userId,
      createdAt: serverTimestamp(),
      fileSize,
      mimeType: 'video/mp4',
      status: 'active',
    };
    const docRef = await addDoc(collection(db, 'videos'), videoMetadata);
    console.log('[uploadVideo] metadata saved', docRef.id);

    return { id: docRef.id, downloadURL, metadata: videoMetadata };
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