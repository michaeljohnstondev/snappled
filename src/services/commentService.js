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

        // Notifications are the onCommentCreated trigger's job.
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

        // No notification for a like. It was writing to the same
        // unread collection as the others, and a ping for every like
        // is the kind of thing people turn the whole category off for -
        // the comment and reply pings are the ones worth keeping.
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

  // createCommentNotification lived here: it wrote a document into a
  // top-level `notifications` collection that nothing has ever read.
  // No trigger watched it, so no push was ever sent and nothing showed
  // in-app - comments notified an empty room from the day they were
  // written.
  //
  // functions/comments.js does it now, on a trigger, which is also the
  // only place that CAN do it properly: it fans out to everyone in the
  // thread rather than one person, and it goes through
  // deliverNotification so blocks, mutes and the per-type toggle are
  // checked the same way they are for follows and game invites.

  /** Thread ids this user has muted, for seeding the bell states. */
  async getMutedThreads() {
    try {
      if (!auth.currentUser) return { success: true, threadIds: [] };
      const snap = await getDoc(doc(db, 'users', auth.currentUser.uid));
      return {
        success: true,
        threadIds: (snap.exists() ? snap.data().mutedThreads : []) || [],
      };
    } catch (error) {
      console.error('[CommentService] getMutedThreads error:', error);
      return { success: false, threadIds: [] };
    }
  },

  /**
   * setThreadMuted — stop or resume notifications for ONE thread.
   *
   * Account-wide comment notifications are a settings toggle; this is
   * the per-conversation one, for the thread that will not stop and
   * that you cannot leave without also leaving every other thread.
   *
   * Stored as mutedThreads on the user document and read by the
   * onCommentCreated trigger before it delivers. Top-level, not under
   * resources/stats, so the client can write it - muting is a
   * preference, not currency.
   */
  async setThreadMuted(threadId, muted) {
    try {
      if (!auth.currentUser || !threadId) {
        return { success: false, error: 'Not signed in' };
      }
      await updateDoc(doc(db, 'users', auth.currentUser.uid), {
        mutedThreads: muted ? arrayUnion(threadId) : arrayRemove(threadId),
      });
      return { success: true, muted };
    } catch (error) {
      console.error('[CommentService] setThreadMuted error:', error);
      return { success: false, error: error.message };
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

      // The error handler is not optional. This query needs a composite
      // index on snappleId + parentCommentId + isDeleted + createdAt,
      // and there was none - so onSnapshot failed, threw into nothing,
      // and the thread simply never updated. A silent listener is
      // indistinguishable from a quiet conversation.
      const unsubscribe = onSnapshot(
        q,
        (querySnapshot) => {
          const comments = [];
          querySnapshot.forEach((doc) => {
            comments.push({ id: doc.id, ...doc.data() });
          });
          callback(comments);
        },
        (error) => {
          console.error('[CommentService] live comments failed:', error.message);
        },
      );

      return unsubscribe;
    } catch (error) {
      console.error('Error subscribing to comments:', error);
      return () => {}; // Return empty unsubscribe function
    }
  }
};

export default commentService;