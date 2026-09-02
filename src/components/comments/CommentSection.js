import React from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import { useComments } from '../../hooks/useComments';
import CommentList from './CommentList';
import AddCommentInput from './AddCommentInput';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

const CommentSection = ({ eventId }) => {
  const styles = useThemedStyles(makeStyles);
  const {
    comments,
    loading,
    error,
    submitting,
    addComment,
    deleteComment,
    clearError,
  } = useComments(eventId);

  // Handle adding a new comment
  const handleAddComment = async (content) => {
    const success = await addComment(content);
    return success;
  };

  // Handle deleting a comment
  const handleDeleteComment = async (commentId, commentUserId) => {
    const success = await deleteComment(commentId, commentUserId);
    if (!success && error) {
      Alert.alert('Error', error);
      clearError();
    }
  };

  // Show error alert if there's an error
  React.useEffect(() => {
    if (error) {
      Alert.alert('Error', error, [{ text: 'OK', onPress: clearError }]);
    }
  }, [error, clearError]);

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text style={styles.title}>Discussion</Text>
        {!loading && (
          <Text style={styles.commentCount}>
            {comments.length === 0
              ? 'No comments'
              : `${comments.length} comment${comments.length === 1 ? '' : 's'}`}
          </Text>
        )}
      </View>

      {/* Add Comment Input */}
      <AddCommentInput
        onAddComment={handleAddComment}
        submitting={submitting}
        disabled={loading}
      />

      {/* Comments List */}
      <CommentList
        comments={comments}
        loading={loading}
        onDeleteComment={handleDeleteComment}
      />
    </View>
  );
};

const makeStyles = (t) => ({
  container: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    paddingHorizontal: 4,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
    color: t.colors.textPrimary,
    fontFamily: theme.fonts.main,
  },
  commentCount: {
    fontSize: 14,
    color: t.colors.textSecondary,
    fontFamily: theme.fonts.main,
  },
});

export default CommentSection;
