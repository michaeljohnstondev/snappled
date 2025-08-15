import React, { useState, useEffect, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  FlatList, 
  TextInput,
  TouchableOpacity,
  Alert,
  Modal,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import VibeButton from '../ui/VibeButton';
import theme from '../../theme/themes';
import { commentService } from '../../services/commentService';
import { auth } from '../../services/firebase';

export default function CommentSection({ 
  visible, 
  onClose, 
  snappleId,
  snappleTitle = "Snapple"
}) {
  const [comments, setComments] = useState([]);
  const [newComment, setNewComment] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [expandedReplies, setExpandedReplies] = useState(new Set());
  const [commentLikes, setCommentLikes] = useState({});
  
  const flatListRef = useRef(null);
  const unsubscribeRef = useRef(null);

  useEffect(() => {
    if (visible && snappleId) {
      loadComments();
      setupRealtimeSubscription();
    } else {
      cleanup();
    }

    return () => cleanup();
  }, [visible, snappleId]);

  function cleanup() {
    if (unsubscribeRef.current) {
      unsubscribeRef.current();
      unsubscribeRef.current = null;
    }
  }

  function setupRealtimeSubscription() {
    unsubscribeRef.current = commentService.subscribeToComments(
      snappleId,
      null,
      (newComments) => {
        setComments(newComments);
        loadCommentLikes(newComments);
      }
    );
  }

  async function loadComments() {
    try {
      const result = await commentService.getComments(snappleId);
      if (result.success) {
        setComments(result.comments);
        loadCommentLikes(result.comments);
      }
    } catch (error) {
      console.error('Error loading comments:', error);
    }
  }

  async function loadCommentLikes(commentsToCheck) {
    if (!auth.currentUser) return;
    
    const likes = {};
    for (const comment of commentsToCheck) {
      const result = await commentService.getUserCommentLike(comment.id);
      if (result.success) {
        likes[comment.id] = result.isLiked;
      }
    }
    setCommentLikes(likes);
  }

  async function handleAddComment() {
    if (!newComment.trim()) return;
    if (!auth.currentUser) {
      Alert.alert('Login Required', 'Please log in to comment');
      return;
    }

    setIsLoading(true);
    try {
      const result = await commentService.addComment(
        snappleId,
        newComment,
        replyingTo?.id || null
      );

      if (result.success) {
        setNewComment('');
        setReplyingTo(null);
        // Comments will update via real-time subscription
      } else {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to add comment');
    } finally {
      setIsLoading(false);
    }
  }

  async function handleLikeComment(commentId) {
    if (!auth.currentUser) {
      Alert.alert('Login Required', 'Please log in to like comments');
      return;
    }

    try {
      const result = await commentService.likeComment(commentId);
      if (result.success) {
        setCommentLikes(prev => ({
          ...prev,
          [commentId]: result.isLiked
        }));
        
        // Update comment in list
        setComments(prev => prev.map(comment => 
          comment.id === commentId 
            ? { 
                ...comment, 
                likes: result.isLiked ? comment.likes + 1 : comment.likes - 1 
              }
            : comment
        ));
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to like comment');
    }
  }

  async function handleReportComment(commentId) {
    Alert.alert(
      'Report Comment',
      'Why are you reporting this comment?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Spam', onPress: () => submitReport(commentId, 'spam') },
        { text: 'Harassment', onPress: () => submitReport(commentId, 'harassment') },
        { text: 'Inappropriate', onPress: () => submitReport(commentId, 'inappropriate') },
        { text: 'Other', onPress: () => submitReport(commentId, 'other') },
      ]
    );
  }

  async function submitReport(commentId, reason) {
    try {
      const result = await commentService.reportComment(commentId, reason);
      if (result.success) {
        Alert.alert('Report Submitted', 'Thank you for helping keep our community safe.');
      } else {
        Alert.alert('Error', result.error);
      }
    } catch (error) {
      Alert.alert('Error', 'Failed to submit report');
    }
  }

  async function loadReplies(commentId) {
    try {
      const result = await commentService.getComments(snappleId, commentId);
      if (result.success) {
        // Add replies to the comment
        setComments(prev => prev.map(comment => 
          comment.id === commentId 
            ? { ...comment, repliesData: result.comments }
            : comment
        ));
        
        setExpandedReplies(prev => new Set([...prev, commentId]));
        loadCommentLikes(result.comments);
      }
    } catch (error) {
      console.error('Error loading replies:', error);
    }
  }

  function formatTimeAgo(timestamp) {
    if (!timestamp) return 'now';
    
    const now = new Date();
    const commentTime = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
    const diffMs = now - commentTime;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'now';
    if (diffMins < 60) return `${diffMins}m`;
    if (diffHours < 24) return `${diffHours}h`;
    return `${diffDays}d`;
  }

  function renderComment({ item: comment, index }) {
    const isLiked = commentLikes[comment.id] || false;
    const canInteract = auth.currentUser && !comment.isDeleted;
    const isOwnComment = auth.currentUser && comment.userId === auth.currentUser.uid;

    return (
      <View style={styles.commentContainer}>
        <View style={styles.commentHeader}>
          <Text style={styles.username}>@{comment.username}</Text>
          <Text style={styles.timestamp}>{formatTimeAgo(comment.createdAt)}</Text>
          {comment.isEdited && <Text style={styles.editedLabel}>(edited)</Text>}
        </View>
        
        <Text style={styles.commentText}>{comment.text}</Text>
        
        <View style={styles.commentActions}>
          <TouchableOpacity 
            style={[styles.actionButton, isLiked && styles.likedButton]}
            onPress={() => handleLikeComment(comment.id)}
            disabled={!canInteract}
          >
            <Text style={[styles.actionIcon, isLiked && styles.likedIcon]}>
              {isLiked ? '❤️' : '🤍'}
            </Text>
            <Text style={[styles.actionText, isLiked && styles.likedText]}>
              {comment.likes}
            </Text>
          </TouchableOpacity>

          <TouchableOpacity 
            style={styles.actionButton}
            onPress={() => setReplyingTo(comment)}
            disabled={!canInteract}
          >
            <Text style={styles.actionIcon}>💬</Text>
            <Text style={styles.actionText}>Reply</Text>
          </TouchableOpacity>

          {comment.replies > 0 && (
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => {
                if (expandedReplies.has(comment.id)) {
                  setExpandedReplies(prev => {
                    const newSet = new Set(prev);
                    newSet.delete(comment.id);
                    return newSet;
                  });
                } else {
                  loadReplies(comment.id);
                }
              }}
            >
              <Text style={styles.actionIcon}>
                {expandedReplies.has(comment.id) ? '⬆️' : '⬇️'}
              </Text>
              <Text style={styles.actionText}>
                {comment.replies} {comment.replies === 1 ? 'reply' : 'replies'}
              </Text>
            </TouchableOpacity>
          )}

          {!isOwnComment && canInteract && (
            <TouchableOpacity 
              style={styles.actionButton}
              onPress={() => handleReportComment(comment.id)}
            >
              <Text style={styles.actionIcon}>⚠️</Text>
            </TouchableOpacity>
          )}
        </View>

        {/* Replies */}
        {expandedReplies.has(comment.id) && comment.repliesData && (
          <View style={styles.repliesContainer}>
            {comment.repliesData.map(reply => (
              <View key={reply.id} style={styles.replyContainer}>
                <View style={styles.commentHeader}>
                  <Text style={styles.username}>@{reply.username}</Text>
                  <Text style={styles.timestamp}>{formatTimeAgo(reply.createdAt)}</Text>
                </View>
                <Text style={styles.commentText}>{reply.text}</Text>
                <View style={styles.commentActions}>
                  <TouchableOpacity 
                    style={[styles.actionButton, commentLikes[reply.id] && styles.likedButton]}
                    onPress={() => handleLikeComment(reply.id)}
                    disabled={!canInteract}
                  >
                    <Text style={styles.actionIcon}>
                      {commentLikes[reply.id] ? '❤️' : '🤍'}
                    </Text>
                    <Text style={styles.actionText}>{reply.likes}</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    );
  }

  if (!visible) return null;

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <KeyboardAvoidingView 
        style={styles.container} 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <LinearGradient
          colors={theme.colors.backgroundGradient}
          style={styles.container}
        >
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Text style={styles.title}>Comments</Text>
              <Text style={styles.subtitle}>{snappleTitle}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeButton}>
              <Text style={styles.closeText}>✕</Text>
            </TouchableOpacity>
          </View>

          {/* Comments List */}
          <FlatList
            ref={flatListRef}
            data={comments}
            renderItem={renderComment}
            keyExtractor={(item) => item.id}
            style={styles.commentsList}
            contentContainerStyle={styles.commentsContent}
            showsVerticalScrollIndicator={false}
            ListEmptyComponent={() => (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateEmoji}>💬</Text>
                <Text style={styles.emptyStateText}>No comments yet</Text>
                <Text style={styles.emptyStateSubtext}>Be the first to comment!</Text>
              </View>
            )}
          />

          {/* Reply indicator */}
          {replyingTo && (
            <View style={styles.replyIndicator}>
              <Text style={styles.replyText}>
                Replying to @{replyingTo.username}
              </Text>
              <TouchableOpacity onPress={() => setReplyingTo(null)}>
                <Text style={styles.cancelReply}>✕</Text>
              </TouchableOpacity>
            </View>
          )}

          {/* Comment Input */}
          <View style={styles.inputContainer}>
            <TextInput
              style={styles.textInput}
              placeholder={replyingTo ? `Reply to @${replyingTo.username}...` : "Add a comment..."}
              placeholderTextColor={theme.colors.textSecondary}
              value={newComment}
              onChangeText={setNewComment}
              multiline
              maxLength={500}
            />
            <TouchableOpacity 
              style={[
                styles.sendButton,
                (!newComment.trim() || isLoading) && styles.sendButtonDisabled
              ]}
              onPress={handleAddComment}
              disabled={!newComment.trim() || isLoading}
            >
              <Text style={styles.sendButtonText}>
                {isLoading ? '⏳' : '🚀'}
              </Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: {
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
  headerLeft: {
    flex: 1,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    opacity: 0.8,
  },
  closeButton: {
    padding: 8,
  },
  closeText: {
    fontSize: 20,
    color: theme.colors.textSecondary,
  },
  commentsList: {
    flex: 1,
  },
  commentsContent: {
    padding: theme.sizes.spacing?.lg || 24,
  },
  commentContainer: {
    marginBottom: theme.sizes.spacing?.lg || 24,
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderRadius: theme.sizes.borderRadius || 12,
    padding: theme.sizes.spacing?.md || 16,
  },
  commentHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
    gap: 8,
  },
  username: {
    fontSize: 14,
    fontWeight: '600',
    color: theme.colors.primary,
  },
  timestamp: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    opacity: 0.7,
  },
  editedLabel: {
    fontSize: 10,
    color: theme.colors.textSecondary,
    opacity: 0.6,
    fontStyle: 'italic',
  },
  commentText: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    lineHeight: 22,
    marginBottom: 12,
  },
  commentActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  actionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  likedButton: {
    backgroundColor: 'rgba(255, 107, 107, 0.2)',
  },
  actionIcon: {
    fontSize: 14,
  },
  actionText: {
    fontSize: 12,
    color: theme.colors.textSecondary,
    fontWeight: '500',
  },
  likedText: {
    color: '#ff6b6b',
  },
  likedIcon: {
    // Already using ❤️ emoji
  },
  repliesContainer: {
    marginTop: 12,
    marginLeft: 16,
    borderLeftWidth: 2,
    borderLeftColor: 'rgba(255,255,255,0.1)',
    paddingLeft: 16,
  },
  replyContainer: {
    marginBottom: 12,
    padding: 12,
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderRadius: 8,
  },
  emptyState: {
    alignItems: 'center',
    paddingVertical: theme.sizes.spacing?.xl || 32,
  },
  emptyStateEmoji: {
    fontSize: 48,
    marginBottom: 16,
  },
  emptyStateText: {
    fontSize: 18,
    fontWeight: '600',
    color: theme.colors.textPrimary,
    marginBottom: 4,
  },
  emptyStateSubtext: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    opacity: 0.8,
  },
  replyIndicator: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.sizes.spacing?.lg || 24,
    paddingVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  replyText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
  },
  cancelReply: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    padding: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    padding: theme.sizes.spacing?.lg || 24,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.1)',
    gap: 12,
  },
  textInput: {
    flex: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
    color: theme.colors.textPrimary,
    padding: 16,
    borderRadius: 20,
    fontSize: 16,
    maxHeight: 100,
    textAlignVertical: 'top',
  },
  sendButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: theme.colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  sendButtonText: {
    fontSize: 18,
  },
});