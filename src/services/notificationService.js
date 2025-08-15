import { 
  doc, 
  setDoc, 
  getDoc, 
  updateDoc, 
  query,
  where,
  getDocs,
  orderBy,
  limit as firestoreLimit,
  deleteDoc,
  collection,
  onSnapshot,
  serverTimestamp,
  increment
} from 'firebase/firestore';
import { auth, db } from './firebase';

const NOTIFICATIONS_COLLECTION = 'notifications';
const NOTIFICATION_SETTINGS_COLLECTION = 'notification_settings';

export const notificationService = {
  async createNotification(notification) {
    try {
      const notificationDoc = {
        userId: notification.userId,
        fromUserId: notification.fromUserId || null,
        fromUsername: notification.fromUsername || 'System',
        type: notification.type, // 'like', 'comment', 'reply', 'follow', 'purchase', 'system'
        title: notification.title,
        message: notification.message,
        targetId: notification.targetId || null, // snapple id, comment id, etc.
        metadata: notification.metadata || {},
        isRead: false,
        createdAt: serverTimestamp()
      };

      const notificationRef = doc(collection(db, NOTIFICATIONS_COLLECTION));
      await setDoc(notificationRef, notificationDoc);

      return {
        success: true,
        notificationId: notificationRef.id
      };
    } catch (error) {
      console.error('Error creating notification:', error);
      return {
        success: false,
        error: error.message || 'Failed to create notification'
      };
    }
  },

  async getUserNotifications(userId, limitCount = 50) {
    try {
      const q = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        firestoreLimit(limitCount)
      );

      const querySnapshot = await getDocs(q);
      const notifications = [];

      querySnapshot.forEach((doc) => {
        notifications.push({ id: doc.id, ...doc.data() });
      });

      return { success: true, notifications };
    } catch (error) {
      console.error('Error fetching notifications:', error);
      return { success: false, error: 'Failed to fetch notifications' };
    }
  },

  async getUnreadNotificationCount(userId) {
    try {
      const q = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where('userId', '==', userId),
        where('isRead', '==', false)
      );

      const querySnapshot = await getDocs(q);
      return { success: true, count: querySnapshot.size };
    } catch (error) {
      console.error('Error getting unread count:', error);
      return { success: false, count: 0 };
    }
  },

  async markNotificationAsRead(notificationId) {
    try {
      const notificationRef = doc(db, NOTIFICATIONS_COLLECTION, notificationId);
      await updateDoc(notificationRef, {
        isRead: true,
        readAt: serverTimestamp()
      });

      return { success: true };
    } catch (error) {
      console.error('Error marking notification as read:', error);
      return { success: false, error: 'Failed to mark as read' };
    }
  },

  async markAllNotificationsAsRead(userId) {
    try {
      const q = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where('userId', '==', userId),
        where('isRead', '==', false)
      );

      const querySnapshot = await getDocs(q);
      const updatePromises = [];

      querySnapshot.forEach((doc) => {
        updatePromises.push(
          updateDoc(doc.ref, {
            isRead: true,
            readAt: serverTimestamp()
          })
        );
      });

      await Promise.all(updatePromises);
      return { success: true };
    } catch (error) {
      console.error('Error marking all notifications as read:', error);
      return { success: false, error: 'Failed to mark all as read' };
    }
  },

  async deleteNotification(notificationId) {
    try {
      await deleteDoc(doc(db, NOTIFICATIONS_COLLECTION, notificationId));
      return { success: true };
    } catch (error) {
      console.error('Error deleting notification:', error);
      return { success: false, error: 'Failed to delete notification' };
    }
  },

  // Real-time notification subscription
  subscribeToNotifications(userId, callback) {
    try {
      const q = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where('userId', '==', userId),
        orderBy('createdAt', 'desc'),
        firestoreLimit(50)
      );

      const unsubscribe = onSnapshot(q, (querySnapshot) => {
        const notifications = [];
        let unreadCount = 0;

        querySnapshot.forEach((doc) => {
          const notification = { id: doc.id, ...doc.data() };
          notifications.push(notification);
          if (!notification.isRead) unreadCount++;
        });

        callback({ notifications, unreadCount });
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error subscribing to notifications:', error);
      return () => {}; // Return empty unsubscribe function
    }
  },

  // Notification settings
  async getUserNotificationSettings(userId) {
    try {
      const settingsRef = doc(db, NOTIFICATION_SETTINGS_COLLECTION, userId);
      const settingsDoc = await getDoc(settingsRef);

      if (settingsDoc.exists()) {
        return { success: true, settings: settingsDoc.data() };
      } else {
        // Return default settings
        const defaultSettings = {
          likes: true,
          comments: true,
          replies: true,
          follows: true,
          purchases: true,
          system: true,
          emailNotifications: false,
          pushNotifications: true,
          priceAlerts: true
        };
        return { success: true, settings: defaultSettings };
      }
    } catch (error) {
      console.error('Error getting notification settings:', error);
      return { success: false, error: 'Failed to get settings' };
    }
  },

  async updateNotificationSettings(userId, settings) {
    try {
      const settingsRef = doc(db, NOTIFICATION_SETTINGS_COLLECTION, userId);
      await setDoc(settingsRef, {
        ...settings,
        updatedAt: serverTimestamp()
      }, { merge: true });

      return { success: true };
    } catch (error) {
      console.error('Error updating notification settings:', error);
      return { success: false, error: 'Failed to update settings' };
    }
  },

  // Helper methods for creating specific notification types
  async notifyLike(snappleId, snappleTitle, likerUserId, likerUsername, snappleCreatorId) {
    if (likerUserId === snappleCreatorId) return; // Don't notify yourself

    return await this.createNotification({
      userId: snappleCreatorId,
      fromUserId: likerUserId,
      fromUsername: likerUsername,
      type: 'like',
      title: 'New Like! 👍',
      message: `@${likerUsername} liked your Snapple "${snappleTitle}"`,
      targetId: snappleId,
      metadata: { snappleId, snappleTitle }
    });
  },

  async notifyComment(snappleId, snappleTitle, commenterUserId, commenterUsername, snappleCreatorId) {
    if (commenterUserId === snappleCreatorId) return; // Don't notify yourself

    return await this.createNotification({
      userId: snappleCreatorId,
      fromUserId: commenterUserId,
      fromUsername: commenterUsername,
      type: 'comment',
      title: 'New Comment! 💬',
      message: `@${commenterUsername} commented on your Snapple "${snappleTitle}"`,
      targetId: snappleId,
      metadata: { snappleId, snappleTitle }
    });
  },

  async notifyReply(commentId, commenterUserId, commenterUsername, originalCommenterUserId) {
    if (commenterUserId === originalCommenterUserId) return; // Don't notify yourself

    return await this.createNotification({
      userId: originalCommenterUserId,
      fromUserId: commenterUserId,
      fromUsername: commenterUsername,
      type: 'reply',
      title: 'New Reply! 💬',
      message: `@${commenterUsername} replied to your comment`,
      targetId: commentId,
      metadata: { commentId }
    });
  },

  async notifyFollow(followerId, followerUsername, followedUserId) {
    if (followerId === followedUserId) return; // Don't notify yourself

    return await this.createNotification({
      userId: followedUserId,
      fromUserId: followerId,
      fromUsername: followerUsername,
      type: 'follow',
      title: 'New Follower! 👥',
      message: `@${followerUsername} started following you`,
      targetId: followerId,
      metadata: { followerId }
    });
  },

  async notifyPurchase(snappleId, snappleTitle, buyerUserId, buyerUsername, snappleCreatorId, price) {
    if (buyerUserId === snappleCreatorId) return; // Don't notify yourself

    return await this.createNotification({
      userId: snappleCreatorId,
      fromUserId: buyerUserId,
      fromUsername: buyerUsername,
      type: 'purchase',
      title: 'Snapple Purchased! 🛒',
      message: `@${buyerUsername} purchased your Snapple "${snappleTitle}" for ${price} coins`,
      targetId: snappleId,
      metadata: { snappleId, snappleTitle, price }
    });
  },

  async notifyPriceAlert(userId, snappleId, snappleTitle, oldPrice, newPrice) {
    return await this.createNotification({
      userId,
      type: 'system',
      title: 'Price Alert! 📈',
      message: `"${snappleTitle}" price changed from ${oldPrice} to ${newPrice} coins`,
      targetId: snappleId,
      metadata: { snappleId, snappleTitle, oldPrice, newPrice, type: 'price_alert' }
    });
  },

  async notifySystemMessage(userId, title, message, metadata = {}) {
    return await this.createNotification({
      userId,
      type: 'system',
      title,
      message,
      metadata
    });
  },

  // Batch notification for multiple users
  async notifyMultipleUsers(userIds, notification) {
    try {
      const promises = userIds.map(userId => 
        this.createNotification({
          ...notification,
          userId
        })
      );

      await Promise.all(promises);
      return { success: true };
    } catch (error) {
      console.error('Error creating batch notifications:', error);
      return { success: false, error: 'Failed to create notifications' };
    }
  },

  // Cleanup old notifications (call periodically)
  async cleanupOldNotifications(userId, daysOld = 30) {
    try {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - daysOld);

      const q = query(
        collection(db, NOTIFICATIONS_COLLECTION),
        where('userId', '==', userId),
        where('createdAt', '<', cutoffDate)
      );

      const querySnapshot = await getDocs(q);
      const deletePromises = [];

      querySnapshot.forEach((doc) => {
        deletePromises.push(deleteDoc(doc.ref));
      });

      await Promise.all(deletePromises);
      return { success: true, deletedCount: deletePromises.length };
    } catch (error) {
      console.error('Error cleaning up notifications:', error);
      return { success: false, error: 'Failed to cleanup notifications' };
    }
  }
};

export default notificationService;