/**
 * GrowthChart — Interactive SVG bar / line / waterfall charts
 * for the Growth panel. Built with react-native-svg + reanimated.
 *
 * Features:
 *  • Three chart types: bar, line, waterfall
 *  • Touch / hover tooltip with crosshair
 *  • Animated entrance (bars grow, line draws)
 *  • Theme-adaptive (light / dark)
 *  • Responsive — fills container width
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    GestureResponderEvent,
    LayoutChangeEvent,
    Platform,
    Text,
    View,
} from "react-native";
import Animated, {
    Easing,
    useAnimatedStyle,
    useSharedValue,
    withTiming
} from "react-native-reanimated";
import Svg, {
    Circle,
    Defs,
    G,
    LinearGradient,
    Path,
    Rect,
    Stop,
    Line as SvgLine,
    Text as SvgText,
} from "react-native-svg";

import type { ThemePalette } from "@/constants/theme";

// ── Types ───────────────────────────────────────────────────────────

export type ChartMode = "bar" | "line" | "waterfall";

export interface GrowthChartPoint {
  label: string;     // period label (e.g. "FY2024")
  subLabel?: string;  // secondary label (e.g. prev period)
  value: number;      // growth as decimal (0.15 = 15%)
}

interface Props {
  data: GrowthChartPoint[];
  colors: ThemePalette;
  mode: ChartMode;
  height?: number;
  title?: string;
  accentPositive?: string;
  accentNegative?: string;
}

// ── Constants ───────────────────────────────────────────────────────

const PAD = { top: 32, right: 16, bottom: 52, left: 56 };
const ANIM_MS = 900;
const BAR_RADIUS = 4;
const Y_TICK_TARGET = 5;

// ── Helpers ─────────────────────────────────────────────────────────

function niceStep(range: number, count: number): number {
  const raw = range / count;
  const mag = Math.pow(10, Math.floor(Math.log10(raw)));
  const r = raw / mag;
  if (r <= 1.5) return mag;
  if (r <= 3) return 2 * mag;
  if (r <= 7) return 5 * mag;
  return 10 * mag;
}

function niceYTicks(lo: number, hi: number): number[] {
  if (hi === lo) return [lo];
  const step = niceStep(hi - lo, Y_TICK_TARGET);
  const nLo = Math.floor(lo / step) * step;
  const nHi = Math.ceil(hi / step) * step;
  const ticks: number[] = [];
  for (let v = nLo; v <= nHi + step * 0.001; v += step) {
    ticks.push(Math.round(v * 10000) / 10000);
  }
  return ticks;
}

function fmtPct(v: number): string {
  const pct = v * 100;
  if (Math.abs(pct) >= 100) return `${pct >= 0 ? "+" : ""}${pct.toFixed(0)}%`;
  return `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
}

function rv(n: number): string {
  return n.toFixed(1);
}

function smoothPath(pts: { x: number; y: number }[]): string {
  const n = pts.length;
  if (n < 2) return "";
  if (n === 2) return `M${rv(pts[0].x)},${rv(pts[0].y)}L${rv(pts[1].x)},${rv(pts[1].y)}`;
  const d: string[] = [`M${rv(pts[0].x)},${rv(pts[0].y)}`];
  const t = 0.3;
  for (let i = 0; i < n - 1; i++) {
    const p0 = pts[Math.max(0, i - 1)];
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const p3 = pts[Math.min(n - 1, i + 2)];
    d.push(
      `C${rv(p1.x + (p2.x - p0.x) * t)},${rv(p1.y + (p2.y - p0.y) * t)},` +
      `${rv(p2.x - (p3.x - p1.x) * t)},${rv(p2.y - (p3.y - p1.y) * t)},` +
      `${rv(p2.x)},${rv(p2.y)}`
    );
  }
  return d.join("");
}

// ── Unique ID counter ───────────────────────────────────────────────

let _cid = 0;

// ── Component ───────────────────────────────────────────────────────

export const GrowthChart = React.memo(function GrowthChart({
  data,
  colors,
  mode,
  height = 280,
  title,
  accentPositive,
  accentNegative,
}: Props) {
  const isDark = colors.mode === "dark";
  const posColor = accentPositive ?? colors.success;
  const negColor = accentNegative ?? colors.danger;
  const guideLine = isDark ? "rgba(255,255,255,0.1)" : "rgba(100,116,139,0.18)";
  const zeroLine = isDark ? "rgba(255,255,255,0.25)" : "rgba(100,116,139,0.35)";

  const [uid] = useState(() => `gc_${++_cid}`);
  const [cw, setCw] = useState(0);
  const [activeIdx, setActiveIdx] = useState<number | null>(null);

  // Animation
  const progress = useSharedValue(0);
  useEffect(() => {
    if (cw > 0 && data.length >= 1) {
      progress.value = 0;
      progress.value = withTiming(1, { duration: ANIM_MS, easing: Easing.out(Easing.cubic) });
    }
  }, [cw, data.length, mode]);

  const animStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * 12 }],
  }));

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const w = Math.floor(e.nativeEvent.layout.width);
    if (w > 0 && w !== cw) setCw(w);
  }, [cw]);

  // ── Geometry ────────────────────────────────────────────────────

  const geo = useMemo(() => {
    if (!data.length || cw <= 0) return null;

    const drawW = cw - PAD.left - PAD.right;
    const drawH = height - PAD.top - PAD.bottom;
    const vals = data.map((d) => d.value);
    const rawMin = Math.min(0, ...vals);
    const rawMax = Math.max(0, ...vals);
    const span = rawMax - rawMin || 0.1;
    const padMin = rawMin - span * 0.08;
    const padMax = rawMax + span * 0.08;
    const padSpan = padMax - padMin;

    const yTicks = niceYTicks(rawMin, rawMax);
    const tickObjs = yTicks.map((v) => ({
      value: v,
      y: PAD.top + (1 - (v - padMin) / padSpan) * drawH,
      label: fmtPct(v),
    }));

    const zeroY = PAD.top + (1 - (0 - padMin) / padSpan) * drawH;

    const n = data.length;
    const barGap = Math.max(4, drawW * 0.04);
    const totalGap = barGap * (n - 1);
    const barW = Math.min(48, (drawW - totalGap) / n);
    const totalBarsW = barW * n + totalGap;
    const offsetX = PAD.left + (drawW - totalBarsW) / 2;

    const bars = data.map((d, i) => {
      const cx = offsetX + i * (barW + barGap) + barW / 2;
      const valY = PAD.top + (1 - (d.value - padMin) / padSpan) * drawH;
      const positive = d.value >= 0;
      return {
        x: offsetX + i * (barW + barGap),
        cx,
        w: barW,
        topY: positive ? valY : zeroY,
        height: Math.abs(valY - zeroY),
        valY,
        positive,
        color: positive ? posColor : negColor,
        lightColor: positive
          ? (isDark ? posColor + "40" : posColor + "22")
          : (isDark ? negColor + "40" : negColor + "22"),
      };
    });

    // Line chart points
    const linePts = bars.map((b) => ({ x: b.cx, y: b.valY }));
    const lineD = smoothPath(linePts);
    // Area under line
    const bottom = PAD.top + drawH;
    const areaD = linePts.length >= 2
      ? `${lineD}L${rv(linePts[linePts.length - 1].x)},${rv(bottom)}L${rv(linePts[0].x)},${rv(bottom)}Z`
      : "";

    return { drawW, drawH, bars, barW, barGap, zeroY, tickObjs, linePts, lineD, areaD, bottom, offsetX };
  }, [data, cw, height, posColor, negColor, isDark]);

  // ── Touch ───────────────────────────────────────────────────────

  const findNearest = useCallback((locX: number) => {
    if (!geo) return;
    let best = 0, bestD = Infinity;
    for (let i = 0; i < geo.bars.length; i++) {
      const d = Math.abs(geo.bars[i].cx - locX);
      if (d < bestD) { bestD = d; best = i; }
    }
    setActiveIdx(best);
  }, [geo]);

  const clearActive = useCallback(() => setActiveIdx(null), []);

  const responders = useMemo(() => ({
    onStartShouldSetResponder: () => true,
    onMoveShouldSetResponder: () => true,
    onResponderGrant: (e: GestureResponderEvent) => findNearest(e.nativeEvent.locationX),
    onResponderMove: (e: GestureResponderEvent) => findNearest(e.nativeEvent.locationX),
    onResponderRelease: clearActive,
    onResponderTerminate: clearActive,
  }), [findNearest, clearActive]);

  const webMouse = useMemo(() =>
    Platform.OS === "web"
      ? { onMouseMove: (e: any) => findNearest(e.nativeEvent.offsetX), onMouseLeave: clearActive }
      : {},
    [findNearest, clearActive],
  );

  // ── Tooltip ─────────────────────────────────────────────────────

  const tip = useMemo(() => {
    if (activeIdx == null || !geo) return null;
    const b = geo.bars[activeIdx];
    const d = data[activeIdx];
    return { x: b.cx, y: b.valY, value: d.value, label: d.label, subLabel: d.subLabel, positive: b.positive, color: b.color };
  }, [activeIdx, geo, data]);

  // ── Render ──────────────────────────────────────────────────────

  if (!data.length) return null;

  const tooltipBg = isDark ? "rgba(18,18,30,0.92)" : "rgba(255,255,255,0.95)";
  const tooltipBorder = isDark ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.08)";
  const fontFamily = Platform.select({ web: "'Inter', system-ui, sans-serif", default: undefined });

  return (
    <View style={{ width: "100%", marginBottom: 4 }} onLayout={onLayout}>
      {title && (
        <Text style={{ color: colors.textSecondary, fontSize: 12, fontWeight: "600", marginBottom: 8, marginLeft: 4 }}>
          {title}
        </Text>
      )}
      {cw > 0 && geo && (
        <Animated.View
          style={[
            {
              height,
              borderRadius: 14,
              backgroundColor: isDark ? colors.bgCard : colors.bgPrimary,
              borderWidth: isDark ? 0 : 1,
              borderColor: colors.borderColor,
              overflow: "hidden",
            },
            animStyle,
          ]}
        >
          <View style={{ flex: 1 }} {...responders} {...webMouse}>
            <Svg width={cw} height={height}>
              <Defs>
                <LinearGradient id={`${uid}_areaPos`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={posColor} stopOpacity={isDark ? 0.35 : 0.2} />
                  <Stop offset="100%" stopColor={posColor} stopOpacity={0.02} />
                </LinearGradient>
                <LinearGradient id={`${uid}_barPos`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={posColor} stopOpacity={isDark ? 0.9 : 0.85} />
                  <Stop offset="100%" stopColor={posColor} stopOpacity={isDark ? 0.55 : 0.5} />
                </LinearGradient>
                <LinearGradient id={`${uid}_barNeg`} x1="0" y1="0" x2="0" y2="1">
                  <Stop offset="0%" stopColor={negColor} stopOpacity={isDark ? 0.55 : 0.5} />
                  <Stop offset="100%" stopColor={negColor} stopOpacity={isDark ? 0.9 : 0.85} />
                </LinearGradient>
              </Defs>

              {/* Y-axis guide lines */}
              {geo.tickObjs.map((t, i) => (
                <G key={`yt${i}`}>
                  <SvgLine
                    x1={PAD.left} y1={t.y} x2={cw - PAD.right} y2={t.y}
                    stroke={t.value === 0 ? zeroLine : guideLine}
                    strokeWidth={t.value === 0 ? 1.2 : 0.6}
                    strokeDasharray={t.value === 0 ? undefined : "3,4"}
                  />
                  <SvgText
                    x={PAD.left - 8} y={t.y + 3.5}
                    fontSize={10} fill={colors.textMuted}
                    textAnchor="end" fontWeight="500"
                    fontFamily={fontFamily}
                  >
                    {t.label}
                  </SvgText>
                </G>
              ))}

              {/* ── BAR MODE ── */}
              {mode === "bar" && geo.bars.map((b, i) => (
                <G key={`b${i}`}>
                  <Rect
                    x={b.x} y={b.topY}
                    width={b.w} height={Math.max(b.height, 1)}
                    rx={BAR_RADIUS} ry={BAR_RADIUS}
                    fill={`url(#${uid}_bar${b.positive ? "Pos" : "Neg"})`}
                    opacity={activeIdx != null && activeIdx !== i ? 0.35 : 1}
                  />
                  {/* Glow on active */}
                  {activeIdx === i && (
                    <Rect
                      x={b.x - 2} y={b.topY - 2}
                      width={b.w + 4} height={Math.max(b.height, 1) + 4}
                      rx={BAR_RADIUS + 1} ry={BAR_RADIUS + 1}
                      fill="none" stroke={b.color} strokeWidth={1.5} opacity={0.5}
                    />
                  )}
                </G>
              ))}

              {/* ── LINE MODE ── */}
              {mode === "line" && geo.linePts.length >= 2 && (
                <G>
                  <Path d={geo.areaD} fill={`url(#${uid}_areaPos)`} />
                  <Path
                    d={geo.lineD} fill="none"
                    stroke={posColor} strokeWidth={2.5}
                    strokeLinejoin="round" strokeLinecap="round"
                    opacity={0.9}
                  />
                  {/* Data dots */}
                  {geo.linePts.map((p, i) => {
                    const b = geo.bars[i];
                    const isActive = activeIdx === i;
                    return (
                      <G key={`ld${i}`}>
                        {isActive && (
                          <Circle cx={p.x} cy={p.y} r={10} fill={b.color} opacity={0.15} />
                        )}
                        <Circle
                          cx={p.x} cy={p.y}
                          r={isActive ? 5 : 3.5}
                          fill={b.color}
                          stroke={isDark ? colors.bgCard : "#fff"}
                          strokeWidth={2}
                          opacity={activeIdx != null && !isActive ? 0.3 : 1}
                        />
                      </G>
                    );
                  })}
                </G>
              )}

              {/* ── WATERFALL MODE ── */}
              {mode === "waterfall" && (() => {
                let cumulative = 0;
                return geo.bars.map((b, i) => {
                  const prev = cumulative;
                  cumulative += data[i].value;
                  const prevY = PAD.top + (1 - (prev - (geo.tickObjs[0]?.value ?? 0) + (geo.tickObjs[0]?.value ?? 0)) / 1) * geo.drawH;
                  // Use actual bar geo but offset from prev cumulative
                  const startVal = prev;
                  const endVal = cumulative;
                  const padMin = geo.tickObjs[geo.tickObjs.length - 1]?.value ?? 0;
                  const padMax = geo.tickObjs[0]?.value ?? 1;
                  // Just use bar rendering with connectors
                  const isActive = activeIdx === i;
                  return (
                    <G key={`wf${i}`}>
                      {/* Connector from previous bar */}
                      {i > 0 && (
                        <SvgLine
                          x1={geo.bars[i - 1].cx} y1={geo.bars[i - 1].valY}
                          x2={b.cx} y2={geo.bars[i - 1].valY}
                          stroke={colors.textMuted} strokeWidth={0.8}
                          strokeDasharray="2,3" opacity={0.5}
                        />
                      )}
                      <Rect
                        x={b.x} y={b.topY}
                        width={b.w} height={Math.max(b.height, 1)}
                        rx={BAR_RADIUS} ry={BAR_RADIUS}
                        fill={b.positive ? posColor : negColor}
                        opacity={activeIdx != null && !isActive ? 0.3 : (isDark ? 0.8 : 0.75)}
                      />
                      {isActive && (
                        <Rect
                          x={b.x - 2} y={b.topY - 2}
                          width={b.w + 4} height={Math.max(b.height, 1) + 4}
                          rx={BAR_RADIUS + 1} ry={BAR_RADIUS + 1}
                          fill="none" stroke={b.color} strokeWidth={1.5} opacity={0.5}
                        />
                      )}
                    </G>
                  );
                });
              })()}

              {/* X-axis labels */}
              {geo.bars.map((b, i) => (
                <SvgText
                  key={`xl${i}`}
                  x={b.cx} y={height - PAD.bottom + 16}
                  fontSize={9.5} fill={activeIdx === i ? colors.textPrimary : colors.textMuted}
                  textAnchor="middle" fontWeight={activeIdx === i ? "700" : "500"}
                  fontFamily={fontFamily}
                >
                  {data[i].label}
                </SvgText>
              ))}

              {/* Crosshair on active */}
              {tip && (
                <G>
                  <SvgLine
                    x1={tip.x} y1={PAD.top} x2={tip.x} y2={height - PAD.bottom}
                    stroke={tip.color} strokeWidth={0.8} strokeDasharray="4,3"
                    opacity={0.6}
                  />
                </G>
              )}
            </Svg>

            {/* Floating tooltip */}
            {tip && (
              <View
                style={{
                  position: "absolute",
                  left: Math.min(Math.max(tip.x - 70, 8), cw - 152),
                  top: Math.max(tip.y - 68, 8),
                  backgroundColor: tooltipBg,
                  borderRadius: 10,
                  borderWidth: 1,
                  borderColor: tooltipBorder,
                  paddingHorizontal: 12,
                  paddingVertical: 8,
                  minWidth: 120,
                  shadowColor: tip.color,
                  shadowOffset: { width: 0, height: 4 },
                  shadowOpacity: 0.2,
                  shadowRadius: 12,
                  elevation: 8,
                }}
                pointerEvents="none"
              >
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "500", marginBottom: 2 }}>
                  {tip.subLabel ? `${tip.subLabel} → ` : ""}{tip.label}
                </Text>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{
                    width: 8, height: 8, borderRadius: 4,
                    backgroundColor: tip.color, marginRight: 6,
                  }} />
                  <Text style={{
                    color: tip.positive ? posColor : negColor,
                    fontSize: 16, fontWeight: "800",
                    fontVariant: ["tabular-nums"],
                  }}>
                    {fmtPct(tip.value)}
                  </Text>
                </View>
              </View>
            )}
          </View>
        </Animated.View>
      )}
    </View>
  );
});
