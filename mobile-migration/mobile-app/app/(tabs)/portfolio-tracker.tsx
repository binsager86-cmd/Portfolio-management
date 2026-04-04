/**
 * Portfolio Tracker — full-featured tracker matching Streamlit's
 * ui_portfolio_tracker() implementation.
 *
 * Features:
 * - 3 KPI cards: Total Portfolio Value (cyan), Net Gain (emerald), ROI (purple)
 * - 2 charts: Portfolio Value Over Time, Net Gain Over Time
 * - Full snapshot table: Date, Value, Daily Movement, Beginning Diff,
 *   Deposit Cash, Accumulated Cash, Net Gain, Change%, ROI%
 * - Save Snapshot / Clear All actions
 * - Color-coded numeric cells (green positive, red negative)
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useMemo, useState } from "react";
import {
    Alert,
    LayoutChangeEvent,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import SnapshotLineChart, {
    ChartDataPoint,
    ChartPalette,
} from "@/components/charts/SnapshotLineChart";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { PortfolioTrackerSkeleton } from "@/components/ui/PageSkeletons";
import type { ThemePalette } from "@/constants/theme";
import { useSnapshots } from "@/hooks/queries";
import { useResponsive } from "@/hooks/useResponsive";
import { fmtNum, formatPercent } from "@/lib/currency";
import { logError, showErrorAlert } from "@/lib/errorHandling";
import {
    deleteAllSnapshots,
    deleteSnapshot,
    recalculateSnapshots,
    saveSnapshot,
    SnapshotRecord,
    updatePrices,
} from "@/services/api";
import { useThemeStore } from "@/services/themeStore";

// ── Chart color constants (matching Streamlit Plotly) ────────────────

const CHART_COLORS = {
  valueLine: { dark: "#06b6d4", light: "#1D4ED8" },
  gainLine: { dark: "#10b981", light: "#047857" },
};

// ── Premium chart palettes ──────────────────────────────────────────

/** Teal → Cyan palette for the Portfolio Value chart */
const VALUE_PALETTE_DARK: ChartPalette = {
  primary: "#06B6D4",
  secondary: "#0EA5E9",
  primaryLight: "#22D3EE",
  secondaryLight: "#38BDF8",
  primaryGlow: "rgba(6,182,212,0.45)",
  secondaryGlow: "rgba(14,165,233,0.45)",
  areaTopOpacity: 0.45,
  areaMidOpacity: 0.12,
  areaBotOpacity: 0.02,
  guideLine: "rgba(255,255,255,0.15)",
  dotFill: "#FFFFFF",
  tooltipBg: "rgba(18,18,28,0.88)",
  tooltipBorder: "rgba(6,182,212,0.35)",
  tooltipShadow: "rgba(6,182,212,0.25)",
  tooltipValue: "#FFFFFF",
  tooltipDate: "rgba(255,255,255,0.55)",
  chartBg: "#0F0F0F",
};

const VALUE_PALETTE_LIGHT: ChartPalette = {
  primary: "#0891B2",
  secondary: "#0284C7",
  primaryLight: "#06B6D4",
  secondaryLight: "#0EA5E9",
  primaryGlow: "rgba(8,145,178,0.22)",
  secondaryGlow: "rgba(2,132,199,0.22)",
  areaTopOpacity: 0.28,
  areaMidOpacity: 0.08,
  areaBotOpacity: 0.01,
  guideLine: "rgba(100,116,139,0.22)",
  dotFill: "#FFFFFF",
  tooltipBg: "rgba(255,255,255,0.92)",
  tooltipBorder: "rgba(8,145,178,0.25)",
  tooltipShadow: "rgba(100,116,139,0.18)",
  tooltipValue: "#1e293b",
  tooltipDate: "rgba(100,116,139,0.72)",
  chartBg: "#F7F8FC",
};

/** Emerald → Teal palette for the Net Gain chart */
const GAIN_PALETTE_DARK: ChartPalette = {
  primary: "#10B981",
  secondary: "#14B8A6",
  primaryLight: "#34D399",
  secondaryLight: "#2DD4BF",
  primaryGlow: "rgba(16,185,129,0.45)",
  secondaryGlow: "rgba(20,184,166,0.45)",
  areaTopOpacity: 0.45,
  areaMidOpacity: 0.12,
  areaBotOpacity: 0.02,
  guideLine: "rgba(255,255,255,0.15)",
  dotFill: "#FFFFFF",
  tooltipBg: "rgba(18,18,28,0.88)",
  tooltipBorder: "rgba(16,185,129,0.35)",
  tooltipShadow: "rgba(16,185,129,0.25)",
  tooltipValue: "#FFFFFF",
  tooltipDate: "rgba(255,255,255,0.55)",
  chartBg: "#0F0F0F",
};

const GAIN_PALETTE_LIGHT: ChartPalette = {
  primary: "#059669",
  secondary: "#0D9488",
  primaryLight: "#10B981",
  secondaryLight: "#14B8A6",
  primaryGlow: "rgba(5,150,105,0.22)",
  secondaryGlow: "rgba(13,148,136,0.22)",
  areaTopOpacity: 0.28,
  areaMidOpacity: 0.08,
  areaBotOpacity: 0.01,
  guideLine: "rgba(100,116,139,0.22)",
  dotFill: "#FFFFFF",
  tooltipBg: "rgba(255,255,255,0.92)",
  tooltipBorder: "rgba(5,150,105,0.25)",
  tooltipShadow: "rgba(100,116,139,0.18)",
  tooltipValue: "#1e293b",
  tooltipDate: "rgba(100,116,139,0.72)",
  chartBg: "#F7F8FC",
};

// ── KPI card colors ─────────────────────────────────────────────────

const KPI_STYLES = {
  value: {
    dark: { bg: "rgba(6,182,212,0.12)", border: "rgba(6,182,212,0.3)", accent: "#06b6d4" },
    light: { bg: "rgba(29,78,216,0.08)", border: "rgba(29,78,216,0.2)", accent: "#1D4ED8" },
  },
  netGain: {
    dark: { bg: "rgba(16,185,129,0.12)", border: "rgba(16,185,129,0.3)", accent: "#10b981" },
    light: { bg: "rgba(4,120,87,0.08)", border: "rgba(4,120,87,0.2)", accent: "#047857" },
  },
  roi: {
    dark: { bg: "rgba(138,43,226,0.12)", border: "rgba(138,43,226,0.3)", accent: "#8a2be2" },
    light: { bg: "rgba(99,102,241,0.08)", border: "rgba(99,102,241,0.2)", accent: "#6366f1" },
  },
  avgMovement: {
    dark: { bg: "rgba(245,158,11,0.12)", border: "rgba(245,158,11,0.3)", accent: "#f59e0b" },
    light: { bg: "rgba(217,119,6,0.08)", border: "rgba(217,119,6,0.2)", accent: "#d97706" },
  },
};

// ── Component ───────────────────────────────────────────────────────

export default function PortfolioTrackerScreen() {
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();
  const isDark = colors.mode === "dark";

  const [containerWidth, setContainerWidth] = useState(900);
  const handleLayout = useCallback((e: LayoutChangeEvent) => {
    const w = e.nativeEvent.layout.width;
    if (w > 0) setContainerWidth(w - 32);
  }, []);

  // ── Data fetching ────────────────────────────────────────────────

  const {
    data: snapData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useSnapshots();

  const saveMutation = useMutation({
    mutationFn: () => saveSnapshot(),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["snapshots"] });
      const msg = `${result.action}: ${result.message}\nPortfolio Value: ${fmtNum(result.portfolio_value)} KWD`;
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Snapshot Saved", msg);
    },
    onError: (err: any) => {
      logError("SaveSnapshot", err);
      showErrorAlert("Error", err, "Failed to save snapshot");
    },
    retry: 1,
  });

  const deleteOneMutation = useMutation({
    mutationFn: deleteSnapshot,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["snapshots"] }),
  });

  const deleteAllMutation = useMutation({
    mutationFn: deleteAllSnapshots,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["snapshots"] });
      const msg = `Deleted ${result.deleted_count} snapshots`;
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Deleted", msg);
    },
  });

  const recalcMutation = useMutation({
    mutationFn: () => {
      console.log("[Recalculate] Starting recalculation request...");
      return recalculateSnapshots();
    },
    onSuccess: (result) => {
      console.log("[Recalculate] Success:", result);
      queryClient.invalidateQueries({ queryKey: ["snapshots"] });
      const msg = `Recalculated ${result.updated} snapshots`;
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Recalculated", msg);
    },
    onError: (err: any) => {
      console.error("[Recalculate] Error:", err);
      console.error("[Recalculate] Response status:", err?.response?.status);
      console.error("[Recalculate] Response data:", err?.response?.data);
      const detail = err?.response?.data?.detail;
      const msg = detail ?? err?.message ?? "Recalculation failed";
      if (Platform.OS === "web") window.alert(`Recalculation error: ${msg}`);
      else Alert.alert("Error", msg);
    },
    retry: 1,
  });

  const refreshPricesMutation = useMutation({
    mutationFn: updatePrices,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["snapshots"] });
      const msg = result.message ?? "Prices updated successfully";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Prices Refreshed", msg);
    },
    onError: (err: any) => {
      console.error("[RefreshPrices] Error:", err);
      const detail = err?.response?.data?.detail;
      const msg = detail ?? err?.message ?? "Price refresh failed";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Error", msg);
    },
    retry: 1,
  });

  // ── Handlers ─────────────────────────────────────────────────────

  const handleDeleteOne = useCallback(
    (snap: SnapshotRecord) => {
      const msg = `Delete snapshot for ${snap.snapshot_date}?`;
      if (Platform.OS === "web") {
        if (window.confirm(msg)) deleteOneMutation.mutate(snap.id);
      } else {
        Alert.alert("Delete Snapshot", msg, [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => deleteOneMutation.mutate(snap.id) },
        ]);
      }
    },
    [deleteOneMutation],
  );

  const handleDeleteAll = useCallback(() => {
    const msg = "Delete ALL snapshots? This cannot be undone.";
    if (Platform.OS === "web") {
      if (window.confirm(msg)) deleteAllMutation.mutate();
    } else {
      Alert.alert("Delete All", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete All", style: "destructive", onPress: () => deleteAllMutation.mutate() },
      ]);
    }
  }, [deleteAllMutation]);

  // ── Derived data ─────────────────────────────────────────────────

  const snapshots = useMemo(() => snapData?.snapshots ?? [], [snapData]);
  const sortedAsc = useMemo(
    () => [...snapshots].sort((a, b) => a.snapshot_date.localeCompare(b.snapshot_date)),
    [snapshots],
  );
  const latest = sortedAsc.length > 0 ? sortedAsc[sortedAsc.length - 1] : null;

  // Average Daily Movement = sum(daily_movement) / number of records
  const avgDailyMovement = useMemo(() => {
    if (sortedAsc.length === 0) return 0;
    const total = sortedAsc.reduce((sum, s) => sum + (s.daily_movement ?? 0), 0);
    return total / sortedAsc.length;
  }, [sortedAsc]);

  const valueChartData: ChartDataPoint[] = useMemo(
    () => sortedAsc.map((s) => ({ label: s.snapshot_date, value: s.portfolio_value })),
    [sortedAsc],
  );
  const gainChartData: ChartDataPoint[] = useMemo(
    () => sortedAsc.map((s) => ({ label: s.snapshot_date, value: s.net_gain })),
    [sortedAsc],
  );

  // ── Loading / Error ──────────────────────────────────────────────

  if (isLoading) return <PortfolioTrackerSkeleton />;
  if (isError) return <ErrorScreen message={error?.message ?? "Failed to load snapshots"} onRetry={refetch} />;

  return (
    <ScrollView
      style={[st.container, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={[st.content, isDesktop && { maxWidth: 1080, alignSelf: "center", width: "100%" }]}
      refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}
      onLayout={handleLayout}
    >
      {/* ── Header Row ──────────────────────────────────────────── */}
      <View style={st.headerRow}>
        <Text style={[st.pageTitle, { color: colors.textPrimary }]}>Portfolio Tracker</Text>
        <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap" }}>
          <Pressable
            onPress={() => refreshPricesMutation.mutate()}
            disabled={refreshPricesMutation.isPending}
            style={[st.actionBtn, { backgroundColor: isDark ? "#0ea5e9" : "#0284c7", opacity: refreshPricesMutation.isPending ? 0.5 : 1 }]}
          >
            <FontAwesome name="refresh" size={14} color="#fff" />
            <Text style={st.actionBtnText}>{refreshPricesMutation.isPending ? "Refreshing..." : "Refresh Prices"}</Text>
          </Pressable>
          <Pressable
            onPress={() => saveMutation.mutate()}
            disabled={saveMutation.isPending}
            style={[st.actionBtn, { backgroundColor: colors.accentPrimary, opacity: saveMutation.isPending ? 0.5 : 1 }]}
          >
            <FontAwesome name="camera" size={14} color="#fff" />
            <Text style={st.actionBtnText}>{saveMutation.isPending ? "Saving..." : "Save Snapshot"}</Text>
          </Pressable>
          {snapshots.length > 0 && (
            <Pressable
              onPress={() => recalcMutation.mutate()}
              disabled={recalcMutation.isPending}
              style={[st.actionBtn, { backgroundColor: colors.success, opacity: recalcMutation.isPending ? 0.5 : 1 }]}
            >
              <FontAwesome name="calculator" size={14} color="#fff" />
              <Text style={st.actionBtnText}>Recalculate</Text>
            </Pressable>
          )}
          {snapshots.length > 0 && (
            <Pressable onPress={handleDeleteAll} style={[st.actionBtn, { backgroundColor: colors.danger }]}>
              <FontAwesome name="trash" size={14} color="#fff" />
              <Text style={st.actionBtnText}>Clear All</Text>
            </Pressable>
          )}
        </View>
      </View>

      {/* Weekend warning */}
      {(new Date().getDay() === 0 || new Date().getDay() === 6) && (
        <View style={[st.warningBanner, { backgroundColor: isDark ? "rgba(255,158,0,0.12)" : "rgba(245,158,11,0.08)", borderColor: isDark ? "rgba(255,158,0,0.3)" : "rgba(245,158,11,0.2)" }]}>
          <FontAwesome name="exclamation-triangle" size={14} color={colors.warning} />
          <Text style={[st.warningText, { color: colors.warning }]}>Weekend — market prices may not be current</Text>
        </View>
      )}

      {/* ── KPI Cards (matching Streamlit: 3 cards) ─────────────── */}
      {latest && (
        <View style={st.kpiRow}>
          <KpiCard
            label="Total Portfolio Value"
            value={`${fmtNum(latest.portfolio_value, 0)} KWD`}
            subtitle="↑ Current Value"
            kpiStyle={isDark ? KPI_STYLES.value.dark : KPI_STYLES.value.light}
            colors={colors}
          />
          <KpiCard
            label="Net Gain From Stocks"
            value={`${fmtNum(latest.net_gain, 0)} KWD`}
            subtitle="↑ Net Gain"
            kpiStyle={isDark ? KPI_STYLES.netGain.dark : KPI_STYLES.netGain.light}
            colors={colors}
            valueColor={latest.net_gain >= 0 ? (isDark ? "#10b981" : "#047857") : colors.danger}
          />
          <KpiCard
            label="Profit Margin"
            value={`${(latest.roi_percent ?? 0).toFixed(1)}%`}
            subtitle="↑ ROI"
            kpiStyle={isDark ? KPI_STYLES.roi.dark : KPI_STYLES.roi.light}
            colors={colors}
            valueColor={(latest.roi_percent ?? 0) >= 0 ? (isDark ? "#8a2be2" : "#6366f1") : colors.danger}
          />
          <KpiCard
            label="Average Daily Movement"
            value={`${avgDailyMovement >= 0 ? "+" : ""}${fmtNum(avgDailyMovement)} KWD`}
            subtitle={`↑ Avg over ${sortedAsc.length} day${sortedAsc.length !== 1 ? "s" : ""}`}
            kpiStyle={isDark ? KPI_STYLES.avgMovement.dark : KPI_STYLES.avgMovement.light}
            colors={colors}
            valueColor={avgDailyMovement >= 0 ? (isDark ? "#f59e0b" : "#d97706") : colors.danger}
          />
        </View>
      )}

      {/* ── Charts ──────────────────────────────────────────────── */}
      {sortedAsc.length >= 2 && (
        <>
          <SnapshotLineChart
            data={valueChartData}
            title="Total Portfolio Value Over Time"
            colors={colors}
            lineColor={isDark ? CHART_COLORS.valueLine.dark : CHART_COLORS.valueLine.light}
            palette={isDark ? VALUE_PALETTE_DARK : VALUE_PALETTE_LIGHT}
            height={300}
            width={containerWidth}
            formatValue={(v) => fmtNum(v, 0)}
          />
          <SnapshotLineChart
            data={gainChartData}
            title="Net Gain from Stocks Over Time"
            colors={colors}
            lineColor={isDark ? CHART_COLORS.gainLine.dark : CHART_COLORS.gainLine.light}
            palette={isDark ? GAIN_PALETTE_DARK : GAIN_PALETTE_LIGHT}
            height={300}
            width={containerWidth}
            formatValue={(v) => fmtNum(v, 0)}
          />
        </>
      )}

      {/* ── Snapshot History Table ───────────────────────────────── */}
      <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>
        <FontAwesome name="history" size={16} color={colors.accentPrimary} />{" "}
        Snapshot History ({snapshots.length})
      </Text>

      {snapshots.length === 0 ? (
        <View style={st.empty}>
          <FontAwesome name="camera" size={48} color={colors.textMuted} />
          <Text style={[st.emptyText, { color: colors.textSecondary }]}>
            No snapshots yet. Tap "Save Snapshot" to record today's values.
          </Text>
        </View>
      ) : (
        <ScrollView horizontal showsHorizontalScrollIndicator>
          <View style={[st.table, { borderColor: colors.borderColor }]}>
            {/* Table Header */}
            <View style={[st.tableRow, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderColor }]}>
              <Text style={[st.th, st.colDate, { color: colors.textSecondary }]}>Date</Text>
              <Text style={[st.th, st.colMoney, { color: colors.textSecondary }]}>Value</Text>
              <Text style={[st.th, st.colMoney, { color: colors.textSecondary }]}>Daily Movement</Text>
              <Text style={[st.th, st.colMoney, { color: colors.textSecondary }]}>Beginning Diff</Text>
              <Text style={[st.th, st.colSmall, { color: colors.textSecondary }]}>Deposit Cash</Text>
              <Text style={[st.th, st.colSmall, { color: colors.textSecondary }]}>Accum. Cash</Text>
              <Text style={[st.th, st.colMoney, { color: colors.textSecondary }]}>Net Gain</Text>
              <Text style={[st.th, st.colPct, { color: colors.textSecondary }]}>Change %</Text>
              <Text style={[st.th, st.colPct, { color: colors.textSecondary }]}>ROI %</Text>
              <Text style={[st.th, st.colAction, { color: colors.textSecondary }]}></Text>
            </View>
            {/* Table Rows — most recent first */}
            {[...snapshots]
              .sort((a, b) => b.snapshot_date.localeCompare(a.snapshot_date))
              .map((snap) => {
                const dm = snap.daily_movement ?? 0;
                const bd = snap.beginning_difference ?? 0;
                const ng = snap.net_gain ?? 0;
                const cp = snap.change_percent ?? 0;
                const rp = snap.roi_percent ?? 0;
                return (
                  <View key={snap.id} style={[st.tableRow, { borderBottomColor: colors.borderColor }]}>
                    <Text style={[st.td, st.colDate, { color: colors.textPrimary }]}>{snap.snapshot_date}</Text>
                    <Text style={[st.td, st.colMoney, { color: colors.textPrimary }]}>{fmtNum(snap.portfolio_value)}</Text>
                    <Text style={[st.td, st.colMoney, { color: dm >= 0 ? colors.success : colors.danger, fontWeight: "600" }]}>{fmtNum(dm)}</Text>
                    <Text style={[st.td, st.colMoney, { color: bd >= 0 ? colors.success : colors.danger, fontWeight: "600" }]}>{fmtNum(bd)}</Text>
                    <Text style={[st.td, st.colSmall, { color: colors.textPrimary }]}>{fmtNum(snap.deposit_cash ?? 0, 0)}</Text>
                    <Text style={[st.td, st.colSmall, { color: colors.textPrimary }]}>{fmtNum(snap.accumulated_cash ?? 0, 0)}</Text>
                    <Text style={[st.td, st.colMoney, { color: ng >= 0 ? colors.success : colors.danger, fontWeight: "600" }]}>{fmtNum(ng)}</Text>
                    <Text style={[st.td, st.colPct, { color: cp >= 0 ? colors.success : colors.danger, fontWeight: "600" }]}>{formatPercent(cp)}</Text>
                    <Text style={[st.td, st.colPct, { color: rp >= 0 ? colors.success : colors.danger, fontWeight: "600" }]}>{formatPercent(rp)}</Text>
                    <View style={st.colAction}>
                      <Pressable onPress={() => handleDeleteOne(snap)} style={{ padding: 4 }}>
                        <FontAwesome name="trash-o" size={14} color={colors.danger} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
          </View>
        </ScrollView>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ── KPI Card sub-component ──────────────────────────────────────────

function KpiCard({
  label,
  value,
  subtitle,
  kpiStyle,
  colors,
  valueColor,
}: {
  label: string;
  value: string;
  subtitle: string;
  kpiStyle: { bg: string; border: string; accent: string };
  colors: ThemePalette;
  valueColor?: string;
}) {
  return (
    <View style={[st.kpiCard, { backgroundColor: kpiStyle.bg, borderColor: kpiStyle.border }]}>
      <Text style={[st.kpiLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[st.kpiValue, { color: valueColor ?? kpiStyle.accent }]}>{value}</Text>
      <Text style={[st.kpiSub, { color: kpiStyle.accent }]}>{subtitle}</Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  pageTitle: { fontSize: 24, fontWeight: "700" },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginTop: 20, marginBottom: 10 },
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  actionBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  warningBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
  },
  warningText: { fontSize: 13, fontWeight: "500" },
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    marginBottom: 16,
  },
  kpiCard: {
    minWidth: 180,
    flex: 1,
    paddingHorizontal: 18,
    paddingVertical: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  kpiLabel: { fontSize: 12, marginBottom: 6, fontWeight: "500" },
  kpiValue: { fontSize: 22, fontWeight: "800" },
  kpiSub: { fontSize: 11, marginTop: 4, fontWeight: "500" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, textAlign: "center", maxWidth: 280 },
  table: { borderWidth: 1, borderRadius: 8, overflow: "hidden", minWidth: 1130 },
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  th: { fontSize: 11, fontWeight: "700" },
  td: { fontSize: 11 },
  colDate: { width: 100, paddingRight: 4 },
  colMoney: { width: 120, paddingRight: 4 },
  colSmall: { width: 100, paddingRight: 4 },
  colPct: { width: 80, paddingRight: 4 },
  colAction: { width: 40, alignItems: "center" as const },
});
