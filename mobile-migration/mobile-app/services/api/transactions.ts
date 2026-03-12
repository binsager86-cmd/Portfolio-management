/**
 * Transaction CRUD, bulk operations, and import.
 */

import api from "./client";
import type {
  TransactionCreate,
  TransactionListResponse,
  TransactionMutationResponse,
  TransactionImportResult,
  TransactionRecord,
} from "./types";

export type { TransactionCreate, TransactionRecord, TransactionListResponse, TransactionMutationResponse, TransactionImportResult };

// ── API functions ───────────────────────────────────────────────────

/** List transactions with optional filters. */
export async function getTransactions(params?: {
  portfolio?: string;
  symbol?: string;
  page?: number;
  per_page?: number;
}): Promise<TransactionListResponse> {
  const { data } = await api.get<{ status: string; data: TransactionListResponse }>(
    "/api/v1/portfolio/transactions",
    { params }
  );
  return data.data;
}

/** Get a single transaction by ID. */
export async function getTransaction(txnId: number): Promise<TransactionRecord> {
  const { data } = await api.get<{ status: string; data: TransactionRecord }>(
    `/api/v1/portfolio/transactions/${txnId}`
  );
  return data.data;
}

/** Create a new transaction. */
export async function createTransaction(
  payload: TransactionCreate
): Promise<TransactionMutationResponse> {
  const { data } = await api.post<{ status: string; data: TransactionMutationResponse }>(
    "/api/v1/portfolio/transactions",
    payload
  );
  return data.data;
}

/** Update an existing transaction. */
export async function updateTransaction(
  txnId: number,
  payload: Partial<TransactionCreate>
): Promise<TransactionMutationResponse> {
  const { data } = await api.put<{ status: string; data: TransactionMutationResponse }>(
    `/api/v1/portfolio/transactions/${txnId}`,
    payload
  );
  return data.data;
}

/** Soft-delete a transaction. */
export async function deleteTransaction(txnId: number): Promise<TransactionMutationResponse> {
  const { data } = await api.delete<{ status: string; data: TransactionMutationResponse }>(
    `/api/v1/portfolio/transactions/${txnId}`
  );
  return data.data;
}

/** Restore a soft-deleted transaction. */
export async function restoreTransaction(txnId: number): Promise<TransactionMutationResponse> {
  const { data } = await api.post<{ status: string; data: TransactionMutationResponse }>(
    `/api/v1/portfolio/transactions/${txnId}/restore`
  );
  return data.data;
}

/** Delete all transactions (soft-delete). */
export async function deleteAllTransactions(): Promise<{ deleted_count: number; message: string }> {
  const { data } = await api.delete<{ status: string; data: { deleted_count: number; message: string } }>(
    "/api/v1/portfolio/transactions"
  );
  return data.data;
}

/** Import transactions from Excel with mode (merge | replace). */
export async function importTransactions(
  file: File,
  portfolio: string,
  mode: "merge" | "replace" = "merge",
  sheetName?: string,
): Promise<TransactionImportResult> {
  const formData = new FormData();
  formData.append("file", file);
  const params: Record<string, string> = { portfolio, mode };
  if (sheetName) params.sheet_name = sheetName;
  const { data } = await api.post<{ status: string; data: TransactionImportResult }>(
    "/api/v1/backup/import",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      params,
    }
  );
  return data.data;
}
