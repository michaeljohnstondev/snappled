import React, { useState } from 'react';
import { View, StyleSheet, Alert, Pressable, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import VibeInput from '../ui/VibeInput';
import { validateComment } from '../../lib/commentUtils';
import theme from '../../theme/themes';
import { Keyboard } from 'react-native';
import { useTheme, useThemedStyles } from '../../theme/ThemeContext';

const AddCommentInput = ({ onAddComment, submitting, disabled }) => {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [comment, setComment] = useState('');

  const handleSubmit = async () => {
    // Validate comment before submitting
    const validation = validateComment(comment);

    if (!validation.isValid) {
      Alert.alert('Invalid Comment', validation.error);
      return;
    }

    // Call the parent's add comment function
    const success = await onAddComment(comment);

    // Clear input only if comment was successfully added
    if (success) {
      setComment('');
      Keyboard.dismiss();
    }
  };

  const canSubmit = comment.trim().length > 0 && !submitting && !disabled;

  return (
    <View style={styles.container}>
      <View style={styles.inputContainer}>
        <VibeInput
          value={comment}
          onChangeText={setComment}
          placeholder="Add a comment..."
          multiline
          style={styles.input}
          maxLength={500}
        />
      </View>

      <Pressable
        onPress={handleSubmit}
        disabled={!canSubmit}
        style={({ pressed }) => [
          { opacity: pressed && canSubmit ? 0.8 : 1 },
          styles.postButtonContainer,
          !canSubmit && styles.disabledContainer,
        ]}
      >
        <LinearGradient
          colors={
            canSubmit
              ? theme.colors.buttonGradient
              : [t.colors.inputBorder, t.colors.inputBorder]
          }
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.gradientBorder}
        >
          <View style={styles.buttonContent}>
            <Text
              style={[styles.postButtonText, !canSubmit && styles.disabledText]}
            >
              {submitting ? 'Posting...' : 'Post'}
            </Text>
          </View>
        </LinearGradient>
      </Pressable>
    </View>
  );
};

const makeStyles = (t) => ({
  container: {
    marginTop: 16,
    marginBottom: 8,
  },
  inputContainer: {
    marginBottom: 12,
  },
  input: {
    minHeight: 60,
    maxHeight: 120,
    textAlignVertical: 'top',
    paddingTop: 12,
  },
  postButtonContainer: {
    alignSelf: 'flex-end',
  },
  gradientBorder: {
    borderRadius: theme.sizes.buttonRadius,
    padding: 2,
    marginVertical: 0,
  },
  buttonContent: {
    backgroundColor: 'transparent',
    borderRadius: theme.sizes.buttonRadius,
    paddingVertical: 8,
    paddingHorizontal: 16,
    alignItems: 'center',
    minWidth: 70,
  },
  postButtonText: {
    color: t.colors.textPrimary,
    fontSize: 14,
    fontWeight: '600',
    fontFamily: theme.fonts.main,
  },
  disabledContainer: {
    opacity: 0.6,
  },
  disabledText: {
    color: t.colors.textSecondary,
  },
});

export default AddCommentInput;
