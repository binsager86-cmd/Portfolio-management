/**
 * KFH Trade Statement Mapper
 *
 * Maps normalized KFH rows to existing API payloads:
 * - Buy/Sell → TransactionCreate
 * - Deposit/Withdrawal → CashDepositCreate
 * - Cash Dividend → TransactionCreate (DIVIDEND_ONLY)
 */

import type { CashDepositCreate, TransactionCreate } from "@/services/api";
import type { KfhNormalizedRow } from "./kfhTradeTypes";

export type KfhMappedPayload =
  | { kind: "transaction"; payload: TransactionCreate }
  | { kind: "deposit"; payload: CashDepositCreate }
  | { kind: "skip"; reason: string };

/**
 * Map a single normalized KFH row to the appropriate API payload.
 * Portfolio defaults to "KFH" since KFH Trade statements are KFH-only.
 */
export function mapKfhRowToPayload(
  row: KfhNormalizedRow,
  portfolio: string = "KFH"
): KfhMappedPayload {
  if (row.importStatus !== "ready") {
    return { kind: "skip", reason: row.ignoreReason ?? row.errorReason ?? "Not ready" };
  }

  const date = row.normalizedDate!;
  const notes = row.rawDescription
    ? `[KFH Trade statement] ${row.rawDescription}`
    : "[KFH Trade statement]";

  switch (row.normalizedType) {
    case "buy":
      return {
        kind: "transaction",
        payload: {
          portfolio,
          stock_symbol: row.ticker!,
          txn_date: date,
          txn_type: "Buy",
          shares: row.quantity!,
          purchase_cost: row.quantity! * row.price!,
          price_override: row.price!,
          fees: null,
          notes,
          broker: "KFH Trade",
          reference: row.fingerprint,
        },
      };

    case "sell":
      return {
        kind: "transaction",
        payload: {
          portfolio,
          stock_symbol: row.ticker!,
          txn_date: date,
          txn_type: "Sell",
          shares: row.quantity!,
          sell_value: row.quantity! * row.price!,
          price_override: row.price!,
          fees: null,
          notes,
          broker: "KFH Trade",
          reference: row.fingerprint,
        },
      };

    case "cash_dividend":
      return {
        kind: "transaction",
        payload: {
          portfolio,
          stock_symbol: row.ticker ?? "DIVIDEND",
          txn_date: date,
          txn_type: "DIVIDEND_ONLY",
          shares: 0,
          cash_dividend: Math.abs(row.cashAmount!),
          notes,
          broker: "KFH Trade",
          reference: row.fingerprint,
        },
      };

    case "deposit":
      return {
        kind: "deposit",
        payload: {
          portfolio,
          deposit_date: date,
          amount: Math.abs(row.cashAmount!),
          currency: "KWD",
          bank_name: "KFH",
          source: "deposit",
          notes,
        },
      };

    case "withdrawal":
      return {
        kind: "deposit",
        payload: {
          portfolio,
          deposit_date: date,
          amount: Math.abs(row.cashAmount!),
          currency: "KWD",
          bank_name: "KFH",
          source: "withdrawal",
          notes,
        },
      };

    default:
      return { kind: "skip", reason: `Unhandled type: ${row.normalizedType}` };
  }
}
