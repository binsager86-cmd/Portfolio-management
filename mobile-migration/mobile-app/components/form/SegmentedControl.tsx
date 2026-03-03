/**
 * SegmentedControl — horizontal pill selector for discrete options.
 *
 * Used for txn_type (Buy / Sell / Dividend) and similar enums.
 * Theme-aware.
 */

import React from "react";
import { View, Text, Pressable, StyleSheet } from "react-native";
import { useThemeStore } from "@/services/themeStore";

interface SegmentedControlProps {
  options: string[];
  value: string;
  onChange: (value: string) => void;
  /** Optional mapping from option value → display label */
  labels?: Record<string, string>;
}

export function SegmentedControl({
  options,
  value,
  onChange,
  labels,
}: SegmentedControlProps) {
  const { colors } = useThemeStore();

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: colors.bgInput, borderColor: colors.borderColor },
      ]}
    >
      {options.map((opt) => {
        const active = opt === value;
        return (
          <Pressable
            key={opt}
            onPress={() => onChange(opt)}
            style={[
              styles.segment,
              active && {
                backgroundColor: colors.accentPrimary,
                shadowColor: colors.accentPrimary,
                shadowOpacity: 0.3,
                shadowRadius: 4,
                shadowOffset: { width: 0, height: 2 },
                elevation: 3,
              },
            ]}
          >
            <Text
              style={[
                styles.label,
                {
                  color: active ? "#ffffff" : colors.textSecondary,
                  fontWeight: active ? "700" : "500",
                },
              ]}
            >
              {labels?.[opt] ?? opt}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    borderRadius: 10,
    borderWidth: 1,
    padding: 3,
    marginBottom: 16,
  },
  segment: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  label: {
    fontSize: 14,
  },
});
