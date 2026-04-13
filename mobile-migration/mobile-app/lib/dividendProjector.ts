/**
 * Dividend Income Projector — CFA-level forward dividend estimation.
 *
 * Methodology:
 *   1. Annual dividend income per stock from transaction history (grouped by calendar year)
 *   2. Base year (D₀): most recent complete calendar year's dividend income
 *   3. Growth rate (g):
 *      - ≥3 years: CAGR = (D_latest / D_earliest)^(1/(n-1)) - 1
 *      - 2 years: simple YoY growth
 *      - 1 year: 0% (flat — insufficient growth data)
 *      - Capped at [-20%, +20%] to prevent extreme outliers
 *   4. Projected income: D₁ = D₀ × (1 + g)
 *   5. Confidence assessment based on:
 *      - Years of data (more → higher confidence)
 *      - Payout consistency (coefficient of variation)
 *      - Growth trend stability
 *
 * GCC-specific: payment window Mar–Jun based on regional AGM conventions.
 */

import type { DividendByStock, DividendRecord, Holding } from "@/services/api/types";

// ── Types ───────────────────────────────────────────────────────────

export type ProjectionConfidence = "high" | "medium" | "low";

export interface DividendProjection {
  /** Stock symbol */
  symbol: string;
  /** Company name */
  company: string;
  /** Current shares held */
  shares: number;
  /** Most recent base-year DPS (KWD) */
  lastDividendPerShare: number;
  /** Projected next-year DPS after growth (KWD) */
  projectedDPS: number;
  /** Projected total income = projectedDPS × shares (KWD) */
  projectedAmount: number;
  /** Estimated dividend growth rate (decimal, e.g. 0.05 = 5%) */
  growthRate: number;
  /** Estimated payment window */
  paymentDateRange: string;
  /** Confidence level based on data quality & consistency */
  confidence: ProjectionConfidence;
  /** Historical yield on cost % */
  yieldOnCost: number;
  /** Whether the stock has bonus share history */
  hasBonus: boolean;
  /** Number of distinct years with dividend payments */
  yearsOfData: number;
  /** Projection method used */
  method: "cagr" | "yoy" | "flat" | "insufficient";
}

export interface PortfolioProjectionSummary {
  /** Total projected dividend income across portfolio (KWD) */
  totalProjected: number;
  /** Average confidence across projections */
  avgConfidence: ProjectionConfidence;
  /** Individual stock projections */
  projections: DividendProjection[];
  /** Disclaimer text key for i18n */
  disclaimerKey: string;
  /** Which calendar year this projection targets */
  projectionYear: number;
}

// ── Constants ───────────────────────────────────────────────────────

/** Maximum allowed growth rate for projection (cap extreme outliers) */
const MAX_GROWTH_RATE = 0.20; // +20%
/** Minimum allowed growth rate (floor for declining dividends) */
const MIN_GROWTH_RATE = -0.20; // -20%
/** CV threshold for high consistency */
const CV_HIGH = 0.25;
/** CV threshold for medium consistency */
const CV_MEDIUM = 0.40;

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Group dividend records by stock and year → annual KWD totals.
 * Returns Map<stock_symbol, Map<year, total_kwd>>
 */
function buildAnnualDividendMap(
  records: DividendRecord[],
): Map<string, Map<string, number>> {
  const result = new Map<string, Map<string, number>>();
  for (const rec of records) {
    const sym = rec.stock_symbol?.trim();
    const year = rec.txn_date?.slice(0, 4);
    if (!sym || !year) continue;
    const kwd = rec.cash_dividend_kwd ?? 0;
    if (kwd <= 0) continue;
    if (!result.has(sym)) result.set(sym, new Map());
    const yearMap = result.get(sym)!;
    yearMap.set(year, (yearMap.get(year) ?? 0) + kwd);
  }
  return result;
}

/** Compound Annual Growth Rate: (end/start)^(1/periods) - 1 */
function calcCAGR(earliest: number, latest: number, periods: number): number {
  if (earliest <= 0 || latest <= 0 || periods <= 0) return 0;
  return Math.pow(latest / earliest, 1 / periods) - 1;
}

/** Coefficient of Variation = σ / μ  (lower = more consistent payouts) */
function calcCV(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  if (mean <= 0) return Infinity;
  const variance =
    values.reduce((s, v) => s + Math.pow(v - mean, 2), 0) / values.length;
  return Math.sqrt(variance) / mean;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Assess projection confidence based on data quality.
 *
 *   - High:   3+ years, CV < 0.25, not steeply declining
 *   - Medium: 2+ years AND CV < 0.40
 *   - Low:    everything else
 */
function assessConfidence(
  yearsOfData: number,
  cv: number,
  growthRate: number,
): ProjectionConfidence {
  if (yearsOfData < 2) return "low";
  if (yearsOfData >= 3 && cv < CV_HIGH && growthRate > -0.10) return "high";
  if (yearsOfData >= 2 && cv < CV_MEDIUM) return "medium";
  return "low";
}

/** GCC stocks typically pay dividends in Q1-Q2 after the annual AGM. */
function estimatePaymentWindow(): string {
  return "Mar – Jun";
}

// ── Core Projection Logic ───────────────────────────────────────────

/**
 * Project dividend income for a single holding.
 *
 * Steps:
 *   1. Build annual time-series of cash dividends received for this stock
 *   2. Select D₀ = most recent complete calendar year's total
 *   3. Derive growth rate (CAGR / YoY / flat) from the series
 *   4. D₁ = D₀ × (1 + g), then DPS₁ = D₁ / current shares
 */
export function projectSingleHolding(
  holding: Holding,
  annualDividends: Map<string, number> | undefined,
  dividendData?: DividendByStock,
  currentYear?: number,
): DividendProjection | null {
  if (!holding.shares_qty || holding.shares_qty <= 0) return null;

  const year = currentYear ?? new Date().getFullYear();
  const hasBonus = (holding.bonus_dividend_shares ?? 0) > 0;
  const yieldOnCost =
    dividendData?.yield_on_cost_pct ?? holding.dividend_yield_on_cost_pct ?? 0;

  // ── No per-year data: fallback to "insufficient" projection ──
  if (!annualDividends || annualDividends.size === 0) {
    const totalCashDiv =
      dividendData?.total_cash_dividend_kwd ?? holding.cash_dividends ?? 0;
    if (totalCashDiv <= 0) return null;

    // We have some lifetime total but no temporal breakdown — rough estimate only
    const dividendCount = dividendData?.dividend_count ?? 1;
    const estimatedAnnual = totalCashDiv / Math.max(dividendCount, 1) * Math.min(dividendCount, 1);
    const dps = estimatedAnnual / holding.shares_qty;
    return {
      symbol: holding.symbol,
      company: holding.company,
      shares: holding.shares_qty,
      lastDividendPerShare: dps,
      projectedDPS: dps,
      projectedAmount: estimatedAnnual,
      growthRate: 0,
      paymentDateRange: estimatePaymentWindow(),
      confidence: "low",
      yieldOnCost,
      hasBonus,
      yearsOfData: 0,
      method: "insufficient",
    };
  }

  // ── Build sorted annual time-series ──
  const years = Array.from(annualDividends.keys()).sort();
  const annualAmounts = years.map((y) => annualDividends.get(y)!);
  const yearsOfData = years.length;

  // ── Select base year D₀ ──
  // Prefer last complete calendar year; fall back to current year if it has
  // data, then to the most recent year available.
  const lastCompleteYear = String(year - 1);
  let d0: number;
  if (annualDividends.has(lastCompleteYear)) {
    d0 = annualDividends.get(lastCompleteYear)!;
  } else if (annualDividends.has(String(year))) {
    d0 = annualDividends.get(String(year))!;
  } else {
    d0 = annualAmounts[annualAmounts.length - 1];
  }

  if (d0 <= 0) return null;

  // ── Growth rate ──
  let growthRate = 0;
  let method: DividendProjection["method"] = "flat";

  if (yearsOfData >= 3) {
    // CAGR across entire series
    growthRate = calcCAGR(annualAmounts[0], annualAmounts[annualAmounts.length - 1], yearsOfData - 1);
    growthRate = clamp(growthRate, MIN_GROWTH_RATE, MAX_GROWTH_RATE);
    method = "cagr";
  } else if (yearsOfData === 2) {
    const prev = annualAmounts[0];
    const curr = annualAmounts[1];
    if (prev > 0) {
      growthRate = (curr - prev) / prev;
      growthRate = clamp(growthRate, MIN_GROWTH_RATE, MAX_GROWTH_RATE);
    }
    method = "yoy";
  }
  // yearsOfData === 1  →  growthRate stays 0, method stays "flat"

  // ── Projected total income ──
  const projectedTotal = Math.max(0, d0 * (1 + growthRate));
  const lastDPS = d0 / holding.shares_qty;
  const projectedDPS = projectedTotal / holding.shares_qty;

  // ── Confidence ──
  const cv = calcCV(annualAmounts);
  const confidence = assessConfidence(yearsOfData, cv, growthRate);

  return {
    symbol: holding.symbol,
    company: holding.company,
    shares: holding.shares_qty,
    lastDividendPerShare: lastDPS,
    projectedDPS,
    projectedAmount: projectedTotal,
    growthRate,
    paymentDateRange: estimatePaymentWindow(),
    confidence,
    yieldOnCost,
    hasBonus,
    yearsOfData,
    method,
  };
}

/**
 * Generate portfolio-wide dividend projection.
 *
 * @param holdings          Current portfolio holdings
 * @param allDividendRecords Individual dividend transaction records (with dates)
 * @param dividendsByStock  Aggregated dividend data by stock (for yield-on-cost)
 */
export function projectPortfolioDividends(
  holdings: Holding[],
  allDividendRecords?: DividendRecord[],
  dividendsByStock?: DividendByStock[],
): PortfolioProjectionSummary {
  const currentYear = new Date().getFullYear();

  // Build per-stock annual dividend map from individual records
  const annualMap = buildAnnualDividendMap(allDividendRecords ?? []);

  // Build dividend-by-stock lookup for yield data
  const divByStockMap = new Map<string, DividendByStock>();
  if (dividendsByStock) {
    for (const d of dividendsByStock) {
      divByStockMap.set(d.stock_symbol, d);
    }
  }

  const projections: DividendProjection[] = [];
  for (const h of holdings) {
    const stockAnnual = annualMap.get(h.symbol);
    const divData = divByStockMap.get(h.symbol);
    const projection = projectSingleHolding(h, stockAnnual, divData, currentYear);
    if (projection) projections.push(projection);
  }

  // Sort by projected amount descending
  projections.sort((a, b) => b.projectedAmount - a.projectedAmount);

  const totalProjected = projections.reduce((sum, p) => sum + p.projectedAmount, 0);

  // Weighted-average confidence (by projected amount — larger positions matter more)
  const confMap: Record<ProjectionConfidence, number> = { high: 3, medium: 2, low: 1 };
  const weightedSum = projections.reduce(
    (s, p) => s + confMap[p.confidence] * p.projectedAmount,
    0,
  );
  const avgConfVal = totalProjected > 0 ? weightedSum / totalProjected : 1;
  const avgConfidence: ProjectionConfidence =
    avgConfVal >= 2.5 ? "high" : avgConfVal >= 1.5 ? "medium" : "low";

  return {
    totalProjected,
    avgConfidence,
    projections,
    disclaimerKey: "dividends.projectionDisclaimer",
    projectionYear: currentYear + 1,
  };
}
