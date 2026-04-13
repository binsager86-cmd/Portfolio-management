/**
 * Register Screen — react-hook-form + Zod, auto-login, Google Sign-In.
 *
 * On successful registration the backend returns a TokenResponse (same
 * shape as login). The auth store now persists tokens immediately so
 * the user is auto-logged-in — no redirect-to-login needed.
 */

import { zodResolver } from "@hookform/resolvers/zod";
import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import {
    KeyboardAvoidingView,
    Platform,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import {
    Button,
    Card,
    Divider,
    HelperText,
    IconButton,
    TextInput,
} from "react-native-paper";

import { useGoogleSignIn } from "@/hooks/useGoogleSignIn";
import { useResponsive } from "@/hooks/useResponsive";
import { analytics } from "@/lib/analytics";
import { validateEnv } from "@/lib/env";
import { registerSchema, type RegisterFormData } from "@/lib/validationSchemas";
import { useAuthStore } from "@/services/authStore";
import { useThemeStore } from "@/services/themeStore";
import { useTranslation } from "react-i18next";

// ── Password strength helper ────────────────────────────────────────

const STRENGTH_LABELS = ["", "weak", "fair", "good", "strong"] as const;
const STRENGTH_COLORS = ["#d1d5db", "#ef4444", "#f59e0b", "#3b82f6", "#22c55e"];

function getPasswordStrength(pwd: string): number {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return score; // 0–4
}

export default function RegisterScreen() {
  const router = useRouter();
  const { register, googleSignIn, isLoading, error, clearError } = useAuthStore();
  const { colors, toggle, mode } = useThemeStore();
  const { isDesktop } = useResponsive();
  const { t } = useTranslation();

  const [showPassword, setShowPassword] = useState(false);
  const isSubmittingRef = useRef(false);

  // Google Sign-In hook (handles popup + redirect flows on web, native on mobile)
  const { signIn: googlePrompt, isLoading: googleLoading } = useGoogleSignIn();

  // Field refs for keyboard navigation
  const displayNameRef = useRef<any>(null);
  const passwordRef = useRef<any>(null);
  const confirmPasswordRef = useRef<any>(null);

  // react-hook-form + Zod
  const {
    control,
    handleSubmit,
    watch,
    reset,
    setFocus,
    formState: { errors },
  } = useForm<RegisterFormData>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      email: "",
      displayName: "",
      password: "",
      confirmPassword: "",
    },
    mode: "onBlur",
  });

  const passwordValue = watch("password");
  const strengthScore = getPasswordStrength(passwordValue || "");

  // Clear store error on unmount
  useEffect(() => {
    return () => clearError();
  }, []);

  // Track screen view
  useEffect(() => {
    analytics.logScreenView("Register");
  }, []);

  // Dev-time config check — catch missing env vars early
  useEffect(() => {
    if (__DEV__) {
      validateEnv();
      console.log("[Register] Google Config:", {
        webClientId: process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
          ? "✅ Set"
          : "❌ Missing",
        apiUrl: process.env.EXPO_PUBLIC_API_URL
          ? "✅ Set"
          : "⚠️ Using fallback",
        currentOrigin:
          typeof window !== "undefined" ? window.location.origin : "native",
      });
    }
  }, []);

  // Focus the first invalid field after validation
  useEffect(() => {
    const errorFields = Object.keys(errors) as (keyof RegisterFormData)[];
    if (errorFields.length > 0) {
      try {
        setFocus(errorFields[0]);
      } catch {
        // setFocus may not work on all platforms — fail silently
      }
    }
  }, [errors, setFocus]);

  // ── Handlers ──────────────────────────────────────────────────────

  const onSubmit = useCallback(async (data: RegisterFormData) => {
    if (isSubmittingRef.current) return;
    isSubmittingRef.current = true;
    analytics.logEvent("registration_attempted", { method: "email" });
    try {
      const ok = await register(
        data.email.trim().toLowerCase(),
        data.password,
        data.displayName?.trim() || undefined,
      );
      if (ok) {
        analytics.logEvent("registration_completed", { method: "email" });
        try {
          // On web, new users see onboarding after registration (not before).
          // On native, onboarding was already shown pre-auth so go to root.
          router.replace(Platform.OS === "web" ? "/(onboarding)/welcome" : "/");
        } catch (navErr) {
          // Fallback: reset form to prevent duplicate submit if nav fails
          reset();
          console.error("Navigation failed after registration", navErr);
        }
      }
    } finally {
      isSubmittingRef.current = false;
    }
  }, [register, router, reset]);

  const handleGoogleSignIn = useCallback(async () => {
    analytics.logEvent("registration_attempted", { method: "google" });
    try {
      console.log("[Register] Starting Google Sign-In…");
      // On web this redirects the page to Google (never returns).
      // On native this returns a result with the token.
      const result = await googlePrompt();

      // ─ Native path (web never reaches here — page navigates away) ─
      if (result.success) {
        if (__DEV__) console.log("[Register] Got token, sending to backend…");
        const ok = await googleSignIn(result.token);
        if (ok) {
          analytics.logEvent("registration_completed", { method: "google" });
          router.replace(Platform.OS === "web" ? "/(onboarding)/welcome" : "/");
        }
      } else if (!result.cancelled) {
        useAuthStore.setState({
          error: result.error || t('auth.googleSignInFailed'),
        });
      }
    } catch (err: unknown) {
      console.error("[Register] Google Sign-In error:", err);
      useAuthStore.setState({
        error: err instanceof Error ? err.message : t('auth.googleSignInUnexpected'),
      });
    }
  }, [googlePrompt, googleSignIn, router]);

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
            disabled={isLoading || googleLoading}
            accessibilityLabel={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            accessibilityRole="button"
          />
        </View>

        {/* Logo / Title */}
        <View style={styles.header}>
          <Text style={styles.icon}>📊</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {t('auth.createAccount')}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {t('auth.registerSubtitle')}
          </Text>
        </View>

        {/* Card — Registration Form */}
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
            {/* Server error banner */}
            {error ? (
              <View
                style={[
                  styles.errorBox,
                  { backgroundColor: colors.danger + "20" },
                ]}
              >
                <Text style={{ color: colors.danger, textAlign: "center" }}>
                  {error}
                </Text>
              </View>
            ) : null}

            {/* Email */}
            <Controller
              control={control}
              name="email"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  testID="register-email-input"
                  label={t('auth.emailOnly')}
                  value={value}
                  onChangeText={(tx) => {
                    onChange(tx);
                    if (error) clearError();
                  }}
                  onBlur={onBlur}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  returnKeyType="next"
                  onSubmitEditing={() => displayNameRef.current?.focus()}
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
              accessibilityLiveRegion="polite"
            >
              {errors.email?.message}
            </HelperText>

            {/* Display Name */}
            <Controller
              control={control}
              name="displayName"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  testID="register-displayname-input"
                  ref={displayNameRef}
                  label={t('auth.displayName')}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  autoCapitalize="words"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  disabled={isLoading}
                  left={<TextInput.Icon icon="badge-account" />}
                  mode="outlined"
                  style={styles.input}
                  contentStyle={styles.inputContent}
                  outlineColor={colors.borderColor}
                  activeOutlineColor={colors.accentPrimary}
                  textColor={colors.textPrimary}
                  theme={inputTheme}
                />
              )}
            />

            {/* Password */}
            <Controller
              control={control}
              name="password"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  testID="register-password-input"
                  ref={passwordRef}
                  label={t('auth.password')}
                  value={value}
                  onChangeText={(tx) => {
                    onChange(tx);
                    if (error) clearError();
                  }}
                  onBlur={onBlur}
                  secureTextEntry={!showPassword}
                  returnKeyType="next"
                  onSubmitEditing={() => confirmPasswordRef.current?.focus()}
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
                  theme={inputTheme}
                />
              )}
            />
            <HelperText
              type="error"
              visible={!!errors.password}
              style={{ color: colors.danger }}
              accessibilityLiveRegion="polite"
            >
              {errors.password?.message}
            </HelperText>

            {/* Password strength indicator */}
            {passwordValue ? (
              <View style={styles.strengthRow}>
                {[0, 1, 2, 3].map((i) => (
                  <View
                    key={i}
                    style={[
                      styles.strengthSegment,
                      {
                        backgroundColor:
                          i < strengthScore
                            ? STRENGTH_COLORS[strengthScore]
                            : colors.borderColor,
                      },
                    ]}
                  />
                ))}
                <Text
                  style={[
                    styles.strengthText,
                    { color: STRENGTH_COLORS[strengthScore] },
                  ]}
                  accessibilityLabel={`Password strength: ${STRENGTH_LABELS[strengthScore]}`}
                >
                  {STRENGTH_LABELS[strengthScore] ? t('auth.' + STRENGTH_LABELS[strengthScore]) : ''}
                </Text>
              </View>
            ) : null}

            {/* Confirm Password */}
            <Controller
              control={control}
              name="confirmPassword"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  testID="register-confirm-password-input"
                  ref={confirmPasswordRef}
                  label={t('auth.confirmPasswordLabel')}
                  value={value}
                  onChangeText={(tx) => {
                    onChange(tx);
                    if (error) clearError();
                  }}
                  onBlur={onBlur}
                  secureTextEntry={!showPassword}
                  returnKeyType="done"
                  onSubmitEditing={handleSubmit(onSubmit)}
                  disabled={isLoading}
                  left={<TextInput.Icon icon="lock-check" />}
                  mode="outlined"
                  style={styles.input}
                  contentStyle={styles.inputContent}
                  outlineColor={
                    errors.confirmPassword ? colors.danger : colors.borderColor
                  }
                  activeOutlineColor={colors.accentPrimary}
                  textColor={colors.textPrimary}
                  error={!!errors.confirmPassword}
                  theme={inputTheme}
                />
              )}
            />
            <HelperText
              type="error"
              visible={!!errors.confirmPassword}
              style={{ color: colors.danger }}
              accessibilityLiveRegion="polite"
            >
              {errors.confirmPassword?.message}
            </HelperText>

            {/* Create Account button */}
            <Button
              testID="register-submit-button"
              mode="contained"
              onPress={handleSubmit(onSubmit)}
              loading={isLoading}
              disabled={isLoading || googleLoading}
              style={styles.button}
              contentStyle={styles.buttonContent}
              labelStyle={styles.buttonLabel}
              buttonColor={colors.accentPrimary}
              textColor="#ffffff"
              accessibilityLabel="Create account"
            >
              {t('auth.createAccount')}
            </Button>

            {/* Divider */}
            <View style={styles.dividerRow}>
              <Divider style={[styles.dividerLine, { backgroundColor: colors.borderColor }]} />
              <Text style={[styles.dividerText, { color: colors.textMuted }]}>
                {t('auth.or')}
              </Text>
              <Divider style={[styles.dividerLine, { backgroundColor: colors.borderColor }]} />
            </View>

            {/* Google Sign-In */}
            <Button
              testID="register-google-button"
              mode="outlined"
              onPress={handleGoogleSignIn}
              loading={googleLoading}
              disabled={isLoading || googleLoading}
              icon="google"
              style={[styles.googleButton, { borderColor: colors.borderColor }]}
              contentStyle={styles.buttonContent}
              labelStyle={[styles.googleLabel, { color: colors.textPrimary }]}
              accessibilityLabel="Continue with Google"
            >
              {t('auth.continueWithGoogle')}
            </Button>

            {/* Back to Login */}
            <Button
              mode="text"
              onPress={() => router.back()}
              disabled={isLoading}
              style={styles.backButton}
              labelStyle={[styles.backLabel, { color: colors.accentPrimary }]}
            >
              {t('auth.alreadyHaveAccount')}
            </Button>
          </Card.Content>
        </Card>

        <Text style={[styles.footer, { color: colors.textMuted }]}>
          {t('auth.footerText')}
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
  dividerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: 16,
  },
  dividerLine: { flex: 1, height: 1 },
  dividerText: { marginHorizontal: 12, fontSize: 13 },
  googleButton: { borderRadius: 10, borderWidth: 1 },
  googleLabel: { fontSize: 15, fontWeight: "600" },
  backButton: { marginTop: 8 },
  backLabel: { fontSize: 14, fontWeight: "600" },
  footer: { marginTop: 32, fontSize: 13 },
  strengthRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 8,
    gap: 4,
  },
  strengthSegment: {
    flex: 1,
    height: 4,
    borderRadius: 2,
  },
  strengthText: {
    fontSize: 12,
    marginLeft: 8,
    fontWeight: "600",
    minWidth: 44,
  },
});
