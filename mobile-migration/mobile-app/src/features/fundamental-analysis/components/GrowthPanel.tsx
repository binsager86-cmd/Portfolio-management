/**
 * GrowthPanel — Modern financial growth analysis dashboard.
 *
 * Three interactive views: Bar Chart · Line Chart · Detail List
 * with animated entrance, summary hero card, metric selector,
 * and interactive hover/touch tooltips on charts.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    View,
} from "react-native";

import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { useGrowthAnalysis } from "@/hooks/queries";
import { exportCSV, exportExcel, TableData } from "@/lib/exportAnalysis";
import { exportGrowthPdf } from "@/lib/exportGrowthPdf";
import { st } from "../styles";
import { type GrowthEntry, type PanelWithSymbolProps } from "../types";
import { GrowthChart, type ChartMode, type GrowthChartPoint } from "./GrowthChart";
import { Card, ExportBar, FadeIn } from "./shared";

// ── View modes ──────────────────────────────────────────────────────

type ViewMode = "bar" | "line" | "waterfall" | "list";

const VIEW_MODES: { key: ViewMode; icon: "bar-chart" | "line-chart" | "area-chart" | "list-ul"; label: string }[] = [
  { key: "bar", icon: "bar-chart", label: "Bar" },
  { key: "line", icon: "line-chart", label: "Line" },
  { key: "waterfall", icon: "area-chart", label: "Waterfall" },
  { key: "list", icon: "list-ul", label: "Detail" },
];

// ── Metric colours (assigned round-robin) ───────────────────────────

const METRIC_PALETTE = [
  "#10b981", "#3b82f6", "#f59e0b", "#8b5cf6",
  "#ec4899", "#06b6d4", "#f97316", "#6366f1",
];

// ── Hero summary card ───────────────────────────────────────────────

function SummaryHero({
  labels,
  growth,
  colors,
  selectedLabel,
  onSelect,
}: {
  labels: string[];
  growth: Record<string, GrowthEntry[]>;
  colors: import("@/constants/theme").ThemePalette;
  selectedLabel: string | null;
  onSelect: (label: string) => void;
}) {
  // Compute latest growth per metric
  const summaries = useMemo(() => {
    return labels.map((label, idx) => {
      const entries = growth[label] ?? [];
      const latest = entries[entries.length - 1];
      const prev = entries.length >= 2 ? entries[entries.length - 2] : null;
      const pct = latest ? latest.growth * 100 : 0;
      const prevPct = prev ? prev.growth * 100 : null;
      const improving = prevPct != null ? pct > prevPct : null;
      const color = METRIC_PALETTE[idx % METRIC_PALETTE.length];
      return { label, pct, prevPct, improving, positive: pct >= 0, color, period: latest?.period ?? "" };
    });
  }, [labels, growth]);

  // Entrance animation
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(20)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(slideAnim, { toValue: 0, tension: 50, friction: 8, useNativeDriver: true }),
    ]).start();
  }, []);

  const isDark = colors.mode === "dark";

  return (
    <Animated.View style={{ opacity: fadeAnim, transform: [{ translateY: slideAnim }] }}>
      <Card colors={colors} style={{ marginBottom: 16, overflow: "hidden" }}>
        {/* Glass-effect header bar */}
        <View style={{
          flexDirection: "row", alignItems: "center", marginBottom: 14, paddingBottom: 12,
          borderBottomWidth: 1, borderBottomColor: colors.borderColor,
        }}>
          <View style={{
            width: 34, height: 34, borderRadius: 10,
            backgroundColor: colors.success + (isDark ? "25" : "15"),
            alignItems: "center", justifyContent: "center",
          }}>
            <FontAwesome name="line-chart" size={15} color={colors.success} />
          </View>
          <View style={{ marginLeft: 10, flex: 1 }}>
            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "800", letterSpacing: -0.3 }}>
              Growth Overview
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 1 }}>
              {summaries.length} metrics · Latest: {summaries[0]?.period ?? "—"}
            </Text>
          </View>
        </View>

        {/* Metric chips grid */}
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {summaries.map((s) => {
            const active = selectedLabel === s.label;
            return (
              <Pressable
                key={s.label}
                onPress={() => onSelect(s.label)}
                style={({ pressed }) => ({
                  flexDirection: "row", alignItems: "center",
                  paddingHorizontal: 12, paddingVertical: 8,
                  borderRadius: 10, borderWidth: 1.5,
                  borderColor: active ? s.color : colors.borderColor,
                  backgroundColor: active
                    ? (isDark ? s.color + "20" : s.color + "0D")
                    : (pressed ? colors.bgCardHover : colors.bgCard),
                  minWidth: 130,
                })}
              >
                {/* Colour dot */}
                <View style={{
                  width: 8, height: 8, borderRadius: 4,
                  backgroundColor: s.color, marginRight: 8,
                }} />
                <View style={{ flex: 1 }}>
                  <Text
                    numberOfLines={1}
                    style={{ color: colors.textSecondary, fontSize: 10, fontWeight: "600", marginBottom: 2 }}
                  >
                    {s.label}
                  </Text>
                  <View style={{ flexDirection: "row", alignItems: "center" }}>
                    <FontAwesome
                      name={s.positive ? "caret-up" : "caret-down"}
                      size={13}
                      color={s.positive ? colors.success : colors.danger}
                      style={{ marginRight: 3 }}
                    />
                    <Text style={{
                      color: s.positive ? colors.success : colors.danger,
                      fontSize: 13, fontWeight: "800",
                      fontVariant: ["tabular-nums"],
                    }}>
                      {s.positive ? "+" : ""}{s.pct.toFixed(1)}%
                    </Text>
                    {/* Trend arrow vs previous period */}
                    {s.improving != null && (
                      <View style={{
                        marginLeft: 6, flexDirection: "row", alignItems: "center",
                        backgroundColor: s.improving
                          ? (isDark ? colors.success + "20" : colors.success + "12")
                          : (isDark ? colors.danger + "20" : colors.danger + "12"),
                        borderRadius: 4, paddingHorizontal: 4, paddingVertical: 1,
                      }}>
                        <FontAwesome
                          name={s.improving ? "arrow-up" : "arrow-down"}
                          size={7}
                          color={s.improving ? colors.success : colors.danger}
                        />
                      </View>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Card>
    </Animated.View>
  );
}

// ── Animated detail row ─────────────────────────────────────────────

function GrowthDetailRow({
  entry,
  index,
  total,
  colors,
  metricColor,
}: {
  entry: GrowthEntry;
  index: number;
  total: number;
  colors: import("@/constants/theme").ThemePalette;
  metricColor: string;
}) {
  const pct = entry.growth * 100;
  const positive = entry.growth >= 0;
  const barWidth = Math.min(Math.abs(pct), 100);
  const isDark = colors.mode === "dark";

  // Staggered entrance
  const anim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.timing(anim, {
      toValue: 1,
      duration: 400,
      delay: index * 50,
      useNativeDriver: true,
    }).start();
  }, []);

  return (
    <Animated.View style={{
      opacity: anim,
      transform: [{ translateX: anim.interpolate({ inputRange: [0, 1], outputRange: [30, 0] }) }],
    }}>
      <View style={[
        st.growthRow,
        index < total - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderColor + "30" },
      ]}>
        <View style={{ flex: 1 }}>
          {/* Period info */}
          <View style={[st.rowCenter, { marginBottom: 6, gap: 6 }]}>
            <View style={{
              backgroundColor: isDark ? metricColor + "20" : metricColor + "10",
              borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
            }}>
              <Text style={{ color: metricColor, fontSize: 10, fontWeight: "700" }}>{entry.prev_period}</Text>
            </View>
            <FontAwesome name="long-arrow-right" size={9} color={colors.textMuted} />
            <View style={{
              backgroundColor: isDark ? metricColor + "30" : metricColor + "18",
              borderRadius: 4, paddingHorizontal: 6, paddingVertical: 2,
            }}>
              <Text style={{ color: metricColor, fontSize: 10, fontWeight: "700" }}>{entry.period}</Text>
            </View>
          </View>
          {/* Bar */}
          <View style={[st.growthBarTrack, { backgroundColor: colors.borderColor + "30", height: 8, borderRadius: 4 }]}>
            <Animated.View style={[
              st.growthBarFill,
              {
                width: anim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ["0%", `${barWidth}%`],
                }),
                height: 8, borderRadius: 4, borderWidth: 0,
                backgroundColor: positive
                  ? (isDark ? colors.success + "50" : colors.success + "30")
                  : (isDark ? colors.danger + "50" : colors.danger + "30"),
              },
            ]} />
          </View>
        </View>
        {/* Value */}
        <View style={{ alignItems: "flex-end", marginLeft: 14, minWidth: 72 }}>
          <View style={st.rowCenter}>
            <FontAwesome
              name={positive ? "caret-up" : "caret-down"}
              size={18} color={positive ? colors.success : colors.danger}
              style={{ marginRight: 4 }}
            />
            <Text style={{
              color: positive ? colors.success : colors.danger,
              fontSize: 16, fontWeight: "800", fontVariant: ["tabular-nums"],
            }}>
              {positive ? "+" : ""}{pct.toFixed(1)}%
            </Text>
          </View>
        </View>
      </View>
    </Animated.View>
  );
}

// ── Main GrowthPanel ────────────────────────────────────────────────

export function GrowthPanel({ stockId, stockSymbol, colors, isDesktop }: PanelWithSymbolProps) {
  const { data, isLoading, refetch, isFetching } = useGrowthAnalysis(stockId);
  const isDark = colors.mode === "dark";

  const growth: Record<string, GrowthEntry[]> = data?.growth ?? {};
  const labels = Object.keys(growth);

  const [viewMode, setViewMode] = useState<ViewMode>("bar");
  const [selectedLabel, setSelectedLabel] = useState<string | null>(null);

  // Auto-select first metric when data loads
  useEffect(() => {
    if (labels.length > 0 && (!selectedLabel || !labels.includes(selectedLabel))) {
      setSelectedLabel(labels[0]);
    }
  }, [labels]);

  // Build chart data for the selected metric
  const chartData: GrowthChartPoint[] = useMemo(() => {
    if (!selectedLabel || !growth[selectedLabel]) return [];
    return growth[selectedLabel].map((g) => ({
      label: g.period,
      subLabel: g.prev_period,
      value: g.growth,
    }));
  }, [selectedLabel, growth]);

  // Chart mode mapping
  const chartMode: ChartMode = viewMode === "line" ? "line" : viewMode === "waterfall" ? "waterfall" : "bar";

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

  const metricColor = useMemo(() => {
    if (!selectedLabel) return colors.success;
    const idx = labels.indexOf(selectedLabel);
    return METRIC_PALETTE[idx >= 0 ? idx % METRIC_PALETTE.length : 0];
  }, [selectedLabel, labels]);

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
          <Text style={[st.emptySubtitle, { color: colors.textMuted }]}>
            Need at least 2 periods of financial statements.
          </Text>
        </View>
      ) : (
        <>
          {/* Top bar: view toggle + export */}
          <View style={{
            flexDirection: "row", alignItems: "center", marginBottom: 14,
            gap: 6, zIndex: 50, overflow: "visible" as const,
          }}>
            {/* View mode pills */}
            <View style={{
              flexDirection: "row",
              backgroundColor: isDark ? colors.bgSecondary : colors.bgInput,
              borderRadius: 10, padding: 3,
              borderWidth: 1, borderColor: colors.borderColor,
            }}>
              {VIEW_MODES.map((vm) => {
                const active = viewMode === vm.key;
                return (
                  <Pressable
                    key={vm.key}
                    onPress={() => setViewMode(vm.key)}
                    style={{
                      flexDirection: "row", alignItems: "center",
                      paddingHorizontal: 10, paddingVertical: 6,
                      borderRadius: 8,
                      backgroundColor: active ? colors.accentPrimary : "transparent",
                    }}
                  >
                    <FontAwesome
                      name={vm.icon} size={11}
                      color={active ? "#fff" : colors.textMuted}
                      style={{ marginRight: 4 }}
                    />
                    <Text style={{
                      fontSize: 11, fontWeight: active ? "700" : "500",
                      color: active ? "#fff" : colors.textSecondary,
                    }}>
                      {vm.label}
                    </Text>
                  </Pressable>
                );
              })}
            </View>

            <View style={{ flex: 1 }} />

            <ExportBar
              onExport={async (fmt) => {
                const t = exportTables();
                if (fmt === "xlsx") await exportExcel(t, stockSymbol, "Growth");
                else if (fmt === "csv") await exportCSV(t, stockSymbol, "Growth");
                else await exportGrowthPdf(growth, labels, stockSymbol);
              }}
              colors={colors}
            />
          </View>

          {/* Hero summary card with metric selector chips */}
          <SummaryHero
            labels={labels}
            growth={growth}
            colors={colors}
            selectedLabel={selectedLabel}
            onSelect={setSelectedLabel}
          />

          {/* Chart or list view */}
          {viewMode !== "list" ? (
            <FadeIn>
              <Card colors={colors} style={{ marginBottom: 16, paddingVertical: 8 }}>
                {/* Chart header */}
                <View style={{
                  flexDirection: "row", alignItems: "center",
                  paddingHorizontal: 2, paddingBottom: 8,
                  borderBottomWidth: 1, borderBottomColor: colors.borderColor + "40",
                  marginBottom: 8,
                }}>
                  <View style={{
                    width: 8, height: 8, borderRadius: 4,
                    backgroundColor: metricColor, marginRight: 8,
                  }} />
                  <Text style={{
                    color: colors.textPrimary, fontSize: 14,
                    fontWeight: "700", flex: 1,
                  }}>
                    {selectedLabel ?? "Select a metric"}
                  </Text>
                  <View style={{
                    backgroundColor: isDark ? metricColor + "20" : metricColor + "10",
                    borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3,
                  }}>
                    <Text style={{ color: metricColor, fontSize: 10, fontWeight: "700" }}>
                      {chartData.length} periods
                    </Text>
                  </View>
                </View>

                <GrowthChart
                  data={chartData}
                  colors={colors}
                  mode={chartMode}
                  height={isDesktop ? 320 : 260}
                  accentPositive={metricColor}
                />
              </Card>
            </FadeIn>
          ) : (
            /* Detail list view — show all metrics with animated rows */
            labels.map((label, idx) => {
              const entries = growth[label] ?? [];
              const mColor = METRIC_PALETTE[idx % METRIC_PALETTE.length];
              return (
                <FadeIn key={label} delay={idx * 60}>
                  {/* Section header */}
                  <View style={[st.sectionHeader, { marginBottom: 10 }]}>
                    <View style={[st.sectionIcon, {
                      backgroundColor: isDark ? mColor + "25" : mColor + "15",
                    }]}>
                      <FontAwesome name="line-chart" size={12} color={mColor} />
                    </View>
                    <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>{label}</Text>
                    <View style={[st.badge, {
                      backgroundColor: isDark ? mColor + "25" : mColor + "15",
                    }]}>
                      <Text style={{ color: mColor, fontSize: 11, fontWeight: "700" }}>{entries.length}</Text>
                    </View>
                  </View>

                  <Card colors={colors} style={{ marginBottom: 16 }}>
                    {entries.map((g, i) => (
                      <GrowthDetailRow
                        key={i}
                        entry={g}
                        index={i}
                        total={entries.length}
                        colors={colors}
                        metricColor={mColor}
                      />
                    ))}
                  </Card>
                </FadeIn>
              );
            })
          )}

          {/* All-metrics comparison chart (when in chart view) */}
          {viewMode !== "list" && labels.length > 1 && (
            <FadeIn delay={200}>
              <Card colors={colors} style={{ marginBottom: 16, paddingVertical: 8 }}>
                <View style={{
                  flexDirection: "row", alignItems: "center",
                  paddingHorizontal: 2, paddingBottom: 8,
                  borderBottomWidth: 1, borderBottomColor: colors.borderColor + "40",
                  marginBottom: 8,
                }}>
                  <View style={{
                    width: 26, height: 26, borderRadius: 8,
                    backgroundColor: isDark ? colors.accentPrimary + "20" : colors.accentPrimary + "10",
                    alignItems: "center", justifyContent: "center", marginRight: 8,
                  }}>
                    <FontAwesome name="exchange" size={11} color={colors.accentPrimary} />
                  </View>
                  <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700", flex: 1 }}>
                    Latest Growth Comparison
                  </Text>
                </View>

                {/* Horizontal bar ranking of all metrics (latest period) */}
                {labels.map((label, idx) => {
                  const entries = growth[label] ?? [];
                  const latest = entries[entries.length - 1];
                  if (!latest) return null;
                  const pct = latest.growth * 100;
                  const positive = pct >= 0;
                  const mColor = METRIC_PALETTE[idx % METRIC_PALETTE.length];
                  const maxPct = Math.max(
                    ...labels.map((l) => {
                      const e = growth[l]?.[growth[l].length - 1];
                      return e ? Math.abs(e.growth * 100) : 0;
                    }),
                    1,
                  );
                  const barPct = (Math.abs(pct) / maxPct) * 100;

                  return (
                    <Pressable
                      key={label}
                      onPress={() => { setSelectedLabel(label); if (viewMode === "list") setViewMode("bar"); }}
                      style={({ pressed }) => ({
                        flexDirection: "row", alignItems: "center",
                        paddingVertical: 8, paddingHorizontal: 2,
                        borderRadius: 8,
                        backgroundColor: pressed
                          ? (isDark ? mColor + "15" : mColor + "08")
                          : (selectedLabel === label ? (isDark ? mColor + "10" : mColor + "06") : "transparent"),
                      })}
                    >
                      {/* Coloured dot */}
                      <View style={{
                        width: 6, height: 6, borderRadius: 3,
                        backgroundColor: mColor, marginRight: 8,
                      }} />
                      <Text numberOfLines={1} style={{
                        width: 120, color: colors.textSecondary,
                        fontSize: 11, fontWeight: "600",
                      }}>
                        {label}
                      </Text>
                      {/* Bar */}
                      <View style={{ flex: 1, height: 10, borderRadius: 5, backgroundColor: colors.borderColor + "25", marginHorizontal: 8 }}>
                        <View style={{
                          width: `${Math.max(barPct, 3)}%`,
                          height: 10, borderRadius: 5,
                          backgroundColor: positive ? mColor + (isDark ? "70" : "50") : colors.danger + (isDark ? "70" : "50"),
                        }} />
                      </View>
                      {/* Value */}
                      <Text style={{
                        minWidth: 60, textAlign: "right",
                        color: positive ? colors.success : colors.danger,
                        fontSize: 12, fontWeight: "800",
                        fontVariant: ["tabular-nums"],
                      }}>
                        {positive ? "+" : ""}{pct.toFixed(1)}%
                      </Text>
                    </Pressable>
                  );
                })}
              </Card>
            </FadeIn>
          )}
        </>
      )}
    </ScrollView>
  );
}
