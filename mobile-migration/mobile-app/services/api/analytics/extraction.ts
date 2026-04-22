/**
 * AI extraction pipeline: upload, polling, validation, verification,
 * attribution & rearrange endpoints.
 */

import api from "../client";
import type { AIUploadResult, AIValidationResult } from "../types";

// ── Interfaces ──────────────────────────────────────────────────────

/** Response from the fast upload endpoint (Phase 1). */
export interface UploadJobResponse {
  job_id: number;
  upload_id: string;
  status: string;
  message: string;
  source_file: string;
}

/** Status response from the extraction polling endpoint. */
export interface ExtractionStatusResponse {
  job_id: number;
  upload_id: string;
  status: "queued" | "running" | "done" | "failed";
  stage: "uploading" | "extracting" | "saving" | "done";
  pages_processed: number;
  total_pages: number;
  progress_percent: number;
  model?: string;
  error_message?: string;
  result?: AIUploadResult;
  source_file?: string;
  pdf_hash?: string;
  attempt_count?: number;
  created_at?: number;
  started_at?: number;
  updated_at?: number;
  last_heartbeat_at?: number;
  completed_at?: number;
}

// ── Upload & Polling ────────────────────────────────────────────────

/**
 * Upload a financial report PDF — returns quickly with a job_id.
 * The actual AI extraction runs asynchronously on the backend.
 * Poll extraction status via getExtractionStatus(job_id).
 */
export async function uploadFinancialStatement(
  stockId: number,
  file: File | Blob | string,
  fileName: string,
  mimeType: string = "application/pdf",
  options?: { signal?: AbortSignal; force?: boolean; model?: string },
): Promise<UploadJobResponse> {
  const formData = new FormData();

  if (typeof file === "string") {
    // Native: pass URI object
    formData.append("file", {
      uri: file,
      name: fileName,
      type: mimeType,
    } as unknown as Blob);
  } else {
    // Web: File or Blob already created by caller
    formData.append("file", file, fileName);
  }

  const params = new URLSearchParams();
  if (options?.force) params.set("force", "true");
  if (options?.model) params.set("model", options.model);
  const queryStr = params.toString() ? `?${params.toString()}` : "";
  const { data } = await api.post<{ status: string; data: UploadJobResponse }>(
    `/api/v1/fundamental/stocks/${stockId}/upload-statement${queryStr}`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 60_000, // Upload-only — should complete quickly
      signal: options?.signal,
    },
  );
  return data.data;
}

/**
 * Poll extraction progress for a running job.
 */
export async function getExtractionStatus(
  jobId: number | string,
): Promise<ExtractionStatusResponse> {
  const { data } = await api.get<{ status: string; data: ExtractionStatusResponse }>(
    `/api/v1/fundamental/extraction-status/${encodeURIComponent(String(jobId))}`,
  );
  return data.data;
}

/**
 * Check if a document has been previously extracted (by content hash).
 */
export async function getCachedStatement(
  stockId: number,
  fileHash: string,
): Promise<AIUploadResult | null> {
  try {
    const { data } = await api.get<{ data: AIUploadResult | null }>(
      `/api/v1/fundamental/stocks/${stockId}/cached-statement/${encodeURIComponent(fileHash)}`,
    );
    return data.data;
  } catch {
    return null;
  }
}

// ── Validation & Verification ───────────────────────────────────────

/**
 * Step 2: Validate extracted financial data against the PDF.
 */
export async function validateFinancialStatement(
  stockId: number,
  file: File | Blob | string,
  fileName: string,
  mimeType: string = "application/pdf",
): Promise<AIValidationResult> {
  const formData = new FormData();

  if (typeof file === "string") {
    formData.append("file", {
      uri: file,
      name: fileName,
      type: mimeType,
    } as unknown as Blob);
  } else {
    formData.append("file", file, fileName);
  }

  const { data } = await api.post<{ status: string; data: AIValidationResult }>(
    `/api/v1/fundamental/stocks/${stockId}/validate-statement`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120_000,
    },
  );
  return data.data;
}

/**
 * Step 3: Verify every line item is placed in the correct statement type.
 */
export async function verifyStatementPlacement(
  stockId: number,
  file: File | Blob | string,
  fileName: string,
  mimeType: string = "application/pdf",
): Promise<AIValidationResult> {
  const formData = new FormData();

  if (typeof file === "string") {
    formData.append("file", {
      uri: file,
      name: fileName,
      type: mimeType,
    } as unknown as Blob);
  } else {
    formData.append("file", file, fileName);
  }

  const { data } = await api.post<{ status: string; data: AIValidationResult }>(
    `/api/v1/fundamental/stocks/${stockId}/verify-placement`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120_000,
    },
  );
  return data.data;
}

/**
 * Step 4: AI Attribution Expert — user-triggered.
 */
export async function aiAttributeExtraction(
  stockId: number,
): Promise<AIValidationResult> {
  const { data } = await api.post<{ status: string; data: AIValidationResult }>(
    `/api/v1/fundamental/stocks/${stockId}/ai-attribute`,
    null,
    { timeout: 180_000 },
  );
  return data.data;
}

/**
 * Step 5: AI Rearrange — verify and correct year↔value placement.
 */
export async function aiRearrangeStatement(
  stockId: number,
  statementType: string,
  periods?: string[],
  pdfId?: number,
): Promise<AIValidationResult> {
  const { data } = await api.post<{ status: string; data: AIValidationResult }>(
    `/api/v1/fundamental/stocks/${stockId}/ai-rearrange`,
    {
      statement_type: statementType,
      periods: periods ?? null,
      pdf_id: pdfId ?? null,
    },
    { timeout: 300_000 },
  );
  return data.data;
}
