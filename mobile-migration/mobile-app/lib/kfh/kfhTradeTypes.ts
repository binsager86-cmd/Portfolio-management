/**
 * KFH Trade Statement Importer — type definitions.
 */

/** Normalized row from a KFH trade statement. */
export interface KfhNormalizedRow {
  source: "kfh_trade_statement";
  rawDate: unknown;
  rawType: string | null;
  rawDescription: string | null;
  rawAmount: string | number | null;

  normalizedDate: string | null;
  normalizedType: KfhTransactionType;

  cashAmount: number | null;
  ticker: string | null;
  quantity: number | null;
  price: number | null;

  importStatus: "ready" | "ignored" | "error";
  ignoreReason: string | null;
  errorReason: string | null;
  rawSnapshot: Record<string, unknown>;
  fingerprint: string;
}

export type KfhTransactionType =
  | "buy"
  | "sell"
  | "cash_dividend"
  | "deposit"
  | "withdrawal"
  | "ignored"
  | "unknown";

/** Summary of parsed file for the preview modal. */
export interface KfhImportPreview {
  fileName: string;
  totalRows: number;
  readyRows: KfhNormalizedRow[];
  ignoredRows: KfhNormalizedRow[];
  errorRows: KfhNormalizedRow[];
  duplicateRows: KfhNormalizedRow[];
  counts: {
    buys: number;
    sells: number;
    cashDividends: number;
    deposits: number;
    withdrawals: number;
    ignored: number;
    errors: number;
    duplicates: number;
  };
}

/** Result of the import operation. */
export interface KfhImportResult {
  imported: number;
  skipped: number;
  errors: number;
  details: string[];
}

/** Column indexes after header detection. */
export interface KfhColumnMap {
  date: number;
  type: number;
  description: number;
  amount: number;
}

/** Detected header info. */
export interface KfhHeaderDetection {
  found: boolean;
  headerRowIndex: number;
  columns: KfhColumnMap | null;
  missingColumns: string[];
  language: "arabic" | "english" | "mixed";
}
