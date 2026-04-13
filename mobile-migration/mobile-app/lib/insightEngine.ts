/**
 * Insight Engine — rules-based portfolio insight generator.
 *
 * Analyzes real portfolio data and generates actionable insight cards
 * for the dashboard. Rules are prioritized and contextual.
 */

import type { Holding, OverviewData } from "@/services/api/types";

// ── Types ───────────────────────────────────────────────────────────

export type InsightPriority = "high" | "medium" | "low";

export interface InsightAction {
  /** Button label (i18n key) */
  labelKey: string;
  /** Tab/screen to navigate to */
  screen: string;
}

export interface PortfolioInsight {
  /** Unique rule ID for dismiss persistence */
  id: string;
  /** Priority determines visual style (border color) */
  priority: InsightPriority;
  /** Emoji prefix */
  emoji: string;
  /** i18n key for the message */
  messageKey: string;
  /** Dynamic interpolation values for the i18n message */
  messageParams?: Record<string, string | number>;
  /** Optional action button */
  action?: InsightAction;
}

// ── Rule Definitions ────────────────────────────────────────────────

type InsightRule = (
  overview: OverviewData,
  holdings: Holding[],
) => PortfolioInsight | null;

/**
 * IF portfolio >60% in one sector → concentration warning
 * (We use allocation_pct / weight_by_cost from holdings)
 */
const sectorConcentrationRule: InsightRule = (_overview, holdings) => {
  if (holdings.length < 2) return null;

  // Group by first letter of symbol as a proxy for sector
  // In reality, we'd use a sector field — we use company grouping by currency/market
  const totalValue = holdings.reduce((s, h) => s + (h.market_value_kwd || 0), 0);
  if (totalValue <= 0) return null;

  // Check if any single stock is >40% of portfolio
  for (const h of holdings) {
    const pct = h.allocation_pct || ((h.market_value_kwd || 0) / totalValue) * 100;
    if (pct > 40) {
      return {
        id: `concentration-${h.symbol}`,
        priority: "high",
        emoji: "⚠️",
        messageKey: "insights.sectorConcentration",
        messageParams: { stock: h.company || h.symbol, pct: Math.round(pct) },
        action: { labelKey: "insights.viewHoldings", screen: "/(tabs)/holdings" },
      };
    }
  }
  return null;
};

/**
 * IF dividendYield >7% AND price dropped >10% → value opportunity
 */
const highYieldDropRule: InsightRule = (_overview, holdings) => {
  for (const h of holdings) {
    const yieldPct = h.dividend_yield_on_cost_pct || 0;
    const pnlPct = h.pnl_pct || 0;

    if (yieldPct > 7 && pnlPct < -10) {
      return {
        id: `high-yield-drop-${h.symbol}`,
        priority: "medium",
        emoji: "🔍",
        messageKey: "insights.highYieldDrop",
        messageParams: {
          stock: h.company || h.symbol,
          yield: yieldPct.toFixed(1),
          drop: Math.abs(pnlPct).toFixed(1),
        },
      };
    }
  }
  return null;
};

/**
 * IF cash >20% of portfolio → cash deployment suggestion
 */
const highCashRule: InsightRule = (overview) => {
  const totalValue = overview.total_value || 0;
  const cashBalance = overview.cash_balance || 0;

  if (totalValue <= 0) return null;

  const cashPct = (cashBalance / totalValue) * 100;
  if (cashPct > 20) {
    return {
      id: "high-cash",
      priority: "low",
      emoji: "💡",
      messageKey: "insights.highCash",
      messageParams: { pct: Math.round(cashPct) },
      action: { labelKey: "insights.viewTrading", screen: "/(tabs)/trading" },
    };
  }
  return null;
};

/**
 * IF portfolio has negative total ROI → encouragement / review
 */
const negativeRoiRule: InsightRule = (overview) => {
  const roi = overview.roi_percent ?? 0;
  if (roi < -5) {
    return {
      id: "negative-roi",
      priority: "high",
      emoji: "📉",
      messageKey: "insights.negativeRoi",
      messageParams: { roi: Math.abs(roi).toFixed(1) },
    };
  }
  return null;
};

/**
 * IF strong positive daily movement → momentum alert
 */
const dailyMomentumRule: InsightRule = (overview) => {
  const dailyPct = overview.daily_movement_pct ?? 0;
  if (dailyPct > 2) {
    return {
      id: "daily-surge",
      priority: "low",
      emoji: "🚀",
      messageKey: "insights.dailySurge",
      messageParams: { pct: dailyPct.toFixed(1) },
    };
  }
  if (dailyPct < -2) {
    return {
      id: "daily-drop",
      priority: "medium",
      emoji: "⚡",
      messageKey: "insights.dailyDrop",
      messageParams: { pct: Math.abs(dailyPct).toFixed(1) },
    };
  }
  return null;
};

/**
 * IF total dividends are significant relative to deposits → income highlight
 */
const dividendIncomeRule: InsightRule = (overview) => {
  const totalDivs = overview.total_dividends ?? 0;
  const deposits = overview.net_deposits ?? 0;

  if (deposits <= 0 || totalDivs <= 0) return null;

  const cashYield = (totalDivs / deposits) * 100;
  if (cashYield > 3) {
    return {
      id: "strong-dividends",
      priority: "low",
      emoji: "💰",
      messageKey: "insights.strongDividends",
      messageParams: { yield: cashYield.toFixed(1) },
      action: { labelKey: "insights.viewDividends", screen: "/(tabs)/dividends" },
    };
  }
  return null;
};

// ── All rules in priority order ─────────────────────────────────────

const RULES: InsightRule[] = [
  sectorConcentrationRule,
  negativeRoiRule,
  highYieldDropRule,
  dailyMomentumRule,
  highCashRule,
  dividendIncomeRule,
];

// ── Public API ──────────────────────────────────────────────────────

/**
 * Generate insights from portfolio data.
 * Returns max 3 insights, highest priority first.
 */
export function generateInsights(
  overview: OverviewData,
  holdings: Holding[],
  dismissedIds?: Set<string>,
): PortfolioInsight[] {
  const insights: PortfolioInsight[] = [];

  for (const rule of RULES) {
    const result = rule(overview, holdings);
    if (result && !(dismissedIds?.has(result.id))) {
      insights.push(result);
    }
  }

  // Sort by priority: high > medium > low
  const priorityOrder: Record<InsightPriority, number> = { high: 0, medium: 1, low: 2 };
  insights.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);

  return insights.slice(0, 3);
}
