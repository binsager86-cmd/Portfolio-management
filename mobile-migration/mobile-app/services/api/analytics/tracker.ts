/**
 * Portfolio tracker, integrity checks, backup/restore & AI analyst.
 */

import { API_TIMEOUT_LONG } from "@/constants/layout";
import api from "../client";
import type {
  AIAnalysisResult,
  BackupImportResult,
  CashIntegrityResult,
  IntegrityCheckResult,
  SaveSnapshotResponse,
} from "../types";

// ── Portfolio Tracker ───────────────────────────────────────────────

/** Save today's portfolio snapshot. */
export async function saveSnapshot(payload?: {
  snapshot_date?: string;
  portfolio_value?: number;
  deposit_cash?: number;
  notes?: string;
}): Promise<SaveSnapshotResponse> {
  const { data } = await api.post<{ status: string; data: SaveSnapshotResponse }>(
    "/api/v1/tracker/save-snapshot",
    payload ?? {},
    { timeout: API_TIMEOUT_LONG },
  );
  return data.data;
}

/** Delete a single snapshot. */
export async function deleteSnapshot(snapshotId: number): Promise<void> {
  await api.delete(`/api/v1/tracker/snapshots/${snapshotId}`);
}

/** Delete all snapshots. */
export async function deleteAllSnapshots(): Promise<{ deleted_count: number; message: string }> {
  const { data } = await api.delete<{ status: string; data: { deleted_count: number; message: string } }>(
    "/api/v1/tracker/snapshots"
  );
  return data.data;
}

/** Recalculate all snapshot metrics. */
export async function recalculateSnapshots(): Promise<{ updated: number; message: string }> {
  const { data } = await api.post<{ status: string; data: { updated: number; message: string } }>(
    "/api/v1/tracker/recalculate",
    {},
    { timeout: API_TIMEOUT_LONG },
  );
  return data.data;
}

// ── Integrity ───────────────────────────────────────────────────────

/** Run full integrity check. */
export async function integrityCheck(): Promise<IntegrityCheckResult> {
  const { data } = await api.get<{ status: string; data: IntegrityCheckResult }>(
    "/api/v1/integrity/check"
  );
  return data.data;
}

/** Check cash balance for a portfolio. */
export async function checkCashIntegrity(portfolio: string): Promise<CashIntegrityResult> {
  const { data } = await api.get<{ status: string; data: CashIntegrityResult }>(
    `/api/v1/integrity/cash/${portfolio}`
  );
  return data.data;
}

// ── Backup & Restore ────────────────────────────────────────────────

/** Download full Excel backup as blob. */
export async function exportBackup(): Promise<Blob> {
  const response = await api.get("/api/v1/backup/export", {
    responseType: "blob",
  });
  return response.data;
}

/** Import transactions from Excel (Backup & Restore flow). */
export async function importBackup(
  file: FormData,
  mode: "merge" | "replace" = "merge",
  sheetName?: string,
): Promise<BackupImportResult> {
  const params: Record<string, string> = { mode };
  if (sheetName) params.sheet_name = sheetName;
  const { data } = await api.post<{ status: string; data: BackupImportResult }>(
    "/api/v1/backup/import",
    file,
    {
      headers: { "Content-Type": "multipart/form-data" },
      params,
    }
  );
  return data.data;
}

// ── AI Analyst ──────────────────────────────────────────────────────

/** Generate AI portfolio analysis. */
export async function analyzePortfolio(payload: {
  prompt?: string;
  include_holdings?: boolean;
  include_transactions?: boolean;
  include_performance?: boolean;
  language?: string;
}): Promise<AIAnalysisResult> {
  const { data } = await api.post<{ status: string; data: AIAnalysisResult }>(
    "/api/v1/ai/analyze",
    payload
  );
  return data.data;
}

/** Check AI service status. */
export async function getAIStatus(): Promise<{ configured: boolean; model: string }> {
  const { data } = await api.get<{ status: string; data: { configured: boolean; model: string } }>(
    "/api/v1/ai/status"
  );
  return data.data;
}
