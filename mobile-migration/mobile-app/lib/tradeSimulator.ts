/**
 * Trade Simulator Engine — "What If" scenario calculator.
 *
 * Given current portfolio state and a proposed trade,
 * computes the projected impact:
 *  - Total portfolio value change
 *  - Allocation shift (before/after)
 *  - Dividend yield impact
 *  - Concentration risk change
 */

import type { Holding } from "@/services/api/types";

// ── Types ───────────────────────────────────────────────────────────

export type TradeDirection = "buy" | "sell";

export interface TradeInput {
  /** Stock symbol */
  symbol: string;
  /** Company name (for display) */
  company: string;
  /** Buy or sell */
  direction: TradeDirection;
  /** Number of shares */
  shares: number;
  /** Price per share */
  pricePerShare: number;
  /** Currency of the stock */
  currency: string;
  /** Known dividend yield % (from existing holdings or external source) */
  dividendYieldPct?: number;
}

export interface AllocationChange {
  symbol: string;
  company: string;
  beforePct: number;
  afterPct: number;
  delta: number;
}

export interface SimulationResult {
  /** Is the trade valid */
  valid: boolean;
  /** i18n key for error message if invalid */
  error?: string;

  /** Trade total cost/proceeds */
  tradeValue: number;

  /** Portfolio value before trade */
  portfolioValueBefore: number;
  /** Portfolio value after trade */
  portfolioValueAfter: number;
  /** Change in portfolio value */
  portfolioValueDelta: number;

  /** Cash balance before */
  cashBefore: number;
  /** Cash balance after */
  cashAfter: number;

  /** Number of holdings before */
  holdingsCountBefore: number;
  /** Number of holdings after */
  holdingsCountAfter: number;

  /** Whether this is a new position */
  isNewPosition: boolean;

  /** Top allocation changes */
  allocationChanges: AllocationChange[];

  /** Dividend yield before/after (weighted) */
  dividendYieldBefore: number;
  dividendYieldAfter: number;

  /** Max single-stock concentration after */
  maxConcentrationAfter: number;
  /** Symbol of most concentrated stock */
  maxConcentrationSymbol: string;
}

// ── Engine ──────────────────────────────────────────────────────────

/**
 * Simulate a trade and compute projected impact on the portfolio.
 */
export function simulateTrade(
  trade: TradeInput,
  holdings: Holding[],
  cashBalance: number,
  totalPortfolioValue: number,
): SimulationResult {
  const tradeValue = trade.shares * trade.pricePerShare;

  // Validate
  if (trade.shares <= 0 || trade.pricePerShare <= 0) {
    return invalidResult("simulator.errors.invalidInput", holdings, cashBalance, totalPortfolioValue);
  }

  const existingHolding = holdings.find(
    (h) => h.symbol.toLowerCase() === trade.symbol.toLowerCase(),
  );

  if (trade.direction === "sell") {
    if (!existingHolding) {
      return invalidResult("simulator.errors.noPosition", holdings, cashBalance, totalPortfolioValue);
    }
    if (trade.shares > existingHolding.shares_qty) {
      return invalidResult(
        "simulator.errors.insufficientShares",
        holdings,
        cashBalance,
        totalPortfolioValue,
      );
    }
  }

  if (trade.direction === "buy" && tradeValue > cashBalance) {
    return invalidResult(
      "simulator.errors.insufficientCash",
      holdings,
      cashBalance,
      totalPortfolioValue,
    );
  }

  // Compute new state
  const cashAfter =
    trade.direction === "buy" ? cashBalance - tradeValue : cashBalance + tradeValue;

  const newHoldings = computeNewHoldings(trade, holdings, existingHolding);
  const isNewPosition = trade.direction === "buy" && !existingHolding;

  // New total = stock values + cash
  const newStockValue = newHoldings.reduce((s, h) => s + h.market_value_kwd, 0);
  const portfolioValueAfter = newStockValue + cashAfter;

  // Allocation changes
  const allocationChanges = computeAllocationChanges(
    holdings,
    newHoldings,
    totalPortfolioValue,
    portfolioValueAfter,
  );

  // Dividend yield
  const dividendYieldBefore = computeWeightedYield(holdings);
  const dividendYieldAfter = computeWeightedYield(newHoldings);

  // Max concentration
  const { symbol: maxSymbol, pct: maxPct } = computeMaxConcentration(
    newHoldings,
    portfolioValueAfter,
  );

  return {
    valid: true,
    tradeValue,
    portfolioValueBefore: totalPortfolioValue,
    portfolioValueAfter,
    portfolioValueDelta: portfolioValueAfter - totalPortfolioValue,
    cashBefore: cashBalance,
    cashAfter,
    holdingsCountBefore: holdings.length,
    holdingsCountAfter: newHoldings.length,
    isNewPosition,
    allocationChanges,
    dividendYieldBefore,
    dividendYieldAfter,
    maxConcentrationAfter: maxPct,
    maxConcentrationSymbol: maxSymbol,
  };
}

// ── Internal helpers ────────────────────────────────────────────────

function invalidResult(
  error: string,
  holdings: Holding[],
  cashBalance: number,
  totalPortfolioValue: number,
): SimulationResult {
  return {
    valid: false,
    error,
    tradeValue: 0,
    portfolioValueBefore: totalPortfolioValue,
    portfolioValueAfter: totalPortfolioValue,
    portfolioValueDelta: 0,
    cashBefore: cashBalance,
    cashAfter: cashBalance,
    holdingsCountBefore: holdings.length,
    holdingsCountAfter: holdings.length,
    isNewPosition: false,
    allocationChanges: [],
    dividendYieldBefore: computeWeightedYield(holdings),
    dividendYieldAfter: computeWeightedYield(holdings),
    maxConcentrationAfter: 0,
    maxConcentrationSymbol: "",
  };
}

function computeNewHoldings(
  trade: TradeInput,
  holdings: Holding[],
  existing: Holding | undefined,
): Holding[] {
  if (trade.direction === "buy") {
    if (existing) {
      return holdings.map((h) => {
        if (h.symbol.toLowerCase() !== trade.symbol.toLowerCase()) return h;
        const newShares = h.shares_qty + trade.shares;
        const newCost = h.total_cost + trade.shares * trade.pricePerShare;
        const newAvgCost = newCost / newShares;
        const newMV = newShares * trade.pricePerShare;
        return {
          ...h,
          shares_qty: newShares,
          avg_cost: newAvgCost,
          total_cost: newCost,
          market_price: trade.pricePerShare,
          market_value: newMV,
          market_value_kwd: newMV, // simplified — assume KWD
          unrealized_pnl: newMV - newCost,
        };
      });
    }
    // New position
    const mv = trade.shares * trade.pricePerShare;
    const newHolding: Holding = {
      company: trade.company,
      symbol: trade.symbol,
      pe_ratio: null,
      shares_qty: trade.shares,
      avg_cost: trade.pricePerShare,
      total_cost: mv,
      market_price: trade.pricePerShare,
      market_value: mv,
      unrealized_pnl: 0,
      realized_pnl: 0,
      cash_dividends: 0,
      reinvested_dividends: 0,
      bonus_dividend_shares: 0,
      bonus_share_value: 0,
      dividend_yield_on_cost_pct: trade.dividendYieldPct ?? 0,
      total_pnl: 0,
      pnl_pct: 0,
      currency: trade.currency,
      market_value_kwd: mv,
      unrealized_pnl_kwd: 0,
      total_pnl_kwd: 0,
      total_cost_kwd: mv,
      weight_by_cost: 0,
      allocation_pct: 0,
      weighted_dividend_yield_on_cost: trade.dividendYieldPct ?? 0,
    };
    return [...holdings, newHolding];
  }

  // Sell
  if (existing && trade.shares >= existing.shares_qty) {
    // Sell entire position
    return holdings.filter(
      (h) => h.symbol.toLowerCase() !== trade.symbol.toLowerCase(),
    );
  }

  return holdings.map((h) => {
    if (h.symbol.toLowerCase() !== trade.symbol.toLowerCase()) return h;
    const newShares = h.shares_qty - trade.shares;
    const costBasis = h.avg_cost * newShares;
    const newMV = newShares * trade.pricePerShare;
    return {
      ...h,
      shares_qty: newShares,
      total_cost: costBasis,
      market_value: newMV,
      market_value_kwd: newMV,
      unrealized_pnl: newMV - costBasis,
    };
  });
}

function computeAllocationChanges(
  oldHoldings: Holding[],
  newHoldings: Holding[],
  oldTotal: number,
  newTotal: number,
): AllocationChange[] {
  const allSymbols = new Set([
    ...oldHoldings.map((h) => h.symbol),
    ...newHoldings.map((h) => h.symbol),
  ]);

  const changes: AllocationChange[] = [];
  for (const sym of allSymbols) {
    const old = oldHoldings.find((h) => h.symbol === sym);
    const nw = newHoldings.find((h) => h.symbol === sym);
    const beforePct = old ? (old.market_value_kwd / (oldTotal || 1)) * 100 : 0;
    const afterPct = nw ? (nw.market_value_kwd / (newTotal || 1)) * 100 : 0;
    const delta = afterPct - beforePct;
    if (Math.abs(delta) > 0.01) {
      changes.push({
        symbol: sym,
        company: old?.company ?? nw?.company ?? sym,
        beforePct,
        afterPct,
        delta,
      });
    }
  }

  return changes.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta)).slice(0, 5);
}

function computeWeightedYield(holdings: Holding[]): number {
  const totalMV = holdings.reduce((s, h) => s + h.market_value_kwd, 0);
  if (totalMV === 0) return 0;
  return holdings.reduce(
    (s, h) => s + (h.dividend_yield_on_cost_pct || 0) * (h.market_value_kwd / totalMV),
    0,
  );
}

function computeMaxConcentration(
  holdings: Holding[],
  totalValue: number,
): { symbol: string; pct: number } {
  if (holdings.length === 0 || totalValue === 0)
    return { symbol: "", pct: 0 };
  let max = { symbol: "", pct: 0 };
  for (const h of holdings) {
    const pct = (h.market_value_kwd / totalValue) * 100;
    if (pct > max.pct) {
      max = { symbol: h.symbol, pct };
    }
  }
  return max;
}
