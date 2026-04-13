/**
 * HistoricalPerformance — Yearly breakdown of portfolio metrics.
 *
 * Sections:
 *  a) Portfolio growth by year (year-end portfolio value)
 *  b) Dividends received by year
 *  c) Appreciation in value each year (value change − deposits)
 *  d) Realized profit/loss each year
 *
 * Each section has a line chart.
 * A year-filter chip bar lets the user select which years to display (default: all).
 */

import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

import DividendYearlyChart from "@/components/charts/DividendYearlyChart";
import SnapshotLineChart, { type ChartDataPoint } from "@/components/charts/SnapshotLineChart";
import { MetricCard } from "@/components/ui/MetricCard";
import { useAllDividends } from "@/hooks/queries/useDividendQueries";
import { useTransactions } from "@/hooks/queries/useTransactionQueries";
import { useResponsive } from "@/hooks/useResponsive";
import { formatCurrency, formatSignedCurrency } from "@/lib/currency";
import type { RealizedProfitDetail, SnapshotRecord } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";

// ── Types ───────────────────────────────────────────────────────────

interface YearlyData {
  year: string;
  portfolioValue: number;       // year-end snapshot value
  dividends: number;            // total cash dividends (KWD) that year
  appreciation: number;         // value change − net deposits
  realizedPnl: number;          // total realized P&L (KWD) that year
}

interface Props {
  snapshotData?: { snapshots: SnapshotRecord[]; count: number };
  realizedData?: { total_realized_kwd: number; total_profit_kwd: number; total_loss_kwd: number; details: RealizedProfitDetail[] };
}

// ── Helpers ─────────────────────────────────────────────────────────

function groupSnapshotsByYear(snapshots: SnapshotRecord[]): Map<string, SnapshotRecord[]> {
  const map = new Map<string, SnapshotRecord[]>();
  for (const s of snapshots) {
    const year = s.snapshot_date.slice(0, 4);
    const arr = map.get(year) ?? [];
    arr.push(s);
    map.set(year, arr);
  }
  return map;
}

// ── Component ───────────────────────────────────────────────────────

export function HistoricalPerformance({ snapshotData, realizedData }: Props) {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const { isPhone, spacing, fonts } = useResponsive();

  // Fetch all dividends (need per-record dates)
  const { data: allDivData } = useAllDividends();

  // Fetch all transactions (buy/sell/dividend — spans full history)
  const { data: allTxnData } = useTransactions({ perPage: 9999 });

  // ── Compute yearly data ─────────────────────────────────────────

  const yearlyData = useMemo((): YearlyData[] => {
    const snapshots = [...(snapshotData?.snapshots ?? [])].sort(
      (a, b) => a.snapshot_date.localeCompare(b.snapshot_date),
    );

    const byYear = groupSnapshotsByYear(snapshots);

    // Dividends by year
    const divByYear = new Map<string, number>();
    for (const d of (allDivData?.dividends ?? [])) {
      const yr = d.txn_date.slice(0, 4);
      divByYear.set(yr, (divByYear.get(yr) ?? 0) + d.cash_dividend_kwd);
    }

    // Realized P&L by year
    const realByYear = new Map<string, number>();
    for (const r of (realizedData?.details ?? [])) {
      const yr = r.txn_date.slice(0, 4);
      realByYear.set(yr, (realByYear.get(yr) ?? 0) + r.realized_pnl_kwd);
    }

    // Cumulative cost basis by year from transactions
    const txnCostByYear = new Map<string, number>();
    const txns = allTxnData?.transactions ?? [];
    for (const txn of txns) {
      if (txn.is_deleted) continue;
      const yr = txn.txn_date.slice(0, 4);
      const cost = txn.purchase_cost ?? 0;
      const sellVal = txn.sell_value ?? 0;
      txnCostByYear.set(yr, (txnCostByYear.get(yr) ?? 0) + cost - sellVal);
    }

    // Union all years from snapshots, dividends, realized trades, and transactions
    const allYearsSet = new Set<string>([
      ...byYear.keys(),
      ...divByYear.keys(),
      ...realByYear.keys(),
      ...txnCostByYear.keys(),
    ]);
    const years = Array.from(allYearsSet).sort();
    if (!years.length) return [];

    let prevYearEndValue = 0;
    let cumulativeCost = 0;

    return years.map((year) => {
      const yearSnaps = byYear.get(year);

      // Accumulate cost basis for this year
      cumulativeCost += txnCostByYear.get(year) ?? 0;

      if (yearSnaps) {
        const sorted = yearSnaps.sort((a, b) =>
          a.snapshot_date.localeCompare(b.snapshot_date),
        );
        const yearEnd = sorted[sorted.length - 1];
        const yearStart = sorted[0];

        // Portfolio growth = year-end value
        const portfolioValue = yearEnd.portfolio_value;

        // Dividends
        const dividends = divByYear.get(year) ?? 0;

        // Appreciation = (year-end value − year-start value) − (net deposits during year)
        const startValue = prevYearEndValue > 0 ? prevYearEndValue : yearStart.portfolio_value;
        const netDepositsThisYear = yearEnd.deposit_cash - (prevYearEndValue > 0 ? (sorted[0].deposit_cash) : yearStart.deposit_cash);
        const appreciation = (yearEnd.portfolio_value - startValue) - netDepositsThisYear;

        // Realized P&L
        const realizedPnl = realByYear.get(year) ?? 0;

        prevYearEndValue = yearEnd.portfolio_value;

        return { year, portfolioValue, dividends, appreciation, realizedPnl };
      }

      // Year has no snapshots — use cumulative cost basis as portfolio value proxy
      const dividends = divByYear.get(year) ?? 0;
      const realizedPnl = realByYear.get(year) ?? 0;
      const portfolioValue = cumulativeCost > 0 ? cumulativeCost : 0;

      return { year, portfolioValue, dividends, appreciation: 0, realizedPnl };
    });
  }, [snapshotData, allDivData, realizedData, allTxnData]);

  // ── Year filter ─────────────────────────────────────────────────

  const allYears = useMemo(() => yearlyData.map((d) => d.year), [yearlyData]);
  const [selectedYears, setSelectedYears] = useState<Set<string>>(new Set());

  // "All" = empty set means show everything
  const isAllSelected = selectedYears.size === 0;

  const toggleYear = (year: string) => {
    setSelectedYears((prev) => {
      const next = new Set(prev);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  };

  const clearFilter = () => setSelectedYears(new Set());

  const filteredData = useMemo(() => {
    if (isAllSelected) return yearlyData;
    return yearlyData.filter((d) => selectedYears.has(d.year));
  }, [yearlyData, selectedYears, isAllSelected]);

  // ── Chart data ──────────────────────────────────────────────────

  const growthChartData: ChartDataPoint[] = useMemo(
    () => filteredData.map((d, i) => ({
      label: d.year,
      value: i === 0
        ? d.portfolioValue - (yearlyData.find((y) => y.year < d.year)?.portfolioValue ?? 0)
        : d.portfolioValue - filteredData[i - 1].portfolioValue,
    })),
    [filteredData, yearlyData],
  );

  const dividendBarData = useMemo(
    () => filteredData.map((d) => ({ year: d.year, amount: d.dividends })),
    [filteredData],
  );

  const appreciationChartData: ChartDataPoint[] = useMemo(
    () => filteredData.map((d) => ({ label: d.year, value: d.appreciation })),
    [filteredData],
  );

  const realizedChartData: ChartDataPoint[] = useMemo(
    () => filteredData.map((d) => ({ label: d.year, value: d.realizedPnl })),
    [filteredData],
  );

  // ── Summary metrics ─────────────────────────────────────────────

  const summary = useMemo(() => {
    const totalDiv = filteredData.reduce((s, d) => s + d.dividends, 0);
    const totalAppr = filteredData.reduce((s, d) => s + d.appreciation, 0);
    const totalReal = filteredData.reduce((s, d) => s + d.realizedPnl, 0);
    const latestValue = filteredData.length > 0 ? filteredData[filteredData.length - 1].portfolioValue : 0;
    const earliestValue = filteredData.length > 0 ? filteredData[0].portfolioValue : 0;
    const totalGrowth = latestValue - earliestValue;
    return { totalDiv, totalAppr, totalReal, latestValue, totalGrowth };
  }, [filteredData]);

  // ── Empty state ─────────────────────────────────────────────────

  if (!yearlyData.length) {
    return (
      <View style={[s.emptyContainer, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <FontAwesome name="bar-chart" size={32} color={colors.textMuted} />
        <Text style={[s.emptyText, { color: colors.textMuted }]}>
          {t("historical.noData")}
        </Text>
      </View>
    );
  }

  const colW = isPhone ? "48%" : "24%";

  return (
    <View>
      {/* ── Year Filter ── */}
      <Text style={[s.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13) }]}>
        {t("historical.filterYears")}
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.filterRow}
        style={{ marginBottom: 16 }}
      >
        <Pressable
          onPress={clearFilter}
          style={[
            s.filterChip,
            {
              backgroundColor: isAllSelected ? colors.accentPrimary + "18" : colors.bgCard,
              borderColor: isAllSelected ? colors.accentPrimary : colors.borderColor,
            },
          ]}
        >
          <Text
            style={[
              s.filterChipText,
              { color: isAllSelected ? colors.accentPrimary : colors.textSecondary },
            ]}
          >
            {t("historical.allYears")}
          </Text>
        </Pressable>
        {allYears.map((year) => {
          const active = selectedYears.has(year);
          return (
            <Pressable
              key={year}
              onPress={() => toggleYear(year)}
              style={[
                s.filterChip,
                {
                  backgroundColor: active ? colors.accentPrimary + "18" : colors.bgCard,
                  borderColor: active ? colors.accentPrimary : colors.borderColor,
                },
              ]}
            >
              <Text
                style={[
                  s.filterChipText,
                  { color: active ? colors.accentPrimary : colors.textSecondary },
                ]}
              >
                {year}
              </Text>
            </Pressable>
          );
        })}
      </ScrollView>

      {/* ── Summary Cards ── */}
      <View style={[s.grid, { gap: spacing.gridGap, marginBottom: spacing.sectionGap }]}>
        <MetricCard
          icon="line-chart"
          label={t("historical.portfolioGrowth")}
          value={formatSignedCurrency(summary.totalGrowth)}
          subline={`${t("historical.latestValue")}: ${formatCurrency(summary.latestValue)}`}
          trend={summary.totalGrowth >= 0 ? "up" : "down"}
          accentColor="#3b82f6"
          width={colW}
        />
        <MetricCard
          icon="money"
          label={t("historical.totalDividends")}
          value={formatCurrency(summary.totalDiv)}
          accentColor={colors.success}
          width={colW}
        />
        <MetricCard
          icon="arrow-up"
          label={t("historical.appreciation")}
          value={formatSignedCurrency(summary.totalAppr)}
          trend={summary.totalAppr >= 0 ? "up" : "down"}
          accentColor="#8b5cf6"
          width={colW}
        />
        <MetricCard
          icon="exchange"
          label={t("historical.realizedPL")}
          value={formatSignedCurrency(summary.totalReal)}
          trend={summary.totalReal >= 0 ? "up" : "down"}
          accentColor="#f59e0b"
          width={colW}
        />
      </View>

      {/* ── Chart: Portfolio Growth by Year ── */}
      <Text style={[s.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13) }]}>
        {t("historical.portfolioGrowthChart")}
      </Text>
      {growthChartData.length >= 1 ? (
        <SnapshotLineChart
          data={growthChartData}
          title=""
          colors={colors}
          lineColor="#3b82f6"
          height={260}
        />
      ) : (
        <View style={[s.chartPlaceholder, { borderColor: colors.borderColor }]}>
          <Text style={{ color: colors.textMuted }}>{t("historical.needMoreData")}</Text>
        </View>
      )}

      {/* ── Chart: Dividends by Year (bar chart) ── */}
      <Text style={[s.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13), marginTop: 16 }]}>
        {t("historical.dividendsByYear")}
      </Text>
      <DividendYearlyChart data={dividendBarData} currency="KWD" height={260} />

      {/* ── Chart: Appreciation by Year ── */}
      <Text style={[s.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13), marginTop: 16 }]}>
        {t("historical.appreciationChart")}
      </Text>
      {appreciationChartData.length >= 2 ? (
        <SnapshotLineChart
          data={appreciationChartData}
          title=""
          colors={colors}
          lineColor="#8b5cf6"
          height={260}
        />
      ) : (
        <View style={[s.chartPlaceholder, { borderColor: colors.borderColor }]}>
          <Text style={{ color: colors.textMuted }}>{t("historical.needMoreData")}</Text>
        </View>
      )}

      {/* ── Chart: Realized P/L by Year ── */}
      <Text style={[s.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13), marginTop: 16 }]}>
        {t("historical.realizedPLChart")}
      </Text>
      {realizedChartData.length >= 2 ? (
        <SnapshotLineChart
          data={realizedChartData}
          title=""
          colors={colors}
          lineColor="#f59e0b"
          height={260}
        />
      ) : (
        <View style={[s.chartPlaceholder, { borderColor: colors.borderColor }]}>
          <Text style={{ color: colors.textMuted }}>{t("historical.needMoreData")}</Text>
        </View>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const s = StyleSheet.create({
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
    marginTop: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
    marginBottom: 24,
  },
  filterRow: {
    flexDirection: "row",
    gap: 8,
    paddingHorizontal: 2,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterChipText: {
    fontSize: 13,
    fontWeight: "600",
  },
  chartPlaceholder: {
    height: 120,
    borderRadius: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    justifyContent: "center",
    alignItems: "center",
    marginBottom: 16,
  },
  emptyContainer: {
    padding: 40,
    borderRadius: 16,
    borderWidth: 1,
    alignItems: "center",
    gap: 12,
    marginVertical: 24,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
  },
});
