/**
 * Fundamental Analysis — Pure helper / utility functions.
 */

import type { ThemePalette } from "@/constants/theme";
import type { StockMetric } from "@/services/api";
import { format, parseISO } from "date-fns";
import { SCORE_THRESHOLDS } from "./types";

/** Group metrics by category with yearly history. */
export function buildHistoricalMetrics(allMetrics: StockMetric[]) {
  const catMap: Record<string, { nameSet: Set<string>; yearData: Record<number, Record<string, number>> }> = {};
  for (const m of allMetrics) {
    const cat = m.metric_type;
    if (!catMap[cat]) catMap[cat] = { nameSet: new Set(), yearData: {} };
    catMap[cat].nameSet.add(m.metric_name);
    if (!catMap[cat].yearData[m.fiscal_year]) catMap[cat].yearData[m.fiscal_year] = {};
    catMap[cat].yearData[m.fiscal_year][m.metric_name] = m.metric_value;
  }
  const result: Record<string, { metricNames: string[]; yearData: Record<number, Record<string, number>>; years: number[] }> = {};
  const catOrder = ["profitability", "liquidity", "leverage", "efficiency", "valuation", "cashflow", "growth"];
  for (const cat of catOrder) {
    if (!catMap[cat]) continue;
    result[cat] = { metricNames: Array.from(catMap[cat].nameSet), yearData: catMap[cat].yearData, years: Object.keys(catMap[cat].yearData).map(Number).sort() };
  }
  return result;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatMetricValue(name: string, value: number): string {
  const lc = name.toLowerCase();
  // True percentage metrics (stored as decimals, display ×100 as %)
  const isPct = ["margin", "roe", "roa", "growth", "payout", "retention"].some((k) => lc.includes(k))
    || lc.includes("dupont") || lc.includes("sustainable");
  if (isPct) return (value * 100).toFixed(1) + "%";
  // Days metrics
  if (lc.includes("days") || lc.includes("cycle")) return value.toFixed(0) + " days";
  // Multiplier metrics (turnover, coverage, liquidity & leverage ratios)
  const isMult = ["turnover", "coverage", "multiplier"].some((k) => lc.includes(k))
    || ["current ratio", "quick ratio", "cash ratio"].some((k) => lc === k);
  if (isMult) return value.toFixed(2) + "x";
  // Per-share metrics
  if (lc.includes("eps") || lc.includes("earnings per share")) return value.toFixed(3);
  return formatNumber(value);
}

/** Type-safe metric formatter — returns "–" for non-numeric values. */
export function safeFormatMetric(name: string, val: unknown): string {
  if (typeof val !== "number" || isNaN(val)) return "–";
  return formatMetricValue(name, val);
}

/** Format ISO date string to a consistent display format. */
export function formatScoreDate(dateStr: string | undefined | null): string {
  if (!dateStr) return "–";
  try {
    return format(parseISO(dateStr), "MMM d, yyyy");
  } catch {
    return dateStr;
  }
}

export function scoreColor(score: number, colors: ThemePalette): string {
  if (score >= SCORE_THRESHOLDS.EXCEPTIONAL) return colors.success;
  if (score >= SCORE_THRESHOLDS.STRONG) return "#22c55e";
  if (score >= SCORE_THRESHOLDS.ACCEPTABLE) return colors.warning ?? "#f59e0b";
  if (score >= SCORE_THRESHOLDS.WEAK) return "#f97316";
  return colors.danger;
}

export function scoreLabel(score: number): string {
  if (score >= SCORE_THRESHOLDS.EXCEPTIONAL) return "Exceptional";
  if (score >= SCORE_THRESHOLDS.STRONG) return "Strong";
  if (score >= SCORE_THRESHOLDS.ACCEPTABLE) return "Acceptable";
  if (score >= SCORE_THRESHOLDS.WEAK) return "Weak";
  return "Avoid";
}

export const INTERPRETATION_SCALE = [
  { min: 85, max: 100, label: "Exceptional investment candidate", color: "#16a34a" },
  { min: 70, max: 84, label: "Strong", color: "#22c55e" },
  { min: 55, max: 69, label: "Acceptable / neutral", color: "#f59e0b" },
  { min: 40, max: 54, label: "Weak", color: "#f97316" },
  { min: 0, max: 39, label: "Avoid unless special situation", color: "#ef4444" },
] as const;
