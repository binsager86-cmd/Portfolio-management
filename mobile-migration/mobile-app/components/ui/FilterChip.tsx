import type { ThemePalette } from "@/constants/theme";
import { UITokens } from "@/constants/uiTokens";
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
    paddingHorizontal: UITokens.filter.chipPaddingH,
    paddingVertical: UITokens.spacing.sm,
    borderRadius: UITokens.filter.chipRadius,
    borderWidth: UITokens.card.borderWidth,
    minHeight: UITokens.filter.chipHeight,
    justifyContent: "center",
  },
  chipText: { fontSize: UITokens.filter.chipFontSize, fontWeight: UITokens.filter.chipFontWeight },
});
