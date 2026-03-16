/**
 * GrowthPanel — Revenue / metric growth analysis with visual bars.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useGrowthAnalysis } from "@/hooks/queries";
import { exportCSV, exportExcel, exportPDF, TableData } from "@/lib/exportAnalysis";
import { st } from "../styles";
import { type GrowthEntry, type PanelWithSymbolProps } from "../types";
import { Card, ExportBar, FadeIn, SectionHeader } from "./shared";

export function GrowthPanel({ stockId, stockSymbol, colors, isDesktop }: PanelWithSymbolProps) {
  const { data, isLoading, refetch, isFetching } = useGrowthAnalysis(stockId);

  const growth: Record<string, GrowthEntry[]> = data?.growth ?? {};
  const labels = Object.keys(growth);

  const exportTables = useCallback((): TableData[] => {
    return labels.map((label) => ({
      title: label,
      headers: ["From Period", "To Period", "Growth %"],
      rows: (growth[label] ?? []).map((g: GrowthEntry) => [
        g.prev_period,
        g.period,
        `${g.growth >= 0 ? "+" : ""}${(g.growth * 100).toFixed(1)}%`,
      ]),
    }));
  }, [growth, labels]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[st.listContent, isDesktop && { maxWidth: 960, alignSelf: "center", width: "100%" }]}
      refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}
    >
      {isLoading ? (
        <LoadingScreen />
      ) : labels.length === 0 ? (
        <View style={st.empty}>
          <View style={[st.emptyIcon, { backgroundColor: colors.success + "10" }]}>
            <FontAwesome name="line-chart" size={32} color={colors.success} />
          </View>
          <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>Insufficient data</Text>
          <Text style={[st.emptySubtitle, { color: colors.textMuted }]}>Need at least 2 periods of financial statements.</Text>
        </View>
      ) : (
        <>
          <View style={{ alignItems: "flex-end", marginBottom: 2 }}>
            <ExportBar
              onExport={async (fmt) => {
                const t = exportTables();
                if (fmt === "xlsx") await exportExcel(t, stockSymbol, "Growth");
                else if (fmt === "csv") await exportCSV(t, stockSymbol, "Growth");
                else await exportPDF(t, stockSymbol, "Growth");
              }}
              colors={colors}
            />
          </View>
          {labels.map((label, idx) => (
            <FadeIn key={label} delay={idx * 60}>
              <SectionHeader title={label} icon="line-chart" iconColor={colors.success} colors={colors} badge={growth[label].length} />
              <Card colors={colors} style={{ marginBottom: 16 }}>
                {growth[label].map((g: GrowthEntry, i: number) => {
                  const pct = g.growth * 100;
                  const positive = g.growth >= 0;
                  const barWidth = Math.min(Math.abs(pct), 100);
                  return (
                    <View key={i} style={[st.growthRow, i < growth[label].length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderColor + "30" }]}>
                      <View style={{ flex: 1 }}>
                        <View style={[st.rowCenter, { marginBottom: 6 }]}>
                          <Text style={{ color: colors.textMuted, fontSize: 11 }}>{g.prev_period}</Text>
                          <FontAwesome name="long-arrow-right" size={10} color={colors.textMuted} style={{ marginHorizontal: 6 }} />
                          <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "500" }}>{g.period}</Text>
                        </View>
                        {/* Visual bar */}
                        <View style={[st.growthBarTrack, { backgroundColor: colors.borderColor + "40" }]}>
                          <View style={[
                            st.growthBarFill,
                            {
                              width: `${barWidth}%`,
                              backgroundColor: positive ? colors.success + "30" : colors.danger + "30",
                              borderColor: positive ? colors.success : colors.danger,
                            },
                          ]} />
                        </View>
                      </View>
                      <View style={{ alignItems: "flex-end", marginLeft: 12, minWidth: 70 }}>
                        <View style={st.rowCenter}>
                          <FontAwesome
                            name={positive ? "caret-up" : "caret-down"}
                            size={16}
                            color={positive ? colors.success : colors.danger}
                            style={{ marginRight: 4 }}
                          />
                          <Text style={{
                            color: positive ? colors.success : colors.danger,
                            fontSize: 15, fontWeight: "800", fontVariant: ["tabular-nums"],
                          }}>
                            {positive ? "+" : ""}{pct.toFixed(1)}%
                          </Text>
                        </View>
                      </View>
                    </View>
                  );
                })}
              </Card>
            </FadeIn>
          ))}
        </>
      )}
    </ScrollView>
  );
}
