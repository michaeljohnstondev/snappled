import { useState, useEffect } from 'react';
import {
  collection,
  addDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  deleteDoc,
  doc,
  getDoc,
} from 'firebase/firestore';
import { db } from '../services/firebase';
import { validateComment, sortComments } from '../lib/commentUtils';
import { useAuth } from '../store/AuthContext';

/**
 * Custom hook for managing comments on an event
 */
export const useComments = (eventId) => {
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [eventData, setEventData] = useState(null);

  const { currentUserId, userData } = useAuth();

  const getDisplayName = () => {
    if (userData?.firstName && userData?.lastName) {
      return `${userData.firstName} ${userData.lastName}`;
    }
    if (userData?.firstName) {
      return userData.firstName;
    }
    return 'Anonymous';
  };

  // Fetch event data to determine hosts/admins
  useEffect(() => {
    if (!eventId) return;

    const fetchEventData = async () => {
      try {
        const eventRef = doc(db, 'events', eventId);
        const eventSnap = await getDoc(eventRef);

        if (eventSnap.exists()) {
          setEventData(eventSnap.data());
        }
      } catch (err) {
        console.error('Error fetching event data:', err);
      }
    };

    fetchEventData();
  }, [eventId]);

  // Determine role for current user (used for permissions and when creating comments)
  const getCurrentUserRole = () => {
    if (!eventData || !currentUserId) return 'attendee';

    // Check if current user is admin
    if (userData && userData.isAdmin === true) {
      return 'admin';
    }

    // Check if current user is the event creator/host
    if (eventData.hostId === currentUserId) {
      return 'host';
    }

    // Check if current user is in hosts array
    if (eventData.hosts && eventData.hosts.includes(currentUserId)) {
      return 'host';
    }

    return 'attendee';
  };

  // Set up real-time listener for comments
  useEffect(() => {
    if (!eventId) {
      setLoading(false);
      return;
    }

    const commentsRef = collection(db, `events/${eventId}/comments`);
    const q = query(commentsRef, orderBy('timestamp', 'desc'));

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const commentsData = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            ...data,
            // Use the stored userRole from comment data, fallback to 'attendee' if not present
            userRole: data.userRole || 'attendee',
          };
        });

        setComments(commentsData);
        setLoading(false);
        setError(null);
      },
      (err) => {
        console.error('Error fetching comments:', err);
        setError('Failed to load comments');
        setLoading(false);
      }
    );

    return unsubscribe;
  }, [eventId]);

  /**
   * Add a new comment
   */
  const addComment = async (content) => {
    if (!currentUserId || !eventId) {
      console.log('Missing currentUserId or eventId');
      setError('You must be logged in to comment');
      return false;
    }

    // Validate comment
    const validation = validateComment(content);
    if (!validation.isValid) {
      console.log('Validation failed:', validation.error);
      setError(validation.error);
      return false;
    }

    setSubmitting(true);
    setError(null);

    try {
      const commentsRef = collection(db, `events/${eventId}/comments`);

      const commentData = {
        userId: currentUserId,
        userName: getDisplayName(),
        content: content.trim(),
        timestamp: serverTimestamp(),
        parentCommentId: null,
        level: 0,
        // Store the current user's role at comment creation time
        userRole: getCurrentUserRole(),
      };

      await addDoc(commentsRef, commentData);

      setSubmitting(false);
      return true;
    } catch (err) {
      console.error('Error adding comment:', err);
      setError('Failed to add comment');
      setSubmitting(false);
      return false;
    }
  };

  /**
   * Delete a comment (only if user owns it or is admin/host)
   */
  const deleteComment = async (commentId, commentUserId) => {
    if (!currentUserId) {
      setError('You must be logged in to delete comments');
      return false;
    }

    const currentUserRole = getCurrentUserRole();
    const isOwner = currentUserId === commentUserId;
    const canDelete =
      isOwner || currentUserRole === 'admin' || currentUserRole === 'host';

    if (!canDelete) {
      setError('You can only delete your own comments');
      return false;
    }

    try {
      const commentRef = doc(db, `events/${eventId}/comments`, commentId);
      await deleteDoc(commentRef);
      return true;
    } catch (err) {
      console.error('Error deleting comment:', err);
      setError('Failed to delete comment');
      return false;
    }
  };

  /**
   * Clear any error messages
   */
  const clearError = () => {
    setError(null);
  };

  return {
    comments,
    loading,
    error,
    submitting,
    addComment,
    deleteComment,
    clearError,
    eventData,
    getCurrentUserRole,
  };
};
