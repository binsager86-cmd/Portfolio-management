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

import { PortfolioChart } from "@/components/charts/PortfolioChart";
import { AIFinancialIntelligence } from "@/components/overview/AIFinancialIntelligence";
import { RealizedTradesSection } from "@/components/overview/RealizedTradesSection";
import { PortfolioCard } from "@/components/portfolio/PortfolioCard";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { MetricCard } from "@/components/ui/MetricCard";
import {
    useAiStatus,
    useOverviewDependentQueries,
    usePortfolioOverview,
    useRfRateSetting,
    useRiskMetrics,
} from "@/hooks/queries";
import { useAuth } from "@/hooks/useAuth";
import { usePriceRefresh } from "@/hooks/usePriceRefresh";
import { useResponsive } from "@/hooks/useResponsive";
import {
    formatCurrency,
    formatPercent,
    formatSignedCurrency,
} from "@/lib/currency";
import { pnlColor } from "@/lib/formatting";
import {
    analyzePortfolio,
    saveSnapshot,
    setRfRate,
    SnapshotRecord
} from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import React, { useCallback, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Alert,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

// ── Main Screen ─────────────────────────────────────────────────────

export default function OverviewScreen() {
  const { user } = useAuth();
  const { colors } = useThemeStore();
  const { metricCols, isDesktop, isPhone, spacing, fonts, maxContentWidth } = useResponsive();
  const { refresh: refreshPrices } = usePriceRefresh();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  // AI state
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState<string | null>(null);
  const [aiCategory, setAiCategory] = useState<number | null>(null);

  // CBK rate (rf_rate) — manual only, persisted to backend
  const [customRfRate, setCustomRfRate] = useState<number | null>(null);
  const [editingRfRate, setEditingRfRate] = useState(false);
  const [rfRateInput, setRfRateInput] = useState("");

  // Fetch stored rf_rate from backend on mount
  const { data: storedRfRate } = useRfRateSetting();

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
  } = usePortfolioOverview(user?.id);

  // Additional data for parity with Streamlit — fire in parallel once overview loads
  const [
    { data: perfData },
    { data: snapshotData },
    { data: realizedData },
  ] = useOverviewDependentQueries(!!data);

  const { data: riskData } = useRiskMetrics(customRfRate, !!data && customRfRate != null);

  const { data: aiStatusData } = useAiStatus();

  const aiMutation = useMutation({
    mutationFn: (prompt: string) =>
      analyzePortfolio({
        prompt,
        include_holdings: true,
        include_performance: true,
        language: "en",
      }),
    onSuccess: (result) => {
      setAiResult(result?.analysis ?? "No analysis returned.");
    },
    onError: (err: Error) => {
      const msg = isAxiosError(err)
        ? (err.response?.data as Record<string, string>)?.detail ?? err.message
        : err.message ?? "AI analysis failed";
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
    await refreshPrices();
    setRefreshing(false);
  }, [refreshPrices]);

  const doSaveSnapshot = useCallback(async () => {
    setSavingSnapshot(true);
    try {
      const result = await saveSnapshot();
      await queryClient.invalidateQueries({ queryKey: ["portfolio-overview"] });
      await queryClient.invalidateQueries({ queryKey: ["snapshots"] });
      const msg = `Snapshot ${result.action}: ${result.message}\nPortfolio Value: ${formatCurrency(result.portfolio_value)} KWD`;
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Snapshot Saved", msg);
    } catch (e: any) {
      console.warn("Save snapshot failed:", e);
      const detail = e?.response?.data?.detail ?? "Failed to save snapshot. Please try again.";
      if (Platform.OS === "web") window.alert(`Error: ${detail}`);
      else Alert.alert("Error", detail);
    }
    setSavingSnapshot(false);
  }, [queryClient]);

  const onSaveSnapshot = useCallback(() => {
    if (Platform.OS === "web") {
      if (window.confirm("Save today's portfolio snapshot? This will record the current portfolio value.")) {
        doSaveSnapshot();
      }
    } else {
      Alert.alert(
        "Save Snapshot",
        "Save today's portfolio snapshot? This will record the current portfolio value.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Save", onPress: doSaveSnapshot },
        ],
      );
    }
  }, [doSaveSnapshot]);

  // ── Derived metrics ──
  const metrics = useMemo(() => {
    if (!data) return null;

    const totalValue = data.total_value ?? 0;
    const totalDeposits = data.net_deposits ?? 0;
    const netGain = data.total_gain ?? 0;
    const roiPct = data.roi_percent ?? 0;
    const holdings = data.portfolio_values
      ? Object.values(data.portfolio_values).reduce(
          (a: number, pv) => a + (pv.holding_count ?? 0),
          0
        )
      : 0;
    const txnCount = data.transaction_count ?? 0;

    // Profit breakdown
    const unrealizedPnl = data.by_portfolio
      ? Object.values(data.by_portfolio).reduce(
          (a: number, p) => a + (p.unrealized_pnl_kwd ?? 0),
          0
        )
      : 0;
    // Use realized-profit endpoint data (matches Streamlit's calculate_realized_profit_details)
    const realizedPnl = realizedData?.total_realized_kwd ?? (data.by_portfolio
      ? Object.values(data.by_portfolio).reduce(
          (a: number, p) => a + (p.realized_pnl_kwd ?? 0),
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

  const chartData = useMemo(
    () =>
      [...(snapshotData?.snapshots ?? [])]
        .sort((a: SnapshotRecord, b: SnapshotRecord) =>
          a.snapshot_date.localeCompare(b.snapshot_date),
        )
        .map((s: SnapshotRecord) => ({
          date: s.snapshot_date,
          value: s.portfolio_value,
        })),
    [snapshotData?.snapshots],
  );

  // ── Loading state ──
  if (isLoading) {
    return <LoadingScreen message="Loading portfolio…" />;
  }

  // ── Error state ──
  if (isError) {
    const errMsg = isAxiosError(error)
      ? (error.response?.data as Record<string, string>)?.detail ?? error.message
      : error instanceof Error
        ? error.message
        : "Failed to load";
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
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.bannerLabel, { color: colors.textSecondary, fontSize: fonts.caption }]}>
            Total Portfolio Value
          </Text>
          <Text style={[styles.bannerValue, { color: colors.textPrimary, fontSize: fonts.hero }]}>
            {formatCurrency(metrics.totalValue)}
          </Text>
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

        {/* Action buttons */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 14 }}>
          <Pressable
            onPress={onRefresh}
            disabled={refreshing || savingSnapshot}
            style={({ pressed }) => ({
              flexDirection: "row" as const,
              alignItems: "center" as const,
              justifyContent: "center" as const,
              gap: 7,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: pressed ? colors.accentSecondary : colors.accentPrimary,
              opacity: refreshing ? 0.7 : 1,
            })}
          >
            {refreshing ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <FontAwesome name="refresh" size={14} color="#fff" />
            )}
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: fonts.caption + 1 }}>
              {refreshing ? "Refreshing…" : "Refresh Prices"}
            </Text>
          </Pressable>

          <Pressable
            onPress={onSaveSnapshot}
            disabled={savingSnapshot || refreshing}
            style={({ pressed }) => ({
              flexDirection: "row" as const,
              alignItems: "center" as const,
              justifyContent: "center" as const,
              gap: 7,
              paddingHorizontal: 16,
              paddingVertical: 10,
              borderRadius: 10,
              backgroundColor: pressed ? "#059669" : colors.success,
              opacity: savingSnapshot ? 0.7 : 1,
            })}
          >
            {savingSnapshot ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <FontAwesome name="camera" size={14} color="#fff" />
            )}
            <Text style={{ color: "#fff", fontWeight: "600", fontSize: fonts.caption + 1 }}>
              {savingSnapshot ? "Saving…" : "Save Snapshot"}
            </Text>
          </Pressable>
        </View>
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
          value={formatPercent(data?.mwrr_percent ?? perfData?.mwrr_percent ?? null)}
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
        <View style={styles.rfLabelRow}>
          <FontAwesome name="bank" size={14} color="#06b6d4" />
          <Text style={[styles.rfLabel, { color: colors.textPrimary }]}>
            CBK Risk-Free Rate (Rf)
          </Text>
          <Text style={[styles.rfValue, { color: colors.textMuted }]}>
            {customRfRate != null ? `${customRfRate.toFixed(2)}%` : "Not set"}
          </Text>
        </View>
        {editingRfRate ? (
          <View style={styles.rfEditRow}>
            <TextInput
              style={[styles.rfInput, {
                borderColor: colors.borderColor,
                backgroundColor: colors.bgInput ?? colors.bgSecondary,
                color: colors.textPrimary,
              }]}
              value={rfRateInput}
              onChangeText={setRfRateInput}
              keyboardType="decimal-pad"
              placeholder="%"
              placeholderTextColor={colors.textMuted}
              autoFocus
            />
            <Pressable
              onPress={async () => {
                const num = parseFloat(rfRateInput);
                if (!isNaN(num) && num >= 0 && num <= 100) {
                  setCustomRfRate(num);
                  setEditingRfRate(false);
                  // Persist to backend
                  try {
                    await setRfRate(num);
                  } catch (err: unknown) {
                    if (__DEV__) console.warn("Failed to persist rf_rate", err);
                  }
                }
              }}
              style={[styles.iconBtn, { backgroundColor: colors.success + "22" }]}
            >
              <FontAwesome name="check" size={12} color={colors.success} />
            </Pressable>
            <Pressable
              onPress={() => { setEditingRfRate(false); setRfRateInput(""); }}
              style={[styles.iconBtn, { backgroundColor: colors.danger + "22" }]}
            >
              <FontAwesome name="times" size={12} color={colors.danger} />
            </Pressable>
          </View>
        ) : (
          <View style={styles.rfEditRow}>
            <Pressable
              onPress={() => {
                setRfRateInput(customRfRate != null ? customRfRate.toString() : "");
                setEditingRfRate(true);
              }}
              style={[styles.iconBtn, { backgroundColor: colors.accentPrimary + "20" }]}
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
        data={chartData}
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
                ([name, pv]) => (
                  <PortfolioCard key={name} name={name} data={pv} />
                )
              )}
            </View>
          </>
        )}

      {/* ── AI Financial Intelligence ── */}
      <AIFinancialIntelligence
        colors={colors}
        aiCategory={aiCategory}
        setAiCategory={setAiCategory}
        aiPrompt={aiPrompt}
        setAiPrompt={setAiPrompt}
        aiResult={aiResult}
        aiMutation={aiMutation}
        handleAiAnalyze={handleAiAnalyze}
        aiStatusData={aiStatusData}
      />

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
  rfLabelRow: { flexDirection: "row", alignItems: "center", gap: 8, flex: 1 },
  rfLabel: { fontSize: 13, fontWeight: "600" },
  rfValue: { fontSize: 11, marginLeft: 4 },
  rfEditRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  rfInput: {
    width: 70,
    height: 32,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    fontSize: 13,
    textAlign: "center",
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 6,
    justifyContent: "center",
    alignItems: "center",
  },

  // FX
  fxNote: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 16,
  },
});
