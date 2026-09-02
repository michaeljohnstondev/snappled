import React from 'react';
import { FlatList, View, Text, StyleSheet } from 'react-native';
import CommentItem from './CommentItem';
import theme from '../../theme/themes';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

const CommentList = ({ comments, loading, onDeleteComment }) => {
  const styles = useThemedStyles(makeStyles);
  const renderComment = ({ item }) => (
    <CommentItem comment={item} onDelete={onDeleteComment} />
  );

  const renderEmpty = () => (
    <View style={styles.emptyContainer}>
      <Text style={styles.emptyText}>
        {loading
          ? 'Loading comments...'
          : 'No comments yet. Be the first to comment!'}
      </Text>
    </View>
  );

  const keyExtractor = (item) => item.id;

  return (
    <FlatList
      data={comments}
      renderItem={renderComment}
      keyExtractor={keyExtractor}
      ListEmptyComponent={renderEmpty}
      showsVerticalScrollIndicator={false}
      scrollEnabled={false}
      style={styles.list}
      contentContainerStyle={[
        styles.contentContainer,
        comments.length === 0 && styles.emptyContentContainer,
      ]}
      // Performance optimizations
      removeClippedSubviews={true}
      maxToRenderPerBatch={10}
      windowSize={10}
      initialNumToRender={5}
    />
  );
};

const makeStyles = (t) => ({
  list: {},
  contentContainer: {
    paddingVertical: 8,
  },
  emptyContentContainer: {
    flex: 1,
    justifyContent: 'center',
  },
  emptyContainer: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    color: t.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    fontFamily: theme.fonts.main,
    fontStyle: 'italic',
  },
});

export default CommentList;
