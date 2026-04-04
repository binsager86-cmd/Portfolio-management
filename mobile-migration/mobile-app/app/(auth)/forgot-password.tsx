/**
 * Forgot Password Screen — 3-step OTP flow:
 *   Step 1: Enter email → sends OTP
 *   Step 2: Enter 6-digit code → verifies OTP
 *   Step 3: Set new password → resets password
 */

import { useRouter } from "expo-router";
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
    Animated,
    KeyboardAvoidingView,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";
import {
    Button,
    Card,
    HelperText,
    IconButton,
    TextInput,
} from "react-native-paper";

import { useResponsive } from "@/hooks/useResponsive";
import { extractErrorMessage } from "@/lib/errorHandling";
import { forgotPassword, resetPassword, verifyOtp } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";

type Step = "email" | "otp" | "password";

// ── Password strength helper ────────────────────────────────────────

const STRENGTH_LABELS = ["", "Weak", "Fair", "Good", "Strong"] as const;
const STRENGTH_COLORS = ["#d1d5db", "#ef4444", "#f59e0b", "#3b82f6", "#22c55e"];

function getPasswordStrength(pwd: string): number {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[0-9]/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return score;
}

export default function ForgotPasswordScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();

  const [step, setStep] = useState<Step>("email");
  const [email, setEmail] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const [countdown, setCountdown] = useState(0);

  // Animated error
  const errorOpacity = useRef(new Animated.Value(0)).current;
  const errorShake = useRef(new Animated.Value(0)).current;

  // Countdown timer for resend
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
    return () => clearTimeout(timer);
  }, [countdown]);

  // Animate error
  useEffect(() => {
    if (error) {
      errorOpacity.setValue(0);
      errorShake.setValue(0);
      Animated.parallel([
        Animated.timing(errorOpacity, { toValue: 1, duration: 300, useNativeDriver: true }),
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

  // ── Shared input theme ────────────────────────────────────────────

  const inputTheme = {
    colors: {
      surfaceVariant: colors.bgInput,
      onSurfaceVariant: colors.textSecondary,
      placeholder: colors.textMuted,
      error: colors.danger,
    },
  };

  // ── Step 1: Send OTP ──────────────────────────────────────────────

  const handleSendOtp = useCallback(async () => {
    setError(null);
    setSuccess(null);

    if (!email.trim()) {
      setError("Please enter your email address");
      return;
    }

    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setSuccess("A 6-digit code has been sent to your email");
      setStep("otp");
      setCountdown(60); // 60s before resend allowed
    } catch (err: unknown) {
      const msg = extractErrorMessage(err, "Failed to send reset code");
      // Always show success message to prevent email enumeration
      if (msg.includes("If an account")) {
        setSuccess(msg);
        setStep("otp");
        setCountdown(60);
      } else {
        setError(msg);
      }
    } finally {
      setLoading(false);
    }
  }, [email]);

  // ── Resend OTP ────────────────────────────────────────────────────

  const handleResendOtp = useCallback(async () => {
    if (countdown > 0) return;
    setError(null);
    setSuccess(null);
    setLoading(true);
    try {
      await forgotPassword(email.trim());
      setSuccess("A new code has been sent to your email");
      setCountdown(60);
      setOtpCode("");
    } catch (err: unknown) {
      setError(extractErrorMessage(err, "Failed to resend code"));
    } finally {
      setLoading(false);
    }
  }, [email, countdown]);

  // ── Step 2: Verify OTP ────────────────────────────────────────────

  const handleVerifyOtp = useCallback(async () => {
    setError(null);
    setSuccess(null);

    if (otpCode.length !== 6) {
      setError("Please enter the 6-digit code");
      return;
    }

    setLoading(true);
    try {
      await verifyOtp(email.trim(), otpCode.trim());
      setSuccess("Code verified! Set your new password.");
      setStep("password");
    } catch (err: unknown) {
      setError(extractErrorMessage(err, "Invalid code"));
    } finally {
      setLoading(false);
    }
  }, [email, otpCode]);

  // ── Step 3: Reset Password ────────────────────────────────────────

  const handleResetPassword = useCallback(async () => {
    setError(null);
    setSuccess(null);

    if (newPassword.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }

    setLoading(true);
    try {
      await resetPassword(email.trim(), otpCode.trim(), newPassword);
      setSuccess("Password reset successfully! Redirecting to login…");
      setTimeout(() => router.replace("/(auth)/login"), 2000);
    } catch (err: unknown) {
      setError(extractErrorMessage(err, "Failed to reset password"));
    } finally {
      setLoading(false);
    }
  }, [email, otpCode, newPassword, confirmPassword, router]);

  // ── Password strength ─────────────────────────────────────────────

  const pwdStrength = getPasswordStrength(newPassword);

  // ── Render helpers ────────────────────────────────────────────────

  const stepTitle = {
    email: "Forgot Password",
    otp: "Enter Reset Code",
    password: "Set New Password",
  }[step];

  const stepSubtitle = {
    email: "Enter your email and we'll send you a reset code",
    otp: `We sent a 6-digit code to ${email}`,
    password: "Choose a strong new password",
  }[step];

  const stepIcon = { email: "🔑", otp: "📧", password: "🔒" }[step];

  return (
    <KeyboardAvoidingView
      style={[styles.container, { backgroundColor: colors.bgPrimary }]}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <ScrollView
        contentContainerStyle={[styles.scroll, isDesktop && styles.scrollDesktop]}
        keyboardShouldPersistTaps="handled"
      >
        {/* Back button */}
        <View style={styles.backRow}>
          <IconButton
            icon="arrow-left"
            iconColor={colors.textSecondary}
            size={24}
            onPress={() => {
              if (step === "otp") setStep("email");
              else if (step === "password") setStep("otp");
              else router.back();
            }}
            accessibilityLabel="Go back"
          />
        </View>

        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.icon}>{stepIcon}</Text>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {stepTitle}
          </Text>
          <Text style={[styles.subtitle, { color: colors.textSecondary }]}>
            {stepSubtitle}
          </Text>
        </View>

        {/* Step indicator */}
        <View style={styles.stepRow}>
          {(["email", "otp", "password"] as Step[]).map((s, i) => (
            <View key={s} style={styles.stepItem}>
              <View
                style={[
                  styles.stepDot,
                  {
                    backgroundColor:
                      step === s
                        ? colors.accentPrimary
                        : i < ["email", "otp", "password"].indexOf(step)
                        ? colors.success
                        : colors.borderColor,
                  },
                ]}
              >
                <Text style={styles.stepDotText}>
                  {i < ["email", "otp", "password"].indexOf(step) ? "✓" : i + 1}
                </Text>
              </View>
              {i < 2 && (
                <View
                  style={[
                    styles.stepLine,
                    {
                      backgroundColor:
                        i < ["email", "otp", "password"].indexOf(step)
                          ? colors.success
                          : colors.borderColor,
                    },
                  ]}
                />
              )}
            </View>
          ))}
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
            {/* Error banner */}
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
                  <Text
                    style={[styles.errorTitle, { color: colors.danger, flex: 1 }]}
                  >
                    {error}
                  </Text>
                  <Pressable
                    onPress={() => setError(null)}
                    hitSlop={12}
                    style={styles.errorDismiss}
                  >
                    <Text style={{ color: colors.danger, fontSize: 18 }}>✕</Text>
                  </Pressable>
                </View>
              </Animated.View>
            ) : null}

            {/* Success banner */}
            {success ? (
              <View
                style={[
                  styles.successBanner,
                  {
                    backgroundColor: colors.success + "12",
                    borderColor: colors.success + "40",
                  },
                ]}
              >
                <Text style={[styles.successText, { color: colors.success }]}>
                  ✓ {success}
                </Text>
              </View>
            ) : null}

            {/* ── Step 1: Email ────────────────────────────────── */}
            {step === "email" && (
              <>
                <TextInput
                  label="Email"
                  value={email}
                  onChangeText={(t) => {
                    setEmail(t);
                    if (error) setError(null);
                  }}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  disabled={loading}
                  left={<TextInput.Icon icon="email" />}
                  mode="outlined"
                  style={styles.input}
                  contentStyle={styles.inputContent}
                  outlineColor={colors.borderColor}
                  activeOutlineColor={colors.accentPrimary}
                  textColor={colors.textPrimary}
                  theme={inputTheme}
                  onSubmitEditing={handleSendOtp}
                />
                <Button
                  mode="contained"
                  onPress={handleSendOtp}
                  loading={loading}
                  disabled={loading || !email.trim()}
                  style={styles.button}
                  contentStyle={styles.buttonContent}
                  labelStyle={styles.buttonLabel}
                  buttonColor={colors.accentPrimary}
                  textColor="#ffffff"
                >
                  Send Reset Code
                </Button>
              </>
            )}

            {/* ── Step 2: OTP ──────────────────────────────────── */}
            {step === "otp" && (
              <>
                <TextInput
                  label="6-digit code"
                  value={otpCode}
                  onChangeText={(t) => {
                    // Only allow digits, max 6
                    const cleaned = t.replace(/\D/g, "").slice(0, 6);
                    setOtpCode(cleaned);
                    if (error) setError(null);
                  }}
                  keyboardType="number-pad"
                  maxLength={6}
                  disabled={loading}
                  left={<TextInput.Icon icon="shield-key" />}
                  mode="outlined"
                  style={[styles.input, styles.otpInput]}
                  contentStyle={styles.inputContent}
                  outlineColor={colors.borderColor}
                  activeOutlineColor={colors.accentPrimary}
                  textColor={colors.textPrimary}
                  theme={inputTheme}
                  onSubmitEditing={handleVerifyOtp}
                />
                <Button
                  mode="contained"
                  onPress={handleVerifyOtp}
                  loading={loading}
                  disabled={loading || otpCode.length !== 6}
                  style={styles.button}
                  contentStyle={styles.buttonContent}
                  labelStyle={styles.buttonLabel}
                  buttonColor={colors.accentPrimary}
                  textColor="#ffffff"
                >
                  Verify Code
                </Button>

                {/* Resend */}
                <Button
                  mode="text"
                  onPress={handleResendOtp}
                  disabled={countdown > 0 || loading}
                  style={styles.resendButton}
                  labelStyle={[
                    styles.resendLabel,
                    { color: countdown > 0 ? colors.textMuted : colors.accentPrimary },
                  ]}
                >
                  {countdown > 0
                    ? `Resend code in ${countdown}s`
                    : "Resend code"}
                </Button>
              </>
            )}

            {/* ── Step 3: New Password ─────────────────────────── */}
            {step === "password" && (
              <>
                <TextInput
                  label="New Password"
                  value={newPassword}
                  onChangeText={(t) => {
                    setNewPassword(t);
                    if (error) setError(null);
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
                  theme={inputTheme}
                />

                {/* Password strength */}
                {newPassword.length > 0 && (
                  <View style={styles.strengthRow}>
                    {[1, 2, 3, 4].map((level) => (
                      <View
                        key={level}
                        style={[
                          styles.strengthBar,
                          {
                            backgroundColor:
                              level <= pwdStrength
                                ? STRENGTH_COLORS[pwdStrength]
                                : colors.borderColor,
                          },
                        ]}
                      />
                    ))}
                    <Text
                      style={[
                        styles.strengthLabel,
                        { color: STRENGTH_COLORS[pwdStrength] },
                      ]}
                    >
                      {STRENGTH_LABELS[pwdStrength]}
                    </Text>
                  </View>
                )}

                <TextInput
                  label="Confirm Password"
                  value={confirmPassword}
                  onChangeText={(t) => {
                    setConfirmPassword(t);
                    if (error) setError(null);
                  }}
                  secureTextEntry={!showPassword}
                  disabled={loading}
                  left={<TextInput.Icon icon="lock-check" />}
                  mode="outlined"
                  style={styles.input}
                  contentStyle={styles.inputContent}
                  outlineColor={
                    confirmPassword && confirmPassword !== newPassword
                      ? colors.danger
                      : colors.borderColor
                  }
                  activeOutlineColor={colors.accentPrimary}
                  textColor={colors.textPrimary}
                  theme={inputTheme}
                  onSubmitEditing={handleResetPassword}
                />
                <HelperText
                  type="error"
                  visible={!!confirmPassword && confirmPassword !== newPassword}
                  style={{ color: colors.danger }}
                >
                  Passwords do not match
                </HelperText>

                <Button
                  mode="contained"
                  onPress={handleResetPassword}
                  loading={loading}
                  disabled={
                    loading ||
                    newPassword.length < 8 ||
                    newPassword !== confirmPassword
                  }
                  style={styles.button}
                  contentStyle={styles.buttonContent}
                  labelStyle={styles.buttonLabel}
                  buttonColor={colors.accentPrimary}
                  textColor="#ffffff"
                >
                  Reset Password
                </Button>
              </>
            )}

            {/* Back to login */}
            <Button
              mode="text"
              onPress={() => router.replace("/(auth)/login")}
              disabled={loading}
              style={styles.backToLoginButton}
              labelStyle={[styles.backToLoginLabel, { color: colors.accentPrimary }]}
            >
              Back to Sign In
            </Button>
          </Card.Content>
        </Card>
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
  backRow: {
    position: "absolute",
    top: Platform.OS === "web" ? 16 : 48,
    left: 8,
    zIndex: 10,
  },
  header: { alignItems: "center", marginBottom: 20 },
  icon: { fontSize: 48, marginBottom: 12 },
  title: { fontSize: 26, fontWeight: "700", marginBottom: 4 },
  subtitle: { fontSize: 14, textAlign: "center", maxWidth: 320, lineHeight: 20 },
  stepRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 24,
  },
  stepItem: { flexDirection: "row", alignItems: "center" },
  stepDot: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepDotText: { color: "#fff", fontSize: 13, fontWeight: "700" },
  stepLine: { width: 40, height: 2, marginHorizontal: 4 },
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
  errorIconRow: { flexDirection: "row", alignItems: "flex-start" },
  errorIcon: { fontSize: 20, marginRight: 10, marginTop: 1 },
  errorTitle: { fontWeight: "600", fontSize: 14, lineHeight: 20 },
  errorDismiss: { marginLeft: 8, padding: 2 },
  successBanner: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    marginBottom: 16,
  },
  successText: { fontWeight: "600", fontSize: 14, lineHeight: 20 },
  input: {
    marginBottom: 12,
    fontSize: 16,
    backgroundColor: "transparent",
  },
  inputContent: {
    paddingVertical: Platform.OS === "web" ? 10 : 6,
    minHeight: 52,
  },
  otpInput: {
    letterSpacing: 8,
    textAlign: "center",
    fontSize: 24,
  },
  button: { marginTop: 12, borderRadius: 10 },
  buttonContent: { paddingVertical: 8 },
  buttonLabel: { fontSize: 16, fontWeight: "700", letterSpacing: 0.5 },
  resendButton: { marginTop: 8 },
  resendLabel: { fontSize: 14, fontWeight: "600" },
  strengthRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
    gap: 4,
  },
  strengthBar: { flex: 1, height: 4, borderRadius: 2 },
  strengthLabel: { fontSize: 12, fontWeight: "600", marginLeft: 8, minWidth: 48 },
  backToLoginButton: { marginTop: 16 },
  backToLoginLabel: { fontSize: 14, fontWeight: "600" },
});
