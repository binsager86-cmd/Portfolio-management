/**
 * MetricsPanel — Financial metric calculation and display
 * (historical table + grouped list views).
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { FAPanelSkeleton } from "@/components/ui/PageSkeletons";
import { useStatements, useStockMetrics } from "@/hooks/queries";
import { showErrorAlert } from "@/lib/errorHandling";
import { exportCSV, exportExcel, TableData } from "@/lib/exportAnalysis";
import { exportMetricsPdf, type MetricsCategoryData } from "@/lib/exportMetricsPdf";
import { calculateMetrics, StockMetric } from "@/services/api";
import { st } from "../styles";
import { CATEGORY_LABELS, type PanelWithSymbolProps } from "../types";
import { buildHistoricalMetrics, enrichMetricsWithFallbacks, formatMetricValue } from "../utils";
import { ActionButton, Card, Chip, ExportBar, FadeIn, SectionHeader } from "./shared";

export function MetricsPanel({ stockId, stockSymbol, colors, isDesktop }: PanelWithSymbolProps) {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"historical" | "grouped">("historical");
  const [calcAllRunning, setCalcAllRunning] = useState(false);

  const stmtQ = useStatements(stockId);
  const periods = useMemo(() => {
    const seen = new Set<string>();
    return (stmtQ.data?.statements ?? [])
      .filter((s) => { if (seen.has(s.period_end_date)) return false; seen.add(s.period_end_date); return true; })
      .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date))
      .map((s) => ({ period_end_date: s.period_end_date, fiscal_year: s.fiscal_year, fiscal_quarter: s.fiscal_quarter }));
  }, [stmtQ.data]);

  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const { data, isLoading, refetch, isFetching } = useStockMetrics(stockId);

  const calcMut = useMutation({
    mutationFn: (p: { period_end_date: string; fiscal_year: number; fiscal_quarter?: number }) => calculateMetrics(stockId, p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["analysis-metrics", stockId] }),
    onError: (err: Error) => showErrorAlert("Calculation Failed", err),
  });

  const handleCalculateAll = async () => {
    if (periods.length === 0) return;
    setCalcAllRunning(true);
    const results = await Promise.allSettled(
      periods.map((p) =>
        calculateMetrics(stockId, {
          period_end_date: p.period_end_date,
          fiscal_year: p.fiscal_year,
          fiscal_quarter: p.fiscal_quarter ?? undefined,
        })
      )
    );
    const failed = results.filter((r) => r.status === "rejected").length;
    if (failed > 0) {
      showErrorAlert("Partial Failure", new Error(`${failed}/${periods.length} period calculations failed.`));
    }
    queryClient.invalidateQueries({ queryKey: ["analysis-metrics", stockId] });
    setCalcAllRunning(false);
  };

  const serverGrouped = data?.grouped ?? {};
  const rawMetrics = data?.metrics ?? [];
  const statements = stmtQ.data?.statements ?? [];

  // Enrich with CFA-level fallback calculations for missing valuation metrics
  const allMetrics = useMemo(
    () => enrichMetricsWithFallbacks(rawMetrics, statements),
    [rawMetrics, statements],
  );

  // Rebuild grouped map to include computed fallback metrics
  const grouped = useMemo(() => {
    const g: Record<string, StockMetric[]> = { ...serverGrouped };
    for (const m of allMetrics) {
      if (m.id < 0) { // synthetic / computed
        if (!g[m.metric_type]) g[m.metric_type] = [];
        g[m.metric_type] = [...(g[m.metric_type] ?? []), m];
      }
    }
    return g;
  }, [serverGrouped, allMetrics]);

  const categories = Object.keys(grouped);
  const historicalCategories = useMemo(() => buildHistoricalMetrics(allMetrics), [allMetrics]);

  const exportTables = useCallback((): TableData[] => {
    return Object.entries(historicalCategories).map(([cat, { metricNames, yearData, years }]) => {
      const catLabel = CATEGORY_LABELS[cat]?.label ?? cat;
      return {
        title: catLabel,
        headers: ["Metric", ...years.map((yr) => `FY${yr}`)],
        rows: metricNames.map((name) => [
          name,
          ...years.map((yr) => {
            const val = yearData[yr]?.[name];
            return val != null ? formatMetricValue(name, val) : null;
          }),
        ]),
      };
    });
  }, [historicalCategories]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[st.listContent, isDesktop && { maxWidth: 960, alignSelf: "center", width: "100%" }]}
      refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}
    >
      {/* Calculate section */}
      <FadeIn>
        <Card colors={colors} style={{ marginBottom: 16 }}>
          <SectionHeader title="Calculate Metrics" icon="cogs" iconColor={colors.accentSecondary} colors={colors} />
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, marginBottom: 10 }}>
            Select a period or calculate all at once from uploaded statements.
          </Text>

          {periods.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {periods.map((p) => (
                <Chip
                  key={p.period_end_date}
                  label={`FY${p.fiscal_year}${p.fiscal_quarter ? ` Q${p.fiscal_quarter}` : ""}`}
                  active={selectedPeriod === p.period_end_date}
                  onPress={() => setSelectedPeriod(p.period_end_date)}
                  colors={colors}
                />
              ))}
            </ScrollView>
          )}

          <View style={{ flexDirection: "row", gap: 8 }}>
            <ActionButton
              label={calcMut.isPending ? "Calculating..." : "Calculate Selected"}
              onPress={() => {
                const p = periods.find((x) => x.period_end_date === selectedPeriod);
                if (p) calcMut.mutate({ period_end_date: p.period_end_date, fiscal_year: p.fiscal_year, fiscal_quarter: p.fiscal_quarter ?? undefined });
              }}
              colors={colors}
              variant="primary"
              disabled={!selectedPeriod}
              loading={calcMut.isPending}
              icon="calculator"
              flex={1}
            />
            <ActionButton
              label={calcAllRunning ? "Running..." : "Calculate All"}
              onPress={handleCalculateAll}
              colors={colors}
              variant="success"
              disabled={periods.length === 0}
              loading={calcAllRunning}
              icon="refresh"
              flex={1}
            />
          </View>
        </Card>
      </FadeIn>

      {isLoading ? (
        <FAPanelSkeleton />
      ) : categories.length === 0 ? (
        <View style={st.empty}>
          <View style={[st.emptyIcon, { backgroundColor: colors.accentPrimary + "10" }]}>
            <FontAwesome name="bar-chart" size={32} color={colors.accentPrimary} />
          </View>
          <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>No metrics yet</Text>
          <Text style={[st.emptySubtitle, { color: colors.textMuted, textAlign: "center" }]}>
            Upload statements and calculate metrics above.
          </Text>
        </View>
      ) : (
        <>
          {/* View toggle */}
          <View style={{ flexDirection: "row", marginBottom: 14, gap: 8, alignItems: "center", zIndex: 50, overflow: "visible" as const }}>
            <Chip label="Historical Table" active={viewMode === "historical"} onPress={() => setViewMode("historical")} colors={colors} icon="table" />
            <Chip label="Grouped List" active={viewMode === "grouped"} onPress={() => setViewMode("grouped")} colors={colors} icon="list-ul" />
            <View style={{ flex: 1 }} />
            <ExportBar
              onExport={async (fmt) => {
                if (fmt === "pdf") {
                  const pdfCats: Record<string, MetricsCategoryData> = {};
                  for (const [cat, { metricNames, yearData, years }] of Object.entries(historicalCategories)) {
                    const catInfo = CATEGORY_LABELS[cat] ?? { label: cat, color: "#6366f1" };
                    pdfCats[cat] = { label: catInfo.label, color: catInfo.color, metricNames, yearData, years };
                  }
                  await exportMetricsPdf(pdfCats, stockSymbol, allMetrics.length);
                } else {
                  const t = exportTables();
                  if (fmt === "xlsx") await exportExcel(t, stockSymbol, "Metrics");
                  else await exportCSV(t, stockSymbol, "Metrics");
                }
              }}
              colors={colors}
            />
          </View>

          {viewMode === "historical" ? (
            Object.entries(historicalCategories).map(([cat, { metricNames, yearData, years }], idx) => {
              const catInfo = CATEGORY_LABELS[cat] ?? { label: cat, icon: "circle" as const, color: "#6366f1" };
              return (
                <FadeIn key={cat} delay={idx * 60}>
                  <SectionHeader title={catInfo.label} icon={catInfo.icon} iconColor={catInfo.color} badge={metricNames.length} colors={colors} />
                  <ScrollView horizontal showsHorizontalScrollIndicator style={{ marginBottom: 16 }}>
                    <Card colors={colors} noPadding>
                      {/* Header */}
                      <View style={[st.metricTableHeader, { borderBottomColor: colors.borderColor }]}>
                        <Text style={[st.metricTableNameCell, { color: colors.textPrimary, fontWeight: "800" }]}>Metric</Text>
                        {years.map((yr) => (
                          <Text key={yr} style={[st.metricTableValCell, { color: colors.textPrimary, fontWeight: "800" }]}>FY{yr}</Text>
                        ))}
                      </View>
                      {/* Rows */}
                      {metricNames.map((name, ri) => (
                        <View key={name} style={[st.metricTableRow, { backgroundColor: ri % 2 === 0 ? "transparent" : colors.bgPrimary + "30" }]}>
                          <Text numberOfLines={1} style={[st.metricTableNameCell, { color: colors.textSecondary }]}>{name}</Text>
                          {years.map((yr) => {
                            const val = yearData[yr]?.[name];
                            return (
                              <Text key={yr} style={[st.metricTableValCell, {
                                color: val != null ? colors.textPrimary : colors.textMuted,
                                fontWeight: val != null ? "600" : "400",
                              }]}>
                                {val != null ? formatMetricValue(name, val) : "–"}
                              </Text>
                            );
                          })}
                        </View>
                      ))}
                    </Card>
                  </ScrollView>
                </FadeIn>
              );
            })
          ) : (
            categories.map((cat, idx) => {
              const catInfo = CATEGORY_LABELS[cat] ?? { label: cat, icon: "circle" as const, color: "#6366f1" };
              return (
                <FadeIn key={cat} delay={idx * 50}>
                  <SectionHeader title={catInfo.label} icon={catInfo.icon} iconColor={catInfo.color} colors={colors} />
                  <Card colors={colors} style={{ marginBottom: 14 }}>
                    {grouped[cat].map((m: StockMetric, mi: number) => (
                      <View key={m.id} style={[st.metricRow, mi < grouped[cat].length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderColor + "40" }]}>
                        <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13 }}>{m.metric_name}</Text>
                        <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                          {formatMetricValue(m.metric_name, m.metric_value)}
                        </Text>
                        <View style={[st.tagPill, { backgroundColor: colors.bgInput, marginLeft: 8 }]}>
                          <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: "600" }}>{m.period_end_date}</Text>
                        </View>
                      </View>
                    ))}
                  </Card>
                </FadeIn>
              );
            })
          )}
        </>
      )}
    </ScrollView>
  );
}
