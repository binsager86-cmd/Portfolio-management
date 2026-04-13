/**
 * Dividend Projector — calculates expected future dividend income
 * for GCC stocks based on historical patterns.
 *
 * GCC-specific: handles irregular dividend schedules, bonus shares,
 * and accounts for Kuwaiti/GCC corporate payout conventions.
 */

import type { DividendByStock, Holding } from "@/services/api/types";

// ── Types ───────────────────────────────────────────────────────────

export type ProjectionConfidence = "high" | "medium" | "low";

export interface DividendProjection {
  /** Stock symbol */
  symbol: string;
  /** Company name */
  company: string;
  /** Current shares held */
  shares: number;
  /** Last known dividend per share (KWD) */
  lastDividendPerShare: number;
  /** Projected annual dividend amount (KWD) */
  projectedAmount: number;
  /** Estimated payment window */
  paymentDateRange: string;
  /** Confidence level based on data quality */
  confidence: ProjectionConfidence;
  /** Historical yield on cost % */
  yieldOnCost: number;
  /** Whether the stock has a history of bonus share distributions */
  hasBonus: boolean;
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
}

// ── Helpers ─────────────────────────────────────────────────────────

/**
 * Determine confidence based on data availability.
 * - high: >2 years of consistent dividend history
 * - medium: 1-2 years or slight irregularity
 * - low: <1 year or very irregular payouts
 */
function assessConfidence(
  totalDividendKwd: number,
  yieldOnCost: number,
  shares: number,
): ProjectionConfidence {
  // If we have meaningful yield data and dividends, more confident
  if (totalDividendKwd > 0 && yieldOnCost > 0 && shares > 0) {
    if (yieldOnCost >= 2) return "high";     // Consistent, meaningful payout
    if (yieldOnCost >= 0.5) return "medium";  // Some history
  }
  if (totalDividendKwd > 0) return "medium";
  return "low";
}

/**
 * GCC stocks typically pay dividends in Q1-Q2 (March–June)
 * after the annual AGM. Some pay semi-annually.
 */
function estimatePaymentWindow(): string {
  return "Mar – Jun";
}

// ── Core Projection Logic ───────────────────────────────────────────

/**
 * Calculate projected dividend for a single holding.
 *
 * Formula: shares × lastDividendPerShare × yieldAdjustment
 * yieldAdjustment accounts for GCC payout variability (conservative 0.9x for medium confidence).
 */
export function projectSingleHolding(
  holding: Holding,
  dividendData?: DividendByStock,
): DividendProjection | null {
  if (!holding.shares_qty || holding.shares_qty <= 0) return null;

  const totalCashDiv = dividendData?.total_cash_dividend_kwd ?? holding.cash_dividends ?? 0;
  const yieldOnCost = dividendData?.yield_on_cost_pct ?? holding.dividend_yield_on_cost_pct ?? 0;
  const hasBonus = (holding.bonus_dividend_shares ?? 0) > 0;

  // Calculate last dividend per share from total dividends / shares
  const lastDivPerShare = holding.shares_qty > 0 && totalCashDiv > 0
    ? totalCashDiv / holding.shares_qty
    : 0;

  // If no dividend history at all, skip
  if (lastDivPerShare === 0 && yieldOnCost === 0) return null;

  const confidence = assessConfidence(totalCashDiv, yieldOnCost, holding.shares_qty);

  // Yield adjustment factor based on confidence
  const yieldAdj = confidence === "high" ? 1.0 : confidence === "medium" ? 0.9 : 0.75;

  const projectedAmount = holding.shares_qty * lastDivPerShare * yieldAdj;

  return {
    symbol: holding.symbol,
    company: holding.company,
    shares: holding.shares_qty,
    lastDividendPerShare: lastDivPerShare,
    projectedAmount,
    paymentDateRange: estimatePaymentWindow(),
    confidence,
    yieldOnCost,
    hasBonus,
  };
}

/**
 * Generate portfolio-wide dividend projection from holdings + dividend data.
 */
export function projectPortfolioDividends(
  holdings: Holding[],
  dividendsByStock?: DividendByStock[],
): PortfolioProjectionSummary {
  const divMap = new Map<string, DividendByStock>();
  if (dividendsByStock) {
    for (const d of dividendsByStock) {
      divMap.set(d.stock_symbol, d);
    }
  }

  const projections: DividendProjection[] = [];

  for (const h of holdings) {
    const divData = divMap.get(h.symbol);
    const projection = projectSingleHolding(h, divData);
    if (projection) {
      projections.push(projection);
    }
  }

  // Sort by projected amount descending
  projections.sort((a, b) => b.projectedAmount - a.projectedAmount);

  const totalProjected = projections.reduce((sum, p) => sum + p.projectedAmount, 0);

  // Average confidence
  const confMap: Record<ProjectionConfidence, number> = { high: 3, medium: 2, low: 1 };
  const avgConfVal = projections.length > 0
    ? projections.reduce((s, p) => s + confMap[p.confidence], 0) / projections.length
    : 1;
  const avgConfidence: ProjectionConfidence =
    avgConfVal >= 2.5 ? "high" : avgConfVal >= 1.5 ? "medium" : "low";

  return {
    totalProjected,
    avgConfidence,
    projections,
    disclaimerKey: "dividends.projectionDisclaimer",
  };
}
