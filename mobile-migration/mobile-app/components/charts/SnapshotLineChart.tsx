/**
 * SnapshotLineChart — Smooth line chart for portfolio tracker.
 *
 * Matches Streamlit's Plotly `go.Scatter` charts:
 * - Spline interpolation (cubic bezier approximation)
 * - Line + markers
 * - Gradient fill under the line
 * - Themed colors
 * - Hover-style tooltip not used (RN), but value labels on markers
 *
 * Uses react-native-svg for cross-platform rendering.
 */

import React, { useMemo } from "react";
import { View, Text, StyleSheet } from "react-native";
import Svg, {
  Path,
  Circle,
  Defs,
  LinearGradient,
  Stop,
  Line as SvgLine,
  Text as SvgText,
  G,
} from "react-native-svg";
import type { ThemePalette } from "@/constants/theme";

// ── Types ───────────────────────────────────────────────────────────

export interface ChartDataPoint {
  label: string; // e.g. "2025-07-26"
  value: number;
}

interface SnapshotLineChartProps {
  data: ChartDataPoint[];
  title: string;
  colors: ThemePalette;
  lineColor: string;
  fillColor?: string; // gradient fill under line
  height?: number;
  width?: number;
  valuePrefix?: string; // e.g. "" or "+"
  valueSuffix?: string; // e.g. " KWD" or "%"
  formatValue?: (v: number) => string;
}

// ── Helpers ─────────────────────────────────────────────────────────

function abbreviateNumber(n: number): string {
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toFixed(0);
}

/** Generate a smooth bezier path through the points */
function smoothPath(points: { x: number; y: number }[]): string {
  if (points.length === 0) return "";
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;

  let d = `M${points[0].x},${points[0].y}`;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[Math.max(0, i - 1)];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[Math.min(points.length - 1, i + 2)];

    const tension = 0.3;
    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`;
  }

  return d;
}

// ── Component ───────────────────────────────────────────────────────

export default function SnapshotLineChart({
  data,
  title,
  colors,
  lineColor,
  fillColor,
  height = 280,
  width: widthProp,
  formatValue,
}: SnapshotLineChartProps) {
  const chartWidth = widthProp ?? 900;

  const computed = useMemo(() => {
    if (data.length === 0) return null;

    const padding = { top: 30, right: 20, bottom: 50, left: 70 };
    const plotW = chartWidth - padding.left - padding.right;
    const plotH = height - padding.top - padding.bottom;

    const values = data.map((d) => d.value);
    let minVal = Math.min(...values);
    let maxVal = Math.max(...values);

    // Add 10% padding
    const range = maxVal - minVal || 1;
    minVal -= range * 0.08;
    maxVal += range * 0.08;

    const xScale = (i: number) =>
      padding.left + (i / Math.max(data.length - 1, 1)) * plotW;
    const yScale = (v: number) =>
      padding.top + plotH - ((v - minVal) / (maxVal - minVal)) * plotH;

    const points = data.map((d, i) => ({ x: xScale(i), y: yScale(d.value) }));
    const linePath = smoothPath(points);

    // Fill path — close at bottom
    const fillPath =
      linePath +
      ` L${points[points.length - 1].x},${padding.top + plotH}` +
      ` L${points[0].x},${padding.top + plotH} Z`;

    // Y-axis ticks (5 ticks)
    const yTicks: { value: number; y: number }[] = [];
    for (let i = 0; i <= 4; i++) {
      const v = minVal + (i / 4) * (maxVal - minVal);
      yTicks.push({ value: v, y: yScale(v) });
    }

    // X-axis labels — show at most 6 evenly spaced
    const maxLabels = Math.min(6, data.length);
    const step = Math.max(1, Math.floor((data.length - 1) / (maxLabels - 1)));
    const xLabels: { label: string; x: number }[] = [];
    for (let i = 0; i < data.length; i += step) {
      const lbl = data[i].label;
      // Show only month/day for brevity: "07-26"
      const short = lbl.length >= 10 ? lbl.slice(5, 10) : lbl;
      xLabels.push({ label: short, x: xScale(i) });
    }
    // Always include last
    if (xLabels.length > 0 && xLabels[xLabels.length - 1].x !== xScale(data.length - 1)) {
      const lbl = data[data.length - 1].label;
      xLabels.push({ label: lbl.slice(5, 10), x: xScale(data.length - 1) });
    }

    return { points, linePath, fillPath, yTicks, xLabels, padding, plotW, plotH };
  }, [data, chartWidth, height]);

  if (!computed || data.length === 0) {
    return (
      <View style={[s.chartContainer, { backgroundColor: colors.bgCard }]}>
        <Text style={[s.title, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[s.noData, { color: colors.textMuted }]}>No data available</Text>
      </View>
    );
  }

  const { points, linePath, fillPath, yTicks, xLabels, padding, plotH } = computed;
  const gradientId = `fill_${title.replace(/\s/g, "_")}`;
  const fmt = formatValue ?? abbreviateNumber;

  return (
    <View style={[s.chartContainer, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <Text style={[s.title, { color: colors.textPrimary }]}>{title}</Text>
      <Svg width="100%" height={height} viewBox={`0 0 ${chartWidth} ${height}`}>
        <Defs>
          <LinearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
            <Stop offset="0" stopColor={lineColor} stopOpacity="0.3" />
            <Stop offset="1" stopColor={lineColor} stopOpacity="0.02" />
          </LinearGradient>
        </Defs>

        {/* Grid lines */}
        {yTicks.map((tick, i) => (
          <SvgLine
            key={`grid-${i}`}
            x1={padding.left}
            y1={tick.y}
            x2={padding.left + (chartWidth - padding.left - padding.right)}
            y2={tick.y}
            stroke={colors.borderColor}
            strokeWidth={0.5}
          />
        ))}

        {/* Y axis labels */}
        {yTicks.map((tick, i) => (
          <SvgText
            key={`ylabel-${i}`}
            x={padding.left - 8}
            y={tick.y + 4}
            fill={colors.textSecondary}
            fontSize={10}
            textAnchor="end"
          >
            {fmt(tick.value)}
          </SvgText>
        ))}

        {/* X axis labels */}
        {xLabels.map((lbl, i) => (
          <SvgText
            key={`xlabel-${i}`}
            x={lbl.x}
            y={height - 8}
            fill={colors.textSecondary}
            fontSize={9}
            textAnchor="middle"
          >
            {lbl.label}
          </SvgText>
        ))}

        {/* Gradient fill */}
        {fillColor !== "none" && (
          <Path d={fillPath} fill={`url(#${gradientId})`} />
        )}

        {/* Line */}
        <Path d={linePath} fill="none" stroke={lineColor} strokeWidth={2.5} />

        {/* Markers — show every Nth to avoid clutter */}
        {points.map((pt, i) => {
          const showMarker = data.length <= 30 || i % Math.ceil(data.length / 20) === 0 || i === data.length - 1;
          if (!showMarker) return null;
          return (
            <Circle
              key={`dot-${i}`}
              cx={pt.x}
              cy={pt.y}
              r={3}
              fill={colors.bgCard}
              stroke={lineColor}
              strokeWidth={2}
            />
          );
        })}
      </Svg>
    </View>
  );
}

const s = StyleSheet.create({
  chartContainer: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
    marginBottom: 12,
  },
  title: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  noData: {
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 40,
  },
});
