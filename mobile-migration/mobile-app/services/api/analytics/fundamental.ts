/**
 * Fundamental analysis: stock CRUD, statements, line items, audit & PDFs.
 */

import api from "../client";
import type { AnalysisStock, FinancialStatement } from "../types";

// ── Analysis Stocks ─────────────────────────────────────────────────

/** List analysis stocks. */
export async function getAnalysisStocks(params?: { search?: string }): Promise<{ stocks: AnalysisStock[]; count: number }> {
  const { data } = await api.get<{ status: string; data: { stocks: AnalysisStock[]; count: number } }>(
    "/api/v1/fundamental/stocks",
    { params },
  );
  return data.data;
}

/** Get single analysis stock with summary. */
export async function getAnalysisStock(stockId: number): Promise<AnalysisStock> {
  const { data } = await api.get<{ status: string; data: AnalysisStock }>(
    `/api/v1/fundamental/stocks/${stockId}`,
  );
  return data.data;
}

/** Create analysis stock. */
export async function createAnalysisStock(payload: {
  symbol: string;
  company_name: string;
  exchange?: string;
  currency?: string;
  sector?: string;
  industry?: string;
  country?: string;
  outstanding_shares?: number;
}): Promise<{ id: number; symbol: string; message: string }> {
  const { data } = await api.post<{ status: string; data: { id: number; symbol: string; message: string } }>(
    "/api/v1/fundamental/stocks",
    payload,
  );
  return data.data;
}

/** Update analysis stock. */
export async function updateAnalysisStock(
  stockId: number,
  payload: Partial<{
    company_name: string;
    exchange: string;
    currency: string;
    sector: string;
    industry: string;
    outstanding_shares: number;
  }>,
): Promise<{ message: string }> {
  const { data } = await api.put<{ status: string; data: { message: string } }>(
    `/api/v1/fundamental/stocks/${stockId}`,
    payload,
  );
  return data.data;
}

/** Delete analysis stock (cascade). */
export async function deleteAnalysisStock(stockId: number): Promise<void> {
  await api.delete(`/api/v1/fundamental/stocks/${stockId}`);
}

// ── Statements & Line Items ─────────────────────────────────────────

/** Get financial statements with line items. */
export async function getStatements(
  stockId: number,
  statementType?: string,
): Promise<{ statements: FinancialStatement[]; count: number }> {
  const { data } = await api.get<{ status: string; data: { statements: FinancialStatement[]; count: number } }>(
    `/api/v1/fundamental/stocks/${stockId}/statements`,
    { params: statementType ? { statement_type: statementType } : undefined },
  );
  return data.data;
}

/** Create / upsert a financial statement with optional line items. */
export async function createStatement(
  stockId: number,
  payload: {
    statement_type: string;
    fiscal_year: number;
    fiscal_quarter?: number;
    period_end_date: string;
    extracted_by?: string;
    notes?: string;
    line_items?: Array<{ code: string; name: string; amount: number; is_total?: boolean }>;
  },
): Promise<{ id: number; message: string }> {
  const { data } = await api.post<{ status: string; data: { id: number; message: string } }>(
    `/api/v1/fundamental/stocks/${stockId}/statements`,
    payload,
  );
  return data.data;
}

/** Delete a financial statement. */
export async function deleteStatement(stockId: number, statementId: number): Promise<void> {
  await api.delete(`/api/v1/fundamental/stocks/${stockId}/statements/${statementId}`);
}

/** Update a single line item amount. */
export async function updateLineItem(
  itemId: number,
  amount: number,
): Promise<{ message: string }> {
  const { data } = await api.put<{ status: string; data: { message: string } }>(
    `/api/v1/fundamental/line-items/${itemId}`,
    { amount },
  );
  return data.data;
}

/** Log a change to a statement line item for audit trail. */
export async function logStatementChange(
  stockId: number,
  statementId: number,
  lineItemId: number,
  action: "extracted" | "validated" | "manually_edited" | "ai_corrected",
  oldValue: number | null,
  newValue: number,
  changedBy: "ai" | "user",
  notes?: string,
): Promise<{ id: number; message: string }> {
  const { data } = await api.post<{ status: string; data: { id: number; message: string } }>(
    `/api/v1/fundamental/stocks/${stockId}/statements/${statementId}/line-items/${lineItemId}/audit`,
    {
      action,
      old_value: oldValue,
      new_value: newValue,
      changed_by: changedBy,
      notes,
    },
  );
  return data.data;
}

// ── PDF file management ─────────────────────────────────────────────

export interface SavedPdf {
  id: number;
  original_name: string;
  file_size: number;
  created_at: number;
}

/** List all saved PDFs for a stock. */
export async function listStockPdfs(stockId: number): Promise<SavedPdf[]> {
  const { data } = await api.get<{ status: string; data: SavedPdf[] }>(
    `/api/v1/fundamental/stocks/${stockId}/pdfs`,
  );
  return data.data;
}

/** Get the download URL for a saved PDF. */
export function getStockPdfDownloadUrl(stockId: number, pdfId: number): string {
  return `/api/v1/fundamental/stocks/${stockId}/pdfs/${pdfId}/download`;
}

/** Download a saved PDF and trigger browser download (web) or return blob. */
export async function downloadStockPdf(stockId: number, pdfId: number, filename: string): Promise<void> {
  const response = await api.get(
    `/api/v1/fundamental/stocks/${stockId}/pdfs/${pdfId}/download`,
    { responseType: "blob" },
  );
  const blob = new Blob([response.data], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Delete a saved PDF. */
export async function deleteStockPdf(stockId: number, pdfId: number): Promise<void> {
  await api.delete(`/api/v1/fundamental/stocks/${stockId}/pdfs/${pdfId}`);
}
