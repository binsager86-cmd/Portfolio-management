/**
 * ErrorScreen — full-screen error state with retry button.
 * Theme-aware.
 */

import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { UITokens } from "@/constants/uiTokens";
import { useThemeStore } from "@/services/themeStore";

interface ErrorScreenProps {
  message: string;
  onRetry?: () => void;
}

export function ErrorScreen({ message, onRetry }: ErrorScreenProps) {
  const { colors } = useThemeStore();

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <Text style={styles.emoji}>⚠️</Text>
      <Text style={[styles.text, { color: colors.danger }]}>{message}</Text>
      {onRetry && (
        <Pressable
          onPress={onRetry}
          style={[styles.button, { backgroundColor: colors.accentPrimary }]}
        >
          <Text style={styles.buttonText}>Retry</Text>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    paddingHorizontal: UITokens.spacing.lg,
  },
  emoji: {
    fontSize: UITokens.error.iconSize,
    marginBottom: UITokens.spacing.md,
  },
  text: {
    fontSize: UITokens.error.titleSize,
    textAlign: "center",
  },
  button: {
    marginTop: UITokens.spacing.xl - UITokens.spacing.md,
    paddingHorizontal: UITokens.error.retryButtonPaddingH,
    paddingVertical: UITokens.error.retryButtonPaddingV,
    borderRadius: UITokens.error.retryButtonRadius,
  },
  buttonText: {
    color: "#ffffff",
    fontWeight: "600",
    fontSize: UITokens.typography.body.size,
  },
});
