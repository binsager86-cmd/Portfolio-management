/**
 * ScorePanel — CFA-based composite score display with sub-scores,
 * history, and underlying metrics.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { FlashList } from "@shopify/flash-list";
import React, { useCallback, useState } from "react";
import { Pressable, RefreshControl, ScrollView, Text, View } from "react-native";

import { LoadingScreen } from "@/components/ui/LoadingScreen";
import type { ThemePalette } from "@/constants/theme";
import { useScoreHistory, useStockScore } from "@/hooks/queries";
import { exportCSV, exportExcel, exportPDF, TableData } from "@/lib/exportAnalysis";
import type { CategoryBreakdown } from "@/services/api";
import { st } from "../styles";
import { SCORE_WEIGHTS, type PanelWithSymbolProps } from "../types";
import { formatScoreDate, INTERPRETATION_SCALE, safeFormatMetric, scoreColor, scoreLabel } from "../utils";
import { Card, ExportBar, FadeIn, NetworkErrorState, SectionHeader } from "./shared";

export const ScorePanel = React.memo(function ScorePanel({ stockId, stockSymbol, colors, isDesktop }: PanelWithSymbolProps) {
  const { data, isLoading, isError, error, refetch, isFetching } = useStockScore(stockId);
  const historyQ = useScoreHistory(stockId);

  const score = data;
  const scoreHistory = historyQ.data?.scores ?? [];

  const VIRTUALIZE_THRESHOLD = 20;

  const renderHistoryRow = useCallback(({ item: sh, index: idx }: { item: typeof scoreHistory[number]; index: number }) => (
    <View key={sh.id} style={[st.scoreHistRow, { backgroundColor: idx % 2 === 0 ? "transparent" : colors.bgPrimary + "30" }]}>
      <Text style={[st.scoreHistCell, { flex: 1, color: colors.textSecondary }]}>{formatScoreDate(sh.scoring_date)}</Text>
      <Text style={[st.scoreHistCell, { width: 52, fontWeight: "800", color: scoreColor(sh.overall_score ?? 0, colors) }]}>
        {sh.overall_score?.toFixed(0) ?? "–"}
      </Text>
      <Text style={[st.scoreHistCell, { width: 34, color: colors.textMuted }]}>{sh.fundamental_score?.toFixed(0) ?? "–"}</Text>
      <Text style={[st.scoreHistCell, { width: 34, color: colors.textMuted }]}>{sh.valuation_score?.toFixed(0) ?? "–"}</Text>
      <Text style={[st.scoreHistCell, { width: 34, color: colors.textMuted }]}>{sh.growth_score?.toFixed(0) ?? "–"}</Text>
      <Text style={[st.scoreHistCell, { width: 34, color: colors.textMuted }]}>{sh.quality_score?.toFixed(0) ?? "–"}</Text>
      <Text style={[st.scoreHistCell, { width: 34, color: colors.textMuted }]}>{sh.risk_score?.toFixed(0) ?? "–"}</Text>
    </View>
  ), [colors]);

  const exportTables = useCallback((): TableData[] => {
    const tables: TableData[] = [];
    if (score && score.overall_score != null) {
      tables.push({
        title: "Score Summary",
        headers: ["Component", "Weight", "Score"],
        rows: [
          ["Overall", "100%", score.overall_score.toFixed(0)],
          ["Fundamental", SCORE_WEIGHTS.FUNDAMENTAL.label, score.fundamental_score?.toFixed(0) ?? "–"],
          ["Quality", SCORE_WEIGHTS.QUALITY.label, score.quality_score?.toFixed(0) ?? "–"],
          ["Growth", SCORE_WEIGHTS.GROWTH.label, score.growth_score?.toFixed(0) ?? "–"],
          ["Valuation", SCORE_WEIGHTS.VALUATION.label, score.valuation_score?.toFixed(0) ?? "–"],
          ["Risk", SCORE_WEIGHTS.RISK.label, score.risk_score?.toFixed(0) ?? "–"],
        ],
      });
    }
    if (scoreHistory.length > 0) {
      tables.push({
        title: "Score History",
        headers: ["Date", "Overall", "Fundamental", "Valuation", "Growth", "Quality", "Risk"],
        rows: scoreHistory.map((sh) => [
          formatScoreDate(sh.scoring_date),
          sh.overall_score?.toFixed(0) ?? "–",
          sh.fundamental_score?.toFixed(0) ?? "–",
          sh.valuation_score?.toFixed(0) ?? "–",
          sh.growth_score?.toFixed(0) ?? "–",
          sh.quality_score?.toFixed(0) ?? "–",
          sh.risk_score?.toFixed(0) ?? "–",
        ]),
      });
    }
    if (score?.details && Object.keys(score.details).length > 0) {
      tables.push({
        title: "Underlying Metrics",
        headers: ["Metric", "Value"],
        rows: Object.entries(score.details).map(([name, val]) => [
          name,
          safeFormatMetric(name, val),
        ]),
      });
    }
    return tables;
  }, [score, scoreHistory]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[st.listContent, isDesktop && { maxWidth: 700, alignSelf: "center", width: "100%" }]}
      refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}
    >
      {isLoading ? (
        <LoadingScreen />
      ) : isError ? (
        <NetworkErrorState error={error} onRetry={refetch} colors={colors} />
      ) : !score || score.overall_score == null ? (
        <View style={st.empty}>
          <View style={[st.emptyIcon, { backgroundColor: colors.warning + "10" }]}>
            <FontAwesome name="star-o" size={32} color={colors.warning} />
          </View>
          <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>
            {score?.error ?? "No score available"}
          </Text>
          <Text style={[st.emptySubtitle, { color: colors.textMuted }]}>Calculate metrics first, then compute the score.</Text>
        </View>
      ) : (
        <>
          <View style={{ alignItems: "flex-end", marginBottom: 2 }}>
            <ExportBar
              onExport={async (fmt) => {
                const t = exportTables();
                if (fmt === "xlsx") await exportExcel(t, stockSymbol, "Score");
                else if (fmt === "csv") await exportCSV(t, stockSymbol, "Score");
                else await exportPDF(t, stockSymbol, "Score");
              }}
              colors={colors}
            />
          </View>

          {/* Overall Score */}
          <FadeIn>
            <Card colors={colors} style={{ alignItems: "center", paddingVertical: 28, marginBottom: 16 }}>
              <View style={[st.scoreRing, { borderColor: scoreColor(score.overall_score!, colors) }]}>
                <View style={[st.scoreRingInner, { backgroundColor: scoreColor(score.overall_score!, colors) + "10" }]}>
                  <Text style={[st.scoreNum, { color: scoreColor(score.overall_score!, colors) }]}>
                    {score.overall_score!.toFixed(0)}
                  </Text>
                </View>
              </View>
              <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "800", marginTop: 14 }}>
                {scoreLabel(score.overall_score!)}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6, textAlign: "center", lineHeight: 16 }}>
                CFA-Based Composite Score{"\n"}
                Fundamentals {SCORE_WEIGHTS.FUNDAMENTAL.label} · Quality {SCORE_WEIGHTS.QUALITY.label} · Growth {SCORE_WEIGHTS.GROWTH.label} · Valuation {SCORE_WEIGHTS.VALUATION.label} · Risk {SCORE_WEIGHTS.RISK.label}
              </Text>

              {/* Sector Percentile (when available from API) */}
              {score.sector_percentile != null && (
                <View style={{ marginTop: 10, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.borderColor + "40", alignItems: "center" }}>
                  <Text style={{ color: colors.accentSecondary, fontSize: 13, fontWeight: "700" }}>
                    Top {Math.max(1, 100 - Math.round(score.sector_percentile))}% in {score.sector_name ?? "Sector"}
                  </Text>
                  <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 2 }}>Peer-relative ranking</Text>
                </View>
              )}

              {/* Risk disclaimer */}
              <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 10, textAlign: "center", lineHeight: 14 }}>
                * Fundamental score only. Not risk-adjusted.{"\n"}
                Past performance ≠ future results.
              </Text>
            </Card>
          </FadeIn>

          {/* Interpretation Scale */}
          <FadeIn delay={50}>
            <Card colors={colors} style={{ marginBottom: 16, paddingVertical: 14, paddingHorizontal: 16 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700", marginBottom: 10 }}>
                Interpretation Scale
              </Text>
              {INTERPRETATION_SCALE.map((tier) => {
                const isActive = score.overall_score! >= tier.min && score.overall_score! <= tier.max;
                return (
                  <View
                    key={tier.min}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      paddingVertical: 5,
                      paddingHorizontal: 8,
                      borderRadius: 6,
                      backgroundColor: isActive ? tier.color + "18" : "transparent",
                      marginBottom: 2,
                    }}
                  >
                    <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: tier.color, marginRight: 10 }} />
                    <Text style={{ color: isActive ? tier.color : colors.textMuted, fontSize: 12, fontWeight: isActive ? "800" : "500", width: 52 }}>
                      {tier.min}–{tier.max}
                    </Text>
                    <Text style={{ color: isActive ? tier.color : colors.textMuted, fontSize: 12, fontWeight: isActive ? "700" : "400", flex: 1 }}>
                      {tier.label}
                    </Text>
                    {isActive && (
                      <FontAwesome name="chevron-left" size={10} color={tier.color} />
                    )}
                  </View>
                );
              })}
            </Card>
          </FadeIn>

          {/* Sub-scores */}
          <FadeIn delay={100}>
            <SectionHeader title="Sub-Scores" icon="sliders" iconColor={colors.accentSecondary} colors={colors} />
            <Card colors={colors} style={{ marginBottom: 16 }}>
              <ScoreBarPremium label="Fundamental" weight={SCORE_WEIGHTS.FUNDAMENTAL.label} value={score.fundamental_score} colors={colors} iconColor={SCORE_WEIGHTS.FUNDAMENTAL.iconColor} breakdown={score.score_breakdown?.fundamental} />
              <ScoreBarPremium label="Quality" weight={SCORE_WEIGHTS.QUALITY.label} value={score.quality_score} colors={colors} iconColor={SCORE_WEIGHTS.QUALITY.iconColor} breakdown={score.score_breakdown?.quality} />
              <ScoreBarPremium label="Growth" weight={SCORE_WEIGHTS.GROWTH.label} value={score.growth_score} colors={colors} iconColor={SCORE_WEIGHTS.GROWTH.iconColor} breakdown={score.score_breakdown?.growth} />
              <ScoreBarPremium label="Valuation" weight={SCORE_WEIGHTS.VALUATION.label} value={score.valuation_score} colors={colors} iconColor={SCORE_WEIGHTS.VALUATION.iconColor} breakdown={score.score_breakdown?.valuation} />
              <ScoreBarPremium label="Risk" weight={SCORE_WEIGHTS.RISK.label} value={score.risk_score} colors={colors} iconColor={SCORE_WEIGHTS.RISK.iconColor} breakdown={score.score_breakdown?.risk} />
            </Card>
          </FadeIn>

          {/* Score History */}
          {scoreHistory.length > 1 && (
            <FadeIn delay={200}>
              <SectionHeader title="Score History" icon="history" iconColor={colors.warning} badge={scoreHistory.length} colors={colors} />
              <Card colors={colors} noPadding style={{ marginBottom: 16 }}>
                {/* Header */}
                <View style={[st.scoreHistRow, { borderBottomWidth: 1, borderBottomColor: colors.borderColor, backgroundColor: colors.bgInput + "40" }]}>
                  <Text style={[st.scoreHistCell, { flex: 1, fontWeight: "800", color: colors.textPrimary }]}>Date</Text>
                  <Text style={[st.scoreHistCell, { width: 52, fontWeight: "800", color: colors.textPrimary }]}>Score</Text>
                  <Text style={[st.scoreHistCell, { width: 34, color: colors.textMuted }]}>F</Text>
                  <Text style={[st.scoreHistCell, { width: 34, color: colors.textMuted }]}>V</Text>
                  <Text style={[st.scoreHistCell, { width: 34, color: colors.textMuted }]}>G</Text>
                  <Text style={[st.scoreHistCell, { width: 34, color: colors.textMuted }]}>Q</Text>
                  <Text style={[st.scoreHistCell, { width: 34, color: colors.textMuted }]}>R</Text>
                </View>
                {scoreHistory.length > VIRTUALIZE_THRESHOLD ? (
                  <View style={{ height: Math.min(scoreHistory.length * 36, 400) }}>
                    <FlashList
                      data={scoreHistory}
                      renderItem={renderHistoryRow}
                      estimatedItemSize={36}
                      keyExtractor={(sh) => String(sh.id)}
                    />
                  </View>
                ) : (
                  scoreHistory.map((sh, idx) => renderHistoryRow({ item: sh, index: idx }))
                )}
              </Card>
            </FadeIn>
          )}

          {/* Underlying Metrics */}
          {score.details && Object.keys(score.details).length > 0 && (
            <FadeIn delay={300}>
              <SectionHeader title="Underlying Metrics" icon="list-ol" iconColor={colors.accentPrimary} badge={Object.keys(score.details).length} colors={colors} />
              <Card colors={colors}>
                {Object.entries(score.details).map(([name, val], idx, arr) => (
                  <View key={name} style={[st.metricRow, idx < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderColor + "30" }]}>
                    <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 12 }}>{name}</Text>
                    <Text
                      style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] }}
                      accessibilityLabel={`${name}: ${safeFormatMetric(name, val)}`}
                    >
                      {safeFormatMetric(name, val)}
                    </Text>
                  </View>
                ))}
              </Card>
            </FadeIn>
          )}
        </>
      )}
    </ScrollView>
  );
});

/* ── ScoreBarPremium (memoized) ─────────────────────────────────── */

interface ScoreBarPremiumProps {
  label: string;
  weight: string;
  value: number | null | undefined;
  colors: ThemePalette;
  iconColor: string;
  breakdown?: CategoryBreakdown;
}

const ScoreBarPremium = React.memo(function ScoreBarPremium({
  label, weight, value, colors, iconColor, breakdown,
}: ScoreBarPremiumProps) {
  const [expanded, setExpanded] = useState(false);
  const v = value ?? 0;
  const barColor = scoreColor(v, colors);
  return (
    <View style={{ marginBottom: 14 }} accessibilityRole="summary">
      <Pressable onPress={() => breakdown && setExpanded((p) => !p)} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
        <View style={[st.rowBetween, { marginBottom: 6 }]}>
          <View style={st.rowCenter}>
            <View style={[st.sectionIcon, { backgroundColor: iconColor + "18", width: 22, height: 22 }]}>
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: iconColor }} />
            </View>
            <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "500", marginLeft: 8 }}>{label}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 10, marginLeft: 4 }}>({weight})</Text>
            {breakdown && (
              <FontAwesome
                name={expanded ? "chevron-up" : "chevron-down"}
                size={10}
                color={colors.textMuted}
                style={{ marginLeft: 6 }}
              />
            )}
          </View>
          <Text
            style={{ color: barColor, fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"] }}
            accessibilityLabel={`${label} score: ${v.toFixed(0)} out of 100`}
          >
            {v.toFixed(0)}
          </Text>
        </View>
        <View style={[st.scoreBarTrack, { backgroundColor: colors.borderColor + "50" }]}>
          <View
            style={[st.scoreBarFill, { width: `${Math.min(v, 100)}%`, backgroundColor: barColor }]}
            accessibilityLabel={`${label} progress bar`}
            accessibilityValue={{ min: 0, max: 100, now: Math.round(v) }}
          />
        </View>
      </Pressable>

      {/* Expanded metric breakdown */}
      {expanded && breakdown && (
        <View style={{ marginTop: 8, marginLeft: 30, paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: iconColor + "40" }}>
          <Text style={{ color: colors.textMuted, fontSize: 10, marginBottom: 6 }}>Base: {breakdown.base} pts</Text>
          {breakdown.metrics.map((m) => {
            const ptsColor = m.points > 0 ? colors.success : m.points < 0 ? colors.danger : colors.textMuted;
            const ptsLabel = m.points > 0 ? `+${m.points}` : String(m.points);
            return (
              <View key={m.metric} style={{ flexDirection: "row", alignItems: "center", marginBottom: 5, minHeight: 22 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600" }}>{m.metric}</Text>
                  <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 1 }}>
                    {m.value != null ? safeFormatMetric(m.metric, m.value) : "—"} · {m.reason}
                  </Text>
                </View>
                <View style={{ backgroundColor: ptsColor + "18", borderRadius: 6, paddingHorizontal: 8, paddingVertical: 2, marginLeft: 8 }}>
                  <Text style={{ color: ptsColor, fontSize: 12, fontWeight: "800", fontVariant: ["tabular-nums"] }}>
                    {ptsLabel}
                  </Text>
                </View>
              </View>
            );
          })}
          <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 4, paddingTop: 4, borderTopWidth: 1, borderTopColor: colors.borderColor + "30" }}>
            <Text style={{ color: colors.textMuted, fontSize: 10 }}>Final (clamped 0–100)</Text>
            <Text style={{ color: barColor, fontSize: 12, fontWeight: "800" }}>{v.toFixed(0)}</Text>
          </View>
        </View>
      )}
    </View>
  );
});
