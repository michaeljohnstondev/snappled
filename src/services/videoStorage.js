import { ref, uploadBytes, getDownloadURL, uploadBytesResumable } from 'firebase/storage';
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
    
    // Convert URI to blob for upload
    const response = await fetch(videoUri);
    const blob = await response.blob();
    
    console.log('Video blob created, size:', blob.size, 'bytes');
    
    // Upload with progress tracking
    const uploadTask = uploadBytesResumable(storageRef, blob, {
      contentType: 'video/mp4',
      customMetadata: {
        prompt: promptText,
        userId: userId,
        uploadedAt: new Date().toISOString(),
      }
    });
    
    // Handle upload progress
    const uploadPromise = new Promise((resolve, reject) => {
      uploadTask.on('state_changed', 
        (snapshot) => {
          const progress = (snapshot.bytesTransferred / snapshot.totalBytes) * 100;
          console.log('Upload progress:', progress + '%');
          if (onProgress) onProgress(progress);
        },
        (error) => {
          console.error('Upload error:', error);
          reject(error);
        },
        async () => {
          // Upload completed successfully
          try {
            const downloadURL = await getDownloadURL(uploadTask.snapshot.ref);
            console.log('Video uploaded successfully:', downloadURL);
            resolve(downloadURL);
          } catch (error) {
            console.error('Error getting download URL:', error);
            reject(error);
          }
        }
      );
    });
    
    const downloadURL = await uploadPromise;
    
    // Save video metadata to Firestore
    const videoMetadata = {
      downloadURL,
      filename,
      promptText,
      userId,
      createdAt: serverTimestamp(),
      fileSize: blob.size,
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