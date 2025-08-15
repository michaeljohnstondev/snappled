import React, { useState, useEffect } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  TouchableOpacity, 
  Modal,
  FlatList,
  Alert
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import theme from '../../theme/themes';
import { notificationService } from '../../services/notificationService';
import { auth } from '../../services/firebase';

export default function NotificationBell({ style }) {
  const [unreadCount, setUnreadCount] = useState(0);
  const [notifications, setNotifications] = useState([]);
  const [showModal, setShowModal] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (auth.currentUser) {
      setupNotificationSubscription();
    }
  }, []);

  function setupNotificationSubscription() {
    const unsubscribe = notificationService.subscribeToNotifications(
      auth.currentUser.uid,
      ({ notifications, unreadCount }) => {
        setNotifications(notifications);
        setUnreadCount(unreadCount);
      }
    );

    return unsubscribe;
  }

  async function handleMarkAllAsRead() {
    if (!auth.currentUser) return;
    
    setIsLoading(true);
    try {
      const result = await notificationService.markAllNotificationsAsRead(auth.currentUser.uid);
      if (!result.success) {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to mark notifications as read');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleNotificationPress(notification) {
    // Mark as read if unread
    if (!notification.isRead) {
      await notificationService.markNotificationAsRead(notification.id);
    }

    // Handle navigation based on notification type
    switch (notification.type) {
      case 'like':
      case 'comment':
      case 'purchase':
        // Navigate to snapple
        console.log('Navigate to snapple:', notification.targetId);
        break;
      case 'reply':
        // Navigate to comment/snapple
        console.log('Navigate to comment:', notification.targetId);
        break;
      case 'follow':
        // Navigate to user profile
        console.log('Navigate to profile:', notification.fromUserId);
        break;
      default:
        // Do nothing for system notifications
        break;
    }
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return 'now';
    
    const now = new Date();
    const notificationTime = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diffMs = now - notificationTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    if (diffDays < 7) return `${diffDays}d`;
    return `${Math.floor(diffDays / 7)}w`;
  }

  function getNotificationIcon(type) {
    switch (type) {
      case 'like': return '👍';
      case 'comment': return '💬';
      case 'reply': return '↩️';
      case 'follow': return '👥';
      case 'purchase': return '🛒';
      case 'system': return '🔔';
      default: return '📢';
    }
  }

  function renderNotification({ item: notification }) {
    return (
      <TouchableOpacity
        style={[
          styles.notificationItem,
          !notification.isRead && styles.unreadNotification
        ]}
        onPress={() => handleNotificationPress(notification)}
      >
        <View style={styles.notificationIcon}>
          <Text style={styles.iconText}>{getNotificationIcon(notification.type)}</Text>
        </View>
        
        <View style={styles.notificationContent}>
          <Text style={styles.notificationTitle}>{notification.title}</Text>
          <Text style={styles.notificationMessage}>{notification.message}</Text>
          <Text style={styles.notificationTime}>
            {formatTimeAgo(notification.createdAt)}
          </Text>
        </View>
        
        {!notification.isRead && <View style={styles.unreadDot} />}
      </TouchableOpacity>
    );
  }

  function renderEmptyState() {
    return (
      <View style={styles.emptyState}>
        <Text style={styles.emptyStateEmoji}>🔔</Text>
        <Text style={styles.emptyStateTitle}>No Notifications</Text>
        <Text style={styles.emptyStateText}>
          You're all caught up! We'll let you know when something happens.
        </Text>
      </View>
    );
  }

  return (
    <>
      <TouchableOpacity
        style={[styles.bellContainer, style]}
        onPress={() => setShowModal(true)}
      >
        <Text style={styles.bellIcon}>🔔</Text>
        {unreadCount > 0 && (
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              {unreadCount > 99 ? '99+' : unreadCount}
            </Text>
          </View>
        )}
      </TouchableOpacity>

      <Modal
        visible={showModal}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setShowModal(false)}
      >
        <LinearGradient
          colors={theme.colors.backgroundGradient}
          style={styles.modalContainer}
        >
          {/* Header */}
          <View style={styles.header}>
            <Text style={styles.title}>Notifications</Text>
            <View style={styles.headerActions}>
              {unreadCount > 0 && (
                <TouchableOpacity
                  onPress={handleMarkAllAsRead}
                  disabled={isLoading}
                  style={styles.markAllButton}
                >
                  <Text style={styles.markAllText}>
                    {isLoading ? 'Marking...' : 'Mark All Read'}
                  </Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity onPress={() => setShowModal(false)}>
                <Text style={styles.closeText}>✕</Text>
              </TouchableOpacity>
            </View>
          </View>

          {/* Notifications List */}
          <FlatList
            data={notifications}
            renderItem={renderNotification}
            keyExtractor={(item) => item.id}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={renderEmptyState}
          />
        </LinearGradient>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  bellContainer: {
    position: 'relative',
    padding: 8,
  },
  bellIcon: {
    fontSize: 24,
  },
  badge: {
    position: 'absolute',
    top: 0,
    right: 0,
    backgroundColor: '#ff4444',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 2,
    borderColor: theme.colors.background,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
  },
  modalContainer: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: theme.sizes.spacing?.lg || 24,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.1)',
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  markAllButton: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: theme.colors.primary,
    borderRadius: 16,
  },
  markAllText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  closeText: {
    fontSize: 20,
    color: theme.colors.textSecondary,
    padding: 4,
  },
  listContent: {
    padding: theme.sizes.spacing?.lg || 24,
  },
  notificationItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    padding: theme.sizes.spacing?.md || 16,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: theme.sizes.borderRadius || 12,
    marginBottom: theme.sizes.spacing?.md || 16,
    position: 'relative',
  },
  unreadNotification: {
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderLeftWidth: 3,
    borderLeftColor: theme.colors.primary,
  },
  notificationIcon: {
    marginRight: 12,
    marginTop: 2,
  },
  iconText: {
    fontSize: 20,
  },
  notificationContent: {
    flex: 1,
  },
  notificationTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  notificationMessage: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 18,
    marginBottom: 6,
  },
  notificationTime: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    opacity: 0.7,
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.colors.primary,
    position: 'absolute',
    top: 8,
    right: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.sizes.spacing?.xl || 32,
  },
  emptyStateEmoji: {
    fontSize: 48,
    marginBottom: 16,
    opacity: 0.5,
  },
  emptyStateTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 8,
  },
  emptyStateText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    opacity: 0.8,
    lineHeight: 20,
    paddingHorizontal: 32,
  },
});