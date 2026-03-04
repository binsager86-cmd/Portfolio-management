/**
 * Login Screen — react-hook-form + Zod, Google Sign-In, themed Paper UI.
 *
 * Form validation is handled by Zod schemas (lib/validationSchemas.ts).
 * Error messages are structured via authErrors.ts for Sentry/Flipper.
 */

import React, { useEffect, useState } from "react";
import {
  View,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Text,
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

export default function LoginScreen() {
  const router = useRouter();
  const { login, googleSignIn, loading, error, clearError } = useAuthStore();
  const { colors, toggle, mode } = useThemeStore();
  const { isDesktop } = useResponsive();

  const [showPassword, setShowPassword] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // react-hook-form + Zod
  const {
    control,
    handleSubmit,
    formState: { errors, isValid },
  } = useForm<LoginFormData>({
    resolver: zodResolver(loginSchema),
    defaultValues: {
      username: __DEV__ ? "sager alsager" : "",
      password: __DEV__ ? "Admin123!" : "",
    },
    mode: "onBlur",
  });

  // Clear store error on unmount
  useEffect(() => {
    return () => clearError();
  }, []);

  // ── Handlers ──────────────────────────────────────────────────────

  const onSubmit = async (data: LoginFormData) => {
    const ok = await login(data.username.trim(), data.password);
    if (ok) {
      router.replace("/(tabs)");
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      setGoogleLoading(true);
      // Dynamic import so we don't crash when package isn't installed
      const { GoogleSignin } = await import(
        "@react-native-google-signin/google-signin"
      );
      await GoogleSignin.hasPlayServices();
      const userInfo = await GoogleSignin.signIn();
      const idToken = userInfo.data?.idToken;
      if (!idToken) throw new Error("Google Sign-In did not return an ID token");
      const ok = await googleSignIn(idToken);
      if (ok) router.replace("/(tabs)");
    } catch (err: any) {
      // If user cancelled, do nothing
      if (err?.code === "SIGN_IN_CANCELLED") return;
      console.warn("[Google Sign-In]", err);
    } finally {
      setGoogleLoading(false);
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
            icon={mode === "dark" ? "weather-sunny" : "weather-night"}
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
              <View
                style={[
                  styles.errorBox,
                  { backgroundColor: colors.danger + "15" },
                ]}
              >
                <Text
                  style={{
                    color: colors.danger,
                    textAlign: "center",
                    fontWeight: "600",
                    fontSize: 14,
                  }}
                >
                  {error}
                </Text>
                {error.toLowerCase().includes("invalid") ? (
                  <Text
                    style={{
                      color: colors.danger,
                      textAlign: "center",
                      fontSize: 12,
                      marginTop: 4,
                      opacity: 0.8,
                    }}
                  >
                    Please check your username and password and try again
                  </Text>
                ) : null}
              </View>
            ) : null}

            {/* Username */}
            <Controller
              control={control}
              name="username"
              render={({ field: { onChange, onBlur, value } }) => (
                <TextInput
                  label="Username"
                  value={value}
                  onChangeText={(t) => {
                    onChange(t);
                    if (error) clearError();
                  }}
                  onBlur={onBlur}
                  autoCapitalize="none"
                  autoCorrect={false}
                  disabled={loading}
                  left={<TextInput.Icon icon="account" />}
                  mode="outlined"
                  style={styles.input}
                  contentStyle={styles.inputContent}
                  outlineColor={
                    errors.username ? colors.danger : colors.borderColor
                  }
                  activeOutlineColor={colors.accentPrimary}
                  textColor={colors.textPrimary}
                  error={!!errors.username}
                  theme={inputTheme}
                />
              )}
            />
            <HelperText
              type="error"
              visible={!!errors.username}
              style={{ color: colors.danger }}
            >
              {errors.username?.message}
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
                  outlineColor={
                    errors.password ? colors.danger : colors.borderColor
                  }
                  activeOutlineColor={colors.accentPrimary}
                  textColor={colors.textPrimary}
                  error={!!errors.password}
                  onSubmitEditing={handleSubmit(onSubmit)}
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
              onPress={handleSubmit(onSubmit)}
              loading={loading}
              disabled={loading || googleLoading}
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
              disabled={loading || googleLoading}
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
              disabled={loading}
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
  errorBox: { borderRadius: 8, padding: 12, marginBottom: 12 },
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
