/**
 * DecisionPanel — actionable buy / hold / sell insight card
 * for the Fundamental Analysis tab.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useMemo } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { FAPanelSkeleton } from "@/components/ui/PageSkeletons";
import type { ThemePalette } from "@/constants/theme";
import { useHoldings, useStockScore, useValuations } from "@/hooks/queries";
import { generateDecisionInsight, type Recommendation } from "@/lib/decisionEngine";
import { useUserPrefsStore } from "@/src/store/userPrefsStore";
import type { PanelWithSymbolProps } from "../types";
import { Card, FadeIn, NetworkErrorState, SectionHeader } from "./shared";

// ── Helpers ───────────────────────────────────────────────────────

function recColor(rec: Recommendation, colors: ThemePalette): string {
  switch (rec) {
    case "strong_buy":  return colors.success;
    case "buy":         return "#34d399";
    case "hold":        return colors.warning;
    case "sell":        return "#f87171";
    case "strong_sell": return colors.danger;
  }
}

function recIcon(rec: Recommendation): React.ComponentProps<typeof FontAwesome>["name"] {
  switch (rec) {
    case "strong_buy":  return "chevron-circle-up";
    case "buy":         return "arrow-circle-up";
    case "hold":        return "minus-circle";
    case "sell":        return "arrow-circle-down";
    case "strong_sell": return "chevron-circle-down";
  }
}

function recLabel(rec: Recommendation): string {
  switch (rec) {
    case "strong_buy":  return "STRONG BUY";
    case "buy":         return "BUY";
    case "hold":        return "HOLD";
    case "sell":        return "SELL";
    case "strong_sell": return "STRONG SELL";
  }
}

function horizonLabel(h: "short" | "medium" | "long"): string {
  switch (h) {
    case "short":  return "0–3 months";
    case "medium": return "3–12 months";
    case "long":   return "12+ months";
  }
}

// ── Component ─────────────────────────────────────────────────────

export const DecisionPanel = React.memo(function DecisionPanel({
  stockId,
  stockSymbol,
  colors,
  isDesktop,
}: PanelWithSymbolProps) {
  const { data: score, isLoading, isError, error, refetch, isFetching } = useStockScore(stockId);
  const valuationsQ = useValuations(stockId);
  const holdingsQ = useHoldings();
  const preferences = useUserPrefsStore((s) => s.preferences);
  const isBeginner = preferences.expertiseLevel === "normal";

  const valuations = valuationsQ.data?.valuations ?? [];

  // Average IV across models (same logic as ScorePanel)
  const avgIV = useMemo(() => {
    const map: Record<string, number> = {};
    for (const v of valuations) {
      if (v.intrinsic_value != null && !map[v.model_type]) {
        map[v.model_type] = v.intrinsic_value;
      }
    }
    const models = Object.values(map);
    return models.length > 0 ? models.reduce((s, x) => s + x, 0) / models.length : null;
  }, [valuations]);

  const currentPrice = score?.details?.["Current Price"] ?? 0;
  const hasPosition = (holdingsQ.data?.holdings ?? []).some(
    (h) => h.symbol.toUpperCase() === stockSymbol.toUpperCase(),
  );

  const insight = useMemo(
    () =>
      generateDecisionInsight(
        stockSymbol,
        currentPrice,
        avgIV,
        score ?? null,
        hasPosition,
        preferences,
      ),
    [stockSymbol, currentPrice, avgIV, score, hasPosition, preferences],
  );

  // ── Loading / Error ──────────────────────────────────────────
  if (isLoading) return <FAPanelSkeleton />;
  if (isError) return <NetworkErrorState error={error as Error} onRetry={refetch} colors={colors} />;
  if (!score || score.overall_score == null)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", padding: 32 }}>
        <FontAwesome name="flask" size={32} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, fontSize: 14, marginTop: 12, textAlign: "center" }}>
          Score this stock first to get a recommendation.
        </Text>
      </View>
    );

  const color = recColor(insight.recommendation, colors);
  const icon = recIcon(insight.recommendation);
  const upside = avgIV && currentPrice > 0 ? ((avgIV - currentPrice) / currentPrice) * 100 : 0;

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={{ padding: isDesktop ? 24 : 16, paddingBottom: 40 }}
      refreshControl={<RefreshControl refreshing={isFetching} onRefresh={refetch} tintColor={colors.accentPrimary} />}
    >
      <FadeIn>
        {/* ── Recommendation Badge ─────────────────────────── */}
        <Card colors={colors}>
          <View style={{ alignItems: "center", paddingVertical: 8 }}>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                backgroundColor: color + "18",
                paddingHorizontal: 20,
                paddingVertical: 10,
                borderRadius: 24,
                gap: 10,
              }}
            >
              <FontAwesome name={icon} size={22} color={color} />
              <Text style={{ color, fontSize: 18, fontWeight: "800", letterSpacing: 0.5 }}>
                {recLabel(insight.recommendation)}
              </Text>
            </View>
            <Text
              style={{
                color: colors.textPrimary,
                fontSize: 15,
                fontWeight: "600",
                marginTop: 10,
                textAlign: "center",
              }}
            >
              {insight.headline}
            </Text>

            {/* Confidence bar */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10 }}>
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600" }}>
                Confidence
              </Text>
              <View
                style={{
                  width: 100,
                  height: 6,
                  borderRadius: 3,
                  backgroundColor: colors.borderColor,
                  overflow: "hidden",
                }}
              >
                <View
                  style={{
                    width: `${insight.confidence}%`,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: color,
                  }}
                />
              </View>
              <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "700" }}>
                {insight.confidence}%
              </Text>
            </View>

            {/* Time Horizon */}
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
                marginTop: 8,
                backgroundColor: colors.bgPrimary,
                paddingHorizontal: 12,
                paddingVertical: 5,
                borderRadius: 12,
              }}
            >
              <FontAwesome name="clock-o" size={11} color={colors.textMuted} />
              <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600" }}>
                Horizon: {horizonLabel(insight.timeHorizon)}
              </Text>
            </View>
          </View>
        </Card>

        {/* ── Price vs Fair Value ──────────────────────────── */}
        {avgIV != null && currentPrice > 0 && (
          <Card colors={colors} style={{ marginTop: 12 }}>
            <SectionHeader title="Valuation Gap" icon="balance-scale" iconColor={colors.accentSecondary} colors={colors} />
            <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 8 }}>
              <View style={{ alignItems: "center", flex: 1 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600" }}>Current Price</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "800", marginTop: 4 }}>
                  {currentPrice.toFixed(3)}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 10 }}>KWD</Text>
              </View>
              <View style={{ alignItems: "center", justifyContent: "center" }}>
                <FontAwesome
                  name={upside >= 0 ? "long-arrow-right" : "long-arrow-left"}
                  size={20}
                  color={upside >= 0 ? colors.success : colors.danger}
                />
                <Text
                  style={{
                    color: upside >= 0 ? colors.success : colors.danger,
                    fontSize: 13,
                    fontWeight: "800",
                    marginTop: 2,
                  }}
                >
                  {upside > 0 ? "+" : ""}
                  {upside.toFixed(1)}%
                </Text>
              </View>
              <View style={{ alignItems: "center", flex: 1 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600" }}>Fair Value</Text>
                <Text style={{ color: colors.success, fontSize: 18, fontWeight: "800", marginTop: 4 }}>
                  {avgIV.toFixed(3)}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 10 }}>KWD</Text>
              </View>
            </View>
          </Card>
        )}

        {/* ── Why? (Reasons) ──────────────────────────────── */}
        {insight.reasons.length > 0 && (
          <Card colors={colors} style={{ marginTop: 12 }}>
            <SectionHeader
              title={isBeginner ? "Why This Rating?" : "Analysis Summary"}
              icon="lightbulb-o"
              iconColor="#f59e0b"
              colors={colors}
            />
            {insight.reasons.map((reason, idx) => (
              <View key={idx} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 8 }}>
                <FontAwesome name="check-circle" size={14} color={colors.accentPrimary} style={{ marginTop: 2 }} />
                <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 13, lineHeight: 20 }}>
                  {reason}
                </Text>
              </View>
            ))}
          </Card>
        )}

        {/* ── What To Do (Actions) ────────────────────────── */}
        {insight.actionSteps.length > 0 && (
          <Card colors={colors} style={{ marginTop: 12 }}>
            <SectionHeader
              title={isBeginner ? "What Should I Do?" : "Actionable Steps"}
              icon="map-signs"
              iconColor={colors.accentPrimary}
              colors={colors}
            />
            {insight.actionSteps.map((step, idx) => (
              <View key={idx} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 8 }}>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    backgroundColor: colors.accentPrimary + "18",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Text style={{ color: colors.accentPrimary, fontSize: 11, fontWeight: "800" }}>{idx + 1}</Text>
                </View>
                <Text style={{ flex: 1, color: colors.textPrimary, fontSize: 13, lineHeight: 20 }}>
                  {step}
                </Text>
              </View>
            ))}
          </Card>
        )}

        {/* ── Risk Warnings ───────────────────────────────── */}
        {insight.riskWarnings.length > 0 && (
          <Card colors={colors} style={{ marginTop: 12 }}>
            <View style={{ backgroundColor: colors.danger + "08", borderRadius: 8, padding: 12 }}>
              <SectionHeader title="Risk Warnings" icon="exclamation-triangle" iconColor={colors.danger} colors={colors} />
              {insight.riskWarnings.map((warning, idx) => (
                <View key={idx} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 8 }}>
                  <FontAwesome name="warning" size={13} color={colors.danger} style={{ marginTop: 2 }} />
                  <Text style={{ flex: 1, color: colors.danger, fontSize: 13, lineHeight: 20 }}>
                    {warning}
                  </Text>
                </View>
              ))}
            </View>
          </Card>
        )}

        {/* ── Score Snapshot (compact) ─────────────────────── */}
        <Card colors={colors} style={{ marginTop: 12 }}>
          <SectionHeader title="Score Snapshot" icon="star" iconColor="#f59e0b" colors={colors} />
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 }}>
            {[
              { label: "Overall", value: score.overall_score, color: colors.accentPrimary },
              { label: "Fundamental", value: score.fundamental_score, color: "#10b981" },
              { label: "Quality", value: score.quality_score, color: "#3b82f6" },
              { label: "Growth", value: score.growth_score, color: "#f97316" },
              { label: "Valuation", value: score.valuation_score, color: "#6366f1" },
              { label: "Risk", value: score.risk_score, color: colors.danger },
            ].map(({ label, value, color: c }) => (
              <View
                key={label}
                style={{
                  flex: 1,
                  minWidth: isDesktop ? 80 : 90,
                  alignItems: "center",
                  backgroundColor: c + "10",
                  paddingVertical: 10,
                  borderRadius: 10,
                }}
              >
                <Text style={{ color: c, fontSize: 20, fontWeight: "800" }}>
                  {value?.toFixed(0) ?? "–"}
                </Text>
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600", marginTop: 2 }}>
                  {label}
                </Text>
              </View>
            ))}
          </View>
        </Card>

        {/* ── Position Context ─────────────────────────────── */}
        {hasPosition && (
          <Card colors={colors} style={{ marginTop: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <FontAwesome name="briefcase" size={14} color={colors.accentPrimary} />
              <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>
                You own {stockSymbol} in your portfolio
              </Text>
            </View>
          </Card>
        )}

        {/* ── Disclaimer ──────────────────────────────────── */}
        <View style={{ marginTop: 16, paddingHorizontal: 4 }}>
          <Text
            style={{
              color: colors.textMuted,
              fontSize: 10,
              fontStyle: "italic",
              textAlign: "center",
              lineHeight: 16,
            }}
          >
            {isBeginner
              ? "💡 This is analysis, not financial advice. Always do your own research before investing."
              : "Disclaimer: Algorithmic analysis based on available financial data. Not investment advice."}
          </Text>
        </View>
      </FadeIn>
    </ScrollView>
  );
});
