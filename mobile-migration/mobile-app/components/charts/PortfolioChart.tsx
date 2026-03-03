/**
 * PortfolioChart — Premium area chart for portfolio value history.
 *
 * Features:
 *  • Natural cubic-spline interpolation (Catmull-Rom → Bézier)
 *  • Linear gradient fill (Purple → Blue) via SVG shaders
 *  • Theme-adaptive background (dark #0F0F0F / light #F7F8FC)
 *  • No grid lines / axis ticks — clean aesthetic
 *  • Touch (mobile) + hover (web) tooltip with glassmorphism
 *  • Entrance animation (1200 ms ease-out fade + slide)
 *  • Fully responsive to container width
 *  • Cross-platform: Web + iOS + Android
 *
 * Built with react-native-svg + react-native-reanimated for
 * maximum cross-platform compatibility.
 */

import React, { useState, useMemo, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ViewStyle,
  Platform,
  LayoutChangeEvent,
  GestureResponderEvent,
} from "react-native";
import Svg, {
  Path,
  Defs,
  LinearGradient,
  Stop,
  Circle,
  Line as SvgLine,
  G,
  Text as SvgText,
} from "react-native-svg";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  withDelay,
  Easing,
} from "react-native-reanimated";
import { useThemeStore } from "@/services/themeStore";
import { formatCurrency } from "@/lib/currency";

// ── Public types ────────────────────────────────────────────────────

export interface ChartDataPoint {
  date: string;
  value: number;
}

interface PortfolioChartProps {
  /** Array of { date, value } points to plot. */
  data: ChartDataPoint[];
  /** Optional inline style for the outer container. */
  style?: ViewStyle;
  /** Chart height — default 300. */
  height?: number;
  /** Chart title. */
  title?: string;
}

// ── Constants ───────────────────────────────────────────────────────

const PAD = { top: 24, right: 20, bottom: 44, left: 62 };
const Y_TICK_COUNT = 5;
const ANIM_MS = 1200;

// Theme-adaptive gradient palettes
const GRAD_DARK = {
  purple: "#8B5CF6",
  blue: "#3B82F6",
  purpleLight: "#A78BFA",
  blueLight: "#60A5FA",
  purpleGlow: "rgba(139,92,246,0.45)",
  blueGlow: "rgba(59,130,246,0.45)",
  areaTopOpacity: 0.45,
  areaMidOpacity: 0.12,
  areaBotOpacity: 0.02,
  guideLine: "rgba(255,255,255,0.15)",
  dotFill: "#FFFFFF",
  tooltipBg: "rgba(18,18,28,0.88)",
  tooltipBorder: "rgba(139,92,246,0.35)",
  tooltipShadow: "rgba(139,92,246,0.25)",
  tooltipValue: "#FFFFFF",
  tooltipDate: "rgba(255,255,255,0.55)",
  chartBg: "#0F0F0F",
  placeholderBg: "#0F0F0F",
} as const;

const GRAD_LIGHT = {
  purple: "#7C3AED",
  blue: "#2563EB",
  purpleLight: "#8B5CF6",
  blueLight: "#3B82F6",
  purpleGlow: "rgba(124,58,237,0.22)",
  blueGlow: "rgba(37,99,235,0.22)",
  areaTopOpacity: 0.28,
  areaMidOpacity: 0.08,
  areaBotOpacity: 0.01,
  guideLine: "rgba(100,116,139,0.22)",
  dotFill: "#FFFFFF",
  tooltipBg: "rgba(255,255,255,0.92)",
  tooltipBorder: "rgba(124,58,237,0.25)",
  tooltipShadow: "rgba(100,116,139,0.18)",
  tooltipValue: "#1e293b",
  tooltipDate: "rgba(100,116,139,0.72)",
  chartBg: "#F7F8FC",
  placeholderBg: "#F7F8FC",
} as const;

// ── Compact value formatter for axis labels ────────────────────────

function fmtAxisVal(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return v.toFixed(0);
}

/** Compute "nice" rounded tick values for a Y-axis. */
function niceYTicks(lo: number, hi: number, count: number): number[] {
  if (hi === lo) return [lo];
  const rawStep = (hi - lo) / (count - 1);
  const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep)));
  const residual = rawStep / magnitude;
  let niceStep: number;
  if (residual <= 1.5) niceStep = magnitude;
  else if (residual <= 3) niceStep = 2 * magnitude;
  else if (residual <= 7) niceStep = 5 * magnitude;
  else niceStep = 10 * magnitude;

  const nLo = Math.floor(lo / niceStep) * niceStep;
  const nHi = Math.ceil(hi / niceStep) * niceStep;
  const ticks: number[] = [];
  for (let v = nLo; v <= nHi + niceStep * 0.01; v += niceStep) {
    ticks.push(Math.round(v * 100) / 100);
  }
  // Trim to count if too many
  while (ticks.length > count + 1) ticks.pop();
  return ticks;
}

// ── Smooth-curve helper (Catmull-Rom → Cubic Bézier) ────────────────

/** Round to 1 decimal for compact SVG path strings. */
function rv(v: number): string {
  return v.toFixed(1);
}

function smoothPath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n < 2) return "";
  if (n === 2)
    return `M${rv(pts[0].x)},${rv(pts[0].y)}L${rv(pts[1].x)},${rv(pts[1].y)}`;

  const d: string[] = [`M${rv(pts[0].x)},${rv(pts[0].y)}`];
  const tension = 0.33;

  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];

    const cp1x = p1.x + (p2.x - p0.x) * tension;
    const cp1y = p1.y + (p2.y - p0.y) * tension;
    const cp2x = p2.x - (p3.x - p1.x) * tension;
    const cp2y = p2.y - (p3.y - p1.y) * tension;

    d.push(
      `C${rv(cp1x)},${rv(cp1y)},${rv(cp2x)},${rv(cp2y)},${rv(p2.x)},${rv(p2.y)}`
    );
  }
  return d.join("");
}

// ── Component ───────────────────────────────────────────────────────

export function PortfolioChart({
  data,
  style,
  height = 300,
  title = "Portfolio Value",
}: PortfolioChartProps) {
  const { colors } = useThemeStore();
  const isDark = colors.mode === "dark";
  const pal = isDark ? GRAD_DARK : GRAD_LIGHT;
  const [containerWidth, setContainerWidth] = useState(0);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  // ── Entrance animation ──────────────────────────────────────────

  const progress = useSharedValue(0);
  const labelAlpha = useSharedValue(0);

  useEffect(() => {
    if (containerWidth > 0 && data?.length >= 2) {
      progress.value = 0;
      labelAlpha.value = 0;
      progress.value = withTiming(1, {
        duration: ANIM_MS,
        easing: Easing.out(Easing.cubic),
      });
      labelAlpha.value = withDelay(
        ANIM_MS * 0.55,
        withTiming(1, { duration: 500, easing: Easing.in(Easing.quad) })
      );
    }
  }, [containerWidth, data?.length]);

  const chartAnimStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 18 }],
  }));

  // ── Layout ──────────────────────────────────────────────────────

  const onLayout = useCallback(
    (e: LayoutChangeEvent) => {
      const w = Math.floor(e.nativeEvent.layout.width);
      if (w > 0 && w !== containerWidth) setContainerWidth(w);
    },
    [containerWidth]
  );

  // ── Chart geometry ──────────────────────────────────────────────

  const geo = useMemo(() => {
    if (!data || data.length < 2 || containerWidth <= 0) return null;

    const cw = containerWidth - PAD.left - PAD.right;
    const ch = height - PAD.top - PAD.bottom;

    const vals = data.map((d) => d.value);
    const lo = Math.min(...vals);
    const hi = Math.max(...vals);
    const span = hi - lo || 1;
    const padLo = lo - span * 0.05;
    const padHi = hi + span * 0.05;
    const padSpan = padHi - padLo;

    const pts = data.map((d, i) => ({
      x: PAD.left + (i / (data.length - 1)) * cw,
      y: PAD.top + (1 - (d.value - padLo) / padSpan) * ch,
    }));

    const line = smoothPath(pts);
    const bottom = PAD.top + ch;
    const area = `${line}L${rv(pts[pts.length - 1].x)},${bottom}L${rv(pts[0].x)},${bottom}Z`;

    // Y-axis ticks
    const yTicks = niceYTicks(lo, hi, Y_TICK_COUNT).map((value) => ({
      value,
      y: PAD.top + (1 - (value - padLo) / padSpan) * ch,
      label: fmtAxisVal(value),
    }));

    return { pts, line, area, cw, ch, yTicks };
  }, [data, containerWidth, height]);

  // ── Touch / mouse interaction ───────────────────────────────────

  const findNearest = useCallback(
    (locX: number) => {
      if (!geo) return;
      let best = 0;
      let bestD = Infinity;
      for (let i = 0; i < geo.pts.length; i++) {
        const d = Math.abs(geo.pts[i].x - locX);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
      setActiveIdx(best);
    },
    [geo]
  );

  const clearActive = useCallback(() => setActiveIdx(null), []);

  const responders = useMemo(
    () => ({
      onStartShouldSetResponder: () => true,
      onMoveShouldSetResponder: () => true,
      onResponderGrant: (e: GestureResponderEvent) =>
        findNearest(e.nativeEvent.locationX),
      onResponderMove: (e: GestureResponderEvent) =>
        findNearest(e.nativeEvent.locationX),
      onResponderRelease: clearActive,
      onResponderTerminate: clearActive,
    }),
    [findNearest, clearActive]
  );

  const webMouse = useMemo(
    () =>
      Platform.OS === "web"
        ? {
            onMouseMove: (e: any) => findNearest(e.nativeEvent.offsetX),
            onMouseLeave: clearActive,
          }
        : {},
    [findNearest, clearActive]
  );

  // ── Date labels ──────────────────────────────────────────────────

  const dateLabels = useMemo(() => {
    if (!geo || data.length < 2) return [];
    const count = containerWidth > 640 ? 5 : 3;
    return Array.from({ length: count }, (_, i) => {
      const idx = Math.round((i / (count - 1)) * (data.length - 1));
      return {
        x: geo.pts[idx].x,
        label: new Date(data[idx].date).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        }),
      };
    });
  }, [geo, data, containerWidth]);

  // ── Tooltip data ─────────────────────────────────────────────────

  const tip = useMemo(() => {
    if (activeIdx == null || !geo) return null;
    return {
      x: geo.pts[activeIdx].x,
      y: geo.pts[activeIdx].y,
      date: data[activeIdx].date,
      value: data[activeIdx].value,
    };
  }, [activeIdx, geo, data]);

  // ── No-data placeholder ─────────────────────────────────────────

  if (!data || data.length < 2) {
    return (
      <View
        style={[
          placeholderS.root,
          {
            borderColor: colors.borderColor,
            backgroundColor: pal.placeholderBg,
            height,
          },
          style,
        ]}
        onLayout={onLayout}
      >
        <Text style={[placeholderS.text, { color: colors.textMuted }]}>
          📊 Chart will appear when history data is available
        </Text>
      </View>
    );
  }

  // ── Render ───────────────────────────────────────────────────────

  return (
    <View style={[{ width: "100%" }, style]} onLayout={onLayout}>
      {title && (
        <Text style={[chartS.title, { color: colors.textSecondary }]}>
          {title}
        </Text>
      )}

      {containerWidth > 0 && geo && (
        <Animated.View
          style={[
            chartS.chartWrap,
            {
              height,
              backgroundColor: pal.chartBg,
              borderWidth: isDark ? 0 : 1,
              borderColor: isDark ? "transparent" : colors.borderColor,
            },
            chartAnimStyle,
          ]}
        >
          <View
            style={chartS.touchLayer}
            {...responders}
            {...webMouse}
          >
            <Svg width={containerWidth} height={height}>
              <Defs>
                {/* Area gradient (Purple top → Blue bottom, fading out) */}
                <LinearGradient id="aFill" x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={pal.purple} stopOpacity={pal.areaTopOpacity} />
                  <Stop offset="55%" stopColor={pal.blue} stopOpacity={pal.areaMidOpacity} />
                  <Stop offset="100%" stopColor={pal.blue} stopOpacity={pal.areaBotOpacity} />
                </LinearGradient>

                {/* Line gradient (Purple left → Blue right) */}
                <LinearGradient id="lStroke" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0%" stopColor={pal.purpleLight} />
                  <Stop offset="100%" stopColor={pal.blueLight} />
                </LinearGradient>

                {/* Glow halo for line */}
                <LinearGradient id="glowS" x1="0" y1="0" x2="1" y2="0">
                  <Stop offset="0%" stopColor={pal.purpleGlow} />
                  <Stop offset="100%" stopColor={pal.blueGlow} />
                </LinearGradient>
              </Defs>

              {/* ── Y-axis grid lines + labels ── */}
              {geo.yTicks.map((tick, i) => (
                <G key={`yt-${i}`}>
                  <SvgLine
                    x1={PAD.left}
                    y1={tick.y}
                    x2={containerWidth - PAD.right}
                    y2={tick.y}
                    stroke={pal.guideLine}
                    strokeWidth={0.7}
                    strokeDasharray="3,4"
                  />
                  <SvgText
                    x={PAD.left - 8}
                    y={tick.y + 4}
                    fontSize={10}
                    fill={colors.textMuted}
                    textAnchor="end"
                    fontWeight="500"
                    fontFamily={Platform.select({
                      web: "'Inter', 'SF Mono', system-ui, sans-serif",
                      default: undefined,
                    })}
                  >
                    {tick.label}
                  </SvgText>
                </G>
              ))}

              {/* ── Gradient area fill ── */}
              <Path d={geo.area} fill="url(#aFill)" />

              {/* ── Glow line (wider, semi-transparent) ── */}
              <Path
                d={geo.line}
                fill="none"
                stroke="url(#glowS)"
                strokeWidth={5}
                strokeLinecap="round"
              />

              {/* ── Main line ── */}
              <Path
                d={geo.line}
                fill="none"
                stroke="url(#lStroke)"
                strokeWidth={2.2}
                strokeLinecap="round"
              />

              {/* ── Date labels (bottom) ── */}
              {dateLabels.map((dl, i) => (
                <SvgText
                  key={i}
                  x={dl.x}
                  y={height - 10}
                  fontSize={11}
                  fill={colors.textMuted + "AA"}
                  textAnchor="middle"
                  fontFamily={Platform.select({
                    web: "'Inter', system-ui, sans-serif",
                    default: undefined,
                  })}
                >
                  {dl.label}
                </SvgText>
              ))}

              {/* ── Active-point indicator ── */}
              {tip && (
                <G>
                  {/* Vertical guide */}
                  <SvgLine
                    x1={tip.x}
                    y1={PAD.top}
                    x2={tip.x}
                    y2={height - PAD.bottom}
                    stroke={pal.guideLine}
                    strokeWidth={1}
                    strokeDasharray="4,4"
                  />
                  {/* Outer glow circle */}
                  <Circle
                    cx={tip.x}
                    cy={tip.y}
                    r={10}
                    fill={pal.purple}
                    opacity={isDark ? 0.22 : 0.15}
                  />
                  {/* Inner dot */}
                  <Circle
                    cx={tip.x}
                    cy={tip.y}
                    r={5}
                    fill={pal.dotFill}
                    stroke={pal.purple}
                    strokeWidth={2.5}
                  />
                </G>
              )}
            </Svg>

            {/* ── Tooltip card (glassmorphism) ── */}
            {tip && (
              <View
                style={[
                  tooltipS.card,
                  {
                    left: Math.min(
                      Math.max(tip.x - 72, 8),
                      containerWidth - 152
                    ),
                    top: Math.max(tip.y - 78, 4),
                    backgroundColor: pal.tooltipBg,
                    borderColor: pal.tooltipBorder,
                    ...(Platform.OS === "web"
                      ? ({
                          boxShadow: `0 8px 32px ${pal.tooltipShadow}`,
                        } as any)
                      : {
                          shadowColor: pal.purple,
                        }),
                  },
                ]}
                pointerEvents="none"
              >
                <Text style={[tooltipS.value, { color: pal.tooltipValue }]}>
                  {formatCurrency(tip.value)}
                </Text>
                <Text style={[tooltipS.date, { color: pal.tooltipDate }]}>
                  {new Date(tip.date).toLocaleDateString(undefined, {
                    year: "numeric",
                    month: "short",
                    day: "numeric",
                  })}
                </Text>
              </View>
            )}
          </View>
        </Animated.View>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const chartS = StyleSheet.create({
  title: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 10,
  },
  chartWrap: {
    borderRadius: 16,
    overflow: "hidden",
  },
  touchLayer: {
    flex: 1,
    position: "relative",
    ...(Platform.OS === "web" ? ({ cursor: "crosshair" } as any) : {}),
  },
});

const tooltipS = StyleSheet.create({
  card: {
    position: "absolute",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderWidth: 1,
    minWidth: 130,
    ...(Platform.OS === "web"
      ? ({
          backdropFilter: "blur(16px)",
          WebkitBackdropFilter: "blur(16px)",
        } as any)
      : {
          shadowOffset: { width: 0, height: 6 },
          shadowOpacity: 0.35,
          shadowRadius: 16,
          elevation: 10,
        }),
  },
  value: {
    fontSize: 16,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
  date: {
    fontSize: 11,
    marginTop: 3,
    letterSpacing: 0.2,
  },
});

const placeholderS = StyleSheet.create({
  root: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 40,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 200,
  },
  text: {
    fontSize: 14,
    textAlign: "center",
  },
});
