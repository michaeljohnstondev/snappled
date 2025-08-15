import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  increment,
  serverTimestamp,
  collection,
  query,
  where,
  getDocs,
  orderBy,
  limit as firestoreLimit,
  deleteDoc,
  arrayUnion,
  arrayRemove,
  onSnapshot
} from 'firebase/firestore';
import { auth, db } from './firebase';

const COMMENTS_COLLECTION = 'comments';
const NOTIFICATIONS_COLLECTION = 'notifications';

export const commentService = {
  async addComment(snappleId, text, parentCommentId = null) {
    try {
      if (!auth.currentUser) {
        throw new Error('Must be logged in to comment');
      }

      if (!text.trim()) {
        throw new Error('Comment cannot be empty');
      }

      const commentDoc = {
        snappleId,
        userId: auth.currentUser.uid,
        username: auth.currentUser.displayName || 'Anonymous',
        text: text.trim(),
        parentCommentId, // null for top-level comments
        likes: 0,
        replies: 0,
        isEdited: false,
        isDeleted: false,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      const commentRef = doc(collection(db, COMMENTS_COLLECTION));
      await setDoc(commentRef, commentDoc);

      // If this is a reply, update parent comment reply count
      if (parentCommentId) {
        const parentRef = doc(db, COMMENTS_COLLECTION, parentCommentId);
        await updateDoc(parentRef, {
          replies: increment(1),
          updatedAt: serverTimestamp()
        });

        // Create notification for parent comment author
        await this.createCommentNotification(parentCommentId, commentRef.id, 'reply');
      } else {
        // Create notification for snapple creator
        await this.createCommentNotification(snappleId, commentRef.id, 'comment');
      }

      return {
        success: true,
        commentId: commentRef.id,
        comment: { id: commentRef.id, ...commentDoc }
      };
    } catch (error) {
      console.error('Error adding comment:', error);
      return {
        success: false,
        error: error.message || 'Failed to add comment'
      };
    }
  },

  async getComments(snappleId, parentCommentId = null, limitCount = 20) {
    try {
      let q;
      
      if (parentCommentId) {
        // Get replies to a specific comment
        q = query(
          collection(db, COMMENTS_COLLECTION),
          where('snappleId', '==', snappleId),
          where('parentCommentId', '==', parentCommentId),
          where('isDeleted', '==', false),
          orderBy('createdAt', 'asc'),
          firestoreLimit(limitCount)
        );
      } else {
        // Get top-level comments
        q = query(
          collection(db, COMMENTS_COLLECTION),
          where('snappleId', '==', snappleId),
          where('parentCommentId', '==', null),
          where('isDeleted', '==', false),
          orderBy('createdAt', 'desc'),
          firestoreLimit(limitCount)
        );
      }

      const querySnapshot = await getDocs(q);
      const comments = [];

      querySnapshot.forEach((doc) => {
        comments.push({ id: doc.id, ...doc.data() });
      });

      return { success: true, comments };
    } catch (error) {
      console.error('Error fetching comments:', error);
      return { success: false, error: 'Failed to fetch comments' };
    }
  },

  async likeComment(commentId) {
    try {
      if (!auth.currentUser) {
        throw new Error('Must be logged in to like comments');
      }

      const userInteractionId = `${auth.currentUser.uid}_${commentId}`;
      const interactionRef = doc(db, 'comment_likes', userInteractionId);
      const interactionDoc = await getDoc(interactionRef);

      const commentRef = doc(db, COMMENTS_COLLECTION, commentId);

      if (interactionDoc.exists()) {
        // Unlike comment
        await deleteDoc(interactionRef);
        await updateDoc(commentRef, {
          likes: increment(-1),
          updatedAt: serverTimestamp()
        });
        
        return { success: true, isLiked: false };
      } else {
        // Like comment
        await setDoc(interactionRef, {
          userId: auth.currentUser.uid,
          commentId,
          createdAt: serverTimestamp()
        });
        
        await updateDoc(commentRef, {
          likes: increment(1),
          updatedAt: serverTimestamp()
        });

        // Create notification for comment author
        await this.createCommentNotification(commentId, null, 'like');
        
        return { success: true, isLiked: true };
      }
    } catch (error) {
      console.error('Error liking comment:', error);
      return { success: false, error: 'Failed to like comment' };
    }
  },

  async editComment(commentId, newText) {
    try {
      if (!auth.currentUser) {
        throw new Error('Must be logged in to edit comments');
      }

      if (!newText.trim()) {
        throw new Error('Comment cannot be empty');
      }

      const commentRef = doc(db, COMMENTS_COLLECTION, commentId);
      const commentDoc = await getDoc(commentRef);

      if (!commentDoc.exists()) {
        throw new Error('Comment not found');
      }

      const commentData = commentDoc.data();
      if (commentData.userId !== auth.currentUser.uid) {
        throw new Error('You can only edit your own comments');
      }

      await updateDoc(commentRef, {
        text: newText.trim(),
        isEdited: true,
        updatedAt: serverTimestamp()
      });

      return { success: true };
    } catch (error) {
      console.error('Error editing comment:', error);
      return { success: false, error: error.message || 'Failed to edit comment' };
    }
  },

  async deleteComment(commentId) {
    try {
      if (!auth.currentUser) {
        throw new Error('Must be logged in to delete comments');
      }

      const commentRef = doc(db, COMMENTS_COLLECTION, commentId);
      const commentDoc = await getDoc(commentRef);

      if (!commentDoc.exists()) {
        throw new Error('Comment not found');
      }

      const commentData = commentDoc.data();
      if (commentData.userId !== auth.currentUser.uid) {
        throw new Error('You can only delete your own comments');
      }

      // Soft delete - mark as deleted instead of removing
      await updateDoc(commentRef, {
        isDeleted: true,
        text: '[deleted]',
        updatedAt: serverTimestamp()
      });

      // If this comment has replies, keep it but mark as deleted
      // If no replies, we could hard delete but soft delete is safer
      
      return { success: true };
    } catch (error) {
      console.error('Error deleting comment:', error);
      return { success: false, error: error.message || 'Failed to delete comment' };
    }
  },

  async reportComment(commentId, reason, description = '') {
    try {
      if (!auth.currentUser) {
        throw new Error('Must be logged in to report comments');
      }

      const reportDoc = {
        type: 'comment',
        targetId: commentId,
        reporterId: auth.currentUser.uid,
        reason, // 'spam', 'harassment', 'inappropriate', 'other'
        description,
        status: 'pending',
        createdAt: serverTimestamp()
      };

      const reportRef = doc(collection(db, 'reports'));
      await setDoc(reportRef, reportDoc);

      return { success: true, reportId: reportRef.id };
    } catch (error) {
      console.error('Error reporting comment:', error);
      return { success: false, error: 'Failed to report comment' };
    }
  },

  async getUserCommentLike(commentId) {
    try {
      if (!auth.currentUser) return { success: true, isLiked: false };

      const userInteractionId = `${auth.currentUser.uid}_${commentId}`;
      const interactionRef = doc(db, 'comment_likes', userInteractionId);
      const interactionDoc = await getDoc(interactionRef);

      return { 
        success: true, 
        isLiked: interactionDoc.exists() 
      };
    } catch (error) {
      console.error('Error checking comment like:', error);
      return { success: false, isLiked: false };
    }
  },

  async createCommentNotification(targetId, commentId, type) {
    try {
      // Get target information (snapple creator or comment author)
      let targetUserId;
      
      if (type === 'comment') {
        // Notification for snapple creator
        const snappleRef = doc(db, 'snapples', targetId);
        const snappleDoc = await getDoc(snappleRef);
        if (snappleDoc.exists()) {
          targetUserId = snappleDoc.data().creatorId;
        }
      } else if (type === 'reply' || type === 'like') {
        // Notification for comment author
        const commentRef = doc(db, COMMENTS_COLLECTION, targetId);
        const commentDoc = await getDoc(commentRef);
        if (commentDoc.exists()) {
          targetUserId = commentDoc.data().userId;
        }
      }

      // Don't notify yourself
      if (!targetUserId || targetUserId === auth.currentUser.uid) {
        return;
      }

      const notificationDoc = {
        userId: targetUserId,
        fromUserId: auth.currentUser.uid,
        fromUsername: auth.currentUser.displayName || 'Anonymous',
        type, // 'comment', 'reply', 'like'
        targetId,
        commentId,
        isRead: false,
        createdAt: serverTimestamp()
      };

      const notificationRef = doc(collection(db, NOTIFICATIONS_COLLECTION));
      await setDoc(notificationRef, notificationDoc);
    } catch (error) {
      console.error('Error creating notification:', error);
      // Don't fail the main operation if notification fails
    }
  },

  // Real-time comment subscription
  subscribeToComments(snappleId, parentCommentId = null, callback) {
    try {
      let q;
      
      if (parentCommentId) {
        q = query(
          collection(db, COMMENTS_COLLECTION),
          where('snappleId', '==', snappleId),
          where('parentCommentId', '==', parentCommentId),
          where('isDeleted', '==', false),
          orderBy('createdAt', 'asc')
        );
      } else {
        q = query(
          collection(db, COMMENTS_COLLECTION),
          where('snappleId', '==', snappleId),
          where('parentCommentId', '==', null),
          where('isDeleted', '==', false),
          orderBy('createdAt', 'desc')
        );
      }

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const comments = [];
        querySnapshot.forEach((doc) => {
          comments.push({ id: doc.id, ...doc.data() });
        });
        callback(comments);
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error subscribing to comments:', error);
      return () => {}; // Return empty unsubscribe function
    }
  }
};

export default commentService;