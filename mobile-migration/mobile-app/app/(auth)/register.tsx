/**
 * Register Screen — create a new user account.
 *
 * Fields: username (min 3), password (min 6), optional display name.
 * Maps to POST /api/v1/auth/register → { username, password, name }.
 * On success the backend returns a TokenResponse and the user is
 * auto-logged-in (same shape as login).
 */

import React, { useState, useEffect, useRef } from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  Animated,
} from "react-native";
import {
  TextInput,
  Button,
  Card,
  HelperText,
  IconButton,
} from "react-native-paper";
import { useRouter } from "expo-router";
import { useAuthStore } from "@/services/authStore";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";

export default function RegisterScreen() {
  const router = useRouter();
  const { register, loading, error, clearError } = useAuthStore();
  const { colors, toggle, mode } = useThemeStore();
  const { isDesktop } = useResponsive();

  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [name, setName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [localError, setLocalError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [submitting, setSubmitting] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  const usernameValid = username.trim().length >= 3;
  const passwordValid = password.length >= 6;
  const passwordsMatch = password === confirmPassword;
  const canSubmit =
    usernameValid && passwordValid && passwordsMatch && !loading && !submitting;

  // Clear store error when component unmounts
  useEffect(() => {
    return () => clearError();
  }, []);

  // Countdown after successful registration → redirect to login
  useEffect(() => {
    if (!success) return;
    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 400,
      useNativeDriver: true,
    }).start();
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          router.replace("/(auth)/login");
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [success]);

  const handleRegister = async () => {
    if (submitting) return; // prevent double-submit
    setLocalError(null);

    if (!usernameValid) {
      setLocalError("Username must be at least 3 characters");
      return;
    }
    if (!passwordValid) {
      setLocalError("Password must be at least 6 characters");
      return;
    }
    if (!passwordsMatch) {
      setLocalError("Passwords do not match");
      return;
    }

    setSubmitting(true);
    try {
      const ok = await register(
        username.trim(),
        password,
        name.trim() || undefined
      );
      if (ok) {
        setSuccess(true);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const displayError = localError || error;

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bgPrimary }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          isDesktop && styles.scrollDesktop,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Theme toggle */}
        <View style={styles.themeToggleRow}>
          <IconButton
            icon={mode === "dark" ? "weather-sunny" : "weather-night"}
            iconColor={colors.textSecondary}
            size={24}
            onPress={toggle}
            accessibilityLabel="Toggle theme"
          />
        </View>

        {/* Logo / Title */}
        <View style={styles.header}>
          <Text style={[styles.icon]}>{success ? "" : "\uD83D\uDCCA"}</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {success ? "" : "Create Account"}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {success ? "" : "Register a new portfolio account"}
          </Text>
        </View>

        {/* Success State */}
        {success ? (
          <Animated.View style={{ opacity: fadeAnim, width: "100%", maxWidth: 440, alignItems: "center" }}>
            <Card
              style={[
                styles.card,
                {
                  backgroundColor: colors.bgCard,
                  borderColor: colors.success || "#22c55e",
                  borderWidth: 2,
                },
                isDesktop && styles.cardDesktop,
              ]}
              mode="outlined"
            >
              <Card.Content style={{ alignItems: "center", paddingVertical: 32 }}>
                <View style={{
                  width: 72,
                  height: 72,
                  borderRadius: 36,
                  backgroundColor: (colors.success || "#22c55e") + "20",
                  justifyContent: "center",
                  alignItems: "center",
                  marginBottom: 20,
                }}>
                  <Text style={{ fontSize: 36 }}>\u2713</Text>
                </View>
                <Text style={{
                  fontSize: 22,
                  fontWeight: "700",
                  color: colors.textPrimary,
                  marginBottom: 8,
                }}>
                  Account Created!
                </Text>
                <Text style={{
                  fontSize: 15,
                  color: colors.textSecondary,
                  textAlign: "center",
                  marginBottom: 4,
                }}>
                  Your account has been successfully created.
                </Text>
                <Text style={{
                  fontSize: 14,
                  color: colors.textMuted,
                  textAlign: "center",
                  marginBottom: 20,
                }}>
                  Redirecting to login in {countdown}s...
                </Text>
                <Button
                  mode="contained"
                  onPress={() => router.replace("/(auth)/login")}
                  style={styles.button}
                  contentStyle={styles.buttonContent}
                  labelStyle={styles.buttonLabel}
                  buttonColor={colors.accentPrimary}
                  textColor="#ffffff"
                >
                  Go to Login Now
                </Button>
              </Card.Content>
            </Card>
          </Animated.View>
        ) : (
        /* Card — Registration Form */
        <Card
          style={[
            styles.card,
            {
              backgroundColor: colors.bgCard,
              borderColor: colors.borderColor,
            },
            isDesktop && styles.cardDesktop,
          ]}
          mode="outlined"
        >
          <Card.Content>
            {displayError ? (
              <View
                style={[
                  styles.errorBox,
                  { backgroundColor: colors.danger + "20" },
                ]}
              >
                <Text style={{ color: colors.danger, textAlign: "center" }}>
                  {displayError}
                </Text>
              </View>
            ) : null}

            <TextInput
              label="Username"
              value={username}
              onChangeText={(t) => {
                setUsername(t);
                setLocalError(null);
              }}
              autoCapitalize="none"
              autoCorrect={false}
              disabled={loading}
              left={<TextInput.Icon icon="account" />}
              mode="outlined"
              style={styles.input}
              contentStyle={styles.inputContent}
              outlineColor={colors.borderColor}
              activeOutlineColor={colors.accentPrimary}
              textColor={colors.textPrimary}
              theme={{
                colors: {
                  surfaceVariant: colors.bgInput,
                  onSurfaceVariant: colors.textSecondary,
                  placeholder: colors.textMuted,
                },
              }}
            />
            <HelperText
              type={username.length > 0 && !usernameValid ? "error" : "info"}
              visible={username.length > 0}
              style={{
                color:
                  username.length > 0 && !usernameValid
                    ? colors.danger
                    : colors.textMuted,
              }}
            >
              {username.length > 0 && !usernameValid
                ? "Minimum 3 characters"
                : ""}
            </HelperText>

            <TextInput
              label="Display Name (optional)"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              disabled={loading}
              left={<TextInput.Icon icon="badge-account" />}
              mode="outlined"
              style={styles.input}
              contentStyle={styles.inputContent}
              outlineColor={colors.borderColor}
              activeOutlineColor={colors.accentPrimary}
              textColor={colors.textPrimary}
              theme={{
                colors: {
                  surfaceVariant: colors.bgInput,
                  onSurfaceVariant: colors.textSecondary,
                  placeholder: colors.textMuted,
                },
              }}
            />

            <TextInput
              label="Password"
              value={password}
              onChangeText={(t) => {
                setPassword(t);
                setLocalError(null);
              }}
              secureTextEntry={!showPassword}
              disabled={loading}
              left={<TextInput.Icon icon="lock" />}
              right={
                <TextInput.Icon
                  icon={showPassword ? "eye-off" : "eye"}
                  onPress={() => setShowPassword(!showPassword)}
                />
              }
              mode="outlined"
              style={styles.input}
              contentStyle={styles.inputContent}
              outlineColor={colors.borderColor}
              activeOutlineColor={colors.accentPrimary}
              textColor={colors.textPrimary}
              theme={{
                colors: {
                  surfaceVariant: colors.bgInput,
                  onSurfaceVariant: colors.textSecondary,
                  placeholder: colors.textMuted,
                },
              }}
            />
            <HelperText
              type={password.length > 0 && !passwordValid ? "error" : "info"}
              visible={password.length > 0}
              style={{
                color:
                  password.length > 0 && !passwordValid
                    ? colors.danger
                    : colors.textMuted,
              }}
            >
              {password.length > 0 && !passwordValid
                ? "Minimum 6 characters"
                : ""}
            </HelperText>

            <TextInput
              label="Confirm Password"
              value={confirmPassword}
              onChangeText={(t) => {
                setConfirmPassword(t);
                setLocalError(null);
              }}
              secureTextEntry={!showPassword}
              disabled={loading}
              left={<TextInput.Icon icon="lock-check" />}
              mode="outlined"
              style={styles.input}
              contentStyle={styles.inputContent}
              outlineColor={colors.borderColor}
              activeOutlineColor={colors.accentPrimary}
              textColor={colors.textPrimary}
              onSubmitEditing={handleRegister}
              theme={{
                colors: {
                  surfaceVariant: colors.bgInput,
                  onSurfaceVariant: colors.textSecondary,
                  placeholder: colors.textMuted,
                },
              }}
            />
            <HelperText
              type={
                confirmPassword.length > 0 && !passwordsMatch
                  ? "error"
                  : "info"
              }
              visible={confirmPassword.length > 0}
              style={{
                color:
                  confirmPassword.length > 0 && !passwordsMatch
                    ? colors.danger
                    : colors.textMuted,
              }}
            >
              {confirmPassword.length > 0 && !passwordsMatch
                ? "Passwords do not match"
                : ""}
            </HelperText>

            <Button
              mode="contained"
              onPress={handleRegister}
              loading={loading}
              disabled={!canSubmit}
              style={styles.button}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
              buttonColor={colors.accentPrimary}
              textColor="#ffffff"
            >
              Create Account
            </Button>

            <Button
              mode="text"
              onPress={() => router.back()}
              disabled={loading}
              style={styles.backButton}
              labelStyle={[styles.backLabel, { color: colors.accentPrimary }]}
            >
              Already have an account? Sign In
            </Button>
          </Card.Content>
        </Card>
        )}

        <Text style={[styles.footer, { color: colors.textMuted }]}>
          Portfolio Mobile — Phase 3
        </Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  scrollDesktop: { paddingHorizontal: 48 },
  themeToggleRow: {
    position: "absolute",
    top: Platform.OS === "web" ? 16 : 48,
    right: 16,
    zIndex: 10,
  },
  header: { alignItems: "center", marginBottom: 28 },
  icon: { fontSize: 56, marginBottom: 12 },
  title: { fontSize: 28, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 15 },
  card: {
    width: "100%",
    maxWidth: 440,
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardDesktop: { maxWidth: 480 },
  errorBox: { borderRadius: 8, padding: 12, marginBottom: 12 },
  input: {
    marginBottom: 4,
    fontSize: 16,
    backgroundColor: "transparent",
  },
  inputContent: {
    paddingVertical: Platform.OS === "web" ? 10 : 6,
    minHeight: 52,
  },
  button: { marginTop: 12, borderRadius: 10 },
  buttonContent: { paddingVertical: 8 },
  buttonLabel: { fontSize: 16, fontWeight: "700", letterSpacing: 0.5 },
  backButton: { marginTop: 8 },
  backLabel: { fontSize: 14, fontWeight: "600" },
  footer: { marginTop: 32, fontSize: 13 },
});
