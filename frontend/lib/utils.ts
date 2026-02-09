import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/** Format a number with commas and optional decimal places */
export function formatNumber(
  value: number,
  decimals = 0,
  options?: { prefix?: string; suffix?: string; showSign?: boolean }
): string {
  const { prefix = "", suffix = "", showSign = false } = options ?? {};
  const sign = showSign && value > 0 ? "+" : "";
  return `${prefix}${sign}${value.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}${suffix}`;
}

/** Format currency (KWD default) */
export function formatCurrency(value: number, decimals = 2): string {
  return formatNumber(value, decimals, { prefix: "" });
}

/** Return Tailwind color class for P&L value */
export function pnlColor(value: number): string {
  if (value > 0) return "text-success";
  if (value < 0) return "text-danger";
  return "text-surface-muted";
}

/** Return bg class for P&L badge */
export function pnlBgColor(value: number): string {
  if (value > 0) return "bg-success-light text-success-dark";
  if (value < 0) return "bg-danger-light text-danger-dark";
  return "bg-slate-100 text-slate-600";
}
