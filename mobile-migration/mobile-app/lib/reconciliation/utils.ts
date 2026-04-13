/**
 * Cash reconciliation detection & opening-balance utilities.
 *
 * Pure functions — no side-effects, no API calls.
 */

import type { CashDepositRecord, Holding, TransactionRecord } from "@/services/api/types";

// ── Types ───────────────────────────────────────────────────────────

export interface IncomeHarvestingResult {
  withdrawal: TransactionRecord;
  isLikelyHarvesting: boolean;
  matchedDepositId: number | null;
  matchedAmount: number | null;
}

export interface OrphanedSellResult {
  transaction: TransactionRecord;
  symbol: string;
  currentShares: number; // always 0
}

export interface OpeningBalanceResult {
  amount: number;
  date: string; // ISO date string
}

export interface ReconciliationSummary {
  manualTotalDeposits: number;
  computedCashFromTxns: number;
  discrepancy: number;
  discrepancyPct: number;
  /** ALL withdrawal deposit records (user selects which to delete) */
  allWithdrawals: CashDepositRecord[];
  /** Withdrawals that matched an income event (legacy, from transaction-level detection) */
  flaggedWithdrawals: IncomeHarvestingResult[];
  orphanedSells: OrphanedSellResult[];
  suggestedOpeningBalance: OpeningBalanceResult;
}

export interface DetectionOptions {
  timeWindowDays: number;
  amountTolerance: number;
}

const DEFAULT_OPTIONS: DetectionOptions = {
  timeWindowDays: 3,
  amountTolerance: 5,
};

// ── Detection: Income Harvesting ────────────────────────────────────

/**
 * Detect withdrawals that likely represent "income harvesting" —
 * withdrawals closely matching a preceding dividend / sell / corporate-action
 * deposit within a configurable time window.
 */
export function detectIncomeHarvesting(
  transactions: TransactionRecord[],
  options: Partial<DetectionOptions> = {},
): IncomeHarvestingResult[] {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  // Cash-dividend txns show up as txn_type "DIVIDEND_ONLY" or with cash_dividend > 0.
  // Sells have sell_value > 0.  Deposits come from the cash_deposits table but
  // also appear in the transaction list as Deposit / Deposit by Corporate Action.
  const withdrawals = transactions.filter(
    (t) => t.txn_type === "Withdraw" || (t.txn_type === "Sell" && false), // only true withdrawals
  );

  const incomeEvents = transactions.filter((t) => {
    if (t.txn_type === "DIVIDEND_ONLY" && (t.cash_dividend ?? 0) > 0) return true;
    if (t.txn_type === "Sell" && (t.sell_value ?? 0) > 0) return true;
    if (
      t.txn_type === "Deposit" ||
      (t.category && t.category.toLowerCase().includes("corporate action"))
    )
      return true;
    return false;
  });

  return withdrawals.map((w) => {
    const wDate = new Date(w.txn_date).getTime();
    const wAmount = Math.abs(costOf(w));

    const match = incomeEvents.find((d) => {
      const dDate = new Date(d.txn_date).getTime();
      const dAmount = amountOf(d);
      const daysDiff = Math.abs(wDate - dDate) / (1000 * 60 * 60 * 24);
      return daysDiff <= opts.timeWindowDays && Math.abs(dAmount - wAmount) <= opts.amountTolerance;
    });

    return {
      withdrawal: w,
      isLikelyHarvesting: !!match,
      matchedDepositId: match?.id ?? null,
      matchedAmount: match ? amountOf(match) : null,
    };
  });
}

// ── Detection: Zero-Holding Sells ───────────────────────────────────

/**
 * Detect sell transactions for stocks where the user currently holds
 * zero shares.  These are typically artifacts of incomplete historical
 * transaction data — the matching buy was never imported.
 */
export function detectZeroHoldingSells(
  transactions: TransactionRecord[],
  holdings: Holding[],
): OrphanedSellResult[] {
  // Build a set of symbols that currently have >0 shares
  const heldSymbols = new Set(
    holdings.filter((h) => h.shares_qty > 0).map((h) => h.symbol),
  );

  return transactions
    .filter(
      (t) =>
        t.txn_type === "Sell" &&
        !t.is_deleted &&
        !heldSymbols.has(t.stock_symbol),
    )
    .map((t) => ({
      transaction: t,
      symbol: t.stock_symbol,
      currentShares: 0,
    }));
}

// ── Dynamic Opening Balance ─────────────────────────────────────────

/**
 * Calculate a dynamic opening-balance adjustment so that:
 *   manualTotalDeposits = fileCapitalDeposits - normalWithdrawals + openingBalance
 *
 * @param transactions All portfolio transactions (non-deleted)
 * @param deposits     Cash deposit records for the portfolio
 * @param manualTotalDeposits  User-reported total capital injected
 * @param flaggedIds   Transaction IDs flagged as income-harvesting (excluded from withdrawal sum)
 */
export function calculateDynamicOpeningBalance(
  transactions: TransactionRecord[],
  deposits: CashDepositRecord[],
  manualTotalDeposits: number,
  flaggedIds: number[],
): OpeningBalanceResult {
  if (!transactions.length && !deposits.length) {
    return { amount: manualTotalDeposits, date: new Date().toISOString().slice(0, 10) };
  }

  // Determine earliest date across both transactions and deposits
  const allDates: number[] = [];
  for (const t of transactions) allDates.push(new Date(t.txn_date).getTime());
  for (const d of deposits) allDates.push(new Date(d.deposit_date).getTime());
  const earliest = Math.min(...allDates);

  const openingDate = new Date(earliest);
  openingDate.setDate(openingDate.getDate() - 1);

  // Capital deposits from file (exclude corporate-action / profit-distribution deposits)
  const fileCapitalDeposits = deposits
    .filter((d) => {
      if (d.is_deleted) return false;
      const src = (d.source ?? "").toLowerCase();
      const notes = (d.notes ?? "").toLowerCase();
      return (
        src === "deposit" &&
        !notes.includes("corporate action") &&
        !notes.includes("profit distribution")
      );
    })
    .reduce((sum, d) => sum + d.amount, 0);

  // Normal withdrawals (those NOT flagged as income-harvesting)
  const normalWithdrawals = deposits
    .filter((d) => {
      if (d.is_deleted) return false;
      const src = (d.source ?? "").toLowerCase();
      return src === "withdrawal";
    })
    .reduce((sum, d) => sum + Math.abs(d.amount), 0);

  // Also include transaction-level withdrawals not flagged
  const txnWithdrawals = transactions
    .filter(
      (t) =>
        t.txn_type === "Withdraw" &&
        !flaggedIds.includes(t.id) &&
        !t.is_deleted,
    )
    .reduce((sum, t) => sum + Math.abs(costOf(t)), 0);

  const totalNormalWithdrawals = normalWithdrawals + txnWithdrawals;

  return {
    amount: manualTotalDeposits - fileCapitalDeposits + totalNormalWithdrawals,
    date: openingDate.toISOString().slice(0, 10),
  };
}

// ── Full Reconciliation Summary ─────────────────────────────────────

/**
 * Build a complete reconciliation summary for one portfolio.
 */
export function buildReconciliationSummary(
  transactions: TransactionRecord[],
  deposits: CashDepositRecord[],
  manualTotalDeposits: number,
  computedCash: number,
  options?: Partial<DetectionOptions>,
  holdings?: Holding[],
): ReconciliationSummary {
  const flagged = detectIncomeHarvesting(transactions, options);
  const flaggedIds = flagged.filter((f) => f.isLikelyHarvesting).map((f) => f.withdrawal.id);

  // Collect ALL non-deleted withdrawal deposit records for user review
  // KFH imports store withdrawals as CashDepositRecords with source="withdrawal"
  const allWithdrawals = deposits.filter(
    (d) => (d.source ?? "").toLowerCase() === "withdrawal" && !d.is_deleted,
  );

  const orphanedSells = holdings
    ? detectZeroHoldingSells(transactions, holdings)
    : [];

  const suggested = calculateDynamicOpeningBalance(
    transactions,
    deposits,
    manualTotalDeposits,
    flaggedIds,
  );

  const discrepancy = manualTotalDeposits - computedCash;
  const discrepancyPct =
    computedCash !== 0 ? Math.abs(discrepancy / computedCash) * 100 : manualTotalDeposits > 0 ? 100 : 0;

  return {
    manualTotalDeposits,
    computedCashFromTxns: computedCash,
    discrepancy,
    discrepancyPct,
    allWithdrawals,
    flaggedWithdrawals: flagged.filter((f) => f.isLikelyHarvesting),
    orphanedSells,
    suggestedOpeningBalance: suggested,
  };
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Extract the monetary amount from a transaction. */
function costOf(t: TransactionRecord): number {
  if (t.purchase_cost != null && t.purchase_cost !== 0) return t.purchase_cost;
  if (t.sell_value != null && t.sell_value !== 0) return t.sell_value;
  if (t.cash_dividend != null && t.cash_dividend !== 0) return t.cash_dividend;
  return 0;
}

function amountOf(t: TransactionRecord): number {
  return Math.abs(costOf(t));
}
