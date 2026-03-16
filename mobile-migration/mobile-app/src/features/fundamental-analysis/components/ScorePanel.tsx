/**
 * ScorePanel — CFA-based composite score display with sub-scores,
 * history, and underlying metrics.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { LoadingScreen } from "@/components/ui/LoadingScreen";
import type { ThemePalette } from "@/constants/theme";
import { useScoreHistory, useStockScore } from "@/hooks/queries";
import { exportCSV, exportExcel, exportPDF, TableData } from "@/lib/exportAnalysis";
import { st } from "../styles";
import type { PanelWithSymbolProps } from "../types";
import { formatMetricValue, scoreColor, scoreLabel } from "../utils";
import { Card, ExportBar, FadeIn, SectionHeader } from "./shared";

export function ScorePanel({ stockId, stockSymbol, colors, isDesktop }: PanelWithSymbolProps) {
  const { data, isLoading, refetch, isFetching } = useStockScore(stockId);
  const historyQ = useScoreHistory(stockId);

  const score = data;
  const scoreHistory = historyQ.data?.scores ?? [];

  const exportTables = useCallback((): TableData[] => {
    const tables: TableData[] = [];
    if (score && score.overall_score != null) {
      tables.push({
        title: "Score Summary",
        headers: ["Component", "Weight", "Score"],
        rows: [
          ["Overall", "100%", score.overall_score.toFixed(0)],
          ["Fundamental", "30%", score.fundamental_score?.toFixed(0) ?? "–"],
          ["Valuation", "25%", score.valuation_score?.toFixed(0) ?? "–"],
          ["Growth", "25%", score.growth_score?.toFixed(0) ?? "–"],
          ["Quality", "20%", score.quality_score?.toFixed(0) ?? "–"],
        ],
      });
    }
    if (scoreHistory.length > 0) {
      tables.push({
        title: "Score History",
        headers: ["Date", "Overall", "Fundamental", "Valuation", "Growth", "Quality"],
        rows: scoreHistory.map((sh) => [
          sh.scoring_date,
          sh.overall_score?.toFixed(0) ?? "–",
          sh.fundamental_score?.toFixed(0) ?? "–",
          sh.valuation_score?.toFixed(0) ?? "–",
          sh.growth_score?.toFixed(0) ?? "–",
          sh.quality_score?.toFixed(0) ?? "–",
        ]),
      });
    }
    if (score?.details && Object.keys(score.details).length > 0) {
      tables.push({
        title: "Underlying Metrics",
        headers: ["Metric", "Value"],
        rows: Object.entries(score.details).map(([name, val]) => [
          name,
          formatMetricValue(name, val as number),
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
                Fundamentals 30% · Valuation 25% · Growth 25% · Quality 20%
              </Text>
            </Card>
          </FadeIn>

          {/* Sub-scores */}
          <FadeIn delay={100}>
            <SectionHeader title="Sub-Scores" icon="sliders" iconColor={colors.accentSecondary} colors={colors} />
            <Card colors={colors} style={{ marginBottom: 16 }}>
              <ScoreBarPremium label="Fundamental" weight="30%" value={score.fundamental_score} colors={colors} iconColor="#10b981" />
              <ScoreBarPremium label="Valuation" weight="25%" value={score.valuation_score} colors={colors} iconColor="#6366f1" />
              <ScoreBarPremium label="Growth" weight="25%" value={score.growth_score} colors={colors} iconColor="#f97316" />
              <ScoreBarPremium label="Quality" weight="20%" value={score.quality_score} colors={colors} iconColor="#3b82f6" />
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
                  <Text style={[st.scoreHistCell, { width: 40, color: colors.textMuted }]}>F</Text>
                  <Text style={[st.scoreHistCell, { width: 40, color: colors.textMuted }]}>V</Text>
                  <Text style={[st.scoreHistCell, { width: 40, color: colors.textMuted }]}>G</Text>
                  <Text style={[st.scoreHistCell, { width: 40, color: colors.textMuted }]}>Q</Text>
                </View>
                {scoreHistory.map((sh, idx) => (
                  <View key={sh.id} style={[st.scoreHistRow, { backgroundColor: idx % 2 === 0 ? "transparent" : colors.bgPrimary + "30" }]}>
                    <Text style={[st.scoreHistCell, { flex: 1, color: colors.textSecondary }]}>{sh.scoring_date}</Text>
                    <Text style={[st.scoreHistCell, { width: 52, fontWeight: "800", color: scoreColor(sh.overall_score ?? 0, colors) }]}>
                      {sh.overall_score?.toFixed(0) ?? "–"}
                    </Text>
                    <Text style={[st.scoreHistCell, { width: 40, color: colors.textMuted }]}>{sh.fundamental_score?.toFixed(0) ?? "–"}</Text>
                    <Text style={[st.scoreHistCell, { width: 40, color: colors.textMuted }]}>{sh.valuation_score?.toFixed(0) ?? "–"}</Text>
                    <Text style={[st.scoreHistCell, { width: 40, color: colors.textMuted }]}>{sh.growth_score?.toFixed(0) ?? "–"}</Text>
                    <Text style={[st.scoreHistCell, { width: 40, color: colors.textMuted }]}>{sh.quality_score?.toFixed(0) ?? "–"}</Text>
                  </View>
                ))}
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
                    <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                      {formatMetricValue(name, val as number)}
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
}

/* ── ScoreBarPremium ───────────────────────────────────────────── */

function ScoreBarPremium({
  label, weight, value, colors, iconColor,
}: { label: string; weight: string; value: number | null | undefined; colors: ThemePalette; iconColor: string }) {
  const v = value ?? 0;
  const barColor = scoreColor(v, colors);
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={[st.rowBetween, { marginBottom: 6 }]}>
        <View style={st.rowCenter}>
          <View style={[st.sectionIcon, { backgroundColor: iconColor + "18", width: 22, height: 22 }]}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: iconColor }} />
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "500", marginLeft: 8 }}>{label}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 10, marginLeft: 4 }}>({weight})</Text>
        </View>
        <Text style={{ color: barColor, fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{v.toFixed(0)}</Text>
      </View>
      <View style={[st.scoreBarTrack, { backgroundColor: colors.borderColor + "50" }]}>
        <View style={[st.scoreBarFill, { width: `${Math.min(v, 100)}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}
