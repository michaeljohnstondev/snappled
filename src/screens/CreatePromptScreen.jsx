import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  SafeAreaView,
  TextInput,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import VibeButton from '../components/ui/VibeButton';
import { useAuth } from '../store/AuthContext';
import { promptService } from '../services/promptService';
import theme from '../theme/themes';

export default function CreatePromptScreen({ navigation }) {
  const { user, userCurrency, updateUserCurrency } = useAuth();
  const [promptText, setPromptText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleCreatePrompt = async () => {
    if (!promptText.trim()) {
      Alert.alert('Error', 'Please enter a prompt');
      return;
    }


    if (userCurrency.tokens < 1) {
      Alert.alert('Insufficient Tokens', 'You need at least 1 token to create a prompt');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await promptService.createPrompt({
        text: promptText.trim(),
        createdBy: user.uid,
        creatorUsername: user.username || user.email?.split('@')[0] || 'Anonymous'
      });

      if (result.success) {
        // Deduct token from user currency
        const newTokenCount = userCurrency.tokens - 1;
        await updateUserCurrency({ tokens: newTokenCount });

        Alert.alert(
          'Success!', 
          'Your prompt has been created and is now live in the community!',
          [
            {
              text: 'OK',
              onPress: () => navigation.goBack()
            }
          ]
        );
      } else {
        Alert.alert('Error', result.error || 'Failed to create prompt');
      }
    } catch (error) {
      console.error('[CreatePromptScreen] Error creating prompt:', error);
      Alert.alert('Error', 'Something went wrong. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <LinearGradient
      colors={theme.colors.backgroundGradient}
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
                Share your creativity with the Snapple Park community
              </Text>
              <View style={styles.tokenInfo}>
                <Text style={styles.tokenText}>🎫 Cost: 1 Token</Text>
                <Text style={styles.balanceText}>
                  Your balance: {userCurrency.tokens || 0} tokens
                </Text>
              </View>
            </View>

            {/* Prompt Input */}
            <View style={styles.inputSection}>
              <Text style={styles.inputLabel}>Your Prompt</Text>
              <TextInput
                style={styles.textInput}
                value={promptText}
                onChangeText={setPromptText}
                placeholder="Write an engaging prompt that inspires creativity..."
                placeholderTextColor={theme.colors.textSecondary}
                multiline
                maxLength={200}
                textAlignVertical="top"
              />
              <Text style={styles.characterCount}>
                {promptText.length}/200 characters
              </Text>
            </View>

            {/* Guidelines */}
            <View style={styles.guidelines}>
              <Text style={styles.guidelinesTitle}>Guidelines</Text>
              <Text style={styles.guidelineItem}>• Keep it creative and engaging</Text>
              <Text style={styles.guidelineItem}>• Make it clear and easy to understand</Text>
              <Text style={styles.guidelineItem}>• Avoid inappropriate or offensive content</Text>
              <Text style={styles.guidelineItem}>• Reported prompts may be removed by moderation</Text>
            </View>

            {/* Buttons */}
            <View style={styles.buttonContainer}>
              <VibeButton
                label={isSubmitting ? "Creating..." : "Create Prompt (1 Token)"}
                onPress={handleCreatePrompt}
                style={[
                  styles.createButton,
                  { opacity: isSubmitting || userCurrency.tokens < 1 ? 0.5 : 1 }
                ]}
                disabled={isSubmitting || userCurrency.tokens < 1}
              />
              
              <VibeButton
                label="Cancel"
                onPress={() => navigation.goBack()}
                style={styles.cancelButton}
              />
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
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
    color: theme.colors.textPrimary,
    fontSize: 24,
    fontWeight: theme.fontWeights.bold,
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 20,
    lineHeight: 22,
  },
  tokenInfo: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  tokenText: {
    color: theme.colors.vibePink,
    fontSize: 16,
    fontWeight: theme.fontWeights.semiBold,
    textAlign: 'center',
    marginBottom: 4,
  },
  balanceText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
  },
  inputSection: {
    marginBottom: 30,
  },
  inputLabel: {
    color: theme.colors.textPrimary,
    fontSize: 18,
    fontWeight: theme.fontWeights.semiBold,
    marginBottom: 12,
  },
  textInput: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: 12,
    padding: 16,
    color: theme.colors.textPrimary,
    fontSize: 16,
    minHeight: 120,
    fontFamily: theme.fonts.main,
  },
  characterCount: {
    color: theme.colors.textSecondary,
    fontSize: 12,
    textAlign: 'right',
    marginTop: 8,
  },
  guidelines: {
    backgroundColor: 'rgba(255, 255, 255, 0.03)',
    padding: 20,
    borderRadius: 12,
    marginBottom: 30,
  },
  guidelinesTitle: {
    color: theme.colors.textPrimary,
    fontSize: 16,
    fontWeight: theme.fontWeights.semiBold,
    marginBottom: 12,
  },
  guidelineItem: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    marginBottom: 6,
    lineHeight: 20,
  },
  buttonContainer: {
    gap: 16,
    paddingBottom: 40,
  },
  createButton: {
    backgroundColor: 'rgba(255, 20, 147, 0.15)',
    borderColor: theme.colors.vibePink,
    borderWidth: 2,
  },
  cancelButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
});