/**
 * Portfolio Analysis — merged Holdings + Analysis screen.
 *
 * Sections (top to bottom):
 *   1. Portfolio & period filters
 *   2. Performance KPIs (TWR, MWRR, ROI, …)
 *   3. Cash Management (manual override, edit pencil)
 *   4. Holdings table (18 cols, sortable, TOTAL row)
 *   5. Allocation donut chart (Market Value Weight)
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
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
    View,
} from "react-native";

import { AllocationDonut, AllocationSlice } from "@/components/charts/AllocationDonut";
import { withErrorBoundary } from "@/components/ui/ErrorBoundary";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { PortfolioAnalysisSkeleton } from "@/components/ui/PageSkeletons";
import {
    useCashBalances,
    useDepositTotals,
    useHoldings,
    usePerformance,

} from "@/hooks/queries";
import { usePriceRefresh } from "@/hooks/usePriceRefresh";
import { useResponsive } from "@/hooks/useResponsive";
import { formatCurrency } from "@/lib/currency";
import { todayISO } from "@/lib/dateUtils";
import {
    exportHoldingsExcel,
} from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { useUserPrefsStore } from "@/src/store/userPrefsStore";

// Extracted components
import { CashBalancesSection } from "@/components/portfolio/CashBalancesSection";
import type { SortDir } from "@/components/portfolio/HoldingsTablePA";
import {
    HeaderCell,
    HoldingRow,
    TABLE_COLUMNS,
    TOTAL_TABLE_WIDTH,
    TotalCell,
    computeTotals,
    htStyles,
    setHoldingsContext,
    sortHoldings,
} from "@/components/portfolio/HoldingsTablePA";
import { KpiCard } from "@/components/portfolio/KpiWidgets";
import { FilterChip } from "@/components/ui/FilterChip";

const PORTFOLIOS = ["All", "KFH", "BBYN", "USA"] as const;

function PortfolioAnalysisScreen() {
  const { colors } = useThemeStore();
  const { isDesktop, spacing } = useResponsive();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const expertiseLevel = useUserPrefsStore((s) => s.preferences.expertiseLevel);

  // Filters
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>("All");
  const [period] = useState<string>("ALL");

  // Holdings sort
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const portfolioParam = selectedPortfolio === "All" ? undefined : selectedPortfolio;

  // ── Queries ─────────────────────────────────────────────────────

  const { refresh: refreshPrices, isRefreshing: priceRefreshing } = usePriceRefresh();

  const {
    data: holdingsResp,
    isLoading: holdingsLoading,
    isError: holdingsError,
    error: holdingsErr,
    refetch: refetchHoldings,
    isRefetching,
    isFetching: holdingsFetching,
    dataUpdatedAt: holdingsUpdatedAt,
  } = useHoldings(portfolioParam);

  usePerformance(portfolioParam, period);

  const { data: cashData } = useCashBalances();

  // Deposit totals per portfolio
  const { kfh: { data: kfhDeposits }, bbyn: { data: bbynDeposits }, usa: { data: usaDeposits } } = useDepositTotals();

  // ── Pull-to-refresh (prices + all dependent caches) ──────────

  const onRefresh = useCallback(async () => {
    await refreshPrices();
  }, [refreshPrices]);

  // ── Derived data ────────────────────────────────────────────────

  const onSort = useCallback(
    (key: string) => {
      if (sortCol === key) {
        if (sortDir === "asc") setSortDir("desc");
        else { setSortCol(null); setSortDir("asc"); }
      } else { setSortCol(key); setSortDir("asc"); }
    },
    [sortCol, sortDir],
  );

  const sortedHoldings = useMemo(
    () => sortHoldings(holdingsResp?.holdings ?? [], sortCol, sortDir),
    [holdingsResp?.holdings, sortCol, sortDir],
  );

  const holdingKeyExtractor = useCallback((item: (typeof sortedHoldings)[number]) => item.symbol, []);
  const renderHoldingRow = useCallback(
    ({ item, index }: { item: (typeof sortedHoldings)[number]; index: number }) => (
      <HoldingRow holding={item} colors={colors} isEven={index % 2 === 0} />
    ),
    [colors],
  );

  // Keep module-level refs in sync so getCellValue can compute allocation
  // Set module-level context for getCellValue allocation calculations
  const _totalPortfolioValueKwd = holdingsResp?.total_portfolio_value_kwd ?? 0;
  setHoldingsContext(holdingsResp?.holdings ?? [], _totalPortfolioValueKwd);
  const cashBalanceKwd = holdingsResp?.cash_balance_kwd ?? 0;

  const totals = useMemo(() => computeTotals(holdingsResp?.holdings ?? []), [holdingsResp?.holdings, _totalPortfolioValueKwd]);

  // Allocation by market value including cash — use backend total_portfolio_value
  // Merge same-company holdings across portfolios into a single slice
  const allocationData: AllocationSlice[] = useMemo(() => {
    const holdings = holdingsResp?.holdings ?? [];
    const totalPortfolio = _totalPortfolioValueKwd;
    if (totalPortfolio <= 0) return [];

    // Group by company name — same stock in different portfolios becomes one slice
    const grouped = new Map<string, { mvKwd: number; pnlPctWeightedSum: number }>();
    for (const h of holdings) {
      const mv = h.market_value_kwd ?? 0;
      if (mv <= 0) continue;
      const key = h.company;
      const existing = grouped.get(key);
      if (existing) {
        existing.pnlPctWeightedSum += (h.pnl_pct ?? 0) * mv;
        existing.mvKwd += mv;
      } else {
        grouped.set(key, { mvKwd: mv, pnlPctWeightedSum: (h.pnl_pct ?? 0) * mv });
      }
    }

    const slices: AllocationSlice[] = Array.from(grouped.entries()).map(([company, { mvKwd, pnlPctWeightedSum }]) => ({
      company,
      weight: mvKwd / totalPortfolio,       // 0–1 fractional
      pnl_pct: mvKwd > 0 ? pnlPctWeightedSum / mvKwd : 0,
    }));

    // Add cash as a slice
    if (cashBalanceKwd > 0) {
      slices.push({ company: "Cash", weight: cashBalanceKwd / totalPortfolio, pnl_pct: 0 });
    }
    return slices;
  }, [holdingsResp?.holdings, _totalPortfolioValueKwd, cashBalanceKwd]);

  const depositTotals = useMemo(() => {
    const t: Record<string, number> = {};
    const calc = (deps: typeof kfhDeposits, pf: string) => {
      if (!deps?.deposits) return;
      t[pf] = deps.deposits.filter((d) => d.amount > 0 && !d.is_deleted).reduce((sum, d) => sum + d.amount, 0);
    };
    calc(kfhDeposits, "KFH");
    calc(bbynDeposits, "BBYN");
    calc(usaDeposits, "USA");
    return t;
  }, [kfhDeposits, bbynDeposits, usaDeposits]);

  // ── Loading / Error ─────────────────────────────────────────────

  if (holdingsLoading) return <PortfolioAnalysisSkeleton />;
  if (holdingsError) return <ErrorScreen message={(holdingsErr as Error)?.message ?? t('portfolioAnalysis.failedToLoad')} onRetry={() => refetchHoldings()} />;

  const resp = holdingsResp;
  const totalsData = resp?.totals;
  const totalMarketValue = totalsData?.total_market_value_kwd ?? 0;
  const totalCost = totalsData?.total_cost_kwd ?? 0;
  const totalUnrealized = totalsData?.total_unrealized_pnl_kwd ?? 0;

  // ── Render ──────────────────────────────────────────────────────

  return (
    <View style={[s.container, { backgroundColor: colors.bgPrimary }]}>
      {/* ── Portfolio filter ─────────────────────────────────────── */}
      <View style={s.filterRow}>
        {PORTFOLIOS.map((pf) => (
          <FilterChip
            key={pf}
            label={pf}
            active={selectedPortfolio === pf}
            onPress={() => setSelectedPortfolio(pf)}
            colors={colors}
          />
        ))}
        <LastUpdated timestamp={holdingsUpdatedAt} isFetching={holdingsFetching} />
      </View>

      {/* ── Scrollable content ───────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={isDesktop ? { maxWidth: 1200, alignSelf: "center" as const, width: "100%" } : undefined}
        refreshControl={
          <RefreshControl refreshing={isRefetching || priceRefreshing} onRefresh={onRefresh} tintColor={colors.accentPrimary} />
        }
      >

        {/* ── 1. Performance KPIs ───────────────────────────────── */}
        <View style={{ paddingHorizontal: spacing.pagePx, marginTop: 8 }}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
            <FontAwesome name="bar-chart" size={16} color={colors.accentPrimary} /> {t('portfolioAnalysis.performance')}
          </Text>
          <View style={s.kpiGrid}>
            <KpiCard label={t('portfolioAnalysis.totalPortfolioValue')} value={formatCurrency(_totalPortfolioValueKwd, "KWD")} colors={colors} />
            <KpiCard label={t('portfolioAnalysis.totalMarketValue')} value={formatCurrency(totalMarketValue, "KWD")} colors={colors} />
            <KpiCard label={t('portfolioAnalysis.totalCost')} value={formatCurrency(totalCost, "KWD")} colors={colors} />
            <KpiCard label={t('portfolioAnalysis.unrealizedGainLoss')} value={formatCurrency(totalUnrealized, "KWD")} color={totalUnrealized >= 0 ? colors.success : colors.danger} colors={colors} />
            <KpiCard label={t('portfolioAnalysis.stocksHeld')} value={sortedHoldings.length} colors={colors} />
          </View>
        </View>

        {/* ── 2. Cash Management ────────────────────────────────── */}
        <View style={{ marginTop: 16 }}>
          <CashBalancesSection
            cashData={cashData ?? {}}
            depositTotals={depositTotals}
            colors={colors}
            spacing={spacing}
            queryClient={queryClient}
          />
        </View>

        {/* ── 3. Holdings Table ──────────────────────────────────── */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.pagePx, marginBottom: 8, marginTop: 16 }}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary, marginTop: 0 }]}>
            <FontAwesome name="briefcase" size={16} color={colors.accentPrimary} /> {t('portfolioAnalysis.holdingsSection')}
          </Text>
          <Pressable
            onPress={async () => {
              if (Platform.OS !== "web") {
                Alert.alert(t('portfolioAnalysis.exportExcel'), t('portfolioAnalysis.exportWebOnly'));
                return;
              }
              try {
                const blob = await exportHoldingsExcel(selectedPortfolio === "All" ? undefined : selectedPortfolio);
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `holdings_${todayISO()}.xlsx`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch (e: unknown) {
                const message = e instanceof Error ? e.message : t('app.error');
                Alert.alert(t('portfolioAnalysis.exportFailed'), message);
              }
            }}
            style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#065f46", borderColor: "#10b981", borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 }}
          >
            <FontAwesome name="download" size={13} color="#34d399" style={{ marginRight: 6 }} />
            <Text style={{ color: "#34d399", fontSize: 13, fontWeight: "700" }}>{t('portfolioAnalysis.exportExcel')}</Text>
          </Pressable>
        </View>
        <View
          style={[htStyles.tableOuter, { borderColor: colors.borderColor, backgroundColor: colors.bgCard, marginHorizontal: spacing.pagePx, marginBottom: 24 }]}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: TOTAL_TABLE_WIDTH }}>
            <View style={{ width: TOTAL_TABLE_WIDTH }}>
              {/* Header */}
              <View style={[htStyles.headerRow, { borderBottomColor: colors.borderColor, backgroundColor: colors.bgSecondary }]}>
                {TABLE_COLUMNS.map((col) => (
                  <HeaderCell key={col.key} col={col} colors={colors} sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                ))}
              </View>

              {/* Data rows */}
              <FlashList
                data={sortedHoldings}
                renderItem={renderHoldingRow}
                keyExtractor={holdingKeyExtractor}
                scrollEnabled={false}
              />

              {/* TOTAL row */}
              {sortedHoldings.length > 0 && (
                <View style={[htStyles.dataRow, htStyles.totalRow, { borderBottomColor: colors.borderColor, backgroundColor: colors.accentPrimary + "18", borderTopColor: colors.accentPrimary }]}>
                  {TABLE_COLUMNS.map((col) => (
                    <TotalCell key={col.key} col={col} totals={totals} colors={colors} />
                  ))}
                </View>
              )}

              {/* Empty state */}
              {sortedHoldings.length === 0 && (
                <View style={htStyles.emptyRow}>
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>{t('portfolioAnalysis.noActiveHoldings')}</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>

        {/* ── 4. Allocation Donut ──────────────────────────────── */}

        {/* Allocation Donut — visible at all levels */}
        {allocationData.length > 0 && (
          <View style={{ paddingHorizontal: spacing.pagePx, marginBottom: 16 }}>
            <AllocationDonut data={allocationData} title={t('portfolioAnalysis.portfolioAllocation')} colors={colors} size={280} showLegend />
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}


// =====================================================================
//  STYLES
// =====================================================================

const s = StyleSheet.create({
  container: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginTop: 16, marginBottom: 10 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  detailTable: { borderWidth: 1, borderRadius: 8, overflow: "hidden" as const },
  detailRow: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  detailCell: { flex: 1, fontSize: 13 },
});

export default withErrorBoundary(PortfolioAnalysisScreen, "Unable to load Holdings. Please try again.");
