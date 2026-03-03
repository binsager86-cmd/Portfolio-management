/**
 * LoadingScreen — full-screen centered spinner with optional message.
 * Theme-aware.
 */

import React from "react";
import { View, Text, ActivityIndicator, StyleSheet } from "react-native";
import { useThemeStore } from "@/services/themeStore";

interface LoadingScreenProps {
  message?: string;
}

export function LoadingScreen({ message = "Loading…" }: LoadingScreenProps) {
  const { colors } = useThemeStore();

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <ActivityIndicator size="large" color={colors.accentPrimary} />
      <Text style={[styles.text, { color: colors.textSecondary }]}>
        {message}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  text: {
    marginTop: 12,
    fontSize: 15,
  },
});
