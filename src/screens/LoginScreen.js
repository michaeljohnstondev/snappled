import {
  View,
  Text,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Pressable,
} from "react-native";
import { useState, useRef } from "react";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import VibeButton from "../components/ui/VibeButton";
import VibeInput from "../components/ui/VibeInput";
import theme from "../theme/themes";
import { signInWithEmailAndPassword, sendPasswordResetEmail } from "firebase/auth";
import { auth } from "../services/firebase";
import { signInWithGoogle, signInWithApple, ensureUserDocument } from "../services/googleAuthService";
import { useTheme, useThemedStyles } from '../theme/ThemeContext';

export default function LoginScreen({ navigation }) {
  const { theme: t } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [appleLoading, setAppleLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [emailError, setEmailError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const passwordInputRef = useRef(null);

  // Shared handler for Google / Apple. ensureUserDocument is idempotent
  // so re-signing-in a returning user is safe — only first-time users
  // get a fresh Snappled user doc with auto-generated username +
  // needsUsernameSetup flag.
  async function handleSocialSignIn(kind) {
    const setLoading = kind === "apple" ? setAppleLoading : setGoogleLoading;
    setLoading(true);
    let signedIn = false;
    try {
      const result =
        kind === "apple" ? await signInWithApple() : await signInWithGoogle();
      signedIn = true;
      const user = result.userCredential.user;
      await ensureUserDocument(user, {
        firstName: result.firstName || undefined,
        lastName: result.lastName || undefined,
        authProvider: kind,
      });
      navigation.navigate("Landing");
    } catch (err) {
      // Both libs throw cancellation codes we should swallow silently
      if (
        err.code === "SIGN_IN_CANCELLED" ||
        err.code === "12501" ||
        err.code === "ERR_REQUEST_CANCELED" ||
        err.code === "ERR_CANCELED"
      ) return;
      console.log(`[LoginScreen] ${kind} sign-in failed`, err?.code, err?.message);
      // If Firebase signed in but only the user-doc write failed, the
      // AuthContext listener will still route them — suppress the toast.
      if (signedIn) return;
      Alert.alert(`${kind === "apple" ? "Apple" : "Google"} Sign-In Failed`, err?.message || "Try again.");
    } finally {
      setLoading(false);
    }
  }

  function validateEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  function validateInputs() {
    let isValid = true;

    setEmailError("");
    setPasswordError("");

    if (!email.trim()) {
      setEmailError("Email is required");
      isValid = false;
    } else if (!validateEmail(email)) {
      setEmailError("Please enter a valid email address");
      isValid = false;
    }

    if (!password.trim()) {
      setPasswordError("Password is required");
      isValid = false;
    } else if (password.length < 6) {
      setPasswordError("Password must be at least 6 characters");
      isValid = false;
    }

    return isValid;
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      Alert.alert("Reset Password", "Enter your email address first, then tap Forgot Password.");
      return;
    }
    try {
      await sendPasswordResetEmail(auth, email.trim());
      Alert.alert("Email Sent", "Check your inbox for a password reset link.");
    } catch (error) {
      Alert.alert("Error", "Could not send reset email. Check your email address.");
    }
  }

  async function handleLogin() {
    if (!validateInputs()) {
      return;
    }

    setIsLoading(true);

    try {
      const userCredential = await signInWithEmailAndPassword(
        auth,
        email,
        password
      );
      
      Alert.alert("Login Successful! 🎉", "Welcome back to Snappled!", [
        { 
          text: "Continue", 
          onPress: () => {
            // Navigate to main app
            navigation.navigate("Landing");
          }
        },
      ]);
    } catch (error) {
      console.log("[Screen:Login] Login error:", error.code);
      
      let errorMessage = "Please check your credentials and try again.";
      
      // Handle specific Firebase auth errors
      if (error.code === 'auth/user-not-found') {
        errorMessage = "No account found with this email address.";
      } else if (error.code === 'auth/wrong-password') {
        errorMessage = "Incorrect password.";
      } else if (error.code === 'auth/invalid-email') {
        errorMessage = "Invalid email address.";
      } else if (error.code === 'auth/user-disabled') {
        errorMessage = "This account has been disabled.";
      } else if (error.code === 'auth/too-many-requests') {
        errorMessage = "Too many failed attempts. Please try again later.";
      }
      
      setPasswordError(errorMessage);
      Alert.alert("Login Failed", errorMessage);
    } finally {
      setIsLoading(false);
    }
  }

  function handleForgotPassword() {
    Alert.alert("Reset Password", "Password reset functionality coming soon!");
  }

  function handleGoToSignup() {
    navigation.navigate("Signup");
  }

  function handleGoBack() {
    navigation.goBack();
  }

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <LinearGradient
        colors={t.colors.backgroundGradient}
        style={styles.container}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          <Pressable onPress={handleGoBack} style={styles.backIcon}>
            <Ionicons
              name="chevron-back"
              size={28}
              color={t.colors.textPrimary}
            />
          </Pressable>

          <View style={styles.header}>
            <Text style={styles.title}>Welcome Back! 👋</Text>
            <Text style={styles.subtitle}>
              Sign in to continue your Snappled adventure
            </Text>
          </View>

          <View style={styles.formContainer}>
            <View style={styles.inputGroup}>
              <Text style={styles.label}>Email</Text>
              <VibeInput
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (emailError) setEmailError("");
                }}
                placeholder="Enter your email"
                keyboardType="email-address"
                autoCapitalize="none"
                autoCorrect={false}
                returnKeyType="next"
                onSubmitEditing={() => passwordInputRef.current?.focus()}
                style={emailError ? styles.errorInput : null}
              />
              {emailError ? (
                <Text style={styles.errorText}>{emailError}</Text>
              ) : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.label}>Password</Text>
              <View style={styles.passwordContainer}>
                <VibeInput
                  ref={passwordInputRef}
                  value={password}
                  onChangeText={(text) => {
                    setPassword(text);
                    if (passwordError) setPasswordError("");
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
                    name={showPassword ? "eye-off" : "eye"}
                    size={20}
                    color={t.colors.textSecondary}
                  />
                </Pressable>
              </View>
              {passwordError ? (
                <Text style={styles.errorText}>{passwordError}</Text>
              ) : null}
            </View>

            <Pressable
              onPress={handleForgotPassword}
              style={styles.forgotPasswordLink}
            >
              <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
            </Pressable>
          </View>

          <View style={styles.buttonGroup}>
            <VibeButton
              label={isLoading ? "Signing In..." : "Sign In"}
              onPress={handleLogin}
              style={[styles.button, isLoading && styles.disabledButton]}
              disabled={isLoading}
            />

            {/* Social sign-in. Apple iOS-only, sits above Google so the
                required option has equal/greater prominence per App
                Store guideline 4.8. */}
            {Platform.OS === "ios" && (
              <Pressable
                onPress={() => handleSocialSignIn("apple")}
                disabled={isLoading || googleLoading || appleLoading}
                style={({ pressed }) => [
                  styles.appleButton,
                  { opacity: pressed ? 0.85 : (isLoading || googleLoading || appleLoading) ? 0.5 : 1 },
                ]}
              >
                <Text style={styles.appleLogo}></Text>
                <Text style={styles.appleButtonText}>
                  {appleLoading ? "Signing in..." : "Sign in with Apple"}
                </Text>
              </Pressable>
            )}
            <Pressable
              onPress={() => handleSocialSignIn("google")}
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
                {googleLoading ? "Signing in..." : "Sign in with Google"}
              </Text>
            </Pressable>

            <Pressable onPress={handleForgotPassword}>
              <Text style={styles.forgotText}>Forgot Password?</Text>
            </Pressable>

            <View style={styles.signupPrompt}>
              <Text style={styles.signupText}>
                Don&apos;t have an account?{" "}
              </Text>
              <Pressable onPress={handleGoToSignup}>
                <Text style={styles.signupLink}>Sign Up</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </LinearGradient>
    </KeyboardAvoidingView>
  );
}

const makeStyles = (t) => ({
  container: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: theme.sizes.spacing?.lg || 24,
    paddingTop: 60,
  },
  backIcon: {
    alignSelf: "flex-start",
    marginBottom: 20,
    padding: 8,
    borderRadius: 20,
    backgroundColor: "rgba(255, 255, 255, 0.1)",
  },
  header: {
    alignItems: "center",
    marginBottom: 40,
  },
  title: {
    fontSize: 32,
    fontWeight: "bold",
    color: t.colors.textPrimary,
    marginBottom: theme.sizes.spacing?.md || 16,
    textAlign: "center",
  },
  subtitle: {
    fontSize: 16,
    color: t.colors.textSecondary,
    textAlign: "center",
    lineHeight: 22,
    paddingHorizontal: 20,
  },
  formContainer: {
    marginBottom: 40,
  },
  inputGroup: {
    marginBottom: theme.sizes.spacing?.lg || 24,
  },
  label: {
    fontSize: 16,
    color: t.colors.textPrimary,
    marginBottom: theme.sizes.spacing?.sm || 8,
    fontWeight: "600",
  },
  passwordContainer: {
    position: "relative",
  },
  passwordInput: {
    paddingRight: 50,
  },
  passwordToggle: {
    position: "absolute",
    right: 15,
    top: "50%",
    transform: [{ translateY: -10 }],
    padding: 5,
  },
  errorInput: {
    borderColor: theme.colors.error || "#FF4136",
    borderWidth: 1.5,
  },
  errorText: {
    color: theme.colors.error || "#FF4136",
    fontSize: 12,
    marginTop: 4,
    marginLeft: 4,
  },
  forgotPasswordLink: {
    alignSelf: "flex-end",
    marginTop: 8,
    padding: 8,
  },
  forgotPasswordText: {
    color: theme.colors.vibeBlue,
    fontSize: 14,
    fontWeight: "500",
  },
  buttonGroup: {
    gap: theme.sizes.spacing?.lg || 24,
    marginBottom: 40,
  },
  button: {
    width: "100%",
  },
  disabledButton: {
    opacity: 0.6,
  },
  signupPrompt: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  signupText: {
    color: t.colors.textSecondary,
    fontSize: 16,
  },
  signupLink: {
    color: theme.colors.vibeBlue,
    fontSize: 16,
    fontWeight: "600",
    textDecorationLine: "underline",
  },
  forgotText: {
    color: t.colors.textSecondary,
    fontSize: 14,
    textAlign: "center",
    marginTop: 12,
  },
  // Apple HIG: black background, white text, Apple logo on left.
  appleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: 48,
    backgroundColor: "#000000",
    borderRadius: 24,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    marginTop: 4,
  },
  appleLogo: {
    color: "#ffffff",
    fontSize: 20,
    marginRight: 10,
    marginTop: -2,
  },
  appleButtonText: {
    color: "#ffffff",
    fontSize: 15,
    fontWeight: "600",
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    width: "100%",
    height: 48,
    backgroundColor: "#ffffff",
    borderRadius: 24,
    borderWidth: 2,
    borderColor: theme.colors.vibeBlue,
    marginTop: 4,
  },
  googleIconContainer: {
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 10,
  },
  googleG: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#4285F4",
  },
  googleButtonText: {
    color: "#1f1f1f",
    fontSize: 15,
    fontWeight: "600",
  },
});