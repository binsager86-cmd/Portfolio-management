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
import { NewsFeed } from "@/components/news/NewsFeed";
import { FirstTimeSetup } from "@/components/onboarding/FirstTimeSetup";
import { AIFinancialIntelligence } from "@/components/overview/AIFinancialIntelligence";
import { HistoricalPerformance } from "@/components/overview/HistoricalPerformance";
import { PortfolioHealthCard } from "@/components/overview/PortfolioHealthCard";
import { RealizedTradesSection } from "@/components/overview/RealizedTradesSection";
import { PortfolioCard } from "@/components/portfolio/PortfolioCard";
import { TradeSimulatorModal } from "@/components/trading/TradeSimulatorModal";
import { withErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { LastUpdated } from "@/components/ui/LastUpdated";
import { MetricCard } from "@/components/ui/MetricCard";
import { OverviewSkeleton } from "@/components/ui/OverviewSkeleton";
import {
    useHoldings,
    useOverviewDependentQueries,
    usePortfolioOverview,
    useRfRateSetting,
    useRiskMetrics,
} from "@/hooks/queries";
import { useAiStatus } from "@/hooks/queries/useSettingsQueries";
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
import { useAuthStore } from "@/services/authStore";
import { useThemeStore } from "@/services/themeStore";
import { useUserPrefsStore } from "@/src/store/userPrefsStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { isAxiosError } from "axios";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
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
import { useSafeAreaInsets } from "react-native-safe-area-context";

// ── Sub-tab type ─────────────────────────────────────────────────────

type OverviewTab = "dashboard" | "historical";

// ── Main Screen ─────────────────────────────────────────────────────

function OverviewScreen() {
  const { user } = useAuth();
  const { colors, toggle, mode } = useThemeStore();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const { metricCols, isDesktop, isPhone, spacing, fonts, maxContentWidth, showSidebar } = useResponsive();
  const { refresh: refreshPrices } = usePriceRefresh();
  const queryClient = useQueryClient();
  const [refreshing, setRefreshing] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);

  // Sub-tab state
  const [activeTab, setActiveTab] = useState<OverviewTab>("dashboard");

  // Insight cards
  const expertiseLevel = useUserPrefsStore((s) => s.preferences.expertiseLevel);
  const showAdvancedMetrics = useUserPrefsStore((s) => s.preferences.showAdvancedMetrics);
  const dividendFocus = useUserPrefsStore((s) => s.preferences.dividendFocus);
  const [showSimulator, setShowSimulator] = useState(false);
  const [profitOpen, setProfitOpen] = useState(false);

  // AI Financial Intelligence state
  const [aiCategory, setAiCategory] = useState<number | null>(null);
  const [aiPrompt, setAiPrompt] = useState("");
  const [aiResult, setAiResult] = useState<string | null>(null);
  const { data: aiStatusData } = useAiStatus();

  const aiMutation = useMutation({
    mutationFn: (prompt: string) =>
      analyzePortfolio({ prompt, include_holdings: true, include_performance: true }),
    onSuccess: (data) => {
      setAiResult(data?.analysis ?? "");
    },
  });

  const handleAiAnalyze = useCallback((prompt: string) => {
    setAiResult(null);
    aiMutation.mutate(prompt);
  }, [aiMutation]);

  // First-time setup wizard — only for genuinely new users with no data.
  // Skip if user already has holdings or transactions (existing user).
  const [showSetup, setShowSetup] = useState(false);
  useEffect(() => {
    async function checkSetup() {
      try {
        let completed: boolean;
        if (Platform.OS === "web") {
          completed = localStorage.getItem("onboarding_complete") === "1";
        } else {
          const SecureStore = await import("expo-secure-store");
          completed = (await SecureStore.getItemAsync("onboarding_complete")) === "1";
        }
        if (completed) return;

        // Existing users who have portfolio data should never see the setup wizard.
        // Auto-set the flag so it never shows again.
        const { token } = useAuthStore.getState();
        if (token) {
          // Wait briefly for overview data to be available via React Query cache
          // If data already loaded, check it; otherwise mark complete for safety
          // (an existing user with a token should never see this wizard)
          if (Platform.OS === "web") {
            localStorage.setItem("onboarding_complete", "1");
          } else {
            const SecureStore = await import("expo-secure-store");
            await SecureStore.setItemAsync("onboarding_complete", "1");
          }
          return;
        }

        setShowSetup(true);
      } catch {
        // ignore — don't block the overview
      }
    }
    checkSetup();
  }, []);

  const handleSetupComplete = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        localStorage.setItem("onboarding_complete", "1");
      } else {
        const SecureStore = await import("expo-secure-store");
        await SecureStore.setItemAsync("onboarding_complete", "1");
      }
    } catch {}
    setShowSetup(false);
  }, []);

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
    dataUpdatedAt,
    isFetching,
  } = usePortfolioOverview(user?.id);

  // Additional data for parity with Streamlit — fire in parallel once overview loads
  const [
    { data: perfData },
    { data: snapshotData },
    { data: realizedData },
  ] = useOverviewDependentQueries(!!data);

  const { data: riskData } = useRiskMetrics(customRfRate, !!data && customRfRate != null);

  const { data: holdingsResp } = useHoldings();

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
      const msg = t('dashboard.snapshotMsg', { action: result.action, message: result.message, value: formatCurrency(result.portfolio_value) });
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert(t('dashboard.snapshotSaved'), msg);
    } catch (e: any) {
      console.warn("Save snapshot failed:", e);
      const detail = e?.response?.data?.detail ?? t('dashboard.snapshotFailed');
      if (Platform.OS === "web") window.alert(`Error: ${detail}`);
      else Alert.alert(t('app.error'), detail);
    }
    setSavingSnapshot(false);
  }, [queryClient]);

  const onSaveSnapshot = useCallback(() => {
    if (Platform.OS === "web") {
      if (window.confirm(t('dashboard.snapshotConfirm'))) {
        doSaveSnapshot();
      }
    } else {
      Alert.alert(
        t('dashboard.saveSnapshot'),
        t('dashboard.snapshotConfirm'),
        [
          { text: t('app.cancel'), style: "cancel" },
          { text: t('dashboard.saveSnapshot'), onPress: doSaveSnapshot },
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
    return <OverviewSkeleton />;
  }

  // ── Error state ──
  if (isError) {
    const errMsg = isAxiosError(error)
      ? (error.response?.data as Record<string, string>)?.detail ?? error.message
      : error instanceof Error
        ? error.message
        : t('app.failedToLoad');
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
    <>
    <ScrollView
      style={[styles.container, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={[
        styles.content,
        {
          paddingTop: showSidebar ? insets.top + 8 : 8,
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
      {/* ── Inline scrollable header (only on web/desktop where tab header is hidden) ── */}
      {showSidebar && (
        <View style={styles.inlineHeader}>
          <View style={{ flex: 1 }}>
            <Text style={[styles.inlineHeaderTitle, { color: colors.textPrimary }]}>
              {t('nav.overview')}
            </Text>
            <LastUpdated timestamp={dataUpdatedAt} isFetching={isFetching} />
          </View>
          <Pressable onPress={toggle} style={styles.inlineHeaderBtn}>
            {({ pressed }) => (
              <FontAwesome
                name={mode === "dark" ? "lightbulb-o" : "moon-o"}
                size={20}
                color={colors.textSecondary}
                style={{ opacity: pressed ? 0.5 : 1 }}
              />
            )}
          </Pressable>
        </View>
      )}
      {!showSidebar && <LastUpdated timestamp={dataUpdatedAt} isFetching={isFetching} />}

      {/* ── Hero Banner ── */}
      <View
        style={[
          styles.banner,
          { backgroundColor: colors.bgCard, borderColor: colors.borderColor, padding: spacing.cardPadding + 6, marginBottom: spacing.sectionGap },
        ]}
      >
        <View style={{ alignItems: "center" }}>
          <Text style={[styles.bannerLabel, { color: colors.textSecondary, fontSize: fonts.caption }]}>
            {t('dashboard.totalValue')}
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
          {t('dashboard.stocks')}: {formatCurrency(data.portfolio_value)} • {t('dashboard.cash')}:{" "}
          {formatCurrency(data.cash_balance)}
        </Text>

        {/* Action buttons */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16 }}>
          <Pressable
            onPress={onRefresh}
            disabled={refreshing || savingSnapshot}
            accessibilityRole="button"
            accessibilityLabel={refreshing ? "Refreshing prices" : "Refresh prices"}
            accessibilityState={{ disabled: refreshing || savingSnapshot }}
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
              {refreshing ? t('dashboard.refreshing') : t('dashboard.refreshPrices')}
            </Text>
          </Pressable>

          <Pressable
            onPress={onSaveSnapshot}
            disabled={savingSnapshot || refreshing}
            accessibilityRole="button"
            accessibilityLabel={savingSnapshot ? "Saving snapshot" : "Save snapshot"}
            accessibilityState={{ disabled: savingSnapshot || refreshing }}
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
              {savingSnapshot ? t('dashboard.saving') : t('dashboard.saveSnapshot')}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── Sub-tab bar ── */}
      <View style={[styles.tabBarContainer, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, marginBottom: spacing.sectionGap }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 6 }}>
          {([
            { key: "dashboard" as OverviewTab, label: t("historical.tabDashboard"), icon: "th-large" as const },
            { key: "historical" as OverviewTab, label: t("historical.tabHistorical"), icon: "history" as const },
          ]).map((tab) => {
            const active = activeTab === tab.key;
            return (
              <Pressable
                key={tab.key}
                onPress={() => setActiveTab(tab.key)}
                style={[
                  styles.tabBtn,
                  active && [styles.tabBtnActive, { backgroundColor: colors.accentPrimary + "12" }],
                ]}
              >
                <FontAwesome
                  name={tab.icon}
                  size={13}
                  color={active ? colors.accentPrimary : colors.textMuted}
                  style={{ marginRight: 6 }}
                />
                <Text style={{
                  color: active ? colors.accentPrimary : colors.textSecondary,
                  fontWeight: active ? "700" : "500",
                  fontSize: 13,
                }}>
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Historical Performance tab ── */}
      {activeTab === "historical" && (
        <HistoricalPerformance
          snapshotData={snapshotData}
          realizedData={realizedData}
        />
      )}

      {/* ── Dashboard tab content ── */}
      {activeTab === "dashboard" && (<>
      {/* ── Row 1: Portfolio Snapshot ── */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13) }]}>
        {t('dashboard.portfolioSnapshot')}
      </Text>
      <View style={[styles.grid, { gap: spacing.gridGap, marginBottom: spacing.sectionGap }]}>
        <MetricCard
          emoji="💼"
          label={t('dashboard.totalValue_label')}
          value={formatCurrency(metrics.totalValue)}
          subline={`${t('dashboard.stocks')}: ${formatCurrency(data.portfolio_value)} • ${t('dashboard.cash')}: ${formatCurrency(data.cash_balance)}`}
          accentColor={colors.accentPrimary}
          icon="suitcase"
          width={colW}
        />
        <MetricCard
          emoji="💰"
          label={t('dashboard.totalDeposits')}
          value={formatCurrency(metrics.totalDeposits)}
          accentColor="#a855f7"
          width={colW}
        />
        <MetricCard
          label={t('dashboard.netGain')}
          value={formatSignedCurrency(metrics.netGain)}
          subline={`${formatPercent(metrics.roiPct)} ${t('dashboard.roi')}`}
          trend={metrics.netGain >= 0 ? "up" : "down"}
          icon="line-chart"
          width={colW}
        />
        <MetricCard
          emoji="📊"
          label={t('dashboard.activeHoldings')}
          value={`${metrics.holdings}`}
          subline={`${metrics.txnCount} ${t('dashboard.transactions')}`}
          accentColor={colors.warning}
          width={colW}
        />
        <MetricCard
          label={t('dashboard.dailyMovement')}
          value={formatSignedCurrency(metrics.dailyMovement)}
          subline={`${metrics.dailyMovementPct >= 0 ? "+" : ""}${metrics.dailyMovementPct.toFixed(2)}% ${t('dashboard.today')}`}
          trend={metrics.dailyMovement >= 0 ? "up" : "down"}
          icon="area-chart"
          width={colW}
        />
      </View>

      {/* ── Row 2: Profit Breakdown ── */}
      <Pressable
        onPress={() => expertiseLevel === "normal" && setProfitOpen((v) => !v)}
        style={[styles.accordionHeader, { borderColor: expertiseLevel === "normal" ? colors.borderColor : "transparent" }]}
        disabled={expertiseLevel !== "normal"}
      >
        <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13), marginBottom: 0 }]}>
          {t('dashboard.profitBreakdown')}
        </Text>
        {expertiseLevel === "normal" && (
          <FontAwesome name={profitOpen ? "chevron-up" : "chevron-down"} size={12} color={colors.textMuted} />
        )}
      </Pressable>
      {(expertiseLevel !== "normal" || profitOpen) && (
      <View style={[styles.grid, { gap: spacing.gridGap, marginBottom: spacing.sectionGap }]}>
        <MetricCard
          label={t('dashboard.realizedProfit')}
          value={formatSignedCurrency(metrics.realizedPnl)}
          subline={t('dashboard.closedTrades')}
          trend={metrics.realizedPnl >= 0 ? "up" : "down"}
          icon="check-circle"
          width={isPhone ? "48%" : "32%"}
        />
        <MetricCard
          label={t('dashboard.unrealizedPL')}
          value={formatSignedCurrency(metrics.unrealizedPnl)}
          subline={t('dashboard.openPositions')}
          trend={metrics.unrealizedPnl >= 0 ? "up" : "down"}
          icon="bar-chart"
          width={isPhone ? "48%" : "32%"}
        />
        <MetricCard
          label={t('dashboard.totalProfit')}
          value={formatSignedCurrency(metrics.totalProfit)}
          subline={t('dashboard.inclDividends', { amount: formatCurrency(metrics.totalDividends) })}
          trend={metrics.totalProfit >= 0 ? "up" : "down"}
          icon="trophy"
          accentColor={colors.accentTertiary}
          width={isPhone ? "100%" : "32%"}
        />
      </View>
      )}

      {/* ── Row 3: Performance Metrics (TWR / MWRR / Sharpe / Sortino) ── */}
      {showAdvancedMetrics && (<>
      <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13) }]}>
        {t('dashboard.performanceMetrics')}
      </Text>
      <View style={[styles.grid, { gap: spacing.gridGap, marginBottom: spacing.sectionGap }]}>
        <MetricCard
          label="TWR"
          value={perfData ? formatPercent(perfData.twr_percent) : "—"}
          subline={t('dashboard.timeWeightedReturn')}
          icon="line-chart"
          accentColor="#3b82f6"
          width={isPhone ? "48%" : "24%"}
        />
        <MetricCard
          label={t('dashboard.mwrr')}
          value={formatPercent(data?.mwrr_percent ?? perfData?.mwrr_percent ?? null)}
          subline={t('dashboard.moneyWeightedReturn')}
          icon="line-chart"
          accentColor="#8b5cf6"
          width={isPhone ? "48%" : "24%"}
        />
        <MetricCard
          label={t('dashboard.sharpeRatio')}
          value={riskData?.sharpe_ratio != null ? riskData.sharpe_ratio.toFixed(2) : "—"}
          subline={customRfRate != null ? t('dashboard.rfRate', { rate: customRfRate.toFixed(2) }) : t('dashboard.setRfRate')}
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
            {t('dashboard.riskFreeRate')}
          </Text>
          <Text style={[styles.rfValue, { color: colors.textMuted }]}>
            {customRfRate != null ? `${customRfRate.toFixed(2)}%` : t('dashboard.notSet')}
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
          label={t('dashboard.sortinoRatio')}
          value={riskData?.sortino_ratio != null ? riskData.sortino_ratio.toFixed(2) : "—"}
          subline={t('dashboard.downsideRiskAdjusted')}
          icon="shield"
          accentColor="#14b8a6"
          width={isPhone ? "48%" : "24%"}
        />
        <MetricCard
          label={t('dashboard.cagr')}
          value={formatPercent(metrics.cagr)}
          subline={t('dashboard.compoundAnnualGrowth')}
          icon="line-chart"
          accentColor="#f59e0b"
          width={isPhone ? "48%" : "24%"}
        />
        <MetricCard
          label={t('dashboard.winRate')}
          value={`${metrics.winRate.toFixed(1)}%`}
          subline={t('dashboard.winRateSubline', { profitable: metrics.profitableTrades, total: metrics.totalTrades })}
          icon="trophy"
          accentColor={metrics.winRate >= 50 ? colors.success : colors.danger}
          width={isPhone ? "48%" : "24%"}
        />
        <MetricCard
          label={t('dashboard.profitFactor')}
          value={metrics.profitFactor === Infinity ? "∞" : metrics.profitFactor.toFixed(2)}
          subline={t('dashboard.profitFactorSubline', { gain: formatCurrency(metrics.grossProfit), loss: formatCurrency(metrics.grossLoss) })}
          icon="balance-scale"
          accentColor={metrics.profitFactor >= 1 ? colors.success : colors.danger}
          width={isPhone ? "48%" : "24%"}
        />
        <MetricCard
          label={t('dashboard.cashYieldDiv')}
          value={formatPercent(metrics.cashYieldDiv)}
          subline={t('dashboard.divsSubline', { amount: formatCurrency(metrics.totalDividends) })}
          icon="money"
          accentColor="#8b5cf6"
          width={isPhone ? "48%" : "24%"}
        />
      </View>
      </>)}

      {/* ── Portfolio Value Chart (from snapshots) ── */}
      {expertiseLevel !== "normal" && (
        <PortfolioChart
          data={chartData}
          title={t('dashboard.totalPortfolioOverTime')}
          style={{ marginTop: 8, marginBottom: 24 }}
          height={300}
        />
      )}

      {/* ── Dividends Summary ── */}
      <Text style={[styles.sectionTitle, { color: dividendFocus ? colors.accentPrimary : colors.textSecondary, fontSize: Math.max(fonts.caption, 13) }]}>
        {dividendFocus ? "💰 " : ""}{t('dashboard.dividendIncome')}
      </Text>
      <View style={[styles.grid, { gap: spacing.gridGap, marginBottom: spacing.sectionGap }]}>
        <MetricCard
          emoji="💰"
          label={t('dashboard.cashDividends')}
          value={formatCurrency(metrics.totalDividends)}
          subline={t('dashboard.yieldSubline', { yield: formatPercent(metrics.cashYieldDiv) })}
          accentColor={colors.success}
          width={dividendFocus ? (isPhone ? "100%" : "32%") : (isPhone ? "48%" : "48%")}
        />
        <MetricCard
          emoji="📈"
          label={t('dashboard.netIncome')}
          value={formatSignedCurrency(metrics.totalDividends - (data.total_fees ?? 0))}
          subline={t('dashboard.dividendsMinusFees')}
          trend={(metrics.totalDividends - (data.total_fees ?? 0)) >= 0 ? "up" : "down"}
          width={dividendFocus ? (isPhone ? "48%" : "32%") : (isPhone ? "48%" : "48%")}
        />
        {dividendFocus && (
          <MetricCard
            emoji="📊"
            label={t('dashboard.yieldOnCost')}
            value={formatPercent(metrics.cashYieldDiv)}
            subline={t('dashboard.depositsSubline', { amount: formatCurrency(metrics.totalDeposits) })}
            accentColor="#8b5cf6"
            width={isPhone ? "48%" : "32%"}
          />
        )}
      </View>

      {/* ── Realized Trades Breakdown (expandable) ── */}
      {expertiseLevel !== "normal" && realizedData && realizedData.details.length > 0 && (
        <RealizedTradesSection
          data={realizedData}
          colors={colors}
          fonts={fonts}
          isPhone={isPhone}
        />
      )}

      {/* ── Per-portfolio Breakdown ── */}
      {expertiseLevel !== "normal" && data.portfolio_values &&
        Object.keys(data.portfolio_values).length > 0 && (
          <>
            <Text
              style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13) }]}
            >
              {t('dashboard.byPortfolio')}
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

      {/* ── Portfolio Health ── */}
      <View style={{ marginBottom: spacing.sectionGap }}>
        <PortfolioHealthCard
          colors={colors}
          totalValue={metrics.totalValue}
          cashBalance={data.cash_balance}
          holdings={holdingsResp?.holdings ?? []}
          roiPct={metrics.roiPct}
          isBeginner={expertiseLevel === "normal"}
        />
      </View>

      {/* ── News for Your Holdings ── */}
      <Text style={[styles.sectionTitle, { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13) }]}>
        {t('news.portfolioNews')}
      </Text>
      <View style={{ marginBottom: spacing.sectionGap }}>
        <NewsFeed portfolioOnly compact maxItems={3} hideCategoryFilter />
      </View>

      {/* ── Trade Simulator FAB ── */}
      {expertiseLevel !== "normal" && (
      <Pressable
        onPress={() => setShowSimulator(true)}
        style={[styles.simulatorFab, { backgroundColor: colors.accentPrimary }]}
        accessibilityRole="button"
        accessibilityLabel={t("simulator.title")}
      >
        <FontAwesome name="flask" size={16} color={colors.bgPrimary} />
        <Text style={[styles.simulatorFabText, { color: colors.bgPrimary }]}>{t("simulator.title")}</Text>
      </Pressable>
      )}

      {/* ── FX Footer ── */}
      <Text style={[styles.fxNote, { color: colors.textMuted }]}>
        {t('dashboard.fxRate', { rate: data.usd_kwd_rate?.toFixed(6) ?? "—" })}
      </Text>
    </>)}
    </ScrollView>

    <FirstTimeSetup visible={showSetup} onComplete={handleSetupComplete} />
    <TradeSimulatorModal visible={showSimulator} onClose={() => setShowSimulator(false)} />
    </>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  content: { paddingVertical: 16, paddingBottom: 40 },

  // Inline scrollable header
  inlineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 16,
  },
  inlineHeaderTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  inlineHeaderBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },

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
  bannerSub: { fontSize: 13, marginTop: 10 },

  // Section title
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
    marginTop: 4,
  },

  // Accordion header for collapsible sections
  accordionHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
    marginTop: 4,
    paddingVertical: 6,
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

  // Simulator FAB
  simulatorFab: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 24,
    marginTop: 8,
  },
  simulatorFabText: {
    fontSize: 14,
    fontWeight: "600",
  },

  // Sub-tab bar
  tabBarContainer: {
    borderRadius: 12,
    borderWidth: 1,
    paddingVertical: 4,
    marginTop: 4,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    marginHorizontal: 2,
  },
  tabBtnActive: {
    borderRadius: 8,
  },
});

export default withErrorBoundary(OverviewScreen, "Unable to load the Overview dashboard. Please try again.");
