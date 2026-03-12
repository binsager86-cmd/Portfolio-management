import type { ThemePalette } from "@/constants/theme";

/**
 * Shared formatting utilities — replaces per-file duplicated formatters.
 */

/** Format number as compact axis label: 1.2M, 3.5K, or plain integer. */
export function fmtAxisVal(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return (v / 1_000_000).toFixed(1).replace(/\.0$/, "") + "M";
  if (abs >= 1_000) return (v / 1_000).toFixed(1).replace(/\.0$/, "") + "K";
  return v.toFixed(0);
}

/** Return a theme PnL color string for a numeric value. */
export function pnlColor(n: number, c: ThemePalette): string {
  if (n > 0) return c.success;
  if (n < 0) return c.danger;
  return c.textSecondary;
}

export type TrendDirection = "up" | "down" | "neutral";

/** Return trend direction string for a numeric value. */
export function pnlTrend(v: number): TrendDirection {
  if (v > 0) return "up";
  if (v < 0) return "down";
  return "neutral";
}
