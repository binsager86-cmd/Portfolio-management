/**
 * DividendYearlyChart — Modern bar chart showing dividend income by year.
 *
 * Features:
 *  • Gradient-filled bars with rounded tops
 *  • Animated entrance (staggered bar rise)
 *  • Touch/hover tooltip with value
 *  • Y-axis labels + dashed grid lines
 *  • Theme-adaptive (dark/light)
 *  • Cross-platform: Web + iOS + Android
 *
 * Built with react-native-svg + react-native-reanimated.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    GestureResponderEvent,
    LayoutChangeEvent,
    Platform,
    StyleSheet,
    Text,
    View,
} from "react-native";
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withTiming,
} from "react-native-reanimated";
import Svg, {
    Defs,
    G,
    LinearGradient,
    Rect,
    Stop,
    Line as SvgLine,
    Text as SvgText
} from "react-native-svg";

import { formatCurrency } from "@/lib/currency";
import { useThemeStore } from "@/services/themeStore";

// ── Types ───────────────────────────────────────────────────────────

export interface YearlyDividendData {
  year: string;
  amount: number;
}

interface Props {
  data: YearlyDividendData[];
  /** Optional projected data — rendered with dashed border / translucent fill */
  projectedData?: YearlyDividendData[];
  currency?: string;
  height?: number;
}

// ── Helpers ─────────────────────────────────────────────────────────

function niceMax(val: number): number {
  if (val <= 0) return 100;
  const exp = Math.pow(10, Math.floor(Math.log10(val)));
  const norm = val / exp;
  const nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
  return nice * exp;
}

function fmtVal(v: number): string {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(1)}K`;
  return v.toFixed(v < 10 ? 2 : 0);
}

// ── Component ───────────────────────────────────────────────────────

export default function DividendYearlyChart({
  data,
  projectedData,
  currency = "KWD",
  height: chartHeight = 260,
}: Props) {
  const { colors } = useThemeStore();
  const [width, setWidth] = useState(0);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  // Entrance animation
  const animProgress = useSharedValue(0);
  useEffect(() => {
    // Brief fade-out then staggered re-entrance
    animProgress.value = withTiming(0, { duration: 180 }, (finished) => {
      if (finished) {
        animProgress.value = withDelay(
          200,
          withTiming(1, { duration: 800, easing: Easing.out(Easing.cubic) })
        );
      }
    });
  }, [data]);

  const containerStyle = useAnimatedStyle(() => ({
    opacity: animProgress.value,
    transform: [{ translateY: (1 - animProgress.value) * 20 }],
  }));

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    setWidth(e.nativeEvent.layout.width);
  }, []);

  // ── Chart geometry ────────────────────────────────────────────────

  const PADDING_LEFT = 52;
  const PADDING_RIGHT = 16;
  const PADDING_TOP = 24;
  const PADDING_BOTTOM = 40;

  const chartW = Math.max(0, width - PADDING_LEFT - PADDING_RIGHT);
  const chartH = Math.max(0, chartHeight - PADDING_TOP - PADDING_BOTTOM);

  // Combine historical + projected for geometry calculations
  const allData = useMemo(() => {
    const combined = [...data];
    if (projectedData) {
      for (const p of projectedData) {
        if (!combined.find((d) => d.year === p.year)) {
          combined.push(p);
        }
      }
    }
    return combined.sort((a, b) => a.year.localeCompare(b.year));
  }, [data, projectedData]);

  const projectedYears = useMemo(
    () => new Set(projectedData?.map((p) => p.year) ?? []),
    [projectedData],
  );

  const maxVal = useMemo(() => {
    const m = Math.max(...allData.map((d) => d.amount), 0);
    return niceMax(m * 1.1);
  }, [allData]);

  // Y-axis ticks (4 ticks)
  const yTicks = useMemo(() => {
    const ticks: number[] = [];
    const step = maxVal / 4;
    for (let i = 0; i <= 4; i++) ticks.push(step * i);
    return ticks;
  }, [maxVal]);

  // Bar geometry
  const barGap = allData.length > 8 ? 4 : 8;
  const barWidth = allData.length > 0
    ? Math.max(12, (chartW - barGap * (allData.length - 1)) / allData.length)
    : 0;

  const bars = useMemo(() => {
    return allData.map((d, i) => {
      const x = PADDING_LEFT + i * (barWidth + barGap);
      const barH = maxVal > 0 ? (d.amount / maxVal) * chartH : 0;
      const y = PADDING_TOP + chartH - barH;
      const isProjected = projectedYears.has(d.year);
      return { x, y, w: barWidth, h: barH, isProjected, ...d };
    });
  }, [allData, barWidth, barGap, chartH, maxVal, projectedYears]);

  // ── Touch / hover ─────────────────────────────────────────────────

  const handleTouch = useCallback(
    (evt: GestureResponderEvent) => {
      const { locationX } = evt.nativeEvent;
      const idx = bars.findIndex(
        (b) => locationX >= b.x - barGap / 2 && locationX <= b.x + b.w + barGap / 2
      );
      setActiveIdx(idx >= 0 ? idx : null);
    },
    [bars, barGap]
  );

  const handleMouseMove = useCallback(
    (evt: any) => {
      if (Platform.OS !== "web") return;
      const rect = evt.currentTarget.getBoundingClientRect();
      const x = evt.clientX - rect.left;
      const idx = bars.findIndex(
        (b) => x >= b.x - barGap / 2 && x <= b.x + b.w + barGap / 2
      );
      setActiveIdx(idx >= 0 ? idx : null);
    },
    [bars, barGap]
  );

  if (!allData.length || width === 0) {
    return (
      <Animated.View style={[s.container, containerStyle]} onLayout={onLayout}>
        {width > 0 && (
          <View style={[s.emptyContainer, { height: chartHeight }]}>
            <Text style={[s.emptyText, { color: colors.textMuted }]}>
              No dividend data to chart
            </Text>
          </View>
        )}
      </Animated.View>
    );
  }

  const activeBar = activeIdx !== null ? bars[activeIdx] : null;

  return (
    <Animated.View style={[s.container, containerStyle]} onLayout={onLayout}>
      {/* Title */}
      <View style={s.titleRow}>
        <Text style={[s.title, { color: colors.textPrimary }]}>
          Dividends by Year
        </Text>
        {activeBar && (
          <Text style={[s.tooltipValue, { color: colors.success }]}>
            {activeBar.year}: {formatCurrency(activeBar.amount, currency)}
          </Text>
        )}
      </View>

      <View
        style={{ height: chartHeight }}
        {...(Platform.OS === "web"
          ? { onMouseMove: handleMouseMove, onMouseLeave: () => setActiveIdx(null) }
          : {})}
        onStartShouldSetResponder={() => true}
        onResponderMove={handleTouch}
        onResponderRelease={() => setActiveIdx(null)}
      >
        <Svg
          width={width}
          height={chartHeight}
          accessibilityRole="image"
          accessibilityLabel={`Dividend income bar chart showing ${data.length} years`}
        >
          <Defs>
            <LinearGradient id="barGrad" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={colors.success} stopOpacity={0.95} />
              <Stop offset="100%" stopColor={colors.accentPrimary} stopOpacity={0.7} />
            </LinearGradient>
            <LinearGradient id="barGradActive" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={colors.success} stopOpacity={1} />
              <Stop offset="100%" stopColor={colors.accentPrimary} stopOpacity={1} />
            </LinearGradient>
            <LinearGradient id="barGradProjected" x1="0" y1="0" x2="0" y2="1">
              <Stop offset="0%" stopColor={colors.warning} stopOpacity={0.5} />
              <Stop offset="100%" stopColor={colors.accentSecondary ?? colors.accentPrimary} stopOpacity={0.3} />
            </LinearGradient>
          </Defs>

          {/* Y-axis grid lines + labels */}
          {yTicks.map((tick, i) => {
            const y = PADDING_TOP + chartH - (tick / maxVal) * chartH;
            return (
              <G key={`ytick-${i}`}>
                <SvgLine
                  x1={PADDING_LEFT}
                  y1={y}
                  x2={width - PADDING_RIGHT}
                  y2={y}
                  stroke={colors.borderColor}
                  strokeWidth={1}
                  strokeDasharray="4,4"
                  opacity={0.5}
                />
                <SvgText
                  x={PADDING_LEFT - 8}
                  y={y + 4}
                  textAnchor="end"
                  fontSize={11}
                  fill={colors.textMuted}
                  fontFamily={Platform.OS === "web" ? "system-ui" : undefined}
                >
                  {fmtVal(tick)}
                </SvgText>
              </G>
            );
          })}

          {/* Bars */}
          {bars.map((bar, i) => {
            const isActive = activeIdx === i;
            const radius = Math.min(6, bar.w / 3);
            const fillId = bar.isProjected
              ? "url(#barGradProjected)"
              : isActive ? "url(#barGradActive)" : "url(#barGrad)";
            return (
              <G key={`bar-${i}`}>
                {/* Bar body (rect) */}
                <Rect
                  x={bar.x}
                  y={bar.y}
                  width={bar.w}
                  height={Math.max(0, bar.h)}
                  rx={radius}
                  ry={radius}
                  fill={fillId}
                  opacity={activeIdx !== null && !isActive ? 0.4 : 1}
                />

                {/* Dashed border for projected bars */}
                {bar.isProjected && bar.h > 0 && (
                  <Rect
                    x={bar.x}
                    y={bar.y}
                    width={bar.w}
                    height={bar.h}
                    rx={radius}
                    ry={radius}
                    fill="none"
                    stroke={colors.warning}
                    strokeWidth={2}
                    strokeDasharray="6,3"
                    opacity={0.8}
                  />
                )}

                {/* Glow effect for active bar */}
                {isActive && bar.h > 0 && (
                  <Rect
                    x={bar.x - 2}
                    y={bar.y - 2}
                    width={bar.w + 4}
                    height={bar.h + 4}
                    rx={radius + 1}
                    ry={radius + 1}
                    fill="none"
                    stroke={colors.success}
                    strokeWidth={2}
                    opacity={0.4}
                  />
                )}

                {/* X-axis label (year) */}
                <SvgText
                  x={bar.x + bar.w / 2}
                  y={PADDING_TOP + chartH + 20}
                  textAnchor="middle"
                  fontSize={12}
                  fontWeight={isActive ? "700" : "500"}
                  fill={isActive ? colors.textPrimary : colors.textSecondary}
                  fontFamily={Platform.OS === "web" ? "system-ui" : undefined}
                >
                  {bar.year}
                </SvgText>

                {/* Value label on top of bar */}
                {bar.h > 20 && (
                  <SvgText
                    x={bar.x + bar.w / 2}
                    y={bar.y - 6}
                    textAnchor="middle"
                    fontSize={10}
                    fontWeight="600"
                    fill={isActive ? colors.success : colors.textMuted}
                    fontFamily={Platform.OS === "web" ? "system-ui" : undefined}
                    opacity={isActive ? 1 : 0.7}
                  >
                    {fmtVal(bar.amount)}
                  </SvgText>
                )}
              </G>
            );
          })}

          {/* Baseline */}
          <SvgLine
            x1={PADDING_LEFT}
            y1={PADDING_TOP + chartH}
            x2={width - PADDING_RIGHT}
            y2={PADDING_TOP + chartH}
            stroke={colors.borderColor}
            strokeWidth={1}
          />
        </Svg>
      </View>
    </Animated.View>
  );
}

const s = StyleSheet.create({
  container: {
    width: "100%",
  },
  titleRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  title: {
    fontSize: 15,
    fontWeight: "700",
  },
  tooltipValue: {
    fontSize: 14,
    fontWeight: "700",
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 14,
  },
});
