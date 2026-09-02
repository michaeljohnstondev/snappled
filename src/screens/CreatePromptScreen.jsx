import React, { useState } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import VibeButton from '../components/ui/VibeButton';
import VibeInput from '../components/ui/VibeInput';
import { useAuth } from '../store/AuthContext';
import { useModal } from '../store/ModalContext';
import { promptService } from '../services/promptService';
import { validatePrompt, PROMPT_MAX_LENGTH } from '../utils/promptFilter';
import theme from '../theme/themes';
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

export default function CreatePromptScreen({ navigation }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { user, userCurrency, updateUserCurrency } = useAuth();
  const { showAlert, showSuccess, showError } = useModal();
  const [promptText, setPromptText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const showGuidelines = () => {
    showAlert(
      'Prompt Guidelines',
      '• Keep it creative and engaging\n• Make it clear and easy to understand\n• Avoid inappropriate or offensive content\n• Reported prompts may be removed by moderation'
    );
  };

  const handleCreatePrompt = async () => {
    const validation = validatePrompt(promptText);
    if (!validation.valid) {
      showError('Invalid Prompt', validation.error);
      return;
    }

    if (userCurrency.tokens < 1) {
      showError('Insufficient Tickets', 'You need at least 1 topic ticket to create a prompt');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await promptService.summonPrompt({
        text: validation.cleaned,
        userId: user.uid,
        username: user.username || user.email?.split('@')[0] || 'Anonymous',
      });

      if (!result.success) {
        showError('Error', result.error || 'Failed to create prompt');
        return;
      }

      // Banned text — refuse, no charge.
      if (result.status === 'banned') {
        showError('Not Allowed', 'This prompt isn\'t allowed.');
        return;
      }

      // Already live — no charge, just point them to it.
      if (result.status === 'already_active') {
        showSuccess('Already Live', 'This prompt is already in the feed — go find it!');
        setTimeout(() => navigation.goBack(), 1200);
        return;
      }

      // Charge ticket on every successful create — internal status (created /
      // revived / promoted) is invisible to the user; from their POV they just
      // made a prompt.
      await updateUserCurrency({ tokens: userCurrency.tokens - 1 });
      showSuccess('Prompt Created!', 'Your prompt is now live in the community.');
      setTimeout(() => navigation.goBack(), 1500);
    } catch (error) {
      console.error('[CreatePromptScreen] Error creating prompt:', error);
      showError('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <LinearGradient
      colors={t.colors.backgroundGradient}
      style={styles.container}
    >
      <SafeAreaView style={styles.safeArea}>
        <KeyboardAvoidingView 
          style={styles.keyboardView}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>Create Custom Prompt</Text>
              <Text style={styles.subtitle}>
                Share your creativity with the Snappled community
              </Text>
              <Pressable onPress={showGuidelines}>
                <Text style={styles.guidelinesLink}>View Guidelines</Text>
              </Pressable>
              <View style={styles.tokenInfo}>
                <Text style={styles.tokenText}>🎫 Cost: 1 Topic Ticket</Text>
                <Text style={styles.balanceText}>
                  Your balance: {userCurrency.tokens || 0} tickets
                </Text>
              </View>
            </View>

            {/* Prompt Input */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>Your Prompt</Text>
              <VibeInput
                value={promptText}
                onChangeText={setPromptText}
                placeholder="Write an engaging prompt that inspires creativity..."
                multiline
                maxLength={PROMPT_MAX_LENGTH}
                style={styles.textInput}
                textAlignVertical="top"
              />
              <Text style={styles.characterCount}>
                {promptText.length}/{PROMPT_MAX_LENGTH} characters
              </Text>
            </View>

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              <VibeButton
                label={isSubmitting ? "Creating..." : "Create Prompt (1 Ticket)"}
                onPress={handleCreatePrompt}
                variant="green"
                disabled={isSubmitting || userCurrency.tokens < 1}
              />

              <VibeButton
                label="Cancel"
                onPress={() => navigation.goBack()}
                variant="red"
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const makeStyles = (t) => ({
  container: {
    flex: 1,
  },
  safeArea: {
    flex: 1,
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 30,
  },
  title: {
    color: t.colors.textPrimary,
    fontSize: 24,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: t.colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 22,
  },
  guidelinesLink: {
    color: theme.colors.vibeBlue,
    fontSize: 14,
    fontWeight: theme.fontWeights.semiBold,
    marginBottom: 20,
  },
  tokenInfo: {
    backgroundColor: theme.colors.vibeBackgroundBlue,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 3,
    borderColor: theme.colors.vibeBlue,
  },
  tokenText: {
    color: theme.colors.vibeBlue,
    fontSize: 16,
    fontWeight: theme.fontWeights.semiBold,
    textAlign: 'center',
    marginBottom: 4,
  },
  balanceText: {
    color: t.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  inputSection: {
    marginBottom: 30,
  },
  inputLabel: {
    color: t.colors.textPrimary,
    fontSize: 18,
    fontWeight: theme.fontWeights.semiBold,
    marginBottom: 12,
  },
  textInput: {
    minHeight: 120,
  },
  characterCount: {
    color: t.colors.textSecondary,
    fontSize: 12,
    textAlign: 'right',
    marginTop: 8,
  },
  buttonContainer: {
    gap: 16,
    paddingBottom: 40,
  },
});