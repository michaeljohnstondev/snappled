import { ref, uploadBytes, getDownloadURL, uploadBytesResumable, uploadString } from 'firebase/storage';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { storage, db } from './firebase';

/**
 * Upload video to Firebase Storage and save metadata to Firestore
 * @param {string} videoUri - Local file URI of the video
 * @param {string} promptText - The prompt the video responds to
 * @param {string} userId - User ID (for future auth integration)
 * @param {Function} onProgress - Progress callback (progress) => void
 * @returns {Promise<string>} - Download URL of uploaded video
 */
export async function uploadVideo(videoUri, promptText, userId = 'anonymous', onProgress) {
  try {
    console.log('Starting video upload...', { videoUri, promptText, userId });
    
    // Generate unique filename
    const timestamp = Date.now();
    const filename = `videos/${userId}/${timestamp}.mp4`;
    
    // Create storage reference
    const storageRef = ref(storage, filename);
    
    // Upload using expo-file-system uploadAsync — bypasses broken RN blob/fetch
    console.log('Reading video from:', videoUri);
    const LegacyFS = require('expo-file-system/legacy');

    if (onProgress) onProgress(5);

    // Upload directly from file URI using expo-file-system
    const uploadUrl = `https://firebasestorage.googleapis.com/v0/b/${storage.app.options.storageBucket}/o/${encodeURIComponent(filename)}?uploadType=media`;

    // Get auth token for the upload
    const { auth: firebaseAuth } = require('./firebase');
    const token = await firebaseAuth.currentUser?.getIdToken();

    if (onProgress) onProgress(10);

    const uploadResult = await LegacyFS.uploadAsync(uploadUrl, videoUri, {
      httpMethod: 'POST',
      uploadType: LegacyFS.FileSystemUploadType.BINARY_CONTENT,
      headers: {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'video/mp4',
      },
    });

    if (onProgress) onProgress(90);

    if (uploadResult.status !== 200) {
      throw new Error(`Upload failed with status ${uploadResult.status}`);
    }

    const downloadURL = await getDownloadURL(storageRef);
    const fileInfo = await LegacyFS.getInfoAsync(videoUri);
    const fileSize = fileInfo.size || 0;
    if (onProgress) onProgress(100);
    console.log('Video uploaded successfully:', downloadURL, 'size:', fileSize);

    
    // Save video metadata to Firestore
    const videoMetadata = {
      videoUrl: downloadURL,
      filename,
      prompt: promptText,
      userId,
      createdAt: serverTimestamp(),
      fileSize,
      mimeType: 'video/mp4',
      status: 'active'
    };
    
    const docRef = await addDoc(collection(db, 'videos'), videoMetadata);
    console.log('Video metadata saved with ID:', docRef.id);
    
    return {
      id: docRef.id,
      downloadURL,
      metadata: videoMetadata
    };
    
  } catch (error) {
    console.error('Video upload failed:', error);
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