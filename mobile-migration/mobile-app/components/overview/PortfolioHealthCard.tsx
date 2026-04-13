/**
 * PortfolioHealthCard — simple, beginner-friendly summary of portfolio health.
 *
 * Shows:
 *  • Overall status (Healthy / Needs Attention / At Risk)
 *  • Diversification assessment
 *  • Cash position alert
 *  • CTA to Fundamental Analysis
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React, { useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, Text, View } from "react-native";

import type { ThemePalette } from "@/constants/theme";
import type { Holding } from "@/services/api";

// ── Types ───────────────────────────────────────────────────────

type HealthStatus = "healthy" | "attention" | "at_risk";

interface HealthItem {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  detail: string;
  status: HealthStatus;
}

// ── Props ───────────────────────────────────────────────────────

interface PortfolioHealthCardProps {
  colors: ThemePalette;
  totalValue: number;
  cashBalance: number;
  holdings: Holding[];
  roiPct: number;
  isBeginner: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────

function statusColor(s: HealthStatus, colors: ThemePalette): string {
  switch (s) {
    case "healthy":   return colors.success;
    case "attention": return colors.warning;
    case "at_risk":   return colors.danger;
  }
}

function statusIcon(s: HealthStatus): React.ComponentProps<typeof FontAwesome>["name"] {
  switch (s) {
    case "healthy":   return "check-circle";
    case "attention": return "exclamation-circle";
    case "at_risk":   return "times-circle";
  }
}

function statusLabel(s: HealthStatus, t: (key: string) => string): string {
  switch (s) {
    case "healthy":   return t("portfolioHealth.healthy");
    case "attention": return t("portfolioHealth.needsAttention");
    case "at_risk":   return t("portfolioHealth.atRisk");
  }
}

// ── Component ───────────────────────────────────────────────────

export function PortfolioHealthCard({
  colors,
  totalValue,
  cashBalance,
  holdings,
  roiPct,
  isBeginner,
}: PortfolioHealthCardProps) {
  const router = useRouter();
  const { t } = useTranslation();

  const items = useMemo<HealthItem[]>(() => {
    const result: HealthItem[] = [];

    // ── Diversification ─────────────────────────────────────
    const count = holdings.length;
    const maxWeight = holdings.reduce((m, h) => Math.max(m, h.allocation_pct ?? 0), 0);

    if (count >= 5 && maxWeight < 30) {
      result.push({
        icon: "pie-chart",
        label: "Diversification",
        detail: isBeginner
          ? "Well diversified across multiple stocks"
          : `${count} holdings, top weight ${maxWeight.toFixed(0)}%`,
        status: "healthy",
      });
    } else if (count >= 3 && maxWeight < 50) {
      result.push({
        icon: "pie-chart",
        label: "Diversification",
        detail: isBeginner
          ? "Somewhat concentrated — consider adding more stocks"
          : `${count} holdings, top weight ${maxWeight.toFixed(0)}% — moderate concentration`,
        status: "attention",
      });
    } else {
      result.push({
        icon: "pie-chart",
        label: "Diversification",
        detail: isBeginner
          ? "Too concentrated — try spreading across more stocks"
          : `${count} holding${count !== 1 ? "s" : ""}, top weight ${maxWeight.toFixed(0)}% — high risk`,
        status: count === 0 ? "attention" : "at_risk",
      });
    }

    // ── Cash Position ───────────────────────────────────────
    const cashPct = totalValue > 0 ? (cashBalance / totalValue) * 100 : 0;

    if (cashPct > 40) {
      result.push({
        icon: "money",
        label: "Cash Position",
        detail: isBeginner
          ? `${cashPct.toFixed(0)}% in cash — consider investing some`
          : `${cashPct.toFixed(0)}% cash drag may reduce returns`,
        status: "attention",
      });
    } else if (cashPct < 5 && count > 0) {
      result.push({
        icon: "money",
        label: "Cash Position",
        detail: isBeginner
          ? "Very low cash — keep some for emergencies"
          : `${cashPct.toFixed(0)}% cash — limited liquidity buffer`,
        status: "attention",
      });
    } else {
      result.push({
        icon: "money",
        label: "Cash Position",
        detail: isBeginner
          ? `${cashPct.toFixed(0)}% cash — good balance`
          : `${cashPct.toFixed(0)}% cash allocation`,
        status: "healthy",
      });
    }

    // ── Overall ROI ────────────────────────────────────────
    if (roiPct > 5) {
      result.push({
        icon: "line-chart",
        label: t("portfolioHealth.returns"),
        detail: isBeginner
          ? t("portfolioHealth.growingNicely")
          : t("portfolioHealth.positiveTrajectory", { roi: roiPct.toFixed(1) }),
        status: "healthy",
      });
    } else if (roiPct >= -5) {
      result.push({
        icon: "line-chart",
        label: t("portfolioHealth.returns"),
        detail: isBeginner
          ? t("portfolioHealth.flatReturns")
          : t("portfolioHealth.nearBreakeven", { roi: roiPct.toFixed(1) }),
        status: "attention",
      });
    } else {
      result.push({
        icon: "line-chart",
        label: t("portfolioHealth.returns"),
        detail: isBeginner
          ? t("portfolioHealth.portfolioDown")
          : t("portfolioHealth.considerRebalancing", { roi: roiPct.toFixed(1) }),
        status: "at_risk",
      });
    }

    return result;
  }, [holdings, totalValue, cashBalance, roiPct, isBeginner, t]);

  // Overall status = worst of items
  const overallStatus: HealthStatus = items.some((i) => i.status === "at_risk")
    ? "at_risk"
    : items.some((i) => i.status === "attention")
      ? "attention"
      : "healthy";

  const overall = statusColor(overallStatus, colors);

  return (
    <View
      style={{
        backgroundColor: colors.bgCard,
        borderRadius: 14,
        borderWidth: 1,
        borderColor: colors.borderColor,
        padding: 16,
        shadowColor: colors.cardShadowColor,
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.1,
        shadowRadius: 4,
      }}
    >
      {/* ── Header ─────────────────────────────────────── */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <View
          style={{
            width: 36,
            height: 36,
            borderRadius: 18,
            backgroundColor: overall + "18",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <FontAwesome name={statusIcon(overallStatus)} size={18} color={overall} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}>
            {t("portfolioHealth.title")}
          </Text>
          <Text style={{ color: overall, fontSize: 12, fontWeight: "600", marginTop: 1 }}>
            {statusLabel(overallStatus, t)}
          </Text>
        </View>
      </View>

      {/* ── Health Items ───────────────────────────────── */}
      {items.map((item, idx) => {
        const c = statusColor(item.status, colors);
        return (
          <View
            key={idx}
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingVertical: 10,
              borderTopWidth: idx === 0 ? 1 : 0,
              borderBottomWidth: 1,
              borderColor: colors.borderColor + "60",
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                backgroundColor: c + "14",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <FontAwesome name={item.icon} size={13} color={c} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>
                {item.label}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 1, lineHeight: 17 }}>
                {item.detail}
              </Text>
            </View>
            <FontAwesome name={statusIcon(item.status)} size={14} color={c} />
          </View>
        );
      })}

      {/* ── CTA: Analyze Your Stocks ──────────────────── */}
      <Pressable
        onPress={() => router.push("/(tabs)/fundamental-analysis")}
        style={({ pressed }) => ({
          flexDirection: "row",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          marginTop: 14,
          paddingVertical: 12,
          borderRadius: 10,
          backgroundColor: pressed ? colors.accentPrimary : colors.accentPrimary + "E8",
        })}
        accessibilityRole="button"
        accessibilityLabel={t("portfolioHealth.analyzeStocks")}
      >
        <FontAwesome name="flask" size={14} color="#fff" />
        <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700" }}>
          {t("portfolioHealth.analyzeStocks")} →
        </Text>
      </Pressable>
    </View>
  );
}
