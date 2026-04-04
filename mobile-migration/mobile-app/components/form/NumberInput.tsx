/**
 * NumberInput — numeric text input that converts to number.
 * suffix allows displaying "KWD", "USD", etc.
 */

import { useThemeStore } from "@/services/themeStore";
import React from "react";
import { StyleSheet, Text, View } from "react-native";
import { TextInput } from "./TextInput";

interface NumberInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  hasError?: boolean;
  suffix?: string;
}

/** Format a numeric string with thousand separators for display. */
function formatDisplay(raw: string): string {
  if (!raw || raw === "-") return raw;
  const parts = raw.split(".");
  const intPart = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return parts.length > 1 ? `${intPart}.${parts[1]}` : intPart;
}

export function NumberInput({
  value,
  onChangeText,
  placeholder,
  hasError,
  suffix,
}: NumberInputProps) {
  const { colors } = useThemeStore();

  const handleChange = (text: string) => {
    // Strip formatting chars, keep digits, single decimal, leading minus
    const cleaned = text.replace(/[^0-9.\-]/g, "");
    onChangeText(cleaned);
  };

  const displayed = formatDisplay(value);

  if (suffix) {
    return (
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <TextInput
            value={displayed}
            onChangeText={handleChange}
            placeholder={placeholder ?? "0.00"}
            keyboardType="decimal-pad"
            hasError={hasError}
          />
        </View>
        <View
          style={[styles.suffixBox, { backgroundColor: colors.bgInput, borderColor: colors.borderColor }]}
        >
          <Text style={[styles.suffixText, { color: colors.textSecondary }]}>
            {suffix}
          </Text>
        </View>
      </View>
    );
  }

  return (
    <TextInput
      value={displayed}
      onChangeText={handleChange}
      placeholder={placeholder ?? "0"}
      keyboardType="decimal-pad"
      hasError={hasError}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    gap: 8,
  },
  suffixBox: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  suffixText: {
    fontSize: 13,
    fontWeight: "600",
  },
});
