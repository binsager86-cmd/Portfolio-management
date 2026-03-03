/**
 * TextInput — themed single-line text input (wraps RN TextInput).
 * Used for symbol, broker, reference, notes.
 */

import React from "react";
import {
  TextInput as RNTextInput,
  TextInputProps as RNTextInputProps,
  StyleSheet,
} from "react-native";
import { useThemeStore } from "@/services/themeStore";

interface TextInputProps extends Omit<RNTextInputProps, "style"> {
  hasError?: boolean;
}

export function TextInput({ hasError, ...props }: TextInputProps) {
  const { colors } = useThemeStore();

  return (
    <RNTextInput
      placeholderTextColor={colors.textSecondary + "88"}
      {...props}
      style={[
        styles.input,
        {
          backgroundColor: colors.bgInput,
          color: colors.textPrimary,
          borderColor: hasError ? colors.danger : colors.borderColor,
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 15,
  },
});
