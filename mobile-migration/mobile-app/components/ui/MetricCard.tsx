/**
 * MetricCard — a single KPI card with accent bar, icon, label, value, and optional trend indicator.
 *
 * Used in the overview dashboard metrics grid.
 * Theme-aware via `useThemeStore`.
 * Responsive: touch targets ≥ 44px, fonts ≥ 14px on mobile.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import type { ThemePalette } from "@/constants/theme";

export type TrendDirection = "up" | "down" | "neutral";

export interface MetricCardProps {
  /** Display label (e.g. "Total Value") */
  label: string;
  /** Formatted display value (e.g. "12,345.678 KWD") */
  value: string;
  /** FontAwesome icon name */
  icon?: React.ComponentProps<typeof FontAwesome>["name"];
  /** Emoji fallback icon (used when `icon` is not provided) */
  emoji?: string;
  /** Trend direction — controls accent color and arrow indicator */
  trend?: TrendDirection;
  /** Optional subline text below the value */
  subline?: string;
  /** Override accent bar color */
  accentColor?: string;
  /** Card width (as percentage or number) */
  width?: string | number;
}

function trendColor(trend: TrendDirection | undefined, c: ThemePalette): string {
  if (trend === "up") return c.success;
  if (trend === "down") return c.danger;
  return c.accentPrimary;
}

function trendArrow(trend: TrendDirection | undefined): string {
  if (trend === "up") return " ▲";
  if (trend === "down") return " ▼";
  return "";
}

export function MetricCard({
  label,
  value,
  icon,
  emoji,
  trend,
  subline,
  accentColor,
  width = "48%",
}: MetricCardProps) {
  const { colors } = useThemeStore();
  const { isPhone, spacing, fonts } = useResponsive();
  const accent = accentColor ?? trendColor(trend, colors);

  return (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.borderColor,
          width: width as any,
          padding: spacing.cardPadding,
        },
      ]}
    >
      {/* Accent top bar */}
      <View style={[styles.accentBar, { backgroundColor: accent }]} />

      {/* Icon */}
      {icon ? (
        <FontAwesome
          name={icon}
          size={isPhone ? 18 : 20}
          color={accent}
          style={styles.icon}
        />
      ) : emoji ? (
        <Text style={[styles.emoji, { fontSize: isPhone ? 20 : 22 }]}>{emoji}</Text>
      ) : null}

      {/* Label */}
      <Text
        style={[
          styles.label,
          {
            color: colors.textSecondary,
            fontSize: isPhone ? 12 : 11,
          },
        ]}
      >
        {label}
      </Text>

      {/* Value + optional trend arrow */}
      <Text
        style={[
          styles.value,
          {
            color: trend ? trendColor(trend, colors) : colors.textPrimary,
            fontSize: isPhone ? 16 : 17,
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
        {trendArrow(trend)}
      </Text>

      {/* Subline */}
      {subline ? (
        <Text
          style={[
            styles.subline,
            {
              color: colors.textMuted,
              fontSize: isPhone ? 12 : 12,
            },
          ]}
        >
          {subline}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    padding: 16,
    borderWidth: 1,
    minHeight: 110,
    overflow: "hidden",
  },
  accentBar: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderTopLeftRadius: 12,
    borderTopRightRadius: 12,
  },
  icon: {
    marginBottom: 6,
  },
  emoji: {
    fontSize: 22,
    marginBottom: 6,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.8,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  value: {
    fontSize: 17,
    fontWeight: "700",
  },
  subline: {
    fontSize: 12,
    marginTop: 4,
  },
});
