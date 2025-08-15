/**
 * Format timestamp to relative time (e.g., "2 hours ago")
 */
export const formatTimestamp = (timestamp) => {
  if (!timestamp) return '';

  const now = new Date();
  const commentTime = timestamp.toDate
    ? timestamp.toDate()
    : new Date(timestamp);
  const diffInMs = now - commentTime;
  const diffInMinutes = Math.floor(diffInMs / (1000 * 60));
  const diffInHours = Math.floor(diffInMs / (1000 * 60 * 60));
  const diffInDays = Math.floor(diffInMs / (1000 * 60 * 60 * 24));

  if (diffInMinutes < 1) {
    return 'just now';
  } else if (diffInMinutes < 60) {
    return `${diffInMinutes}m ago`;
  } else if (diffInHours < 24) {
    return `${diffInHours}h ago`;
  } else if (diffInDays < 7) {
    return `${diffInDays}d ago`;
  } else {
    return commentTime.toLocaleDateString();
  }
};

/**
 * Validate comment content
 */
export const validateComment = (content) => {
  if (!content || typeof content !== 'string') {
    return { isValid: false, error: 'Comment cannot be empty' };
  }

  const trimmed = content.trim();

  if (trimmed.length === 0) {
    return { isValid: false, error: 'Comment cannot be empty' };
  }

  if (trimmed.length > 500) {
    return {
      isValid: false,
      error: 'Comment is too long (max 500 characters)',
    };
  }

  return { isValid: true, error: null };
};

/**
 * Sort comments by timestamp (newest first)
 */
export const sortComments = (comments) => {
  return [...comments].sort((a, b) => {
    const timeA = a.timestamp?.toDate
      ? a.timestamp.toDate()
      : new Date(a.timestamp);
    const timeB = b.timestamp?.toDate
      ? b.timestamp.toDate()
      : new Date(b.timestamp);
    return timeB - timeA; // newest first
  });
};

/**
 * Filter comments based on criteria (for future threading support)
 */
export const filterTopLevelComments = (comments) => {
  return comments.filter((comment) => !comment.parentCommentId);
};

/**
 * Get replies for a specific comment (for future threading support)
 */
export const getRepliesForComment = (comments, parentCommentId) => {
  return comments.filter(
    (comment) => comment.parentCommentId === parentCommentId
  );
};

/**
 * Sanitize comment content (basic cleanup)
 */
export const sanitizeComment = (content) => {
  if (!content) return '';

  return content
    .trim()
    .replace(/\s+/g, ' ') // replace multiple spaces with single space
    .substring(0, 500); // enforce max length
};
