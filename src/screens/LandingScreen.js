import React, { useState, useRef } from 'react';
import { 
  View, 
  Text, 
  StyleSheet, 
  KeyboardAvoidingView, 
  Platform, 
  ScrollView, 
  Pressable, 
  Alert 
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import VibeButton from '../components/ui/VibeButton';
import VibeInput from '../components/ui/VibeInput';
import theme from '../theme/themes';
import { signInWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '../services/firebase';
import { signInWithGoogle, signInWithApple, ensureUserDocument } from '../services/googleAuthService';

export default function LandingScreen({ navigation }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  // Shared social sign-in handler. ensureUserDocument is idempotent
  // so returning social-login users don't get a second user doc.
  async function handleSocialSignIn(kind) {
    const setLoading = kind === 'apple' ? setAppleLoading : setGoogleLoading;
    setLoading(true);
    let signedIn = false;
    try {
      const result =
        kind === 'apple' ? await signInWithApple() : await signInWithGoogle();
      signedIn = true;
      const user = result.userCredential.user;
      await ensureUserDocument(user, {
        firstName: result.firstName || undefined,
        lastName: result.lastName || undefined,
        authProvider: kind,
      });
      // AuthContext will route the user to the main app on success.
    } catch (err) {
      // Swallow user-cancellation codes silently
      if (
        err.code === 'SIGN_IN_CANCELLED' ||
        err.code === '12501' ||
        err.code === 'ERR_REQUEST_CANCELED' ||
        err.code === 'ERR_CANCELED'
      ) return;
      console.log(`[Screen:Landing] ${kind} sign-in failed`, err?.code, err?.message);
      // If Firebase signed in but only the user-doc write failed,
      // AuthContext still routes — suppress the toast.
      if (signedIn) return;
      Alert.alert(
        `${kind === 'apple' ? 'Apple' : 'Google'} Sign-In Failed`,
        err?.message || 'Try again.',
      );
    } finally {
      setLoading(false);
    }
  }
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const passwordInputRef = useRef(null);

  function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  function validateInputs() {
    let isValid = true;
    setEmailError('');
    setPasswordError('');

    if (!email.trim()) {
      setEmailError('Email is required');
      isValid = false;
    } else if (!validateEmail(email)) {
      setEmailError('Please enter a valid email address');
      isValid = false;
    }

    if (!password.trim()) {
      setPasswordError('Password is required');
      isValid = false;
    } else if (password.length < 6) {
      setPasswordError('Password must be at least 6 characters');
      isValid = false;
    }

    return isValid;
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      Alert.alert('Reset Password', 'Enter your email first, then tap Forgot Password.');
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert('Email Sent', 'Check your inbox for a password reset link.');
    } catch (e) {
      Alert.alert('Error', 'Could not send reset email. Check your email address.');
    }
  }

  async function handleLogin() {
    if (!validateInputs()) return;
    
    setIsLoading(true);
    try {
      console.log('[Screen:Landing] Attempting login for:', email);
      await signInWithEmailAndPassword(auth, email, password);
      console.log('[Screen:Landing] Login successful');
      // Navigation will happen automatically via AuthContext
    } catch (error) {
      console.log('[Screen:Landing] Login error:', error.code);
      console.log('[Screen:Landing] Login error message:', error.message);
      
      let errorMessage = 'Please check your credentials and try again.';
      if (error.code === 'auth/user-not-found') {
        errorMessage = 'No account found with this email address.';
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = 'Incorrect password.';
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = 'Invalid email address.';
      }
      
      setPasswordError(errorMessage);
      Alert.alert('Login Failed', errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  const handleSignup = () => {
    navigation.navigate('Signup');
  };

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <LinearGradient
        colors={theme.colors.backgroundGradient}
        style={styles.container}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.header}>
            <Text style={styles.title}>Snappled</Text>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <VibeInput
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (emailError) setEmailError('');
                }}
                placeholder="Enter your email"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                style={emailError ? styles.errorInput : null}
              />
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordContainer}>
                <VibeInput
                  ref={passwordInputRef}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (passwordError) setPasswordError('');
                  }}
                  placeholder="Enter your password"
                  secureTextEntry={!showPassword}
                  autoCapitalize="none"
                  autoCorrect={false}
                  returnKeyType="done"
                  onSubmitEditing={handleLogin}
                  style={[
                    styles.passwordInput,
                    passwordError ? styles.errorInput : null,
                  ]}
                />
                <Pressable
                  onPress={() => setShowPassword(!showPassword)}
                  style={styles.passwordToggle}
                >
                  <Ionicons
                    name={showPassword ? 'eye-off' : 'eye'}
                    size={20}
                    color={theme.colors.textSecondary}
                  />
                </Pressable>
              </View>
              {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
            </View>
          </View>

          <View style={styles.buttonContainer}>
            <VibeButton
              label={isLoading ? 'Signing In...' : 'Login'}
              onPress={handleLogin}
              style={[styles.loginButton, isLoading && styles.disabledButton]}
              disabled={isLoading}
            />

            <Pressable onPress={handleForgotPassword}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </Pressable>

            <View style={styles.dividerRow}>
              <View style={styles.dividerLine} />
              <Text style={styles.dividerText}>or</Text>
              <View style={styles.dividerLine} />
            </View>

            {/* Apple Sign-In first on iOS per App Store guideline 4.8. */}
            {Platform.OS === 'ios' && (
              <Pressable
                onPress={() => handleSocialSignIn('apple')}
                disabled={isLoading || googleLoading || appleLoading}
                style={({ pressed }) => [
                  styles.appleButton,
                  { opacity: pressed ? 0.85 : (isLoading || googleLoading || appleLoading) ? 0.5 : 1 },
                ]}
              >
                <Text style={styles.appleLogo}></Text>
                <Text style={styles.appleButtonText}>
                  {appleLoading ? 'Signing in...' : 'Sign in with Apple'}
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => handleSocialSignIn('google')}
              disabled={isLoading || googleLoading || appleLoading}
              style={({ pressed }) => [
                styles.googleButton,
                { opacity: pressed ? 0.85 : (isLoading || googleLoading || appleLoading) ? 0.5 : 1 },
              ]}
            >
              <View style={styles.googleIconContainer}>
                <Text style={styles.googleG}>G</Text>
              </View>
              <Text style={styles.googleButtonText}>
                {googleLoading ? 'Signing in...' : 'Sign in with Google'}
              </Text>
            </Pressable>

            <View style={styles.signupContainer}>
              <Text style={styles.signupText}>Don't have an account? </Text>
              <Pressable onPress={handleSignup}>
                <Text style={styles.signupLink}>Sign Up</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: theme.sizes.spacing?.lg || 24,
    paddingTop: 80,
    justifyContent: 'center',
  },
  header: {
    alignItems: 'center',
    marginBottom: 60,
  },
  title: {
    fontSize: 48,
    fontFamily: theme.fonts.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  formContainer: {
    marginBottom: 40,
  },
  inputGroup: {
    marginBottom: theme.sizes.spacing?.lg || 24,
  },
  label: {
    fontSize: 16,
    fontFamily: theme.fonts.main,
    color: theme.colors.textPrimary,
    marginBottom: theme.sizes.spacing?.sm || 8,
    fontWeight: '600',
  },
  passwordContainer: {
    position: 'relative',
  },
  passwordInput: {
    paddingRight: 50,
  },
  passwordToggle: {
    position: 'absolute',
    right: 15,
    top: '50%',
    transform: [{ translateY: -10 }],
    padding: 5,
  },
  errorInput: {
    borderColor: theme.colors.error || '#FF4136',
    borderWidth: 1.5,
  },
  errorText: {
    color: theme.colors.error || '#FF4136',
    fontSize: 12,
    fontFamily: theme.fonts.main,
    marginTop: 4,
    marginLeft: 4,
  },
  loginButton: {
    width: '100%',
  },
  disabledButton: {
    opacity: 0.6,
  },
  buttonContainer: {
    gap: 20,
    alignItems: 'center',
  },
  signupContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  signupText: {
    color: theme.colors.textSecondary,
    fontSize: 16,
    fontFamily: theme.fonts.main,
  },
  forgotText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    textAlign: 'center',
    marginTop: 12,
  },
  dividerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 16,
  },
  dividerLine: {
    flex: 1,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.1)',
  },
  dividerText: {
    color: theme.colors.textSecondary,
    fontSize: 14,
    marginHorizontal: 16,
  },
  signupLink: {
    color: theme.colors.vibeBlue,
    fontSize: 16,
    fontFamily: theme.fonts.main,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
  appleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 48,
    backgroundColor: '#000000',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
  },
  appleLogo: {
    color: '#ffffff',
    fontSize: 20,
    marginRight: 10,
    marginTop: -2,
  },
  appleButtonText: {
    color: '#ffffff',
    fontSize: 15,
    fontWeight: '600',
  },
  googleButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '100%',
    height: 48,
    backgroundColor: '#ffffff',
    borderRadius: 24,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
  },
  googleIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  googleG: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4285F4',
  },
  googleButtonText: {
    color: '#1f1f1f',
    fontSize: 15,
    fontWeight: '600',
  },
});