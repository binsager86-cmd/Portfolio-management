/**
 * Login Screen — react-hook-form + Zod, Google Sign-In, themed Paper UI.
 *
 * Form validation is handled by Zod schemas (lib/validationSchemas.ts).
 * Error messages are structured via authErrors.ts for Sentry/Flipper.
 */

import React, { useEffect, useState, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
  Animated,
  Pressable,
} from "react-native";
import {
  TextInput,
  Button,
  Card,
  HelperText,
  IconButton,
  Divider,
} from "react-native-paper";
import { useRouter } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";

import { useAuthStore } from "@/services/authStore";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import { loginSchema, type LoginFormData } from "@/lib/validationSchemas";
import { useGoogleSignIn } from "@/hooks/useGoogleSignIn";

export default function LoginScreen() {
  const router = useRouter();
  const { login, googleSignIn, isLoading, error, clearError } = useAuthStore();
  const { colors, toggle, mode } = useThemeStore();
  const { isDesktop } = useResponsive();

  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  // Animated shake + fade for error banner
  const errorOpacity = useRef(new Animated.Value(0)).current;
  const errorShake = useRef(new Animated.Value(0)).current;

  // Google Sign-In hook (handles popup + redirect flows on web, native on mobile)
  const { signIn: googlePrompt, isLoading: googleLoading } = useGoogleSignIn();

  // react-hook-form + Zod
  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      email: __DEV__ ? "sager alsager" : "",
      password: __DEV__ ? "Admin123!" : "",
    },
    mode: "onBlur",
  });

  // Clear store error on unmount
  useEffect(() => {
    return () => clearError();
  }, []);

  // Animate error banner in when error changes
  useEffect(() => {
    if (error) {
      errorOpacity.setValue(0);
      errorShake.setValue(0);
      Animated.parallel([
        Animated.timing(errorOpacity, {
          toValue: 1,
          duration: 300,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(errorShake, { toValue: 10, duration: 60, useNativeDriver: true }),
          Animated.timing(errorShake, { toValue: -10, duration: 60, useNativeDriver: true }),
          Animated.timing(errorShake, { toValue: 8, duration: 60, useNativeDriver: true }),
          Animated.timing(errorShake, { toValue: -8, duration: 60, useNativeDriver: true }),
          Animated.timing(errorShake, { toValue: 0, duration: 60, useNativeDriver: true }),
        ]),
      ]).start();
    } else {
      errorOpacity.setValue(0);
    }
  }, [error]);

  // ── Handlers ──────────────────────────────────────────────────────

  const onSubmit = useCallback(async (data: LoginFormData) => {
    if (submitting) return;           // prevent double-tap
    setSubmitting(true);
    try {
      const ok = await login(data.email.trim(), data.password);
      if (ok) {
        router.replace("/(tabs)");
      }
    } finally {
      setSubmitting(false);
    }
  }, [submitting, login, router]);

  // Wrap react-hook-form submit to prevent native <form> reload on web
  const safeSubmit = useCallback(
    (e?: any) => {
      if (e?.preventDefault) e.preventDefault();
      handleSubmit(onSubmit)(e);
    },
    [handleSubmit, onSubmit],
  );

  const handleGoogleSignIn = async () => {
    try {
      console.log("[Login] Starting Google Sign-In…");
      // On web this redirects the page to Google (never returns).
      // On native this returns a result with the token.
      const result = await googlePrompt();

      // ─ Native path (web never reaches here — page navigates away) ─
      if (result.success) {
        if (__DEV__) console.log("[Login] Got token, sending to backend…");
        const ok = await googleSignIn(result.token);
        if (ok) {
          router.replace("/(tabs)");
        }
      } else if (!result.cancelled) {
        useAuthStore.setState({
          error: result.error || "Google Sign-In failed. Please try again.",
        });
      }
    } catch (err: any) {
      console.error("[Login] Google Sign-In error:", err);
      useAuthStore.setState({
        error: err?.message || "Google Sign-In failed unexpectedly.",
      });
    }
  };

  // ── Shared input theme ────────────────────────────────────────────

  const inputTheme = {
    colors: {
      surfaceVariant: colors.bgInput,
      onSurfaceVariant: colors.textSecondary,
      placeholder: colors.textMuted,
      error: colors.danger,
    },
  };

  // ── Render ────────────────────────────────────────────────────────

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
            icon={mode === "dark" ? "lightbulb-on-outline" : "weather-night"}
            iconColor={colors.textSecondary}
            size={24}
            onPress={toggle}
            accessibilityLabel="Toggle theme"
          />
        </View>

        {/* Logo / Title */}
        <View style={styles.header}>
          <Text style={styles.icon}>📊</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            Portfolio Tracker
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            Sign in to your account
          </Text>
        </View>

        {/* Card */}
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
            {/* Server / store error banner */}
            {error ? (
              <Animated.View
                style={[
                  styles.errorBanner,
                  {
                    backgroundColor: colors.danger + "12",
                    borderColor: colors.danger + "40",
                    opacity: errorOpacity,
                    transform: [{ translateX: errorShake }],
                  },
                ]}
              >
                <View style={styles.errorIconRow}>
                  <Text style={styles.errorIcon}>⚠</Text>
                  <View style={styles.errorTextCol}>
                    <Text
                      style={[
                        styles.errorTitle,
                        { color: colors.danger },
                      ]}
                    >
                      {error}
                    </Text>
                    {error.toLowerCase().includes("invalid") ||
                    error.toLowerCase().includes("incorrect") ? (
                      <Text
                        style={[
                          styles.errorHint,
                          { color: colors.danger },
                        ]}
                      >
                        Double-check your email and password, then try again.
                      </Text>
                    ) : null}
                  </View>
                  <Pressable
                    onPress={clearError}
                    hitSlop={12}
                    style={styles.errorDismiss}
                    accessibilityLabel="Dismiss error"
                  >
                    <Text style={{ color: colors.danger, fontSize: 18 }}>✕</Text>
                  </Pressable>
                </View>
              </Animated.View>
            ) : null}

            {/* Email */}
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  label="Email"
                  value={value}
                  onChangeText={(t) => {
                    onChange(t);
                    if (error) clearError();
                  }}
                  onBlur={onBlur}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  disabled={isLoading}
                  left={<TextInput.Icon icon="email" />}
                  mode="outlined"
                  style={styles.input}
                  contentStyle={styles.inputContent}
                  outlineColor={
                    errors.email ? colors.danger : colors.borderColor
                  }
                  activeOutlineColor={colors.accentPrimary}
                  textColor={colors.textPrimary}
                  error={!!errors.email}
                  theme={inputTheme}
                />
              )}
            />
            <HelperText
              type="error"
              visible={!!errors.email}
              style={{ color: colors.danger }}
            >
              {errors.email?.message}
            </HelperText>

            {/* Password */}
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  label="Password"
                  value={value}
                  onChangeText={(t) => {
                    onChange(t);
                    if (error) clearError();
                  }}
                  onBlur={onBlur}
                  secureTextEntry={!showPassword}
                  disabled={isLoading}
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
                  outlineColor={
                    errors.password ? colors.danger : colors.borderColor
                  }
                  activeOutlineColor={colors.accentPrimary}
                  textColor={colors.textPrimary}
                  error={!!errors.password}
                  onSubmitEditing={safeSubmit}
                  theme={inputTheme}
                />
              )}
            />
            <HelperText
              type="error"
              visible={!!errors.password}
              style={{ color: colors.danger }}
            >
              {errors.password?.message}
            </HelperText>

            {/* Sign In button */}
            <Button
              mode="contained"
              onPress={safeSubmit}
              loading={isLoading || submitting}
              disabled={isLoading || submitting || googleLoading}
              style={styles.button}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
              buttonColor={colors.accentPrimary}
              textColor="#ffffff"
            >
              Sign In
            </Button>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <Divider style={[styles.dividerLine, { backgroundColor: colors.borderColor }]} />
              <Text style={[styles.dividerText, { color: colors.textMuted }]}>
                or
              </Text>
              <Divider style={[styles.dividerLine, { backgroundColor: colors.borderColor }]} />
            </View>

            {/* Google Sign-In */}
            <Button
              mode="outlined"
              onPress={handleGoogleSignIn}
              loading={googleLoading}
              disabled={isLoading || googleLoading}
              icon="google"
              style={[styles.googleButton, { borderColor: colors.borderColor }]}
              contentStyle={styles.buttonContent}
              labelStyle={[styles.googleLabel, { color: colors.textPrimary }]}
            >
              Continue with Google
            </Button>

            {/* Register link */}
            <Button
              mode="text"
              onPress={() => router.push("/(auth)/register")}
              disabled={isLoading}
              style={styles.registerButton}
              labelStyle={[
                styles.registerLabel,
                { color: colors.accentPrimary },
              ]}
            >
              Register as New User
            </Button>
          </Card.Content>
        </Card>

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
  errorBanner: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  errorIconRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  errorIcon: {
    fontSize: 20,
    marginRight: 10,
    marginTop: 1,
  },
  errorTextCol: {
    flex: 1,
  },
  errorTitle: {
    fontWeight: "600",
    fontSize: 14,
    lineHeight: 20,
  },
  errorHint: {
    fontSize: 13,
    marginTop: 4,
    opacity: 0.8,
    lineHeight: 18,
  },
  errorDismiss: {
    marginLeft: 8,
    padding: 2,
  },
  input: {
    marginBottom: 12,
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
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 12, fontSize: 13 },
  googleButton: { borderRadius: 10, borderWidth: 1 },
  googleLabel: { fontSize: 15, fontWeight: "600" },
  registerButton: { marginTop: 8 },
  registerLabel: { fontSize: 14, fontWeight: "600" },
  footer: { marginTop: 32, fontSize: 13 },
});
