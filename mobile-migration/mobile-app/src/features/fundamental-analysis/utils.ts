/**
 * Fundamental Analysis — Pure helper / utility functions.
 */

import type { ThemePalette } from "@/constants/theme";
import type { StockMetric } from "@/services/api";

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
  for (const cat of Object.keys(catMap)) {
    if (result[cat]) continue;
    result[cat] = { metricNames: Array.from(catMap[cat].nameSet), yearData: catMap[cat].yearData, years: Object.keys(catMap[cat].yearData).map(Number).sort() };
  }
  return result;
}

export function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

export function formatMetricValue(name: string, value: number): string {
  const lc = name.toLowerCase();
  if (["margin", "ratio", "roe", "roa", "growth", "payout", "turnover", "coverage"].some((p) => lc.includes(p)) || lc.includes("dupont"))
    return (value * 100).toFixed(1) + "%";
  if (lc.includes("days") || lc.includes("cycle")) return value.toFixed(0) + " days";
  if (lc.includes("multiplier")) return value.toFixed(2) + "x";
  return formatNumber(value);
}

export function scoreColor(score: number, colors: ThemePalette): string {
  if (score >= 70) return colors.success;
  if (score >= 50) return colors.warning ?? "#f59e0b";
  return colors.danger;
}

export function scoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 60) return "Above Average";
  if (score >= 50) return "Average";
  if (score >= 40) return "Below Average";
  return "Poor";
}
