/**
 * AllocationDonut — Donut pie chart for portfolio allocation by weight.
 *
 * Design language unified with PortfolioChart:
 * - Purple → Blue gradient palette (GRAD_DARK / GRAD_LIGHT)
 * - LinearGradient SVG fills per slice
 * - Entrance animation (scale + fade)
 * - Matching dark-theme container (#0F0F0F / #F7F8FC)
 * - Clean gaps between segments
 * - Outside percent labels
 * - Company legend table alongside
 * - Theme-aware colors
 *
 * Uses react-native-svg + react-native-reanimated for cross-platform rendering.
 */

import React, { useMemo, useEffect } from "react";
import { View, Text, StyleSheet, ScrollView, Platform } from "react-native";
import Svg, { G, Path, Text as SvgText, Defs, LinearGradient, Stop } from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
} from "react-native-reanimated";
import type { ThemePalette } from "@/constants/theme";

// ── Gradient slice palettes (matches PortfolioChart purple→blue language) ──

const SLICE_PALETTE = [
  { from: "#8B5CF6", to: "#7C3AED" }, // purple (primary)
  { from: "#3B82F6", to: "#2563EB" }, // blue
  { from: "#06B6D4", to: "#0891B2" }, // cyan
  { from: "#10B981", to: "#059669" }, // emerald
  { from: "#F59E0B", to: "#D97706" }, // amber
  { from: "#EF4444", to: "#DC2626" }, // red
  { from: "#EC4899", to: "#DB2777" }, // pink
  { from: "#6366F1", to: "#4F46E5" }, // indigo
  { from: "#14B8A6", to: "#0D9488" }, // teal
  { from: "#F97316", to: "#EA580C" }, // orange
  { from: "#A855F7", to: "#9333EA" }, // violet
  { from: "#22D3EE", to: "#06B6D4" }, // sky
  { from: "#84CC16", to: "#65A30D" }, // lime
  { from: "#FB923C", to: "#F97316" }, // light orange
  { from: "#C084FC", to: "#A855F7" }, // light purple
  { from: "#38BDF8", to: "#0EA5E9" }, // light blue
];

const ANIM_MS = 800;

// ── Types ───────────────────────────────────────────────────────────

export interface AllocationSlice {
  company: string;
  weight: number; // 0–1 range (fractional)
  pnl_pct?: number;
}

interface AllocationDonutProps {
  data: AllocationSlice[];
  title?: string;
  colors: ThemePalette;
  size?: number;
  /** Show the legend table next to the chart. Default true */
  showLegend?: boolean;
}

// ── Geometry helpers ────────────────────────────────────────────────

function polarToCartesian(cx: number, cy: number, r: number, angleDeg: number) {
  const rad = ((angleDeg - 90) * Math.PI) / 180;
  return { x: cx + r * Math.cos(rad), y: cy + r * Math.sin(rad) };
}

function describeArc(
  cx: number,
  cy: number,
  outerR: number,
  innerR: number,
  startAngle: number,
  endAngle: number,
  pull: number = 0,
) {
  // Pull: offset the center of the slice outward
  const midAngle = (startAngle + endAngle) / 2;
  const pullRad = ((midAngle - 90) * Math.PI) / 180;
  const dx = pull * Math.cos(pullRad);
  const dy = pull * Math.sin(pullRad);

  const sCx = cx + dx;
  const sCy = cy + dy;

  const sweep = endAngle - startAngle;
  const largeArc = sweep > 180 ? 1 : 0;

  const oStart = polarToCartesian(sCx, sCy, outerR, startAngle);
  const oEnd = polarToCartesian(sCx, sCy, outerR, endAngle);
  const iStart = polarToCartesian(sCx, sCy, innerR, endAngle);
  const iEnd = polarToCartesian(sCx, sCy, innerR, startAngle);

  return [
    `M ${oStart.x} ${oStart.y}`,
    `A ${outerR} ${outerR} 0 ${largeArc} 1 ${oEnd.x} ${oEnd.y}`,
    `L ${iStart.x} ${iStart.y}`,
    `A ${innerR} ${innerR} 0 ${largeArc} 0 ${iEnd.x} ${iEnd.y}`,
    "Z",
  ].join(" ");
}

// ── Component ───────────────────────────────────────────────────────

export function AllocationDonut({
  data,
  title = "Portfolio Allocation by Weight",
  colors,
  size = 280,
  showLegend = true,
}: AllocationDonutProps) {
  const isDark = colors.mode === "dark";

  // ── Entrance animation (matches PortfolioChart) ─────────────────

  const progress = useSharedValue(0);

  useEffect(() => {
    progress.value = 0;
    progress.value = withTiming(1, {
      duration: ANIM_MS,
      easing: Easing.out(Easing.cubic),
    });
  }, [data]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ scale: 0.92 + progress.value * 0.08 }],
  }));

  const filteredData = useMemo(
    () => data.filter((d) => d.weight > 0),
    [data],
  );

  const totalWeight = useMemo(
    () => filteredData.reduce((s, d) => s + d.weight, 0),
    [filteredData],
  );

  const maxWeight = useMemo(
    () => Math.max(...filteredData.map((d) => d.weight), 0),
    [filteredData],
  );

  // Build arc data
  const arcs = useMemo(() => {
    if (totalWeight <= 0) return [];
    const GAP_DEG = filteredData.length > 1 ? 1.5 : 0; // clean gaps
    const totalGap = GAP_DEG * filteredData.length;
    const availableDeg = 360 - totalGap;
    let currentAngle = GAP_DEG / 2;
    return filteredData.map((slice, i) => {
      const sweepDeg = (slice.weight / totalWeight) * availableDeg;
      const startAngle = currentAngle;
      const endAngle = currentAngle + sweepDeg;
      currentAngle = endAngle + GAP_DEG;
      const pal = SLICE_PALETTE[i % SLICE_PALETTE.length];
      return {
        ...slice,
        startAngle,
        endAngle,
        gradFrom: pal.from,
        gradTo: pal.to,
        flatColor: pal.from,
        pull: slice.weight === maxWeight ? size * 0.015 : 0,
        pct: ((slice.weight / totalWeight) * 100).toFixed(1),
      };
    });
  }, [filteredData, totalWeight, maxWeight, size]);

  if (filteredData.length === 0) {
    return (
      <View style={[styles.emptyContainer, { backgroundColor: isDark ? "#0F0F0F" : "#F7F8FC", borderColor: isDark ? "transparent" : colors.borderColor, borderWidth: isDark ? 0 : 1 }]}>
        <Text style={[styles.emptyText, { color: colors.textMuted }]}>
          No allocation data available.
        </Text>
      </View>
    );
  }

  const cx = size / 2;
  const cy = size / 2;
  const outerR = size * 0.40;
  const innerR = outerR * 0.55; // slightly thicker ring than original
  const labelR = outerR + 18;

  return (
    <Animated.View style={[styles.wrapper, animStyle]}>
      {/* Title — matches PortfolioChart typography */}
      <Text style={[styles.title, { color: colors.textSecondary }]}>{title}</Text>

      <View style={[styles.chartBackground, { backgroundColor: isDark ? "#0F0F0F" : "#F7F8FC", borderWidth: isDark ? 0 : 1, borderColor: isDark ? "transparent" : colors.borderColor }]}>
        <View style={styles.chartRow}>
          {/* Donut */}
          <View style={styles.chartContainer}>
            <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
              <Defs>
                {arcs.map((arc, i) => (
                  <LinearGradient key={`grad-${i}`} id={`sliceGrad${i}`} x1="0" y1="0" x2="1" y2="1">
                    <Stop offset="0%" stopColor={arc.gradFrom} stopOpacity={0.95} />
                    <Stop offset="100%" stopColor={arc.gradTo} stopOpacity={0.8} />
                  </LinearGradient>
                ))}
              </Defs>
              <G>
                {arcs.map((arc, i) => (
                  <Path
                    key={i}
                    d={describeArc(cx, cy, outerR, innerR, arc.startAngle, arc.endAngle, arc.pull)}
                    fill={`url(#sliceGrad${i})`}
                    stroke={isDark ? "#0F0F0F" : "#F7F8FC"}
                    strokeWidth={1.5}
                  />
                ))}

                {/* Center label — asset count */}
                <SvgText
                  x={cx}
                  y={cy - 6}
                  fill={colors.textPrimary}
                  fontSize={16}
                  fontWeight="700"
                  textAnchor="middle"
                  alignmentBaseline="central"
                >
                  {filteredData.length}
                </SvgText>
                <SvgText
                  x={cx}
                  y={cy + 10}
                  fill={colors.textMuted}
                  fontSize={8}
                  fontWeight="600"
                  textAnchor="middle"
                  alignmentBaseline="central"
                >
                  ASSETS
                </SvgText>

                {/* Percent text labels outside */}
                {arcs.map((arc, i) => {
                  const midAngle = (arc.startAngle + arc.endAngle) / 2;
                  const sweepDeg = arc.endAngle - arc.startAngle;
                  // Only show label if slice is big enough
                  if (sweepDeg < 15) return null;
                  const pos = polarToCartesian(cx, cy, labelR, midAngle);
                  return (
                    <SvgText
                      key={`lbl-${i}`}
                      x={pos.x}
                      y={pos.y}
                      fill={colors.textPrimary}
                      fontSize={10}
                      fontWeight="600"
                      textAnchor="middle"
                      alignmentBaseline="central"
                    >
                      {arc.pct}%
                    </SvgText>
                  );
                })}
              </G>
            </Svg>
          </View>

          {/* Legend table */}
          {showLegend && (
            <View style={styles.legendContainer}>
              <Text style={[styles.legendTitle, { color: colors.textMuted }]}>
                Breakdown
              </Text>
              <ScrollView style={styles.legendScroll} nestedScrollEnabled>
                {arcs.map((arc, i) => (
                  <View key={i} style={[styles.legendRow, { borderBottomColor: isDark ? "rgba(255,255,255,0.06)" : colors.borderColor }]}>
                    <View style={[styles.legendDot, { backgroundColor: arc.flatColor }]} />
                    <Text style={[styles.legendCompany, { color: colors.textPrimary }]} numberOfLines={1}>
                      {arc.company}
                    </Text>
                    <Text style={[styles.legendPct, { color: colors.textSecondary }]}>
                      {(arc.weight * 100).toFixed(1)}%
                    </Text>
                  </View>
                ))}
              </ScrollView>
            </View>
          )}
        </View>
      </View>
    </Animated.View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  wrapper: {
    marginBottom: 16,
  },
  title: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  chartBackground: {
    borderRadius: 16,
    overflow: "hidden",
    padding: 16,
  },
  chartRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 12,
  },
  chartContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  legendContainer: {
    flex: 1,
    minWidth: 120,
  },
  legendTitle: {
    fontSize: 11,
    fontWeight: "700",
    marginBottom: 8,
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  legendScroll: {
    maxHeight: 250,
  },
  legendRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 6,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  legendDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  legendCompany: {
    flex: 1,
    fontSize: 12,
    fontWeight: "500",
  },
  legendPct: {
    fontSize: 12,
    fontWeight: "600",
    minWidth: 42,
    textAlign: "right",
  },
  emptyContainer: {
    padding: 32,
    borderRadius: 16,
    alignItems: "center",
  },
  emptyText: {
    fontSize: 14,
  },
});
