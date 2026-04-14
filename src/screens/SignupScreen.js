import { View, Text, StyleSheet, Alert, ScrollView } from 'react-native';
import { useState } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import VibeButton from '../components/ui/VibeButton';
import VibeInput from '../components/ui/VibeInput';
import theme from '../theme/themes';
import { userService } from '../services/userService';

export default function SignupScreen({ navigation }) {
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: ''
  });
  const [isLoading, setIsLoading] = useState(false);

  function updateFormData(field, value) {
    setFormData(prev => ({ ...prev, [field]: value }));
  }

  function validateForm() {
    const { username, email, password, confirmPassword } = formData;
    
    if (!username.trim()) {
      Alert.alert('Missing Username', 'Please enter a username.');
      return false;
    }
    
    if (username.length < 3) {
      Alert.alert('Username Too Short', 'Username must be at least 3 characters.');
      return false;
    }
    
    if (!email.trim() || !email.includes('@')) {
      Alert.alert('Invalid Email', 'Please enter a valid email address.');
      return false;
    }
    
    if (password.length < 6) {
      Alert.alert('Weak Password', 'Password must be at least 6 characters.');
      return false;
    }
    
    if (password !== confirmPassword) {
      Alert.alert('Password Mismatch', 'Passwords do not match.');
      return false;
    }
    
    return true;
  }

  async function handleSignup() {
    if (!validateForm()) return;

    setIsLoading(true);
    
    try {
      const result = await userService.createUser({
        email: formData.email,
        password: formData.password,
        username: formData.username
      });
      
      if (result.success) {
        Alert.alert(
          'Account Created! 🎉',
          `Welcome to Snappled, @${formData.username}!\n\nYou've been given:\n• 100 coins 🪙\n• 10 topic tickets 🎫\n\nTime to start creating!`,
          [{ 
            text: 'Continue', 
            onPress: () => {
              // Navigation will happen automatically via AuthContext after user creation
            }
          }]
        );
      } else {
        Alert.alert('Signup Failed', result.error || 'Something went wrong. Please try again.');
      }
    } catch (error) {
      console.log('[Screen:Signup] Signup error:', error);
      Alert.alert('Signup Failed', 'Something went wrong. Please try again.');
    } finally {
      setIsLoading(false);
    }
  }

  function handleGoToLogin() {
    navigation.navigate('Login');
  }

  function handleGoBack() {
    navigation.goBack();
  }

  return (
    <LinearGradient
      colors={theme.colors.backgroundGradient}
      style={styles.container}
    >
      <ScrollView showsVerticalScrollIndicator={false} style={styles.scrollView}>
        <View style={styles.header}>
          <Text style={styles.title}>Join Snappled! 🎬</Text>
          <Text style={styles.subtitle}>
            Create your account and start having fun with creative prompts!
          </Text>
        </View>

        <View style={styles.formContainer}>
          <View style={styles.inputGroup}>
            <Text style={styles.label}>Username</Text>
            <VibeInput
              value={formData.username}
              onChangeText={(value) => updateFormData('username', value)}
              placeholder="Choose a cool username"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={20}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Email</Text>
            <VibeInput
              value={formData.email}
              onChangeText={(value) => updateFormData('email', value)}
              placeholder="Enter your email"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Password</Text>
            <VibeInput
              value={formData.password}
              onChangeText={(value) => updateFormData('password', value)}
              placeholder="Create a secure password (6+ chars)"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.label}>Confirm Password</Text>
            <VibeInput
              value={formData.confirmPassword}
              onChangeText={(value) => updateFormData('confirmPassword', value)}
              placeholder="Confirm your password"
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <View style={styles.termsContainer}>
            <Text style={styles.termsText}>
              By signing up, you agree to our Terms of Service and Privacy Policy.
              Let's keep Snappled fun and safe for everyone! 🌟
            </Text>
          </View>
        </View>

        <View style={styles.buttonGroup}>
          <VibeButton
            label={isLoading ? "Creating Account..." : "Create Account"}
            onPress={handleSignup}
            style={[styles.button, isLoading && styles.disabledButton]}
            disabled={isLoading}
          />

          <View style={styles.loginPrompt}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <VibeButton
              label="Sign In"
              onPress={handleGoToLogin}
              style={styles.loginButton}
            />
          </View>

          <VibeButton
            label="← Back to Home"
            onPress={handleGoBack}
            style={styles.backButton}
          />
        </View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    padding: theme.sizes.spacing?.lg || 24,
  },
  header: {
    alignItems: 'center',
    marginTop: 60,
    marginBottom: theme.sizes.spacing?.xl || 32,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: theme.colors.textPrimary,
    marginBottom: theme.sizes.spacing?.md || 16,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: 16,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  formContainer: {
    marginBottom: theme.sizes.spacing?.xl || 32,
  },
  inputGroup: {
    marginBottom: theme.sizes.spacing?.lg || 24,
  },
  label: {
    fontSize: 16,
    color: theme.colors.textPrimary,
    marginBottom: theme.sizes.spacing?.sm || 8,
    fontWeight: '500',
  },
  termsContainer: {
    marginTop: theme.sizes.spacing?.lg || 24,
    padding: theme.sizes.spacing?.md || 16,
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: theme.sizes.borderRadius || 12,
  },
  termsText: {
    fontSize: 14,
    color: theme.colors.textSecondary,
    lineHeight: 20,
    textAlign: 'center',
  },
  buttonGroup: {
    gap: theme.sizes.spacing?.md || 16,
    paddingBottom: theme.sizes.spacing?.xl || 32,
  },
  button: {
    width: '100%',
  },
  disabledButton: {
    opacity: 0.6,
  },
  loginPrompt: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  loginText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
  },
  loginButton: {
    flex: 0,
    paddingHorizontal: 16,
  },
  backButton: {
    opacity: 0.7,
    marginTop: theme.sizes.spacing?.md || 16,
  },
});