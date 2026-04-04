/**
 * KFH Trade Statement Import Service
 *
 * Orchestrates: file pick → parse → preview build → import execution.
 * Uses existing createTransaction / createDeposit APIs.
 */

import { extractErrorMessage } from "@/lib/errorHandling";
import { createDeposit, createTransaction } from "@/services/api";
import { mapKfhRowToPayload } from "./kfhTradeMapper";
import { parseKfhStatement } from "./kfhTradeParser";
import type { KfhImportPreview, KfhImportResult, KfhNormalizedRow } from "./kfhTradeTypes";

// ── Build preview from parsed rows ──────────────────────────────────

export function buildPreview(
  rows: KfhNormalizedRow[],
  fileName: string,
  existingFingerprints: Set<string> = new Set()
): KfhImportPreview {
  const readyRows: KfhNormalizedRow[] = [];
  const ignoredRows: KfhNormalizedRow[] = [];
  const errorRows: KfhNormalizedRow[] = [];
  const duplicateRows: KfhNormalizedRow[] = [];

  const seenFingerprints = new Set<string>();

  for (const row of rows) {
    // Duplicate detection (within file + against existing)
    if (row.importStatus === "ready") {
      if (existingFingerprints.has(row.fingerprint) || seenFingerprints.has(row.fingerprint)) {
        duplicateRows.push({
          ...row,
          importStatus: "ignored",
          ignoreReason: "Duplicate (already imported or repeated in file)",
        });
        continue;
      }
      seenFingerprints.add(row.fingerprint);
    }

    switch (row.importStatus) {
      case "ready":
        readyRows.push(row);
        break;
      case "ignored":
        ignoredRows.push(row);
        break;
      case "error":
        errorRows.push(row);
        break;
    }
  }

  const counts = {
    buys: readyRows.filter((r) => r.normalizedType === "buy").length,
    sells: readyRows.filter((r) => r.normalizedType === "sell").length,
    cashDividends: readyRows.filter((r) => r.normalizedType === "cash_dividend").length,
    deposits: readyRows.filter((r) => r.normalizedType === "deposit").length,
    withdrawals: readyRows.filter((r) => r.normalizedType === "withdrawal").length,
    ignored: ignoredRows.length,
    errors: errorRows.length,
    duplicates: duplicateRows.length,
  };

  return {
    fileName,
    totalRows: rows.length,
    readyRows,
    ignoredRows,
    errorRows,
    duplicateRows,
    counts,
  };
}

// ── Execute import ──────────────────────────────────────────────────

export async function executeImport(
  readyRows: KfhNormalizedRow[],
  portfolio: string = "KFH",
  onProgress?: (current: number, total: number) => void
): Promise<KfhImportResult> {
  let imported = 0;
  let skipped = 0;
  let errors = 0;
  const details: string[] = [];

  const total = readyRows.length;

  for (let i = 0; i < readyRows.length; i++) {
    const row = readyRows[i];
    const mapped = mapKfhRowToPayload(row, portfolio);

    onProgress?.(i + 1, total);

    try {
      switch (mapped.kind) {
        case "transaction":
          await createTransaction(mapped.payload);
          imported++;
          break;
        case "deposit":
          await createDeposit(mapped.payload);
          imported++;
          break;
        case "skip":
          skipped++;
          details.push(`Skipped: ${mapped.reason}`);
          break;
      }
    } catch (err: unknown) {
      errors++;
      const desc = row.rawDescription ?? `Row #${i + 1}`;
      details.push(`Error importing "${desc}": ${extractErrorMessage(err)}`);
    }
  }

  return { imported, skipped, errors, details };
}

// ── Full pipeline: parse file → build preview ───────────────────────

export async function parseAndPreview(
  arrayBuffer: ArrayBuffer,
  fileName: string,
  existingFingerprints?: Set<string>
): Promise<{ preview: KfhImportPreview | null; error?: string }> {
  const parsed = await parseKfhStatement(arrayBuffer, fileName);
  if (parsed.error) {
    return { preview: null, error: parsed.error };
  }

  const preview = buildPreview(parsed.rows, fileName, existingFingerprints);
  return { preview };
}
