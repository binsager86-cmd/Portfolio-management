/**
 * ComparisonPanel — Multi-period side-by-side comparison with YoY changes.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useMemo, useState } from "react";
import { RefreshControl, ScrollView, Text, View } from "react-native";

import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useStatements } from "@/hooks/queries";
import { exportCSV, exportExcel, exportPDF, TableData } from "@/lib/exportAnalysis";
import { st } from "../styles";
import { STMNT_META, type PanelWithSymbolProps } from "../types";
import { formatNumber } from "../utils";
import { ExportBar, StatementTabBar } from "./shared";

export function ComparisonPanel({ stockId, stockSymbol, colors, isDesktop: _isDesktop }: PanelWithSymbolProps) {
  const [typeFilter, setTypeFilter] = useState<string>("income");
  const { data, isLoading, refetch, isFetching } = useStatements(stockId, typeFilter);

  const statements = data?.statements ?? [];

  const periods = useMemo(() =>
    [...statements]
      .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date))
      .map((s) => ({
        label: `FY${s.fiscal_year}${s.fiscal_quarter ? ` Q${s.fiscal_quarter}` : ""}`,
        period: s.period_end_date,
        items: Object.fromEntries(
          (s.line_items ?? []).map((li) => [li.line_item_code, { amount: li.amount, name: li.line_item_name, isTotal: li.is_total }])
        ),
      })),
  [statements]);

  const allCodes = useMemo(() => {
    const codes: { code: string; name: string; isTotal: boolean }[] = [];
    const seen = new Set<string>();
    for (const s of statements) {
      for (const li of s.line_items ?? []) {
        if (!seen.has(li.line_item_code)) {
          seen.add(li.line_item_code);
          codes.push({ code: li.line_item_code, name: li.line_item_name, isTotal: li.is_total });
        }
      }
    }
    return codes;
  }, [statements]);

  const exportTables = useCallback((): TableData[] => {
    const headers = ["Line Item"];
    for (let i = 0; i < periods.length; i++) {
      headers.push(periods[i].label);
      if (i > 0) headers.push("YoY %");
    }
    const rows = allCodes.map((item) => {
      const row: (string | number | null)[] = [item.name];
      for (let i = 0; i < periods.length; i++) {
        const val = periods[i].items[item.code]?.amount;
        row.push(val != null ? val : null);
        if (i > 0) {
          const prevVal = periods[i - 1].items[item.code]?.amount;
          const yoy = prevVal && prevVal !== 0 && val != null ? ((val - prevVal) / Math.abs(prevVal)) * 100 : null;
          row.push(yoy != null ? `${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%` : null);
        }
      }
      return row;
    });
    const typeName = STMNT_META[typeFilter]?.label ?? typeFilter;
    return [{ title: `${typeName} — Period Comparison`, headers, rows }];
  }, [periods, allCodes, typeFilter]);

  return (
    <View style={{ flex: 1 }}>
      <StatementTabBar value={typeFilter} onChange={(v) => setTypeFilter(v ?? "income")} colors={colors} />

      {isLoading ? (
        <LoadingScreen />
      ) : periods.length < 2 ? (
        <View style={st.empty}>
          <View style={[st.emptyIcon, { backgroundColor: colors.warning + "10" }]}>
            <FontAwesome name="columns" size={32} color={colors.warning} />
          </View>
          <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>Need 2+ periods</Text>
          <Text style={[st.emptySubtitle, { color: colors.textMuted }]}>Upload statements for multiple fiscal years to compare.</Text>
        </View>
      ) : (
        <ScrollView refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}>
          <View style={{ paddingHorizontal: 12, paddingTop: 8, flexDirection: "row", justifyContent: "flex-end" }}>
            <ExportBar
              onExport={async (fmt) => {
                const t = exportTables();
                if (fmt === "xlsx") await exportExcel(t, stockSymbol, "Comparison");
                else if (fmt === "csv") await exportCSV(t, stockSymbol, "Comparison");
                else await exportPDF(t, stockSymbol, "Comparison");
              }}
              colors={colors}
              disabled={periods.length < 2}
            />
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 0, paddingBottom: 80 }}>
            <View>
              {/* Header row */}
              <View style={[st.compHeaderRow, { borderBottomColor: colors.borderColor }]}>
                <Text style={[st.compCellName, { color: colors.textPrimary, fontWeight: "800" }]}>Line Item</Text>
                {periods.map((p, i) => (
                  <React.Fragment key={p.period}>
                    <Text style={[st.compCellVal, { color: colors.textPrimary, fontWeight: "800" }]}>{p.label}</Text>
                    {i > 0 && <Text style={[st.compCellYoy, { color: colors.accentPrimary, fontWeight: "700" }]}>YoY %</Text>}
                  </React.Fragment>
                ))}
              </View>

              {/* Data rows */}
              {allCodes.map((item, rowIdx) => {
                const isTotal = item.isTotal;
                return (
                  <View
                    key={item.code}
                    style={[
                      st.compRow,
                      { backgroundColor: isTotal ? colors.bgInput + "50" : (rowIdx % 2 === 0 ? "transparent" : colors.bgPrimary + "30") },
                      isTotal && { borderTopWidth: 1, borderTopColor: colors.borderColor },
                    ]}
                  >
                    <Text numberOfLines={1} style={[st.compCellName, { color: isTotal ? colors.textPrimary : colors.textSecondary, fontWeight: isTotal ? "700" : "400" }]}>
                      {item.name}
                    </Text>
                    {periods.map((p, i) => {
                      const val = p.items[item.code]?.amount;
                      const prevVal = i > 0 ? periods[i - 1].items[item.code]?.amount : undefined;
                      const yoy = prevVal && prevVal !== 0 && val != null ? ((val - prevVal) / Math.abs(prevVal)) * 100 : null;
                      return (
                        <React.Fragment key={p.period}>
                          <Text style={[st.compCellVal, {
                            color: val != null && val < 0 ? colors.danger : (isTotal ? colors.textPrimary : colors.textSecondary),
                            fontWeight: isTotal ? "700" : "500",
                          }]}>
                            {val != null ? formatNumber(val) : "–"}
                          </Text>
                          {i > 0 && (
                            <Text style={[st.compCellYoy, {
                              color: yoy == null ? colors.textMuted : yoy >= 0 ? colors.success : colors.danger,
                              fontWeight: "600",
                            }]}>
                              {yoy != null ? `${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%` : "–"}
                            </Text>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>
      )}
    </View>
  );
}
