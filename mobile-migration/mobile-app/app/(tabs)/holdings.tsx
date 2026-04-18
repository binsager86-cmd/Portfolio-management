/**
 * Holdings Screen — Thin orchestrator.
 *
 * All data logic lives in useHoldingsView, table cells in HoldingsDataGrid,
 * and the merge modal in StockMergeModal. This file wires them together
 * as the Expo Router default export.
 */

import { AllocationDonut } from "@/components/charts/AllocationDonut";
import { CashBalancesSection } from "@/components/portfolio/CashBalancesSection";
import { KpiCard } from "@/components/portfolio/KpiWidgets";
import { DataScreen } from "@/components/screens";
import { FilterChip } from "@/components/ui/FilterChip";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { HoldingsTableSkeleton } from "@/components/ui/PageSkeletons";
import { ResponsiveDataTable, type DataColumn } from "@/components/ui/ResponsiveDataTable";
import { UITokens } from "@/constants/uiTokens";
import { useCashBalances } from "@/hooks/queries";
import { useResponsive } from "@/hooks/useResponsive";
import { fmtNum, formatCurrency } from "@/lib/currency";
import { todayISO } from "@/lib/dateUtils";
import { showErrorAlert } from "@/lib/errorHandling";
import { exportHoldingsExcel, type Holding } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { getApiErrorMessage } from "@/src/features/fundamental-analysis/types";
import {
  HeaderCell,
  HoldingRow,
  TotalCell,
  ts,
} from "@/src/features/holdings/components/HoldingsDataGrid";
import { StockMergeModal } from "@/src/features/holdings/components/StockMergeModal";
import {
  SUMMARY_COLUMNS,
  SUMMARY_TABLE_WIDTH,
  TABLE_COLUMNS,
  TOTAL_TABLE_WIDTH,
  useHoldingsView,
} from "@/src/features/holdings/hooks/useHoldingsView";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";

// ── Main screen ─────────────────────────────────────────────────────

export default function HoldingsScreen() {
  const { colors } = useThemeStore();
  const { spacing } = useResponsive();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const router = useRouter();

  const {
    filter, setFilter,
    sortCol, sortDir, onSort,
    resp, isLoading, isError, error, refetch, isRefetching, isFetching, dataUpdatedAt,
    sortedHoldings, totals, allocationData, depositTotals,
  } = useHoldingsView();

  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);
  const [viewMode, setViewMode] = useState<"summary" | "detailed">("summary");

  const activeColumns = viewMode === "summary" ? SUMMARY_COLUMNS : TABLE_COLUMNS;
  const activeTableWidth = viewMode === "summary" ? SUMMARY_TABLE_WIDTH : TOTAL_TABLE_WIDTH;

  const { data: cashData, refetch: refetchCash } = useCashBalances();

  // ── Mobile card columns (priority-filtered on phone) ────────────
  const mobileColumns = useMemo<DataColumn<Holding>[]>(() => [
    { key: "symbol", label: t("holdings.symbol", "Symbol"), render: (h) => `${h.symbol} — ${h.company}`, priority: "high" },
    { key: "value", label: t("holdings.marketValue", "Market Value"), render: (h) => formatCurrency(h.market_value_kwd), priority: "high" },
    { key: "pnl", label: t("dashboard.unrealizedPL", "Unrealized P&L"), render: (h) => formatCurrency(h.unrealized_pnl_kwd), priority: "high" },
    { key: "pnl_pct", label: t("holdings.pnlPct", "P&L %"), render: (h) => `${h.pnl_pct >= 0 ? "+" : ""}${h.pnl_pct.toFixed(2)}%`, priority: "medium" },
    { key: "cost", label: t("holdings.avgCost", "Avg Cost"), render: (h) => fmtNum(h.total_cost_kwd), priority: "low" },
  ], [t]);

  const holdingKeyExtractor = useCallback((item: Holding) => item.symbol, []);
  const mobileHoldingKeyExtractor = useCallback((item: Holding) => item.symbol, []);
  const renderDesktopHoldingRow = useCallback(
    ({ item, index }: { item: Holding; index: number }) => (
      <HoldingRow
        holding={item}
        colors={colors}
        isEven={index % 2 === 0}
        onCompanyPress={setSelectedHolding}
        columns={activeColumns}
      />
    ),
    [activeColumns, colors],
  );

  const portfolios = [undefined, "KFH", "BBYN", "USA"];
  const filterLabels = ["All", "KFH", "BBYN", "USA"];

  return (
    <DataScreen
      loading={isLoading}
      error={isError ? getApiErrorMessage(error, t("holdingsScreen.failedToLoad")) : null}
      onRetry={() => refetch()}
      loadingSkeleton={<HoldingsTableSkeleton />}
      bare
    >
      <View style={[s.container, { backgroundColor: colors.bgPrimary }]}>
        {/* ── Portfolio filter tabs ────────────────────────────── */}
        <View style={s.filterRow}>
          {portfolios.map((p, i) => (
            <FilterChip
              key={filterLabels[i]}
              label={filterLabels[i]}
              active={filter === p}
              onPress={() => setFilter(p)}
              colors={colors}
            />
          ))}
          <LastUpdated timestamp={dataUpdatedAt} isFetching={isFetching} />        </View>

        {/* ── Summary KPI Cards ───────────────────────────────── */}
        {resp && (
          <View style={[s.kpiCardRow, { borderBottomColor: colors.borderColor }]}>
            <KpiCard label={t("holdings.title")} value={String(resp.count)} color={colors.accentPrimary} colors={colors} />
            <KpiCard label={t("holdings.marketValue")} value={`${fmtNum(resp.totals.total_market_value_kwd)} KWD`} colors={colors} />
            <KpiCard label={t("holdings.avgCost")} value={`${fmtNum(resp.totals.total_cost_kwd)} KWD`} colors={colors} />
            <KpiCard
              label={t("dashboard.unrealizedPL")}
              value={`${resp.totals.total_unrealized_pnl_kwd >= 0 ? "+" : ""}${fmtNum(resp.totals.total_unrealized_pnl_kwd)} KWD`}
              color={resp.totals.total_unrealized_pnl_kwd > 0 ? colors.success : resp.totals.total_unrealized_pnl_kwd < 0 ? colors.danger : colors.textMuted}
              colors={colors}
            />
          </View>
        )}

        {/* ── Scrollable content ──────────────────────────────── */}
        <ScrollView
          style={{ flex: 1 }}
          refreshControl={
            <RefreshControl refreshing={isRefetching} onRefresh={() => { refetch(); refetchCash(); }} />
          }
        >
          {/* Cash Management */}
          <CashBalancesSection
            cashData={cashData ?? {}}
            depositTotals={depositTotals}
            colors={colors}
            spacing={spacing}
            queryClient={queryClient}
          />

          {/* Holdings header + Export */}
          <View style={[s.holdingsHeaderRow, { marginHorizontal: spacing.pagePx }]}>
            <Text style={[s.holdingsTitle, { color: colors.textPrimary }]}>
              <FontAwesome name="briefcase" size={16} color={colors.accentPrimary} />
              {"  "}{t("holdings.title")}
            </Text>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={async () => {
                if (Platform.OS !== "web") {
                  Alert.alert(t("holdingsScreen.export"), t("holdingsScreen.exportWebOnly"));
                  return;
                }
                try {
                  const blob = await exportHoldingsExcel(filter ?? undefined);
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement("a");
                  a.href = url;
                  a.download = `holdings_${todayISO()}.xlsx`;
                  document.body.appendChild(a);
                  a.click();
                  document.body.removeChild(a);
                  URL.revokeObjectURL(url);
                } catch (e: any) {
                  showErrorAlert(t("holdingsScreen.exportFailed"), e);
                }
              }}
              style={s.holdingsExportBtn}
            >
              <FontAwesome name="download" size={14} color="#10b981" style={{ marginRight: 8 }} />
              <Text style={s.holdingsExportText}>{t("holdingsScreen.exportExcel")}</Text>
            </TouchableOpacity>
          </View>

          {/* Summary / Detailed view toggle */}
          <View style={[s.viewToggleRow, { marginHorizontal: spacing.pagePx }]}>
            {(["summary", "detailed"] as const).map((mode) => (
              <Pressable
                key={mode}
                onPress={() => setViewMode(mode)}
                style={[
                  s.viewToggleBtn,
                  {
                    backgroundColor: viewMode === mode ? colors.accentPrimary : colors.bgCard,
                    borderColor: viewMode === mode ? colors.accentPrimary : colors.borderColor,
                  },
                ]}
              >
                <FontAwesome
                  name={mode === "summary" ? "list" : "table"}
                  size={12}
                  color={viewMode === mode ? "#fff" : colors.textMuted}
                  style={{ marginRight: 6 }}
                />
                <Text style={{ color: viewMode === mode ? "#fff" : colors.textSecondary, fontSize: 13, fontWeight: "600" }}>
                  {mode === "summary" ? t("holdings.summary", "Summary") : t("holdings.detailed", "Detailed")}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Holdings table — ResponsiveDataTable auto-switches to cards on phone */}
          <View style={{ marginHorizontal: spacing.pagePx, marginTop: 4, marginBottom: UITokens.spacing.lg }}>
            <ResponsiveDataTable<Holding>
              data={sortedHoldings}
              columns={mobileColumns}
              keyExtractor={mobileHoldingKeyExtractor}
              onPressItem={setSelectedHolding}
              itemA11yLabel={(h) => `${h.symbol} ${h.company}, value ${formatCurrency(h.market_value_kwd)}`}
              desktopTable={
                <View
                  style={[
                    ts.tableOuter,
                    {
                      borderColor: colors.borderColor,
                      backgroundColor: colors.bgCard,
                    },
                  ]}
                >
                  <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: activeTableWidth }}>
                    <View style={{ width: activeTableWidth }}>
                      {/* Header */}
                      <View style={[ts.headerRow, { borderBottomColor: colors.borderColor, backgroundColor: colors.bgSecondary }]}>
                        {activeColumns.map((col) => (
                          <HeaderCell key={col.key} col={col} colors={colors} sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                        ))}
                      </View>

                      {/* Data rows */}
                      <FlashList
                        data={sortedHoldings}
                        renderItem={renderDesktopHoldingRow}
                        keyExtractor={holdingKeyExtractor}
                        scrollEnabled={false}
                      />

                      {/* TOTAL row */}
                      {sortedHoldings.length > 0 && (
                        <View
                          style={[
                            ts.dataRow,
                            ts.totalRow,
                            {
                              borderBottomColor: colors.borderColor,
                              backgroundColor: colors.accentPrimary + "18",
                              borderTopColor: colors.accentPrimary,
                            },
                          ]}
                        >
                          {activeColumns.map((col) => (
                            <TotalCell key={col.key} col={col} totals={totals} colors={colors} />
                          ))}
                        </View>
                      )}

                      {/* Empty state */}
                      {sortedHoldings.length === 0 && (
                        <View style={ts.emptyRow}>
                          <FontAwesome name="briefcase" size={36} color={colors.textMuted} style={{ marginBottom: 8 }} />
                          <Text style={{ color: colors.textMuted, fontSize: 14, marginBottom: 12 }}>
                            {t("holdingsScreen.noActiveHoldings")}
                          </Text>
                          <Pressable
                            onPress={() => router.push("/(tabs)/add-stock" as any)}
                            style={[
                              { backgroundColor: colors.accentPrimary, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8 },
                              Platform.OS === "web" ? ({ cursor: "pointer" } as any) : undefined,
                            ]}
                          >
                            <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>{t("holdingsScreen.addFirstStock")}</Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  </ScrollView>
                </View>
              }
            />
          </View>

          {/* Allocation Donut Chart */}
          {allocationData.length > 0 && (
            <View
              style={[
                donutStyles.section,
                {
                  marginHorizontal: spacing.pagePx,
                  backgroundColor: colors.bgCard,
                  borderColor: colors.borderColor,
                },
              ]}
            >
              <Text style={[donutStyles.sectionLabel, { color: colors.textPrimary }]}>
                <FontAwesome name="pie-chart" size={14} color={colors.accentPrimary} />{" "}
                {t("holdingsScreen.weightByCost")}
              </Text>
              <AllocationDonut
                data={allocationData}
                title={t("holdingsScreen.portfolioAllocation")}
                colors={colors}
                size={280}
                showLegend={true}
              />
            </View>
          )}
        </ScrollView>

        {/* Stock Merge Modal */}
        {selectedHolding && (
          <StockMergeModal
            holding={selectedHolding}
            colors={colors}
            onClose={() => setSelectedHolding(null)}
            onMerged={() => {
              queryClient.invalidateQueries({ queryKey: ["holdings"] });
              queryClient.invalidateQueries({ queryKey: ["overview"] });
              queryClient.invalidateQueries({ queryKey: ["all-stocks-for-merge"] });
            }}
          />
        )}
      </View>
    </DataScreen>
  );
}

// ── Screen styles ───────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  kpiCardRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
  },
  holdingsHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginTop: 16,
    marginBottom: 6,
  },
  holdingsTitle: { fontSize: 18, fontWeight: "700" as const },
  holdingsExportBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "#1a3a2a",
    borderColor: "#10b981",
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 44,
  },
  holdingsExportText: { color: "#10b981", fontSize: 13, fontWeight: "700" as const },
  viewToggleRow: {
    flexDirection: "row" as const,
    gap: 8,
    marginTop: 8,
    marginBottom: 4,
  },
  viewToggleBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
});

const donutStyles = StyleSheet.create({
  section: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionLabel: { fontSize: 14, fontWeight: "700", marginBottom: 12 },
});
