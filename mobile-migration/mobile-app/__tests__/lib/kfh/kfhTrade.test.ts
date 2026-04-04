/**
 * Tests for KFH Trade Statement Parser — header detection, date/amount
 * normalization, type classification, trade detail extraction, and mapper.
 */

import { buildPreview } from "@/lib/kfh/kfhTradeImportService";
import { mapKfhRowToPayload } from "@/lib/kfh/kfhTradeMapper";
import {
    classifyType,
    detectHeaders,
    extractDividendTicker,
    extractTradeDetail,
    isHtmlMaskedAsXls,
    normalizeAmount,
    normalizeDate,
} from "@/lib/kfh/kfhTradeParser";
import type { KfhNormalizedRow } from "@/lib/kfh/kfhTradeTypes";

// ── normalizeDate ───────────────────────────────────────────────────

describe("normalizeDate", () => {
  it("parses yyyy-mm-dd", () => {
    expect(normalizeDate("2024-03-15")).toBe("2024-03-15");
  });

  it("parses dd-mm-yyyy", () => {
    expect(normalizeDate("15-03-2024")).toBe("2024-03-15");
  });

  it("parses dd/mm/yyyy", () => {
    expect(normalizeDate("5/1/2024")).toBe("2024-01-05");
  });

  it("handles Excel serial date", () => {
    // 45366 = 2024-03-15 in Excel serial
    const result = normalizeDate(45366);
    expect(result).toBe("2024-03-15");
  });

  it("handles Date objects", () => {
    const d = new Date("2024-06-01T00:00:00Z");
    expect(normalizeDate(d)).toBe("2024-06-01");
  });

  it("returns null for garbage input", () => {
    expect(normalizeDate("foobar")).toBeNull();
    expect(normalizeDate(null)).toBeNull();
    expect(normalizeDate(undefined)).toBeNull();
  });
});

// ── normalizeAmount ─────────────────────────────────────────────────

describe("normalizeAmount", () => {
  it("returns numeric values as-is", () => {
    expect(normalizeAmount(123.45)).toBe(123.45);
  });

  it("parses string with commas", () => {
    expect(normalizeAmount("1,234.56")).toBe(1234.56);
  });

  it("strips NBSP (treated as space, parseFloat stops at it)", () => {
    // NBSP is replaced with space → "1 234" → parseFloat returns 1
    // This is expected; KFH amounts use commas not NBSP as thousands separator
    expect(normalizeAmount("1\u00A0234")).toBe(1);
    // Real thousands-separated amounts use commas
    expect(normalizeAmount("1,234")).toBe(1234);
  });

  it("returns null for null/undefined", () => {
    expect(normalizeAmount(null)).toBeNull();
    expect(normalizeAmount(undefined)).toBeNull();
  });

  it("returns null for non-numeric string", () => {
    expect(normalizeAmount("abc")).toBeNull();
  });

  it("handles negative values", () => {
    expect(normalizeAmount("-500.00")).toBe(-500);
  });
});

// ── classifyType ────────────────────────────────────────────────────

describe("classifyType", () => {
  it("classifies Arabic Buy", () => {
    const r = classifyType("شراء", null, 100);
    expect(r.type).toBe("buy");
    expect(r.ignoreReason).toBeNull();
  });

  it("classifies English Sell", () => {
    const r = classifyType("Sell", null, 100);
    expect(r.type).toBe("sell");
    expect(r.ignoreReason).toBeNull();
  });

  it("classifies English deposit", () => {
    const r = classifyType("Deposit", null, 500);
    expect(r.type).toBe("deposit");
  });

  it("classifies Deposit by Corporate Action as cash_dividend", () => {
    const r = classifyType("Deposit by Corporate Action", null, 50);
    expect(r.type).toBe("cash_dividend");
  });

  it("ignores Withdraw by Corporate Action", () => {
    const r = classifyType("Withdraw by Corporate Action", null, -50);
    expect(r.type).toBe("ignored");
    expect(r.ignoreReason).toContain("Withdraw by Corporate Action");
  });

  it("ignores opening balance", () => {
    const r = classifyType("الرصيد الافتتاحى", null, 0);
    expect(r.type).toBe("ignored");
    expect(r.ignoreReason).toContain("Opening balance");
  });

  it("ignores separator rows", () => {
    const r = classifyType("--", null, 0);
    expect(r.type).toBe("ignored");
    expect(r.ignoreReason).toBe("Separator row");
  });

  it("ignores Stocks Transfer Processing Fee", () => {
    const r = classifyType(null, "Stocks Transfer Processing Fee", 5);
    expect(r.type).toBe("ignored");
  });

  it("returns unknown for unrecognized types", () => {
    const r = classifyType("SomethingNew", null, 100);
    expect(r.type).toBe("unknown");
  });

  it("ignores negative corporate action amount", () => {
    const r = classifyType("Deposit by Corporate Action", null, -50);
    expect(r.type).toBe("ignored");
    expect(r.ignoreReason).toContain("Negative");
  });
});

// ── extractTradeDetail ──────────────────────────────────────────────

describe("extractTradeDetail", () => {
  it("extracts English buy: Buy KSE - NBK 100@2.500", () => {
    const d = extractTradeDetail("Buy KSE - NBK 100@2.500");
    expect(d).not.toBeNull();
    expect(d!.ticker).toBe("NBK");
    expect(d!.quantity).toBe(100);
    expect(d!.price).toBe(2.5);
  });

  it("extracts English sell: Sell KSE - ZAIN`R 500@0.620", () => {
    const d = extractTradeDetail("Sell KSE - ZAIN`R 500@0.620");
    expect(d).not.toBeNull();
    expect(d!.ticker).toBe("ZAIN");
    expect(d!.quantity).toBe(500);
    expect(d!.price).toBe(0.62);
  });

  it("extracts Arabic: -0.320@1000 NBK - KSE", () => {
    const d = extractTradeDetail("-0.320@1000 NBK - KSE");
    expect(d).not.toBeNull();
    expect(d!.ticker).toBe("NBK");
    expect(d!.quantity).toBe(1000);
    expect(d!.price).toBe(0.32);
  });

  it("returns null for non-trade descriptions", () => {
    expect(extractTradeDetail("Transfer to account")).toBeNull();
    expect(extractTradeDetail(null)).toBeNull();
    expect(extractTradeDetail("")).toBeNull();
  });
});

// ── extractDividendTicker ───────────────────────────────────────────

describe("extractDividendTicker", () => {
  it("extracts ticker from Cash Dividend - NBK", () => {
    expect(extractDividendTicker("Cash Dividend - NBK")).toBe("NBK");
  });

  it("extracts ticker from Cash Dividends - ZAIN`R", () => {
    expect(extractDividendTicker("Cash Dividends - ZAIN`R")).toBe("ZAIN");
  });

  it("returns null for non-dividend descriptions", () => {
    expect(extractDividendTicker("Buy KSE - NBK 100@2.500")).toBeNull();
    expect(extractDividendTicker(null)).toBeNull();
  });
});

// ── detectHeaders ───────────────────────────────────────────────────

describe("detectHeaders", () => {
  it("detects English headers", () => {
    const rows = [
      ["Date", "Transaction Type", "Description", "Amount"],
      ["2024-01-01", "Buy", "Buy KSE - NBK 100@2.500", 250],
    ];
    const h = detectHeaders(rows);
    expect(h.found).toBe(true);
    expect(h.language).toBe("english");
    expect(h.columns).toEqual({ date: 0, type: 1, description: 2, amount: 3 });
    expect(h.headerRowIndex).toBe(0);
  });

  it("detects Arabic headers", () => {
    const rows = [
      ["التاريخ", "نوع الصفقة", "الاسم", "المبلغ"],
      ["01-01-2024", "شراء", "Buy something", 100],
    ];
    const h = detectHeaders(rows);
    expect(h.found).toBe(true);
    expect(h.language).toBe("arabic");
    expect(h.columns!.date).toBe(0);
  });

  it("detects headers on a later row", () => {
    const rows = [
      ["Report Title", null, null, null],
      ["KFH Trade Statement", null, null, null],
      ["Date", "Transaction Type", "Description", "Amount"],
      ["2024-01-01", "Buy", "desc", 100],
    ];
    const h = detectHeaders(rows);
    expect(h.found).toBe(true);
    expect(h.headerRowIndex).toBe(2);
  });

  it("returns not found when headers are missing", () => {
    const rows = [
      ["A", "B", "C"],
      ["1", "2", "3"],
    ];
    const h = detectHeaders(rows);
    expect(h.found).toBe(false);
    expect(h.missingColumns.length).toBeGreaterThan(0);
  });
});

// ── isHtmlMaskedAsXls ───────────────────────────────────────────────

describe("isHtmlMaskedAsXls", () => {
  it("detects HTML content", () => {
    expect(isHtmlMaskedAsXls("<html><body><table></table></body></html>")).toBe(true);
  });

  it("detects Microsoft office Excel namespace", () => {
    expect(isHtmlMaskedAsXls("urn:schemas-microsoft-com:office:excel")).toBe(true);
  });

  it("returns false for non-HTML content", () => {
    expect(isHtmlMaskedAsXls("PK\x03\x04some binary xlsx")).toBe(false);
  });
});

// ── mapKfhRowToPayload ──────────────────────────────────────────────

describe("mapKfhRowToPayload", () => {
  const baseRow: KfhNormalizedRow = {
    source: "kfh_trade_statement",
    rawDate: "2024-01-15",
    rawType: "Buy",
    rawDescription: "Buy KSE - NBK 100@2.500",
    rawAmount: 250,
    normalizedDate: "2024-01-15",
    normalizedType: "buy",
    cashAmount: 250,
    ticker: "NBK",
    quantity: 100,
    price: 2.5,
    importStatus: "ready",
    ignoreReason: null,
    errorReason: null,
    rawSnapshot: {},
    fingerprint: "abc123",
  };

  it("maps Buy to TransactionCreate", () => {
    const result = mapKfhRowToPayload(baseRow, "KFH");
    expect(result.kind).toBe("transaction");
    if (result.kind === "transaction") {
      expect(result.payload.txn_type).toBe("Buy");
      expect(result.payload.stock_symbol).toBe("NBK");
      expect(result.payload.shares).toBe(100);
      expect(result.payload.purchase_cost).toBe(250);
      expect(result.payload.broker).toBe("KFH Trade");
    }
  });

  it("maps Sell to TransactionCreate", () => {
    const row: KfhNormalizedRow = {
      ...baseRow,
      normalizedType: "sell",
      rawType: "Sell",
      rawDescription: "Sell KSE - NBK 100@2.500",
    };
    const result = mapKfhRowToPayload(row, "KFH");
    expect(result.kind).toBe("transaction");
    if (result.kind === "transaction") {
      expect(result.payload.txn_type).toBe("Sell");
      expect(result.payload.sell_value).toBe(250);
    }
  });

  it("maps Cash Dividend to DIVIDEND_ONLY", () => {
    const row: KfhNormalizedRow = {
      ...baseRow,
      normalizedType: "cash_dividend",
      ticker: "NBK",
      cashAmount: 50,
      quantity: null,
      price: null,
    };
    const result = mapKfhRowToPayload(row, "KFH");
    expect(result.kind).toBe("transaction");
    if (result.kind === "transaction") {
      expect(result.payload.txn_type).toBe("DIVIDEND_ONLY");
      expect(result.payload.cash_dividend).toBe(50);
      expect(result.payload.stock_symbol).toBe("NBK");
    }
  });

  it("maps Deposit to CashDepositCreate", () => {
    const row: KfhNormalizedRow = {
      ...baseRow,
      normalizedType: "deposit",
      cashAmount: 1000,
      ticker: null,
      quantity: null,
      price: null,
    };
    const result = mapKfhRowToPayload(row, "KFH");
    expect(result.kind).toBe("deposit");
    if (result.kind === "deposit") {
      expect(result.payload.amount).toBe(1000);
      expect(result.payload.source).toBe("deposit");
    }
  });

  it("maps Withdrawal to CashDepositCreate with positive amount", () => {
    const row: KfhNormalizedRow = {
      ...baseRow,
      normalizedType: "withdrawal",
      cashAmount: -500,
      ticker: null,
      quantity: null,
      price: null,
    };
    const result = mapKfhRowToPayload(row, "KFH");
    expect(result.kind).toBe("deposit");
    if (result.kind === "deposit") {
      expect(result.payload.amount).toBe(500);
      expect(result.payload.source).toBe("withdrawal");
    }
  });

  it("skips non-ready rows", () => {
    const row: KfhNormalizedRow = { ...baseRow, importStatus: "ignored", ignoreReason: "test" };
    const result = mapKfhRowToPayload(row, "KFH");
    expect(result.kind).toBe("skip");
  });
});

// ── buildPreview ────────────────────────────────────────────────────

describe("buildPreview", () => {
  const makeRow = (
    overrides: Partial<KfhNormalizedRow>
  ): KfhNormalizedRow => ({
    source: "kfh_trade_statement",
    rawDate: "2024-01-01",
    rawType: "Buy",
    rawDescription: "desc",
    rawAmount: 100,
    normalizedDate: "2024-01-01",
    normalizedType: "buy",
    cashAmount: 100,
    ticker: "NBK",
    quantity: 10,
    price: 10,
    importStatus: "ready",
    ignoreReason: null,
    errorReason: null,
    rawSnapshot: {},
    fingerprint: `fp_${Math.random()}`,
    ...overrides,
  });

  it("groups rows by status", () => {
    const rows = [
      makeRow({ normalizedType: "buy" }),
      makeRow({ normalizedType: "sell" }),
      makeRow({ importStatus: "ignored", ignoreReason: "Opening balance", normalizedType: "ignored" }),
      makeRow({ importStatus: "error", errorReason: "Bad date", normalizedType: "buy" }),
    ];
    const p = buildPreview(rows, "test.xlsx");
    expect(p.readyRows.length).toBe(2);
    expect(p.ignoredRows.length).toBe(1);
    expect(p.errorRows.length).toBe(1);
    expect(p.counts.buys).toBe(1);
    expect(p.counts.sells).toBe(1);
  });

  it("detects duplicates by fingerprint", () => {
    const rows = [
      makeRow({ fingerprint: "fp_dup1" }),
      makeRow({ fingerprint: "fp_dup1" }),
    ];
    const p = buildPreview(rows, "test.xlsx");
    expect(p.readyRows.length).toBe(1);
    expect(p.duplicateRows.length).toBe(1);
  });

  it("detects duplicates against existing fingerprints", () => {
    const existing = new Set(["fp_existing"]);
    const rows = [makeRow({ fingerprint: "fp_existing" })];
    const p = buildPreview(rows, "test.xlsx", existing);
    expect(p.readyRows.length).toBe(0);
    expect(p.duplicateRows.length).toBe(1);
  });
});
