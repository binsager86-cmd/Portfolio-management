/**
 * Financial Extraction — single-step AI extraction.
 *
 * Uploads PDF → Gemini extracts financial data with self-audit.
 */

import { uploadFinancialStatement } from "./analytics";
import type { AIUploadResult } from "./types";

export interface ExtractionProgress {
  isProcessing: boolean;
  result?: AIUploadResult;
  /** Elapsed time in milliseconds */
  elapsedMs?: number;
}

export type OnProgressChange = (progress: ExtractionProgress) => void;

/**
 * Run the extraction step: upload PDF → AI extracts financials.
 */
export async function runExtraction(
  stockId: number,
  fileUri: string,
  fileName: string,
  mimeType: string = "application/pdf",
  onProgress?: OnProgressChange,
): Promise<{ result: AIUploadResult; elapsedMs: number }> {
  onProgress?.({ isProcessing: true });

  const t0 = Date.now();
  const result = await uploadFinancialStatement(stockId, fileUri, fileName, mimeType);
  const elapsedMs = Date.now() - t0;

  onProgress?.({ isProcessing: false, result, elapsedMs });
  return { result, elapsedMs };
}
