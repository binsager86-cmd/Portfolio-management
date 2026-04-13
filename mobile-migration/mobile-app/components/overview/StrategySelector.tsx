/**
 * StrategySelector — "Choose your strategy" card with alignment scoring.
 *
 * Shows strategy templates (Dividend/Growth/Islamic) with:
 *  - Emoji + name + description
 *  - Alignment score bar for current portfolio
 *  - "Activate" action that applies filters in userPrefsStore
 *
 * Beginner mode: simplified labels, no jargon.
 */

import type { ThemePalette } from "@/constants/theme";
import { useHoldings, usePortfolioOverview } from "@/hooks/queries";
import { useAuth } from "@/hooks/useAuth";
import { analytics } from "@/lib/analytics";
import {
    getStrategies,
    scoreAlignment,
    type StrategyId,
    type StrategyTemplate,
} from "@/lib/strategies";
import { useThemeStore } from "@/services/themeStore";
import { useUserPrefsStore } from "@/src/store/userPrefsStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { I18nManager, Pressable, StyleSheet, Text, View } from "react-native";

// ── Helpers ─────────────────────────────────────────────────────────

function scoreColor(score: number, colors: ThemePalette): string {
  if (score >= 70) return colors.success;
  if (score >= 40) return colors.warning;
  return colors.danger;
}

// ── Component ───────────────────────────────────────────────────────

interface Props {
  onSelect?: (strategy: StrategyId) => void;
}

export function StrategySelector({ onSelect }: Props) {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const { user } = useAuth();
  const expertiseLevel = useUserPrefsStore((s) => s.preferences.expertiseLevel);
  const setShariaFilter = useUserPrefsStore((s) => s.toggleShariaFilter);
  const setDividendFocus = useUserPrefsStore((s) => s.toggleDividendFocus);
  const enableShariaFilter = useUserPrefsStore((s) => s.preferences.enableShariaFilter);
  const dividendFocus = useUserPrefsStore((s) => s.preferences.dividendFocus);
  const isRTL = I18nManager.isRTL;

  const [activeId, setActiveId] = useState<StrategyId | null>(null);
  const [expandedId, setExpandedId] = useState<StrategyId | null>(null);

  const { data: holdingsResp } = useHoldings();
  const { data: overviewData } = usePortfolioOverview(user?.id);
  const holdings = holdingsResp?.holdings ?? [];

  const cashPct = useMemo(() => {
    if (!overviewData) return 0;
    const total = overviewData.total_value || 1;
    return ((overviewData.cash_balance || 0) / total) * 100;
  }, [overviewData]);

  const strategies = getStrategies();

  const scores = useMemo(() => {
    const map: Record<StrategyId, ReturnType<typeof scoreAlignment>> = {} as any;
    for (const s of strategies) {
      map[s.id] = scoreAlignment(s, holdings, cashPct);
    }
    return map;
  }, [strategies, holdings, cashPct]);

  const handleActivate = (strategy: StrategyTemplate) => {
    setActiveId(strategy.id);
    analytics.logEvent("strategy_selected", { strategy: strategy.id });

    // Apply relevant filters
    if (strategy.id === "islamic" && !enableShariaFilter) {
      setShariaFilter();
    }
    if (strategy.id === "dividend" && !dividendFocus) {
      setDividendFocus();
    }

    onSelect?.(strategy.id);
  };

  return (
    <View style={s.container}>
      <Text style={[s.sectionTitle, { color: colors.textSecondary }]}>
        {t("strategies.chooseStrategy")}
      </Text>

      {strategies.map((strategy) => {
        const score = scores[strategy.id];
        const isActive = activeId === strategy.id;
        const isExpanded = expandedId === strategy.id;

        return (
          <View
            key={strategy.id}
            style={[
              s.card,
              {
                backgroundColor: colors.bgCard,
                borderColor: isActive ? colors.accentPrimary : colors.borderColor,
                borderWidth: isActive ? 2 : 1,
              },
            ]}
          >
            {/* Header */}
            <Pressable
              onPress={() => setExpandedId(isExpanded ? null : strategy.id)}
              style={[s.cardHeader, { flexDirection: isRTL ? "row-reverse" : "row" }]}
              accessibilityRole="button"
              accessibilityLabel={t(strategy.nameKey)}
            >
              <Text style={s.emoji}>{strategy.emoji}</Text>
              <View style={[s.headerText, isRTL && { alignItems: "flex-end" }]}>
                <Text style={[s.strategyName, { color: colors.textPrimary }]}>
                  {t(strategy.nameKey)}
                </Text>
                <Text
                  style={[
                    s.strategyDesc,
                    { color: colors.textSecondary, textAlign: isRTL ? "right" : "left" },
                  ]}
                  numberOfLines={isExpanded ? undefined : 2}
                >
                  {t(strategy.descriptionKey)}
                </Text>
              </View>
              <FontAwesome
                name={isExpanded ? "chevron-up" : "chevron-down"}
                size={12}
                color={colors.textMuted}
              />
            </Pressable>

            {/* Alignment score bar */}
            {holdings.length > 0 && (
              <View style={s.scoreRow}>
                <Text style={[s.scoreLabel, { color: colors.textMuted }]}>
                  {t("strategies.alignment")}
                </Text>
                <View style={[s.scoreBarBg, { backgroundColor: colors.borderColor }]}>
                  <View
                    style={[
                      s.scoreBarFill,
                      {
                        backgroundColor: scoreColor(score.score, colors),
                        width: `${score.score}%`,
                      },
                    ]}
                  />
                </View>
                <Text style={[s.scoreValue, { color: scoreColor(score.score, colors) }]}>
                  {score.score}%
                </Text>
              </View>
            )}

            {/* Expanded details */}
            {isExpanded && (
              <View style={s.details}>
                {/* Allocation targets */}
                <Text style={[s.detailLabel, { color: colors.textSecondary }]}>
                  {t("strategies.targetAllocation")}
                </Text>
                {strategy.allocations.map((alloc) => (
                  <View
                    key={alloc.labelKey}
                    style={[s.allocRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}
                  >
                    <Text style={s.allocEmoji}>{alloc.emoji}</Text>
                    <Text style={[s.allocLabel, { color: colors.textPrimary }]}>
                      {t(alloc.labelKey)}
                    </Text>
                    <Text style={[s.allocPct, { color: colors.accentPrimary }]}>
                      {alloc.targetPct}%
                    </Text>
                  </View>
                ))}

                {/* Strengths & improvements */}
                {score.strengths.length > 0 && (
                  <View style={s.feedbackSection}>
                    {score.strengths.map((fb, i) => (
                      <View key={i} style={[s.feedbackRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                        <Text style={[s.feedbackIcon, { color: colors.success }]}>✓</Text>
                        <Text style={[s.feedbackText, { color: colors.textSecondary }]}>{t(fb.key, fb.params)}</Text>
                      </View>
                    ))}
                  </View>
                )}
                {score.improvements.length > 0 && (
                  <View style={s.feedbackSection}>
                    {score.improvements.map((fb, i) => (
                      <View key={i} style={[s.feedbackRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                        <Text style={[s.feedbackIcon, { color: colors.warning }]}>→</Text>
                        <Text style={[s.feedbackText, { color: colors.textSecondary }]}>{t(fb.key, fb.params)}</Text>
                      </View>
                    ))}
                  </View>
                )}

                {/* Activate button */}
                <Pressable
                  onPress={() => handleActivate(strategy)}
                  style={[
                    s.activateBtn,
                    {
                      backgroundColor: isActive
                        ? colors.success + "20"
                        : colors.accentPrimary + "15",
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityLabel={`Activate ${t(strategy.nameKey)} strategy`}
                >
                  <FontAwesome
                    name={isActive ? "check-circle" : "play-circle"}
                    size={16}
                    color={isActive ? colors.success : colors.accentPrimary}
                  />
                  <Text
                    style={[
                      s.activateLabel,
                      { color: isActive ? colors.success : colors.accentPrimary },
                    ]}
                  >
                    {isActive ? t("strategies.active") : t("strategies.activate")}
                  </Text>
                </Pressable>
              </View>
            )}
          </View>
        );
      })}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { gap: 12 },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 4,
  },
  card: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  cardHeader: {
    alignItems: "flex-start",
    gap: 10,
    padding: 14,
  },
  emoji: { fontSize: 28, marginTop: 2 },
  headerText: { flex: 1, gap: 4 },
  strategyName: { fontSize: 16, fontWeight: "700" },
  strategyDesc: { fontSize: 13, lineHeight: 18 },
  scoreRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingBottom: 12,
  },
  scoreLabel: { fontSize: 11, width: 65 },
  scoreBarBg: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    overflow: "hidden",
  },
  scoreBarFill: {
    height: "100%",
    borderRadius: 3,
  },
  scoreValue: { fontSize: 12, fontWeight: "700", width: 36, textAlign: "right" },
  details: {
    paddingHorizontal: 14,
    paddingBottom: 14,
    gap: 10,
  },
  detailLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  allocRow: {
    alignItems: "center",
    gap: 8,
    paddingVertical: 4,
  },
  allocEmoji: { fontSize: 14 },
  allocLabel: { flex: 1, fontSize: 13 },
  allocPct: { fontSize: 13, fontWeight: "700" },
  feedbackSection: { gap: 4, marginTop: 4 },
  feedbackRow: { alignItems: "flex-start", gap: 6 },
  feedbackIcon: { fontSize: 13, fontWeight: "700", marginTop: 1 },
  feedbackText: { flex: 1, fontSize: 12, lineHeight: 16 },
  activateBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 4,
  },
  activateLabel: { fontSize: 14, fontWeight: "600" },
});
