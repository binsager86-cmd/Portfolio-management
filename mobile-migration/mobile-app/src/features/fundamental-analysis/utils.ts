/**
 * Fundamental Analysis — Pure helper / utility functions.
 */

import type { ThemePalette } from "@/constants/theme";
import type { FinancialStatement, StockMetric } from "@/services/api";
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
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 3 });
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
  if (lc.includes("eps") || lc.includes("earnings per share") || lc.includes("book value")) return value.toFixed(3);
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

// ── CFA-level fallback calculations for valuation metrics ────────────

/** Extract a numeric line-item from a statement by matching canonical codes. */
function extractLineItem(statement: FinancialStatement, ...codes: string[]): number | null {
  const upperCodes = new Set(codes.map((c) => c.toUpperCase()));
  for (const li of statement.line_items ?? []) {
    if (upperCodes.has(li.line_item_code.toUpperCase()) && li.amount != null) {
      return li.amount;
    }
  }
  return null;
}

/**
 * Compute missing valuation metrics from uploaded financial statements
 * using standard CFA Level 1/2 formulas:
 *
 *   Dividends / Share  = Common Dividends Paid / Shares Outstanding
 *                         (or directly from DIVIDEND_PER_SHARE line item)
 *   Payout Ratio       = Dividends Per Share / EPS
 *                         (fallback: |Common Dividends Paid| / Net Income)
 *   Retention Rate     = 1 − Payout Ratio
 *   Sustainable Growth = ROE × Retention Rate
 *                         where ROE = Net Income / Shareholders' Equity
 *
 * Only fills in metrics that are missing (nil) for a given fiscal year.
 * Returns a new array with the original metrics plus any computed ones.
 */
export function enrichMetricsWithFallbacks(
  allMetrics: StockMetric[],
  statements: FinancialStatement[],
): StockMetric[] {
  // Index existing valuation metrics by fiscal_year → metric_name
  const existing = new Map<string, number>();
  for (const m of allMetrics) {
    if (m.metric_type === "valuation") {
      existing.set(`${m.fiscal_year}::${m.metric_name}`, m.metric_value);
    }
  }

  const VALUATION_TARGETS = ["Dividends / Share", "Payout Ratio", "Retention Rate", "Sustainable Growth Rate"] as const;
  const computed: StockMetric[] = [];
  let syntheticId = -1;

  // Group annual statements by fiscal_year → statement_type
  const stmtByYear = new Map<number, Map<string, FinancialStatement>>();
  for (const s of statements) {
    if (s.fiscal_quarter != null) continue; // annual only
    if (!stmtByYear.has(s.fiscal_year)) stmtByYear.set(s.fiscal_year, new Map());
    stmtByYear.get(s.fiscal_year)!.set(s.statement_type, s);
  }

  for (const [fiscalYear, typeMap] of stmtByYear) {
    // Check which valuation metrics are missing for this year
    const missing = VALUATION_TARGETS.filter(
      (name) => !existing.has(`${fiscalYear}::${name}`),
    );
    if (missing.length === 0) continue;

    const income = typeMap.get("income");
    const balance = typeMap.get("balance");
    const cashflow = typeMap.get("cashflow");

    // Extract required line items
    const netIncome = income ? extractLineItem(income, "NET_INCOME", "NET_INCOME_TO_COMMON") : null;
    const epsDiluted = income
      ? extractLineItem(income, "EPS_DILUTED", "EPS_BASIC", "eps_basic",
          "basic_and_diluted_earnings_per_share_fils",
          "basic_and_diluted_earnings_per_share_attributable_to_owners_of_the_parent_company_fils")
      : null;
    const sharesOutstanding = balance
      ? extractLineItem(balance, "SHARES_OUTSTANDING_DILUTED", "SHARES_OUTSTANDING_BASIC",
          "DILUTED_SHARES_OUTSTANDING", "BASIC_SHARES_OUTSTANDING",
          "TOTAL_COMMON_SHARES_OUTSTANDING", "FILING_DATE_SHARES_OUTSTANDING",
          "SHARES_OUTSTANDING", "SHARES_DILUTED")
      : (income
        ? extractLineItem(income, "SHARES_OUTSTANDING_DILUTED", "SHARES_OUTSTANDING_BASIC",
            "DILUTED_SHARES_OUTSTANDING", "BASIC_SHARES_OUTSTANDING",
            "TOTAL_COMMON_SHARES_OUTSTANDING", "SHARES_OUTSTANDING", "SHARES_DILUTED")
        : null);
    const dividendsPaid = cashflow
      ? extractLineItem(cashflow, "COMMON_DIVIDENDS_PAID", "dividends_paid")
      : null;
    const dpsLineItem = income
      ? extractLineItem(income, "DIVIDEND_PER_SHARE", "DIVIDENDS_PER_SHARE")
        ?? (cashflow ? extractLineItem(cashflow, "DIVIDEND_PER_SHARE", "DIVIDENDS_PER_SHARE") : null)
        ?? (balance ? extractLineItem(balance, "DIVIDEND_PER_SHARE", "DIVIDENDS_PER_SHARE") : null)
      : null;
    const shareholdersEquity = balance
      ? extractLineItem(balance, "SHAREHOLDERS_EQUITY", "TOTAL_EQUITY")
      : null;

    // Find a period_end_date for this fiscal year from any statement
    const periodEndDate = (income ?? balance ?? cashflow)?.period_end_date ?? `${fiscalYear}-12-31`;

    // Helper to check if an EPS code looks like it's in fils/cents (sub-unit)
    const isSubUnit = (code: string) => /fils|cents|halala/i.test(code);
    let eps = existing.get(`${fiscalYear}::EPS`) ?? null;
    if (eps == null && epsDiluted != null) {
      // Check for sub-unit codes in income statement
      const epsLi = income?.line_items?.find((li) =>
        ["EPS_DILUTED", "EPS_BASIC", "eps_basic",
         "basic_and_diluted_earnings_per_share_fils",
         "basic_and_diluted_earnings_per_share_attributable_to_owners_of_the_parent_company_fils"]
          .some((c) => li.line_item_code.toUpperCase() === c.toUpperCase()) && li.amount != null);
      eps = epsLi && isSubUnit(epsLi.line_item_code) ? epsDiluted / 1000 : epsDiluted;
    }

    // ── 1. Dividends / Share ─────────────────────────────────────
    let dps: number | null = null;
    if (missing.includes("Dividends / Share")) {
      if (dpsLineItem != null) {
        dps = dpsLineItem;
      } else if (dividendsPaid != null && sharesOutstanding != null && sharesOutstanding !== 0) {
        // dividends_paid is typically negative in cash flow; use absolute value
        dps = Math.abs(dividendsPaid) / sharesOutstanding;
      }
      if (dps != null) {
        computed.push({
          id: syntheticId--, stock_id: 0, fiscal_year: fiscalYear,
          fiscal_quarter: null, period_end_date: periodEndDate,
          metric_type: "valuation", metric_name: "Dividends / Share",
          metric_value: dps, created_at: 0,
        });
        existing.set(`${fiscalYear}::Dividends / Share`, dps);
      }
    } else {
      dps = existing.get(`${fiscalYear}::Dividends / Share`) ?? null;
    }

    // ── 2. Payout Ratio  = DPS / EPS  (or |Div Paid| / Net Income) ─
    let payoutRatio: number | null = null;
    if (missing.includes("Payout Ratio")) {
      if (dps != null && eps != null && eps !== 0) {
        payoutRatio = dps / eps;
      } else if (dividendsPaid != null && netIncome != null && netIncome !== 0) {
        payoutRatio = Math.abs(dividendsPaid) / netIncome;
      }
      // Clamp to [0,1] – payout > 100% is possible but cap display sanity
      if (payoutRatio != null && payoutRatio < 0) payoutRatio = 0;
      if (payoutRatio != null) {
        computed.push({
          id: syntheticId--, stock_id: 0, fiscal_year: fiscalYear,
          fiscal_quarter: null, period_end_date: periodEndDate,
          metric_type: "valuation", metric_name: "Payout Ratio",
          metric_value: payoutRatio, created_at: 0,
        });
        existing.set(`${fiscalYear}::Payout Ratio`, payoutRatio);
      }
    } else {
      payoutRatio = existing.get(`${fiscalYear}::Payout Ratio`) ?? null;
    }

    // ── 3. Retention Rate = 1 − Payout Ratio ─────────────────────
    let retentionRate: number | null = null;
    if (missing.includes("Retention Rate")) {
      if (payoutRatio != null) {
        retentionRate = 1 - payoutRatio;
        computed.push({
          id: syntheticId--, stock_id: 0, fiscal_year: fiscalYear,
          fiscal_quarter: null, period_end_date: periodEndDate,
          metric_type: "valuation", metric_name: "Retention Rate",
          metric_value: retentionRate, created_at: 0,
        });
        existing.set(`${fiscalYear}::Retention Rate`, retentionRate);
      }
    } else {
      retentionRate = existing.get(`${fiscalYear}::Retention Rate`) ?? null;
    }

    // ── 4. Sustainable Growth Rate = ROE × Retention Rate ────────
    if (missing.includes("Sustainable Growth Rate")) {
      if (retentionRate != null && netIncome != null && shareholdersEquity != null && shareholdersEquity !== 0) {
        const roe = netIncome / shareholdersEquity;
        const sgr = roe * retentionRate;
        computed.push({
          id: syntheticId--, stock_id: 0, fiscal_year: fiscalYear,
          fiscal_quarter: null, period_end_date: periodEndDate,
          metric_type: "valuation", metric_name: "Sustainable Growth Rate",
          metric_value: sgr, created_at: 0,
        });
      }
    }
  }

  if (computed.length === 0) return allMetrics;
  return [...allMetrics, ...computed];
}

export const INTERPRETATION_SCALE = [
  { min: 85, max: 100, label: "Exceptional investment candidate", color: "#16a34a" },
  { min: 70, max: 84, label: "Strong", color: "#22c55e" },
  { min: 55, max: 69, label: "Acceptable / neutral", color: "#f59e0b" },
  { min: 40, max: 54, label: "Weak", color: "#f97316" },
  { min: 0, max: 39, label: "Avoid unless special situation", color: "#ef4444" },
] as const;
