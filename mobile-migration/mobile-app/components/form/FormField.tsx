/**
 * FormField — wraps a label + input + optional error message.
 * Keeps consistent spacing/styling across every form input.
 */

import React, { ReactNode } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useThemeStore } from "@/services/themeStore";

interface FormFieldProps {
  label: string;
  error?: string;
  required?: boolean;
  children: ReactNode;
}

export function FormField({ label, error, required, children }: FormFieldProps) {
  const { colors } = useThemeStore();

  return (
    <View style={styles.wrapper}>
      <Text style={[styles.label, { color: colors.textPrimary }]}>
        {label}
        {required && <Text style={{ color: colors.accentPrimary }}> *</Text>}
      </Text>
      {children}
      {error ? (
        <Text style={[styles.error, { color: colors.danger }]}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  label: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 6,
  },
  error: {
    fontSize: 12,
    marginTop: 4,
  },
});
