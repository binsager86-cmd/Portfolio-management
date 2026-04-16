/**
 * Dividend & bonus share endpoints.
 */

import api from "../client";
import type {
  BonusSharesResponse,
  DividendByStock,
  DividendListResponse,
} from "../types";

/** List all dividend entries. */
export async function getDividends(params?: {
  stock_symbol?: string;
  page?: number;
  page_size?: number;
}): Promise<DividendListResponse> {
  const { data } = await api.get<{ status: string; data: DividendListResponse }>(
    "/api/v1/dividends",
    { params }
  );
  return data.data;
}

/** Dividends grouped by stock with yield on cost. */
export async function getDividendsByStock(): Promise<{ stocks: DividendByStock[]; count: number }> {
  const { data } = await api.get<{ status: string; data: { stocks: DividendByStock[]; count: number } }>(
    "/api/v1/dividends/by-stock"
  );
  return data.data;
}

/** List bonus share transactions. */
export async function getBonusShares(params?: {
  page?: number;
  page_size?: number;
}): Promise<BonusSharesResponse> {
  const { data } = await api.get<{ status: string; data: BonusSharesResponse }>(
    "/api/v1/dividends/bonus-shares",
    { params }
  );
  return data.data;
}

/** Soft-delete a dividend record. */
export async function deleteDividend(dividendId: number): Promise<void> {
  await api.delete(`/api/v1/dividends/${dividendId}`);
}
