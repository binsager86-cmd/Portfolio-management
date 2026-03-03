/**
 * Overview Dashboard — responsive for Web (desktop) + Mobile.
 *
 * Uses React Query for data fetching with pull-to-refresh.
 *
 * Layout:
 *   Hero Banner: total value + net gain + ROI
 *   Row 1: Portfolio Snapshot  (5 metric cards on desktop, 2-col on mobile)
 *   Row 2: Profit Breakdown    (3 metric cards)
 *   Chart: Portfolio value history (placeholder until history endpoint exists)
 *   Per-portfolio cards + FX rate footer.
 *
 * Light/Dark theme matches the legacy Streamlit CSS vars.
 */

import React, { useMemo, useCallback, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  RefreshControl,
  Platform,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { useQuery, useMutation } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  getOverview,
  getPerformance,
  getRiskMetrics,
  getSnapshots,
  getRealizedProfit,
  analyzePortfolio,
  getAIStatus,
  getRfRate,
  setRfRate,
  OverviewData,
  PerformanceData,
  RiskMetrics,
  SnapshotRecord,
  RealizedProfitData,
} from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import { usePriceRefresh } from "@/hooks/usePriceRefresh";
import { useAuth } from "@/hooks/useAuth";
import { MetricCard } from "@/components/ui/MetricCard";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { PortfolioCard } from "@/components/portfolio/PortfolioCard";
import { PortfolioChart } from "@/components/charts/PortfolioChart";
import {
  formatCurrency,
  formatSignedCurrency,
  formatPercent,
} from "@/lib/currency";
import type { ThemePalette } from "@/constants/theme";

// ── Helpers ─────────────────────────────────────────────────────────

function pnlColor(n: number, c: ThemePalette): string {
  if (n > 0) return c.success;
  if (n < 0) return c.danger;
  return c.textSecondary;
}

// ── AI Prompt Library ────────────────────────────────────────────────

const AI_PROMPT_CATEGORIES = [
  {
    label: "Portfolio Health",
    icon: "heartbeat" as const,
    prompts: [
      "Analyze my portfolio health and diversification",
      "What are my biggest risk exposures?",
      "How well diversified is my portfolio across sectors?",
    ],
  },
  {
    label: "Performance",
    icon: "line-chart" as const,
    prompts: [
      "Identify my top and bottom performers",
      "Compare my portfolio performance vs market",
      "Which stocks are dragging down my returns?",
    ],
  },
  {
    label: "Recommendations",
    icon: "lightbulb-o" as const,
    prompts: [
      "What changes would you recommend to improve my portfolio?",
      "Should I rebalance? If so, how?",
      "Which positions should I consider adding to or trimming?",
    ],
  },
  {
    label: "Dividends",
    icon: "money" as const,
    prompts: [
      "Analyze my dividend income potential",
      "Which stocks have the best dividend yield?",
      "How can I improve my passive income?",
    ],
  },
];

// ── Realized Trades Breakdown ───────────────────────────────────────

function RealizedTradesSection({
  data,
  colors,
  fonts,
  isPhone,
}: {
  data: RealizedProfitData;
  colors: ThemePalette;
  fonts: { caption: number };
  isPhone: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  // Summary by stock
  const byStock = useMemo(() => {
    const map: Record<string, { symbol: string; trades: number; profit: number; loss: number; net: number }> = {};
    for (const d of data.details) {
      if (!map[d.symbol]) {
        map[d.symbol] = { symbol: d.symbol, trades: 0, profit: 0, loss: 0, net: 0 };
      }
      map[d.symbol].trades++;
      if (d.realized_pnl_kwd >= 0) map[d.symbol].profit += d.realized_pnl_kwd;
      else map[d.symbol].loss += d.realized_pnl_kwd;
      map[d.symbol].net += d.realized_pnl_kwd;
    }
    return Object.values(map).sort((a, b) => b.net - a.net);
  }, [data.details]);

  const profitCount = data.details.filter((d) => d.realized_pnl > 0).length;
  const lossCount = data.details.filter((d) => d.realized_pnl < 0).length;

  return (
    <View style={{ marginBottom: 16 }}>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={{
          flexDirection: "row",
          alignItems: "center",
          paddingVertical: 8,
          gap: 8,
        }}
      >
        <FontAwesome
          name={expanded ? "chevron-down" : "chevron-right"}
          size={12}
          color={colors.textSecondary}
        />
        <Text
          style={[
            styles.sectionTitle,
            { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13), marginBottom: 0, marginTop: 0 },
          ]}
        >
          Realized Trades Breakdown
        </Text>
        <View style={{ flexDirection: "row", gap: 8, marginLeft: "auto" }}>
          <Text style={{ color: colors.success, fontSize: 12, fontWeight: "600" }}>
            {profitCount} wins
          </Text>
          <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "600" }}>
            {lossCount} losses
          </Text>
        </View>
      </Pressable>

      {expanded && (
        <View>
          {/* Summary row */}
          <View
            style={[
              styles.grid,
              { gap: 8, marginBottom: 12 },
            ]}
          >
            <MetricCard
              label="Total Trades"
              value={`${data.details.length}`}
              subline={`${profitCount}W / ${lossCount}L`}
              icon="exchange"
              accentColor={colors.accentPrimary}
              width={isPhone ? "48%" : "24%"}
            />
            <MetricCard
              label="Total Realized"
              value={formatSignedCurrency(data.total_realized_kwd)}
              subline="Net P/L (KWD)"
              trend={data.total_realized_kwd >= 0 ? "up" : "down"}
              width={isPhone ? "48%" : "24%"}
            />
            <MetricCard
              label="Gross Gains"
              value={formatCurrency(data.total_profit_kwd)}
              subline="Winning trades"
              accentColor={colors.success}
              width={isPhone ? "48%" : "24%"}
            />
            <MetricCard
              label="Gross Losses"
              value={formatCurrency(Math.abs(data.total_loss_kwd))}
              subline="Losing trades"
              accentColor={colors.danger}
              width={isPhone ? "48%" : "24%"}
            />
          </View>

          {/* Summary by stock table */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>
            Summary by Stock
          </Text>
          <View style={{ borderWidth: 1, borderColor: colors.borderColor, borderRadius: 8, overflow: "hidden", marginBottom: 12 }}>
            {/* Header */}
            <View style={{ flexDirection: "row", backgroundColor: colors.bgSecondary, paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.borderColor }}>
              <Text style={{ flex: 2, color: colors.textSecondary, fontSize: 11, fontWeight: "700" }}>Symbol</Text>
              <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 11, fontWeight: "700", textAlign: "right" }}>Trades</Text>
              <Text style={{ flex: 1.5, color: colors.textSecondary, fontSize: 11, fontWeight: "700", textAlign: "right" }}>Gains</Text>
              <Text style={{ flex: 1.5, color: colors.textSecondary, fontSize: 11, fontWeight: "700", textAlign: "right" }}>Losses</Text>
              <Text style={{ flex: 1.5, color: colors.textSecondary, fontSize: 11, fontWeight: "700", textAlign: "right" }}>Net P/L</Text>
            </View>
            {/* Rows */}
            {byStock.map((row, idx) => (
              <View
                key={row.symbol}
                style={{
                  flexDirection: "row",
                  paddingVertical: 8,
                  paddingHorizontal: 12,
                  borderBottomWidth: idx < byStock.length - 1 ? StyleSheet.hairlineWidth : 0,
                  borderBottomColor: colors.borderColor,
                  backgroundColor: idx % 2 === 0 ? "transparent" : colors.bgCardHover + "20",
                }}
              >
                <Text style={{ flex: 2, color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>{row.symbol}</Text>
                <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13, textAlign: "right" }}>{row.trades}</Text>
                <Text style={{ flex: 1.5, color: colors.success, fontSize: 13, textAlign: "right" }}>{formatCurrency(row.profit)}</Text>
                <Text style={{ flex: 1.5, color: colors.danger, fontSize: 13, textAlign: "right" }}>{formatCurrency(Math.abs(row.loss))}</Text>
                <Text style={{ flex: 1.5, color: row.net >= 0 ? colors.success : colors.danger, fontSize: 13, fontWeight: "600", textAlign: "right" }}>
                  {row.net >= 0 ? "+" : ""}{formatCurrency(row.net)}
                </Text>
              </View>
            ))}
          </View>

          {/* Detailed trades table */}
          <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "700", letterSpacing: 0.5, textTransform: "uppercase", marginBottom: 6 }}>
            Recent Trades ({Math.min(30, data.details.length)} of {data.details.length})
          </Text>
          <View style={{ borderWidth: 1, borderColor: colors.borderColor, borderRadius: 8, overflow: "hidden" }}>
            {/* Header */}
            <View style={{ flexDirection: "row", backgroundColor: colors.bgSecondary, paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: colors.borderColor }}>
              <Text style={{ flex: 1.5, color: colors.textSecondary, fontSize: 11, fontWeight: "700" }}>Symbol</Text>
              <Text style={{ flex: 1.5, color: colors.textSecondary, fontSize: 11, fontWeight: "700" }}>Date</Text>
              <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 11, fontWeight: "700", textAlign: "right" }}>Shares</Text>
              <Text style={{ flex: 1.5, color: colors.textSecondary, fontSize: 11, fontWeight: "700", textAlign: "right" }}>P/L (KWD)</Text>
            </View>
            {data.details.slice(0, 30).map((d, idx) => (
              <View
                key={d.id}
                style={{
                  flexDirection: "row",
                  paddingVertical: 7,
                  paddingHorizontal: 12,
                  borderBottomWidth: idx < Math.min(29, data.details.length - 1) ? StyleSheet.hairlineWidth : 0,
                  borderBottomColor: colors.borderColor,
                  backgroundColor: idx % 2 === 0 ? "transparent" : colors.bgCardHover + "20",
                }}
              >
                <Text style={{ flex: 1.5, color: colors.textPrimary, fontSize: 12, fontWeight: "500" }}>{d.symbol}</Text>
                <Text style={{ flex: 1.5, color: colors.textSecondary, fontSize: 12 }}>{d.txn_date}</Text>
                <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 12, textAlign: "right" }}>{d.shares.toLocaleString()}</Text>
                <Text style={{ flex: 1.5, color: d.realized_pnl_kwd >= 0 ? colors.success : colors.danger, fontSize: 12, fontWeight: "600", textAlign: "right" }}>
                  {d.realized_pnl_kwd >= 0 ? "+" : ""}{formatCurrency(d.realized_pnl_kwd)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────

export default function OverviewScreen() {
  const { user } = useAuth();
  const { colors } = useThemeStore();
  const { metricCols, isDesktop, isPhone, spacing, fonts, maxContentWidth } = useResponsive();
  const { refresh: refreshPrices, isRefreshing: priceRefreshing } = usePriceRefresh();
  const [refreshing, setRefreshing] = useState(false);

  // AI state
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiCategory, setAiCategory] = useState<number | null>(null);

  // CBK rate (rf_rate) — manual only, persisted to backend
  const [customRfRate, setCustomRfRate] = useState<number | null>(null);
  const [editingRfRate, setEditingRfRate] = useState(false);
  const [rfRateInput, setRfRateInput] = useState("");

  // Fetch stored rf_rate from backend on mount
  const { data: storedRfRate } = useQuery({
    queryKey: ["rf-rate-setting"],
    queryFn: getRfRate,
    staleTime: Infinity,
  });

  // When stored rate loads, apply it
  React.useEffect(() => {
    if (storedRfRate != null && customRfRate === null) {
      setCustomRfRate(storedRfRate);
    }
  }, [storedRfRate]);

  // ── React Query ──
  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
  } = useQuery<OverviewData>({
    queryKey: ["portfolio-overview", user?.id],
    queryFn: getOverview,
    enabled: true,
    staleTime: 0,                 // always treat as stale so any invalidation triggers refetch
    refetchOnMount: "always",     // refetch every time the tab is focused
    refetchOnWindowFocus: true,   // refetch when window regains focus
  });

  // Additional data for parity with Streamlit
  const { data: perfData } = useQuery<PerformanceData>({
    queryKey: ["performance"],
    queryFn: () => getPerformance({ period: "all" }),
    enabled: !!data,
  });

  const { data: riskData } = useQuery<RiskMetrics>({
    queryKey: ["risk-metrics", customRfRate],
    queryFn: () => getRiskMetrics({ rf_rate: (customRfRate ?? 0) / 100 }),
    enabled: !!data && customRfRate != null,
  });

  const { data: snapshotData } = useQuery({
    queryKey: ["snapshots-chart"],
    queryFn: () => getSnapshots(),
    enabled: !!data,
  });

  const { data: realizedData } = useQuery<RealizedProfitData>({
    queryKey: ["realized-profit"],
    queryFn: () => getRealizedProfit(),
    enabled: !!data,
  });

  const { data: aiStatusData } = useQuery({
    queryKey: ["ai-status"],
    queryFn: () => getAIStatus(),
  });

  const aiMutation = useMutation({
    mutationFn: (prompt: string) =>
      analyzePortfolio({
        prompt,
        include_holdings: true,
        include_performance: true,
        language: "en",
      }),
    onSuccess: (result: any) => {
      setAiResult(result?.analysis ?? "No analysis returned.");
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.message ?? "AI analysis failed";
      setAiResult(`Error: ${msg}`);
    },
  });

  const handleAiAnalyze = (prompt: string) => {
    setAiResult(null);
    setAiPrompt(prompt);
    aiMutation.mutate(prompt);
  };

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Fetches latest prices from yfinance, then invalidates ALL
    // price-dependent queries (holdings, performance, overview, …)
    await refreshPrices();
    setRefreshing(false);
  }, [refreshPrices]);

  // ── Derived metrics ──
  const metrics = useMemo(() => {
    if (!data) return null;

    const totalValue = data.total_value ?? 0;
    const totalDeposits = data.net_deposits ?? 0;
    const netGain = data.total_gain ?? 0;
    const roiPct = data.roi_percent ?? 0;
    const holdings = data.portfolio_values
      ? Object.values(data.portfolio_values).reduce(
          (a: number, pv: any) => a + (pv.holding_count ?? 0),
          0
        )
      : 0;
    const txnCount = data.transaction_count ?? 0;

    // Profit breakdown
    const unrealizedPnl = data.by_portfolio
      ? Object.values(data.by_portfolio).reduce(
          (a: number, p: any) => a + (p.unrealized_pnl_kwd ?? 0),
          0
        )
      : 0;
    // Use realized-profit endpoint data (matches Streamlit's calculate_realized_profit_details)
    const realizedPnl = realizedData?.total_realized_kwd ?? (data.by_portfolio
      ? Object.values(data.by_portfolio).reduce(
          (a: number, p: any) => a + (p.realized_pnl_kwd ?? 0),
          0
        )
      : 0);
    const totalDividends = data.total_dividends ?? 0;
    const totalProfit = realizedPnl + unrealizedPnl + totalDividends;

    // Daily movement — LIVE from backend (matches Streamlit: live_value - prev_snapshot)
    const dailyMovement = data.daily_movement ?? 0;
    const dailyMovementPct = data.daily_movement_pct ?? 0;

    // CAGR — from backend (CFA: V_start = first deposit, V_end = live value, t = years since first deposit)
    const cagr = data.cagr_percent ?? 0;

    // Win rate + profit factor from realized trades
    const trades = realizedData?.details ?? [];
    const profitableTrades = trades.filter((t) => t.realized_pnl > 0);
    const losingTrades = trades.filter((t) => t.realized_pnl < 0);
    const totalTrades = trades.length;
    const winRate = totalTrades > 0 ? (profitableTrades.length / totalTrades) * 100 : 0;
    const grossProfit = profitableTrades.reduce((s, t) => s + t.realized_pnl_kwd, 0);
    const grossLoss = Math.abs(losingTrades.reduce((s, t) => s + t.realized_pnl_kwd, 0));
    const profitFactor = grossLoss > 0 ? grossProfit / grossLoss : grossProfit > 0 ? Infinity : 0;

    // Cash yield dividend = total dividends / total deposits
    const cashYieldDiv = totalDeposits > 0 ? (totalDividends / totalDeposits) * 100 : 0;

    return {
      totalValue,
      totalDeposits,
      netGain,
      roiPct,
      holdings,
      txnCount,
      unrealizedPnl,
      realizedPnl,
      totalDividends,
      totalProfit,
      dailyMovement,
      dailyMovementPct,
      cagr,
      winRate,
      profitFactor,
      grossProfit,
      grossLoss,
      totalTrades,
      profitableTrades: profitableTrades.length,
      cashYieldDiv,
    };
  }, [data, snapshotData, realizedData]);

  // ── Loading state ──
  if (isLoading) {
    return <LoadingScreen message="Loading portfolio…" />;
  }

  // ── Error state ──
  if (isError) {
    const errMsg =
      (error as any)?.response?.data?.detail ??
      (error as any)?.message ??
      "Failed to load";
    return <ErrorScreen message={errMsg} onRetry={() => refetch()} />;
  }

  if (!data || !metrics) return null;

  // Width for each metric card based on responsive breakpoint
  const colW =
    metricCols === 5
      ? "19%"
      : metricCols === 3
        ? "32%"
        : "48%";

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingHorizontal: spacing.pagePx,
          maxWidth: maxContentWidth,
          alignSelf: isDesktop ? "center" as const : undefined,
          width: isDesktop ? "100%" as const : undefined,
        },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.accentPrimary}
        />
      }
    >
      {/* ── Hero Banner ── */}
      <View
        style={[
          styles.banner,
          { backgroundColor: colors.bgCard, borderColor: colors.borderColor, padding: spacing.cardPadding + 6, marginBottom: spacing.sectionGap },
        ]}
      >
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            alignItems: "flex-start",
          }}
        >
          <View style={{ flex: 1 }}>
            <Text style={[styles.bannerLabel, { color: colors.textSecondary, fontSize: fonts.caption }]}>
              Total Portfolio Value
            </Text>
            <Text style={[styles.bannerValue, { color: colors.textPrimary, fontSize: fonts.hero }]}>
              {formatCurrency(metrics.totalValue)}
            </Text>
          </View>
          {/* Refresh button */}
          <Pressable
            onPress={onRefresh}
            style={({ pressed }) => ({
              minWidth: 44,
              minHeight: 44,
              alignItems: "center" as const,
              justifyContent: "center" as const,
              borderRadius: 8,
              backgroundColor: pressed ? colors.bgCardHover : "transparent",
            })}
          >
            <FontAwesome
              name="refresh"
              size={18}
              color={refreshing ? colors.accentPrimary : colors.textMuted}
            />
          </Pressable>
        </View>
        <View style={styles.bannerRow}>
          <Text
            style={[
              styles.bannerGain,
              { color: pnlColor(metrics.netGain, colors), fontSize: fonts.body + 1 },
            ]}
          >
            {formatSignedCurrency(metrics.netGain)}
          </Text>
          <Text
            style={[
              styles.bannerRoi,
              { color: pnlColor(metrics.roiPct, colors), fontSize: fonts.body + 1 },
            ]}
          >
            {" "}
            ({formatPercent(metrics.roiPct)})
          </Text>
        </View>
        <Text style={[styles.bannerSub, { color: colors.textMuted, fontSize: fonts.caption }]}>
          Stocks: {formatCurrency(data.portfolio_value)} • Cash:{" "}
          {formatCurrency(data.cash_balance)}
        </Text>
      </View>

      {/* ── Row 1: Portfolio Snapshot ── */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13) }]}>
        Portfolio Snapshot
      </Text>
      <View style={[styles.grid, { gap: spacing.gridGap, marginBottom: spacing.sectionGap }]}>
        <MetricCard
          emoji="💼"
          label="Total Value"
          value={formatCurrency(metrics.totalValue)}
          subline={`Stocks: ${formatCurrency(data.portfolio_value)} • Cash: ${formatCurrency(data.cash_balance)}`}
          accentColor={colors.accentPrimary}
          icon="suitcase"
          width={colW}
        />
        <MetricCard
          emoji="💰"
          label="Total Deposits"
          value={formatCurrency(metrics.totalDeposits)}
          subline={`Invested: ${formatCurrency(data.total_invested)}`}
          accentColor="#a855f7"
          width={colW}
        />
        <MetricCard
          label="Net Gain"
          value={formatSignedCurrency(metrics.netGain)}
          subline={`${formatPercent(metrics.roiPct)} ROI`}
          trend={metrics.netGain >= 0 ? "up" : "down"}
          icon="line-chart"
          width={colW}
        />
        <MetricCard
          emoji="📊"
          label="Active Holdings"
          value={`${metrics.holdings}`}
          subline={`${metrics.txnCount} transactions`}
          accentColor={colors.warning}
          width={colW}
        />
        <MetricCard
          label="Daily Movement"
          value={formatSignedCurrency(metrics.dailyMovement)}
          subline={`${metrics.dailyMovementPct >= 0 ? "+" : ""}${metrics.dailyMovementPct.toFixed(2)}% today`}
          trend={metrics.dailyMovement >= 0 ? "up" : "down"}
          icon="area-chart"
          width={colW}
        />
      </View>

      {/* ── Row 2: Profit Breakdown ── */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13) }]}>
        Profit Breakdown
      </Text>
      <View style={[styles.grid, { gap: spacing.gridGap, marginBottom: spacing.sectionGap }]}>
        <MetricCard
          label="Realized Profit"
          value={formatSignedCurrency(metrics.realizedPnl)}
          subline="Closed trades"
          trend={metrics.realizedPnl >= 0 ? "up" : "down"}
          icon="check-circle"
          width={isPhone ? "48%" : "32%"}
        />
        <MetricCard
          label="Unrealized P/L"
          value={formatSignedCurrency(metrics.unrealizedPnl)}
          subline="Open positions"
          trend={metrics.unrealizedPnl >= 0 ? "up" : "down"}
          icon="bar-chart"
          width={isPhone ? "48%" : "32%"}
        />
        <MetricCard
          label="Total Profit"
          value={formatSignedCurrency(metrics.totalProfit)}
          subline={`Incl. ${formatCurrency(metrics.totalDividends)} dividends`}
          trend={metrics.totalProfit >= 0 ? "up" : "down"}
          icon="trophy"
          accentColor={colors.accentTertiary}
          width={isPhone ? "100%" : "32%"}
        />
      </View>

      {/* ── Row 3: Performance Metrics (TWR / MWRR / Sharpe / Sortino) ── */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13) }]}>
        Performance Metrics
      </Text>
      <View style={[styles.grid, { gap: spacing.gridGap, marginBottom: spacing.sectionGap }]}>
        <MetricCard
          label="TWR"
          value={perfData ? formatPercent(perfData.twr_percent) : "—"}
          subline="Time-Weighted Return (GIPS)"
          icon="line-chart"
          accentColor="#3b82f6"
          width={isPhone ? "48%" : "24%"}
        />
        <MetricCard
          label="MWRR (IRR)"
          value={perfData ? formatPercent(perfData.mwrr_percent) : "—"}
          subline="Money-Weighted Return"
          icon="line-chart"
          accentColor="#8b5cf6"
          width={isPhone ? "48%" : "24%"}
        />
        <MetricCard
          label="Sharpe Ratio"
          value={riskData?.sharpe_ratio != null ? riskData.sharpe_ratio.toFixed(2) : "—"}
          subline={customRfRate != null ? `Rf: ${customRfRate.toFixed(2)}%` : "Set Rf rate →"}
          icon="balance-scale"
          accentColor="#06b6d4"
          width={isPhone ? "48%" : "24%"}
        />
      </View>

      {/* ── CBK Rate (Rf) Manual Override ── */}
      <View style={[styles.rfRateRow, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>        
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, flex: 1 }}>
          <FontAwesome name="bank" size={14} color="#06b6d4" />
          <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>
            CBK Risk-Free Rate (Rf)
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 11, marginLeft: 4 }}>
            {customRfRate != null ? `${customRfRate.toFixed(2)}%` : "Not set"}
          </Text>
        </View>
        {editingRfRate ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <TextInput
              style={{
                width: 70,
                height: 32,
                borderWidth: 1,
                borderRadius: 6,
                borderColor: colors.borderColor,
                backgroundColor: colors.bgInput ?? colors.bgSecondary,
                color: colors.textPrimary,
                paddingHorizontal: 8,
                fontSize: 13,
                textAlign: "center",
              }}
              value={rfRateInput}
              onChangeText={setRfRateInput}
              keyboardType="decimal-pad"
              placeholder="%"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <Pressable
              onPress={() => {
                const num = parseFloat(rfRateInput);
                if (!isNaN(num) && num >= 0 && num <= 100) {
                  setCustomRfRate(num);
                  setEditingRfRate(false);
                  // Persist to backend
                  setRfRate(num).catch(() => {});
                }
              }}
              style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: colors.success + "22", justifyContent: "center", alignItems: "center" }}
            >
              <FontAwesome name="check" size={12} color={colors.success} />
            </Pressable>
            <Pressable
              onPress={() => { setEditingRfRate(false); setRfRateInput(""); }}
              style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: colors.danger + "22", justifyContent: "center", alignItems: "center" }}
            >
              <FontAwesome name="times" size={12} color={colors.danger} />
            </Pressable>
          </View>
        ) : (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
            <Pressable
              onPress={() => {
                setRfRateInput(customRfRate != null ? customRfRate.toString() : "");
                setEditingRfRate(true);
              }}
              style={{ width: 30, height: 30, borderRadius: 6, backgroundColor: colors.accentPrimary + "20", justifyContent: "center", alignItems: "center" }}
            >
              <FontAwesome name="pencil" size={13} color={colors.accentPrimary} />
            </Pressable>
          </View>
        )}
      </View>

      <View style={[styles.grid, { gap: spacing.gridGap, marginBottom: spacing.sectionGap }]}>
        <MetricCard
          label="Sortino Ratio"
          value={riskData?.sortino_ratio != null ? riskData.sortino_ratio.toFixed(2) : "—"}
          subline="Downside risk-adjusted"
          icon="shield"
          accentColor="#14b8a6"
          width={isPhone ? "48%" : "24%"}
        />
        <MetricCard
          label="CAGR"
          value={formatPercent(metrics.cagr)}
          subline="Compound Annual Growth"
          icon="line-chart"
          accentColor="#f59e0b"
          width={isPhone ? "48%" : "24%"}
        />
        <MetricCard
          label="Win Rate"
          value={`${metrics.winRate.toFixed(1)}%`}
          subline={`${metrics.profitableTrades}/${metrics.totalTrades} trades`}
          icon="trophy"
          accentColor={metrics.winRate >= 50 ? colors.success : colors.danger}
          width={isPhone ? "48%" : "24%"}
        />
        <MetricCard
          label="Profit Factor"
          value={metrics.profitFactor === Infinity ? "∞" : metrics.profitFactor.toFixed(2)}
          subline={`Gain: ${formatCurrency(metrics.grossProfit)} / Loss: ${formatCurrency(metrics.grossLoss)}`}
          icon="balance-scale"
          accentColor={metrics.profitFactor >= 1 ? colors.success : colors.danger}
          width={isPhone ? "48%" : "24%"}
        />
        <MetricCard
          label="Cash Yield Div"
          value={formatPercent(metrics.cashYieldDiv)}
          subline={`Divs: ${formatCurrency(metrics.totalDividends)}`}
          icon="money"
          accentColor="#8b5cf6"
          width={isPhone ? "48%" : "24%"}
        />
      </View>

      {/* ── Portfolio Value Chart (from snapshots) ── */}
      <PortfolioChart
        data={
          [...(snapshotData?.snapshots ?? [])]
            .sort((a: SnapshotRecord, b: SnapshotRecord) =>
              a.snapshot_date.localeCompare(b.snapshot_date),
            )
            .map((s: SnapshotRecord) => ({
              date: s.snapshot_date,
              value: s.portfolio_value,
            }))
        }
        title="Total Portfolio Value Over Time"
        style={{ marginTop: 8, marginBottom: 24 }}
        height={300}
      />

      {/* ── Dividends Summary ── */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13) }]}>
        Dividend Income
      </Text>
      <View style={[styles.grid, { gap: spacing.gridGap, marginBottom: spacing.sectionGap }]}>
        <MetricCard
          emoji="💰"
          label="Cash Dividends"
          value={formatCurrency(metrics.totalDividends)}
          subline={`Yield: ${formatPercent(metrics.cashYieldDiv)}`}
          accentColor={colors.success}
          width={isPhone ? "48%" : "48%"}
        />
        <MetricCard
          emoji="📈"
          label="Net Income"
          value={formatSignedCurrency(metrics.totalDividends - (data.total_fees ?? 0))}
          subline="Dividends − Fees"
          trend={(metrics.totalDividends - (data.total_fees ?? 0)) >= 0 ? "up" : "down"}
          width={isPhone ? "48%" : "48%"}
        />
      </View>

      {/* ── Realized Trades Breakdown (expandable) ── */}
      {realizedData && realizedData.details.length > 0 && (
        <RealizedTradesSection
          data={realizedData}
          colors={colors}
          fonts={fonts}
          isPhone={isPhone}
        />
      )}

      {/* ── Per-portfolio Breakdown ── */}
      {data.portfolio_values &&
        Object.keys(data.portfolio_values).length > 0 && (
          <>
            <Text
              style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13) }]}
            >
              By Portfolio
            </Text>
            <View
              style={[
                styles.portfolioGrid,
                isDesktop && styles.portfolioGridDesktop,
                { gap: spacing.gridGap },
              ]}
            >
              {Object.entries(data.portfolio_values).map(
                ([name, pv]: [string, any]) => (
                  <PortfolioCard key={name} name={name} data={pv} />
                )
              )}
            </View>
          </>
        )}

      {/* ── AI Financial Intelligence ── */}
      <View style={[styles.aiSection, { borderColor: colors.borderColor }]}>
        <View style={styles.aiHeader}>
          <FontAwesome name="magic" size={20} color={colors.accentPrimary} />
          <Text style={[styles.sectionTitle, { color: colors.textSecondary, marginBottom: 0, marginTop: 0, marginLeft: 8 }]}>
            AI Financial Intelligence
          </Text>
        </View>

        {aiStatusData?.configured === false && (
          <View style={[styles.aiWarning, { backgroundColor: colors.warning + "22", borderColor: colors.warning }]}>
            <FontAwesome name="exclamation-triangle" size={14} color={colors.warning} />
            <Text style={{ color: colors.warning, fontSize: 13, marginLeft: 8, flex: 1 }}>
              AI not configured. Add your Gemini API key in Settings.
            </Text>
          </View>
        )}

        {/* Prompt Categories */}
        <View style={styles.aiCategories}>
          {AI_PROMPT_CATEGORIES.map((cat, idx) => (
            <Pressable
              key={cat.label}
              onPress={() => setAiCategory(aiCategory === idx ? null : idx)}
              style={[
                styles.aiCatBtn,
                {
                  backgroundColor: aiCategory === idx ? colors.accentPrimary + "22" : colors.bgCard,
                  borderColor: aiCategory === idx ? colors.accentPrimary : colors.borderColor,
                },
              ]}
            >
              <FontAwesome name={cat.icon} size={14} color={aiCategory === idx ? colors.accentPrimary : colors.textSecondary} />
              <Text style={{ color: aiCategory === idx ? colors.accentPrimary : colors.textSecondary, fontSize: 12, fontWeight: "600", marginLeft: 6 }}>
                {cat.label}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Prompt suggestions for selected category */}
        {aiCategory !== null && (
          <View style={{ marginBottom: 12 }}>
            {AI_PROMPT_CATEGORIES[aiCategory].prompts.map((p) => (
              <Pressable
                key={p}
                onPress={() => handleAiAnalyze(p)}
                style={[styles.aiPromptSuggestion, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
              >
                <Text style={{ color: colors.textPrimary, fontSize: 13, flex: 1 }}>{p}</Text>
                <FontAwesome name="arrow-right" size={12} color={colors.accentPrimary} />
              </Pressable>
            ))}
          </View>
        )}

        {/* Custom prompt input */}
        <View style={styles.aiInputRow}>
          <TextInput
            style={[styles.aiInput, { backgroundColor: colors.bgCard, color: colors.textPrimary, borderColor: colors.borderColor }]}
            placeholderTextColor={colors.textMuted}
            placeholder="Ask anything about your portfolio..."
            value={aiPrompt}
            onChangeText={setAiPrompt}
            multiline
          />
          <Pressable
            onPress={() => aiPrompt.trim() && handleAiAnalyze(aiPrompt.trim())}
            disabled={aiMutation.isPending || !aiPrompt.trim()}
            style={[
              styles.aiSendBtn,
              {
                backgroundColor: colors.accentPrimary,
                opacity: aiMutation.isPending || !aiPrompt.trim() ? 0.5 : 1,
              },
            ]}
          >
            {aiMutation.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <FontAwesome name="send" size={16} color="#fff" />
            )}
          </Pressable>
        </View>

        {/* AI Result */}
        {aiMutation.isPending && (
          <View style={[styles.aiResultCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <ActivityIndicator size="small" color={colors.accentPrimary} />
            <Text style={{ color: colors.textSecondary, marginLeft: 12, fontSize: 13 }}>Analyzing portfolio...</Text>
          </View>
        )}
        {aiResult && !aiMutation.isPending && (
          <View style={[styles.aiResultCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <ScrollView style={{ maxHeight: 400 }} nestedScrollEnabled>
              <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 22 }}>{aiResult}</Text>
            </ScrollView>
          </View>
        )}
      </View>

      {/* ── FX Footer ── */}
      <Text style={[styles.fxNote, { color: colors.textMuted }]}>
        USD/KWD Rate: {data.usd_kwd_rate?.toFixed(6) ?? "—"}
      </Text>
    </ScrollView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingVertical: 16, paddingBottom: 40 },

  // Banner
  banner: {
    borderRadius: 16,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
    borderWidth: 1,
  },
  bannerLabel: { fontSize: 14, marginBottom: 6 },
  bannerValue: { fontSize: 32, fontWeight: "700" },
  bannerRow: {
    flexDirection: "row",
    marginTop: 8,
    alignItems: "baseline",
  },
  bannerGain: { fontSize: 17, fontWeight: "600" },
  bannerRoi: { fontSize: 17, fontWeight: "600" },
  bannerSub: { fontSize: 13, marginTop: 8 },

  // Section title
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
    marginTop: 4,
  },

  // Grid
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
    marginBottom: 24,
  },

  // Portfolio cards
  portfolioGrid: { marginBottom: 16 },
  portfolioGridDesktop: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
  },

  // CBK Rate editor row
  rfRateRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
    marginTop: -6,
  },

  // FX
  fxNote: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 16,
  },

  // AI Section
  aiSection: {
    marginTop: 8,
    marginBottom: 16,
    borderTopWidth: 1,
    paddingTop: 16,
  },
  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  aiWarning: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  aiCategories: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  aiCatBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 44,
  },
  aiPromptSuggestion: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
    gap: 8,
    minHeight: 44,
  },
  aiInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 12,
  },
  aiInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 44,
    maxHeight: 100,
  },
  aiSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  aiResultCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
});
