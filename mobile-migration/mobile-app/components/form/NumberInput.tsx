/**
 * NumberInput — numeric text input that converts to number.
 * suffix allows displaying "KWD", "USD", etc.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import { TextInput } from "./TextInput";
import { useThemeStore } from "@/services/themeStore";

interface NumberInputProps {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  hasError?: boolean;
  suffix?: string;
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
    // Allow only digits, single decimal point, and minus at start
    const cleaned = text.replace(/[^0-9.\-]/g, "");
    onChangeText(cleaned);
  };

  if (suffix) {
    return (
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <TextInput
            value={value}
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
      value={value}
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
