/**
 * SectionHeader — consistent section title across all screens.
 *
 * Replaces 11+ ad-hoc sectionTitle/sectionLabel styles with one component.
 *
 *   <SectionHeader title="Portfolio Snapshot" icon="pie-chart" />
 *   <SectionHeader title="Active Holdings" variant="label" />
 */

import { useResponsive } from "@/hooks/useResponsive";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import { StyleSheet, Text, View } from "react-native";

interface SectionHeaderProps {
  title: string;
  /** "title" = larger (default), "label" = uppercase caption */
  variant?: "title" | "label";
  icon?: React.ComponentProps<typeof FontAwesome>["name"];
  /** Extra right-side element (e.g., a toggle, info button) */
  right?: React.ReactNode;
}

export function SectionHeader({
  title,
  variant = "title",
  icon,
  right,
}: SectionHeaderProps) {
  const { colors } = useThemeStore();
  const { fonts } = useResponsive();

  const isLabel = variant === "label";

  return (
    <View style={styles.row}>
      <View style={styles.left}>
        {icon && (
          <FontAwesome
            name={icon}
            size={isLabel ? 12 : 14}
            color={colors.accentPrimary}
            style={styles.icon}
          />
        )}
        <Text
          style={[
            isLabel ? styles.label : styles.title,
            {
              color: colors.textPrimary,
              fontSize: isLabel ? fonts.caption : fonts.title,
            },
          ]}
        >
          {title}
        </Text>
      </View>
      {right}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    marginTop: 4,
  },
  left: {
    flexDirection: "row",
    alignItems: "center",
  },
  icon: {
    marginRight: 8,
  },
  title: {
    fontWeight: "700",
  },
  label: {
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
});
