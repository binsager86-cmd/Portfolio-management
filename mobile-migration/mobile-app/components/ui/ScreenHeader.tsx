/**
 * ScreenHeader — inline header row with title + optional trailing action.
 *
 * Used at top of tab screens (Overview, Dividends, etc.) to show
 * screen title + theme toggle or other button.
 *
 *   <ScreenHeader title="Overview" trailing={<ThemeToggle />} />
 */

import { useResponsive } from "@/hooks/useResponsive";
import { useThemeStore } from "@/services/themeStore";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface ScreenHeaderProps {
  title: string;
  /** Element rendered on the right (e.g., theme toggle, refresh button) */
  trailing?: React.ReactNode;
}

export function ScreenHeader({ title, trailing }: ScreenHeaderProps) {
  const { colors } = useThemeStore();
  const { fonts } = useResponsive();

  return (
    <View style={styles.row}>
      <Text style={[styles.title, { color: colors.textPrimary, fontSize: fonts.title + 2 }]}>
        {title}
      </Text>
      {trailing}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 8,
    marginBottom: 8,
  },
  title: {
    fontWeight: "700",
  },
});
