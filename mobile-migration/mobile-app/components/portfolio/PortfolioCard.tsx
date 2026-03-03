/**
 * PortfolioCard — shows a single portfolio's summary (market value, gain, currency).
 *
 * Used in the "By Portfolio" section of the overview dashboard.
 * Theme-aware.
 */

import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import { formatCurrency, formatSignedCurrency } from "@/lib/currency";
import type { ThemePalette } from "@/constants/theme";

export interface PortfolioCardData {
  market_value?: number;
  market_value_kwd?: number;
  total_cost_kwd?: number;
  currency?: string;
  holding_count?: number;
  [key: string]: any;
}

interface PortfolioCardProps {
  /** Portfolio name (e.g. "KFH", "BBYN", "USA") */
  name: string;
  /** Portfolio value data from the overview endpoint */
  data: PortfolioCardData;
  /** Optional press handler — navigates to detail */
  onPress?: () => void;
}

function pnlColor(n: number, c: ThemePalette): string {
  if (n > 0) return c.success;
  if (n < 0) return c.danger;
  return c.textSecondary;
}

export function PortfolioCard({ name, data, onPress }: PortfolioCardProps) {
  const { colors } = useThemeStore();
  const { isPhone, spacing } = useResponsive();
  const ccy = data.currency ?? "KWD";
  const gain = (data.market_value_kwd ?? 0) - (data.total_cost_kwd ?? 0);

  const content = (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.borderColor,
          padding: spacing.cardPadding,
          flex: isPhone ? undefined : 1,
          minWidth: isPhone ? undefined : 240,
        },
      ]}
    >
      {/* Header row: name + currency */}
      <View style={styles.header}>
        <Text style={[styles.name, { color: colors.accentSecondary }]}>
          {name}
        </Text>
        <Text style={[styles.currency, { color: colors.textMuted }]}>
          {ccy}
        </Text>
      </View>

      {/* Market value in local currency */}
      <Text style={[styles.value, { color: colors.textPrimary }]}>
        {formatCurrency(data.market_value, ccy)}
      </Text>

      {/* KWD equivalent + gain */}
      <View style={styles.detailRow}>
        <Text style={[styles.kwdValue, { color: colors.textSecondary }]}>
          ≈ {formatCurrency(data.market_value_kwd, "KWD")}
        </Text>
        {gain !== 0 && (
          <Text style={[styles.gain, { color: pnlColor(gain, colors) }]}>
            {formatSignedCurrency(gain, "KWD")}
          </Text>
        )}
      </View>

      {/* Holdings count */}
      {data.holding_count != null && (
        <Text style={[styles.holdingCount, { color: colors.textMuted }]}>
          {data.holding_count} holding{data.holding_count !== 1 ? "s" : ""}
        </Text>
      )}
    </View>
  );

  if (onPress) {
    return (
      <Pressable
        onPress={onPress}
        style={({ pressed }) => ({ opacity: pressed ? 0.8 : 1 })}
      >
        {content}
      </Pressable>
    );
  }

  return content;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: 12,
    marginBottom: 12,
    borderWidth: 1,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 6,
  },
  name: {
    fontSize: 17,
    fontWeight: "700",
  },
  currency: {
    fontSize: 12,
  },
  value: {
    fontSize: 20,
    fontWeight: "600",
  },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginTop: 4,
  },
  kwdValue: {
    fontSize: 13,
  },
  gain: {
    fontSize: 13,
    fontWeight: "600",
  },
  holdingCount: {
    fontSize: 11,
    marginTop: 6,
  },
});
