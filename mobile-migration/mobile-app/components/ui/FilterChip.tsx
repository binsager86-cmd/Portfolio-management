import type { ThemePalette } from "@/constants/theme";
import React from "react";
import { Platform, Pressable, StyleSheet, Text } from "react-native";

export const FilterChip = React.memo(function FilterChip({
  label,
  active,
  onPress,
  activeColor,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  activeColor?: string;
  colors: ThemePalette;
}) {
  const bg = active ? (activeColor ?? colors.accentPrimary) : colors.bgCard;
  return (
    <Pressable
      onPress={onPress}
      style={[styles.chip, { backgroundColor: bg, borderColor: colors.borderColor }, Platform.OS === "web" ? ({ cursor: "pointer" } as any) : undefined]}
    >
      <Text style={[styles.chipText, { color: active ? "#fff" : colors.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: "600" },
});
