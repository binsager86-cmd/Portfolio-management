/**
 * FormScreen — standardized layout for form-based screens.
 *
 * Provides consistent:
 *   • KeyboardAvoidingView + ScrollView with keyboard persistence
 *   • Back button + title header
 *   • Desktop-responsive max-width centering
 *   • Error banner (animated shake + fade, dismissible)
 *   • Submit button with loading state
 *
 * Used by: add-transaction, add-deposit, login, add-stock, etc.
 */

import React, { ReactNode, useEffect, useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  Animated,
  ViewStyle,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";

// ── Types ───────────────────────────────────────────────────────────

export interface FormScreenProps {
  /** Screen title shown next to the back arrow */
  title: string;
  /** Form content (Controller fields, etc.) */
  children: ReactNode;
  /**
   * Error string to display as an animated banner.
   * Pass null/undefined to hide.
   */
  error?: string | null;
  /** Called when the user dismisses the error banner */
  onDismissError?: () => void;

  // ── Submit button ─────────────────────────────────────────────
  /** Submit button label (default: "Submit") */
  submitLabel?: string;
  /** Called when the submit button is pressed */
  onSubmit?: () => void;
  /** Shows spinner inside the submit button */
  isSubmitting?: boolean;
  /** Override the submit button colour (defaults to accentPrimary) */
  submitColor?: string;

  // ── Optional extras ───────────────────────────────────────────
  /** Hide the default back button (e.g. login screen with no back) */
  hideBack?: boolean;
  /** Content rendered below the submit button (danger zone, import, etc.) */
  footer?: ReactNode;
  /** Override max-width on desktop (default 600) */
  maxWidth?: number;
  /** Additional style for the scroll container */
  contentStyle?: ViewStyle;
}

// ── Component ───────────────────────────────────────────────────────

export function FormScreen({
  title,
  children,
  error,
  onDismissError,
  submitLabel = "Submit",
  onSubmit,
  isSubmitting = false,
  submitColor,
  hideBack = false,
  footer,
  maxWidth = 600,
  contentStyle,
}: FormScreenProps) {
  const router = useRouter();
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();

  // ── Animated error banner ─────────────────────────────────────
  const errorOpacity = useRef(new Animated.Value(0)).current;
  const errorShake = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (error) {
      errorOpacity.setValue(0);
      errorShake.setValue(0);
      Animated.parallel([
        Animated.timing(errorOpacity, {
          toValue: 1,
          duration: 250,
          useNativeDriver: true,
        }),
        Animated.sequence([
          Animated.timing(errorShake, { toValue: 10, duration: 50, useNativeDriver: true }),
          Animated.timing(errorShake, { toValue: -10, duration: 50, useNativeDriver: true }),
          Animated.timing(errorShake, { toValue: 6, duration: 50, useNativeDriver: true }),
          Animated.timing(errorShake, { toValue: -6, duration: 50, useNativeDriver: true }),
          Animated.timing(errorShake, { toValue: 0, duration: 50, useNativeDriver: true }),
        ]),
      ]).start();
    } else {
      errorOpacity.setValue(0);
    }
  }, [error, errorOpacity, errorShake]);

  return (
    <KeyboardAvoidingView
      style={[styles.flex, { backgroundColor: colors.bgPrimary }]}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          isDesktop && { maxWidth, alignSelf: "center" as const, width: "100%" },
          contentStyle,
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <View style={styles.headerRow}>
          {!hideBack && (
            <Pressable onPress={() => router.back()} style={styles.backBtn}>
              <FontAwesome name="arrow-left" size={18} color={colors.textPrimary} />
            </Pressable>
          )}
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {title}
          </Text>
        </View>

        {/* ── Error banner ────────────────────────────────────── */}
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
            <View style={styles.errorRow}>
              <Text style={styles.errorIcon}>⚠</Text>
              <Text
                style={[styles.errorText, { color: colors.danger }]}
                numberOfLines={4}
              >
                {error}
              </Text>
              {onDismissError && (
                <Pressable
                  onPress={onDismissError}
                  hitSlop={12}
                  style={styles.errorDismiss}
                  accessibilityLabel="Dismiss error"
                >
                  <Text style={{ color: colors.danger, fontSize: 18 }}>✕</Text>
                </Pressable>
              )}
            </View>
          </Animated.View>
        ) : null}

        {/* ── Form content ────────────────────────────────────── */}
        {children}

        {/* ── Submit button ───────────────────────────────────── */}
        {onSubmit && (
          <Pressable
            onPress={onSubmit}
            disabled={isSubmitting}
            style={[
              styles.submitBtn,
              {
                backgroundColor: submitColor ?? colors.accentPrimary,
                opacity: isSubmitting ? 0.6 : 1,
              },
            ]}
          >
            {isSubmitting ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text style={styles.submitLabel}>{submitLabel}</Text>
            )}
          </Pressable>
        )}

        {/* ── Footer (danger-zone, import, etc.) ──────────────── */}
        {footer}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scroll: {
    padding: 20,
    paddingBottom: 60,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  // Error banner
  errorBanner: {
    borderWidth: 1,
    borderRadius: 10,
    padding: 14,
    marginBottom: 16,
  },
  errorRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  errorIcon: {
    fontSize: 20,
  },
  errorText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  errorDismiss: {
    padding: 4,
  },
  // Submit button
  submitBtn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  submitLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
