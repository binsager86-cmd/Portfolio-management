/**
 * Currency formatting helpers.
 *
 * Handles KWD (3 decimals), USD (2 decimals), and fallback (2 decimals).
 * Uses Intl.NumberFormat for locale-aware number formatting.
 */

const DECIMAL_MAP: Record<string, number> = {
  KWD: 3,
  USD: 2,
  EUR: 2,
  GBP: 2,
};

/**
 * Format a number as a currency string.
 *
 * @param value   — numeric value
 * @param ccy     — ISO currency code (default "KWD")
 * @param opts    — override minimumFractionDigits / maximumFractionDigits
 *
 * @example
 *   formatCurrency(12345.678, 'KWD')  // "12,345.678 KWD"
 *   formatCurrency(-420.5, 'USD')     // "-420.50 USD"
 *   formatCurrency(1234)              // "1,234.000 KWD"
 */
export function formatCurrency(
  value: number | null | undefined,
  ccy: string = "KWD",
  opts?: { minimumFractionDigits?: number; maximumFractionDigits?: number }
): string {
  if (value == null) return "—";

  const decimals = DECIMAL_MAP[ccy] ?? 2;
  const minDec = opts?.minimumFractionDigits ?? decimals;
  const maxDec = opts?.maximumFractionDigits ?? decimals;

  const formatted = value.toLocaleString(undefined, {
    minimumFractionDigits: minDec,
    maximumFractionDigits: maxDec,
  });

  return `${formatted} ${ccy}`;
}

/**
 * Format a number with sign prefix ("+1,234.56" / "-420.00").
 */
export function formatSignedCurrency(
  value: number | null | undefined,
  ccy: string = "KWD"
): string {
  if (value == null) return "—";
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${formatCurrency(value, ccy)}`;
}

/**
 * Format a percentage with sign prefix.
 *
 * @example
 *   formatPercent(12.345)  // "+12.35%"
 *   formatPercent(-3.1)    // "-3.10%"
 */
export function formatPercent(
  value: number | null | undefined,
  decimals: number = 2
): string {
  if (value == null) return "—";
  const prefix = value >= 0 ? "+" : "";
  return `${prefix}${value.toFixed(decimals)}%`;
}
