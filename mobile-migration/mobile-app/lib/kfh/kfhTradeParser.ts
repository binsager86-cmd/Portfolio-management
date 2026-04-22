/**
 * KFH Trade Statement Parser
 *
 * Handles: real .xlsx, real .xls, HTML saved as .xls
 * Detects headers dynamically in Arabic / English / mixed.
 * Normalizes dates, amounts, transaction types, and extracts trade details.
 */

import type {
    KfhColumnMap,
    KfhHeaderDetection,
    KfhNormalizedRow,
    KfhTransactionType,
} from "./kfhTradeTypes";
import { z } from "zod";

// ── Post-parse validation schema ────────────────────────────────────

const KfhRowSchema = z.object({
  source: z.literal("kfh_trade_statement"),
  normalizedDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  normalizedType: z.enum(["buy", "sell", "cash_dividend", "deposit", "withdrawal", "ignored", "unknown"]),
  cashAmount: z.number().finite().nullable(),
  ticker: z.string().max(20).nullable(),
  quantity: z.number().finite().nonnegative().nullable(),
  price: z.number().finite().nonnegative().nullable(),
  importStatus: z.enum(["ready", "ignored", "error"]),
  fingerprint: z.string().min(1),
});

// ── Header aliases ──────────────────────────────────────────────────

const HEADER_ALIASES: Record<string, string[]> = {
  date: ["التاريخ", "date"],
  type: ["نوع الصفقة", "transaction type"],
  description: ["الاسم", "description"],
  amount: ["المبلغ", "amount"],
};

const REQUIRED_KEYS = Object.keys(HEADER_ALIASES) as (keyof KfhColumnMap)[];

// ── Transaction type aliases ────────────────────────────────────────

const TYPE_MAP: Record<string, KfhTransactionType> = {
  // Buy
  "شراء": "buy",
  buy: "buy",
  // Sell
  "بيع": "sell",
  sell: "sell",
  // Deposit
  "إيداع": "deposit",
  deposit: "deposit",
  // Withdrawal
  "سحب": "withdrawal",
  withdraw: "withdrawal",
  // Cash dividend (corporate action)
  "deposit by corporate action": "cash_dividend",
};

const IGNORED_TYPES = new Set([
  "withdraw by corporate action",
  "الرصيد الافتتاحى",
  "--",
  "stocks transfer processing fee",
]);

// ── Text normalization ──────────────────────────────────────────────

function normalizeText(val: unknown): string {
  if (val == null) return "";
  return String(val)
    .replace(/\u00A0/g, " ")   // non-breaking spaces
    .replace(/\s+/g, " ")      // collapse whitespace
    .trim();
}

// ── File format detection ───────────────────────────────────────────

export function isHtmlMaskedAsXls(content: string): boolean {
  const head = content.substring(0, 2000).toLowerCase();
  return (
    head.includes("<html") ||
    head.includes("<table") ||
    head.includes("urn:schemas-microsoft-com:office:excel")
  );
}

// ── Parse file to raw sheet rows ────────────────────────────────────

export async function parseFileToRows(
  arrayBuffer: ArrayBuffer
): Promise<{ rows: unknown[][]; error?: string }> {
  try {
    const XLSX = await import("xlsx");

    // Check if content is HTML disguised as .xls
    const textDecoder = new TextDecoder("utf-8", { fatal: false });
    const textSample = textDecoder.decode(new Uint8Array(arrayBuffer).slice(0, 2000));

    let workbook: ReturnType<typeof XLSX.read>;

    if (isHtmlMaskedAsXls(textSample)) {
      const fullText = textDecoder.decode(new Uint8Array(arrayBuffer));
      workbook = XLSX.read(fullText, { type: "string" });
    } else {
      workbook = XLSX.read(arrayBuffer, { type: "array" });
    }

    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    if (!firstSheet) {
      return { rows: [], error: "No sheets found in the workbook." };
    }

    // KFH Trade HTML exports have two tables → two sheets:
    //   Sheet1 = metadata (Name, Period, etc.)
    //   Sheet2 = transaction data
    // Pick the sheet with the most rows (the data sheet).
    let bestRows: unknown[][] = [];
    for (const name of workbook.SheetNames) {
      const sheet = workbook.Sheets[name];
      if (!sheet) continue;
      const sheetRows: unknown[][] = XLSX.utils.sheet_to_json(sheet, {
        header: 1,
        defval: null,
        blankrows: false,
      });
      if (sheetRows.length > bestRows.length) {
        bestRows = sheetRows;
      }
    }

    return { rows: bestRows };
  } catch {
    return {
      rows: [],
      error:
        "This KFH statement format could not be parsed automatically. " +
        "Please open the file in Excel and save it as Excel Workbook (.xlsx), then upload it again.",
    };
  }
}

// ── Header detection ────────────────────────────────────────────────

export function detectHeaders(rows: unknown[][]): KfhHeaderDetection {
  for (let rowIdx = 0; rowIdx < Math.min(rows.length, 30); rowIdx++) {
    const row = rows[rowIdx];
    if (!Array.isArray(row)) continue;

    const normalized = row.map((cell) => normalizeText(cell).toLowerCase());

    const found: Partial<KfhColumnMap> = {};
    let lang: "arabic" | "english" | "mixed" | null = null;

    for (const key of REQUIRED_KEYS) {
      const aliases = HEADER_ALIASES[key];
      for (let colIdx = 0; colIdx < normalized.length; colIdx++) {
        const cell = normalized[colIdx];
        for (const alias of aliases) {
          if (cell === alias.toLowerCase()) {
            found[key] = colIdx;
            // Detect language
            const isArabic = /[\u0600-\u06FF]/.test(alias);
            if (lang === null) lang = isArabic ? "arabic" : "english";
            else if ((isArabic && lang === "english") || (!isArabic && lang === "arabic"))
              lang = "mixed";
            break;
          }
        }
        if (found[key] !== undefined) break;
      }
    }

    const missing = REQUIRED_KEYS.filter((k) => found[k] === undefined);

    if (missing.length === 0) {
      return {
        found: true,
        headerRowIndex: rowIdx,
        columns: found as KfhColumnMap,
        missingColumns: [],
        language: lang ?? "english",
      };
    }
  }

  // Not found — report all columns that we couldn't locate
  const missingDisplay = REQUIRED_KEYS.map((k) => {
    const aliases = HEADER_ALIASES[k];
    return `${k}: ${aliases.join(" / ")}`;
  });

  return {
    found: false,
    headerRowIndex: -1,
    columns: null,
    missingColumns: missingDisplay,
    language: "english",
  };
}

// ── Date normalization ──────────────────────────────────────────────

export function normalizeDate(val: unknown): string | null {
  if (val == null) return null;

  // Excel serial date number
  if (typeof val === "number" && val > 30000 && val < 100000) {
    const utcDays = Math.floor(val) - 25569;
    const d = new Date(utcDays * 86400000);
    if (!isNaN(d.getTime())) {
      return d.toISOString().slice(0, 10);
    }
  }

  // JS Date object
  if (val instanceof Date) {
    if (!isNaN(val.getTime())) return val.toISOString().slice(0, 10);
    return null;
  }

  const s = normalizeText(val);
  if (!s) return null;

  // yyyy-mm-dd (optionally with time)
  const isoMatch = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (isoMatch) {
    const [, y, m, d] = isoMatch;
    return `${y}-${m}-${d}`;
  }

  // dd-mm-yyyy or dd/mm/yyyy (optionally with time)
  const dmyMatch = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})/);
  if (dmyMatch) {
    const [, d, m, y] = dmyMatch;
    return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
  }

  return null;
}

// ── Amount normalization ────────────────────────────────────────────

export function normalizeAmount(val: unknown): number | null {
  if (val == null) return null;
  if (typeof val === "number") return isNaN(val) ? null : val;

  const s = normalizeText(val)
    .replace(/,/g, "")
    .replace(/\u00A0/g, "");

  if (!s) return null;
  const n = parseFloat(s);
  return isNaN(n) ? null : n;
}

// ── Transaction type classification ─────────────────────────────────

export function classifyType(
  rawType: string | null,
  rawDescription: string | null,
  amount: number | null
): { type: KfhTransactionType; ignoreReason: string | null } {
  const typeStr = normalizeText(rawType).toLowerCase();
  const descStr = normalizeText(rawDescription).toLowerCase();

  // Check ignore list first
  if (IGNORED_TYPES.has(typeStr) || IGNORED_TYPES.has(descStr)) {
    const reason =
      typeStr === "--"
        ? "Separator row"
        : typeStr === "الرصيد الافتتاحى"
          ? "Opening balance"
          : typeStr.includes("withdraw by corporate")
            ? "Withdraw by Corporate Action"
            : descStr.includes("stocks transfer processing fee")
              ? "Stocks Transfer Processing Fee"
              : `Ignored type: ${rawType}`;
    return { type: "ignored", ignoreReason: reason };
  }

  // Check description for ignored patterns too
  if (descStr.includes("stocks transfer processing fee")) {
    return { type: "ignored", ignoreReason: "Stocks Transfer Processing Fee" };
  }

  // Map known types
  const mapped = TYPE_MAP[typeStr];

  if (mapped === "cash_dividend") {
    if (amount != null && amount <= 0) {
      return { type: "ignored", ignoreReason: "Negative corporate action" };
    }
    return { type: "cash_dividend", ignoreReason: null };
  }

  // Also detect "deposit by corporate action" in description
  if (descStr.includes("deposit by corporate action") || descStr.includes("corporate action")) {
    if (typeStr.includes("withdraw")) {
      return { type: "ignored", ignoreReason: "Withdraw by Corporate Action" };
    }
    if (amount != null && amount <= 0) {
      return { type: "ignored", ignoreReason: "Negative corporate action" };
    }
    return { type: "cash_dividend", ignoreReason: null };
  }

  if (mapped) {
    return { type: mapped, ignoreReason: null };
  }

  // Zero amount
  if (amount === 0 || amount == null) {
    return { type: "ignored", ignoreReason: "Zero or missing amount" };
  }

  return { type: "unknown", ignoreReason: null };
}

// ── Trade detail extraction (Buy/Sell) ──────────────────────────────

export interface TradeDetail {
  ticker: string;
  quantity: number;
  price: number;
}

// Arabic pattern: price @ quantity TICKER - KSE
const ARABIC_TRADE_RE =
  /(-?\d+(?:\.\d+)?)\s*@\s*(\d+(?:\.\d+)?)\s+([A-Z0-9._-]+)\s*-\s*KSE/i;

// English pattern: Buy/Sell KSE - TICKER`R quantity@price
const ENGLISH_TRADE_RE =
  /(?:Buy|Sell)\s+KSE\s*-\s*([A-Z0-9._-]+)(?:`R)?\s+(\d+(?:\.\d+)?)\s*@\s*(-?\d*\.?\d+)/i;

export function extractTradeDetail(description: string | null): TradeDetail | null {
  if (!description) return null;
  const desc = normalizeText(description);

  // Try English pattern first
  const engMatch = desc.match(ENGLISH_TRADE_RE);
  if (engMatch) {
    const ticker = engMatch[1].replace(/`R$/i, "").toUpperCase();
    const quantity = parseFloat(engMatch[2]);
    const price = Math.abs(parseFloat(engMatch[3]));
    if (!isNaN(quantity) && !isNaN(price) && ticker) {
      return { ticker, quantity, price };
    }
  }

  // Try Arabic pattern
  const arMatch = desc.match(ARABIC_TRADE_RE);
  if (arMatch) {
    const price = Math.abs(parseFloat(arMatch[1]));
    const quantity = parseFloat(arMatch[2]);
    const ticker = arMatch[3].replace(/`R$/i, "").toUpperCase();
    if (!isNaN(quantity) && !isNaN(price) && ticker) {
      return { ticker, quantity, price };
    }
  }

  return null;
}

// ── Dividend ticker extraction ──────────────────────────────────────

const DIVIDEND_TICKER_RE = /Cash Dividends?\s*-\s*([A-Z0-9._-]+)(?:`R)?/i;

export function extractDividendTicker(description: string | null): string | null {
  if (!description) return null;
  const match = normalizeText(description).match(DIVIDEND_TICKER_RE);
  if (match) return match[1].replace(/`R$/i, "").toUpperCase();
  return null;
}

// ── Fingerprint ─────────────────────────────────────────────────────

export async function computeFingerprint(
  date: string | null,
  type: string,
  amount: number | null,
  description: string | null
): Promise<string> {
  const raw = `${date ?? ""}|${type}|${amount ?? ""}|${normalizeText(description).toLowerCase()}`;

  if (typeof crypto !== "undefined" && crypto.subtle) {
    const encoded = new TextEncoder().encode(raw);
    const hash = await crypto.subtle.digest("SHA-256", encoded);
    return Array.from(new Uint8Array(hash))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }

  // Fallback: simple hash (non-crypto environments)
  let h = 0;
  for (let i = 0; i < raw.length; i++) {
    h = ((h << 5) - h + raw.charCodeAt(i)) | 0;
  }
  return `fallback_${Math.abs(h).toString(16)}`;
}

// ── Main parse function ─────────────────────────────────────────────

export async function parseKfhStatement(
  arrayBuffer: ArrayBuffer,
  fileName: string
): Promise<{
  rows: KfhNormalizedRow[];
  error?: string;
  headerInfo?: KfhHeaderDetection;
}> {
  // 1. Parse file to raw rows
  const { rows: rawRows, error: parseError } = await parseFileToRows(arrayBuffer);
  if (parseError) return { rows: [], error: parseError };
  if (rawRows.length === 0) return { rows: [], error: "The file appears to be empty." };

  // 2. Detect headers
  const headerInfo = detectHeaders(rawRows);
  if (!headerInfo.found || !headerInfo.columns) {
    return {
      rows: [],
      error:
        "Could not find required headers in the file.\n\n" +
        "Missing columns:\n" +
        headerInfo.missingColumns.join("\n") +
        "\n\nAccepted headers (Arabic / English):\n" +
        Object.entries(HEADER_ALIASES)
          .map(([k, aliases]) => `${k}: ${aliases.join(" / ")}`)
          .join("\n"),
      headerInfo,
    };
  }

  const cols = headerInfo.columns;
  const dataRows = rawRows.slice(headerInfo.headerRowIndex + 1);

  // 3. Normalize each row
  const normalized: KfhNormalizedRow[] = [];

  for (const raw of dataRows) {
    if (!Array.isArray(raw)) continue;

    const rawDate = raw[cols.date];
    const rawType = raw[cols.type];
    const rawDescription = raw[cols.description];
    const rawAmount = raw[cols.amount];

    // Skip fully empty rows
    if (
      rawDate == null &&
      rawType == null &&
      rawDescription == null &&
      rawAmount == null
    ) {
      continue;
    }

    const rawSnapshot: Record<string, unknown> = {};
    raw.forEach((cell, i) => {
      rawSnapshot[`col_${i}`] = cell;
    });

    const normalizedDate = normalizeDate(rawDate);
    const cashAmount = normalizeAmount(rawAmount);
    const typeStr = normalizeText(rawType);
    const descStr = normalizeText(rawDescription);

    const { type: normalizedType, ignoreReason } = classifyType(
      typeStr || null,
      descStr || null,
      cashAmount
    );

    // Build base row
    const row: KfhNormalizedRow = {
      source: "kfh_trade_statement",
      rawDate,
      rawType: typeStr || null,
      rawDescription: descStr || null,
      rawAmount: typeof rawAmount === "string" || typeof rawAmount === "number" ? rawAmount : null,
      normalizedDate,
      normalizedType,
      cashAmount,
      ticker: null,
      quantity: null,
      price: null,
      importStatus: "ready",
      ignoreReason,
      errorReason: null,
      rawSnapshot,
      fingerprint: "",
    };

    // Handle ignored
    if (normalizedType === "ignored") {
      row.importStatus = "ignored";
    }

    // Handle unknown
    if (normalizedType === "unknown") {
      row.importStatus = "ignored";
      row.ignoreReason = `Unknown transaction type: ${typeStr || "(empty)"}`;
    }

    // Zero amount
    if (cashAmount === 0) {
      row.importStatus = "ignored";
      row.ignoreReason = "Zero amount";
    }

    // Validate date
    if (row.importStatus === "ready" && !normalizedDate) {
      row.importStatus = "error";
      row.errorReason = `Invalid date: ${String(rawDate)}`;
    }

    // Validate amount
    if (row.importStatus === "ready" && cashAmount == null) {
      row.importStatus = "error";
      row.errorReason = `Invalid amount: ${String(rawAmount)}`;
    }

    // Extract trade details for buy/sell
    if (
      row.importStatus === "ready" &&
      (normalizedType === "buy" || normalizedType === "sell")
    ) {
      const detail = extractTradeDetail(descStr);
      if (detail) {
        row.ticker = detail.ticker;
        row.quantity = detail.quantity;
        row.price = detail.price;
      } else {
        row.importStatus = "error";
        row.errorReason = `Could not extract trade details (ticker/quantity/price) from description: "${descStr}"`;
      }
    }

    // Extract dividend ticker (optional — not a blocker)
    if (normalizedType === "cash_dividend") {
      row.ticker = extractDividendTicker(descStr);
    }

    // Compute fingerprint
    row.fingerprint = await computeFingerprint(
      normalizedDate,
      normalizedType,
      cashAmount,
      descStr
    );

    normalized.push(row);
  }

  // Validate all "ready" rows against schema — demote invalid rows to "error"
  for (const row of normalized) {
    if (row.importStatus !== "ready") continue;
    const result = KfhRowSchema.safeParse(row);
    if (!result.success) {
      row.importStatus = "error";
      row.errorReason = `Validation failed: ${result.error.issues.map((i) => i.message).join("; ")}`;
    }
  }

  return { rows: normalized, headerInfo };
}
