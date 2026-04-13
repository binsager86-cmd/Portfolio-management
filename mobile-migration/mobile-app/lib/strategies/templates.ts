/**
 * Strategy Templates — pre-built portfolio rules for GCC investors.
 *
 * Three strategies:
 *  1. Dividend Income — maximize yield, prefer large-cap payers
 *  2. Growth — capital appreciation, reinvest dividends
 *  3. Islamic — Sharia-compliant stocks only, avoid interest-based
 *
 * Each strategy provides:
 *  - Description & rationale
 *  - Target allocation rules
 *  - Stock filtering criteria
 *  - Suggested rebalance guidance
 */

import { getMusaffaStatus } from "@/lib/shariaCompliance";
import type { Holding } from "@/services/api/types";

// ── Types ───────────────────────────────────────────────────────────

export type StrategyId = "dividend" | "growth" | "islamic";

export interface AllocationTarget {
  /** Category label (e.g., "High-yield stocks") */
  label: string;
  /** i18n key for the label */
  labelKey: string;
  /** Target percentage of portfolio */
  targetPct: number;
  /** Emoji icon */
  emoji: string;
}

export interface StrategyTemplate {
  id: StrategyId;
  /** i18n key for strategy name */
  nameKey: string;
  /** i18n key for description */
  descriptionKey: string;
  /** Emoji icon */
  emoji: string;
  /** Target allocation buckets */
  allocations: AllocationTarget[];
  /** Criteria for filtering/scoring stocks */
  criteria: StrategyCriteria;
}

export interface StrategyCriteria {
  /** Minimum dividend yield to qualify (%) */
  minYield?: number;
  /** Maximum P/E ratio */
  maxPE?: number;
  /** Require Sharia compliance */
  shariaOnly?: boolean;
  /** Prefer stocks with positive PnL */
  preferProfitable?: boolean;
  /** Minimum allocation per stock (%) */
  minAllocationPct?: number;
  /** Maximum allocation per stock (%) */
  maxAllocationPct?: number;
}

export interface ScoreFeedback {
  /** i18n key for the feedback message */
  key: string;
  /** Interpolation params for the i18n key */
  params?: Record<string, string | number>;
}

export interface StrategyScore {
  /** 0–100 alignment score */
  score: number;
  /** What's aligned */
  strengths: ScoreFeedback[];
  /** What needs attention */
  improvements: ScoreFeedback[];
}

// ── Strategy Definitions ────────────────────────────────────────────

export const STRATEGIES: Record<StrategyId, StrategyTemplate> = {
  dividend: {
    id: "dividend",
    nameKey: "strategies.dividend.name",
    descriptionKey: "strategies.dividend.description",
    emoji: "💰",
    allocations: [
      { label: "High-yield stocks", labelKey: "strategies.dividend.highYield", targetPct: 60, emoji: "📈" },
      { label: "Stable payers", labelKey: "strategies.dividend.stablePayers", targetPct: 25, emoji: "🏦" },
      { label: "Cash reserve", labelKey: "strategies.dividend.cashReserve", targetPct: 15, emoji: "💵" },
    ],
    criteria: {
      minYield: 3,
      preferProfitable: true,
      maxAllocationPct: 25,
    },
  },
  growth: {
    id: "growth",
    nameKey: "strategies.growth.name",
    descriptionKey: "strategies.growth.description",
    emoji: "🚀",
    allocations: [
      { label: "Growth stocks", labelKey: "strategies.growth.growthStocks", targetPct: 70, emoji: "📊" },
      { label: "Value opportunities", labelKey: "strategies.growth.valueOpp", targetPct: 20, emoji: "🔍" },
      { label: "Cash reserve", labelKey: "strategies.growth.cashReserve", targetPct: 10, emoji: "💵" },
    ],
    criteria: {
      maxPE: 25,
      preferProfitable: true,
      maxAllocationPct: 20,
    },
  },
  islamic: {
    id: "islamic",
    nameKey: "strategies.islamic.name",
    descriptionKey: "strategies.islamic.description",
    emoji: "☪️",
    allocations: [
      { label: "Sharia-compliant equities", labelKey: "strategies.islamic.compliantEquities", targetPct: 75, emoji: "✅" },
      { label: "Islamic income", labelKey: "strategies.islamic.islamicIncome", targetPct: 15, emoji: "💰" },
      { label: "Cash reserve", labelKey: "strategies.islamic.cashReserve", targetPct: 10, emoji: "💵" },
    ],
    criteria: {
      shariaOnly: true,
      minYield: 2,
      maxAllocationPct: 20,
    },
  },
};

// ── Strategy Analysis ───────────────────────────────────────────────

/**
 * Score how well current holdings align with a given strategy.
 */
export function scoreAlignment(
  strategy: StrategyTemplate,
  holdings: Holding[],
  cashPct: number,
): StrategyScore {
  const strengths: ScoreFeedback[] = [];
  const improvements: ScoreFeedback[] = [];
  let score = 50; // Start neutral

  const { criteria } = strategy;

  if (holdings.length === 0) {
    return { score: 0, strengths: [], improvements: [{ key: "strategies.score.addHoldings" }] };
  }

  // 1. Yield check
  if (criteria.minYield != null) {
    const avgYield = holdings.reduce((s, h) => s + (h.dividend_yield_on_cost_pct || 0), 0) / holdings.length;
    if (avgYield >= criteria.minYield) {
      strengths.push({ key: "strategies.score.yieldMeetsTarget", params: { yield: avgYield.toFixed(1) } });
      score += 15;
    } else {
      improvements.push({ key: "strategies.score.yieldBelowTarget", params: { yield: avgYield.toFixed(1), target: criteria.minYield } });
      score -= 10;
    }
  }

  // 2. P/E check
  if (criteria.maxPE != null) {
    const withPE = holdings.filter((h) => h.pe_ratio != null && h.pe_ratio > 0);
    if (withPE.length > 0) {
      const avgPE = withPE.reduce((s, h) => s + (h.pe_ratio || 0), 0) / withPE.length;
      if (avgPE <= criteria.maxPE) {
        strengths.push({ key: "strategies.score.peWithinTarget", params: { pe: avgPE.toFixed(1) } });
        score += 10;
      } else {
        improvements.push({ key: "strategies.score.peExceedsTarget", params: { pe: avgPE.toFixed(1), target: criteria.maxPE } });
        score -= 10;
      }
    }
  }

  // 3. Sharia compliance check
  if (criteria.shariaOnly) {
    const compliant = holdings.filter((h) => (getMusaffaStatus(h.symbol) ?? h.sharia_status) === "compliant");
    const nonCompliant = holdings.filter((h) => (getMusaffaStatus(h.symbol) ?? h.sharia_status) === "non-compliant");
    if (nonCompliant.length === 0 && compliant.length > 0) {
      strengths.push({ key: "strategies.score.allCompliant" });
      score += 20;
    } else if (nonCompliant.length > 0) {
      improvements.push({ key: "strategies.score.nonCompliant", params: { count: nonCompliant.length } });
      score -= 15;
    }
  }

  // 4. Concentration check
  if (criteria.maxAllocationPct != null) {
    const overconcentrated = holdings.filter(
      (h) => (h.allocation_pct || 0) > criteria.maxAllocationPct!
    );
    if (overconcentrated.length === 0) {
      strengths.push({ key: "strategies.score.goodDiversification" });
      score += 10;
    } else {
      improvements.push({ key: "strategies.score.overconcentrated", params: { count: overconcentrated.length, maxPct: criteria.maxAllocationPct } });
      score -= 10;
    }
  }

  // 5. Cash allocation vs strategy target
  const targetCash = strategy.allocations.find((a) => a.labelKey.includes("cashReserve"))?.targetPct ?? 10;
  const cashDiff = Math.abs(cashPct - targetCash);
  if (cashDiff <= 5) {
    strengths.push({ key: "strategies.score.cashNearTarget", params: { pct: cashPct.toFixed(0) } });
    score += 5;
  } else if (cashPct > targetCash + 10) {
    improvements.push({ key: "strategies.score.cashTooHigh", params: { pct: cashPct.toFixed(0) } });
    score -= 5;
  }

  // 6. Profitability preference
  if (criteria.preferProfitable) {
    const profitable = holdings.filter((h) => (h.pnl_pct || 0) > 0);
    const ratio = profitable.length / holdings.length;
    if (ratio >= 0.6) {
      strengths.push({ key: "strategies.score.profitableHoldings", params: { pct: Math.round(ratio * 100) } });
      score += 10;
    }
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    strengths,
    improvements,
  };
}

/**
 * Filter holdings based on strategy criteria.
 * Returns holdings that match the strategy's rules.
 */
export function filterByStrategy(
  strategy: StrategyTemplate,
  holdings: Holding[],
): Holding[] {
  const { criteria } = strategy;
  return holdings.filter((h) => {
    if (criteria.shariaOnly && (getMusaffaStatus(h.symbol) ?? h.sharia_status) === "non-compliant") return false;
    if (criteria.minYield != null && (h.dividend_yield_on_cost_pct || 0) < criteria.minYield) return false;
    if (criteria.maxPE != null && h.pe_ratio != null && h.pe_ratio > criteria.maxPE) return false;
    return true;
  });
}

/**
 * Get all strategy templates as an array for UI display.
 */
export function getStrategies(): StrategyTemplate[] {
  return Object.values(STRATEGIES);
}
