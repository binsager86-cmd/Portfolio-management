/**
 * Portfolio endpoints: overview, holdings, FX, accounts, stocks,
 * cash deposits CRUD + import/export, cash balances.
 */

import api from "./client";
import type {
  OverviewData,
  HoldingsResponse,
  Holding,
  AccountEntry,
  CashDepositCreate,
  CashDepositRecord,
  CashDepositListResponse,
  PortfolioCashBalance,
  StockRecord,
  StockCreate,
  StockListEntry,
} from "./types";

export type {
  PortfolioBreakdown,
  PortfolioValueEntry,
  AccountEntry,
  OverviewData,
  Holding,
  HoldingsResponse,
  CashDepositCreate,
  CashDepositRecord,
  CashDepositListResponse,
  PortfolioCashBalance,
  StockRecord,
  StockCreate,
  StockListEntry,
} from "./types";

// ── Overview & Holdings ─────────────────────────────────────────────

/** Get complete portfolio overview (all KWD). */
export async function getOverview(): Promise<OverviewData> {
  const { data } = await api.get<{ status: string; data: OverviewData }>(
    "/api/portfolio/overview"
  );
  return data.data;
}

/** Get all holdings (with KWD conversions). Optional portfolio filter. */
export async function getHoldings(
  portfolio?: string
): Promise<HoldingsResponse> {
  const params = portfolio ? { portfolio } : {};
  const { data } = await api.get<{ status: string; data: HoldingsResponse }>(
    "/api/portfolio/holdings",
    { params }
  );
  return data.data;
}

/** Get holdings for a specific portfolio table. */
export async function getPortfolioTable(
  portfolioName: string
): Promise<{
  portfolio: string;
  currency: string;
  holdings: Holding[];
  count: number;
}> {
  const { data } = await api.get<{ status: string; data: {
    portfolio: string;
    currency: string;
    holdings: Holding[];
    count: number;
  } }>(
    `/api/portfolio/table/${portfolioName}`
  );
  return data.data;
}

/** Get current USD→KWD rate. */
export async function getFxRate(): Promise<{
  usd_kwd: number;
  source: string;
}> {
  const { data } = await api.get<{ status: string; data: { usd_kwd: number; source: string } }>(
    "/api/portfolio/fx-rate"
  );
  return data.data;
}

/** Health check (no auth required). */
export async function healthCheck(): Promise<{
  status: string;
  db_exists: boolean;
}> {
  const { data } = await api.get("/health");
  return data;
}

/** Get account/cash balances. */
export async function getAccounts(): Promise<{ total_cash_kwd: number; accounts: AccountEntry[] }> {
  const { data } = await api.get<{ status: string; data: { total_cash_kwd: number; accounts: AccountEntry[] } }>("/api/portfolio/accounts");
  return data.data;
}

// ── Cash Deposit CRUD ───────────────────────────────────────────────

/** List cash deposits with optional filters. */
export async function getDeposits(params?: {
  portfolio?: string;
  page?: number;
  page_size?: number;
}): Promise<CashDepositListResponse> {
  const { data } = await api.get<{ status: string; data: CashDepositListResponse }>(
    "/api/v1/cash/deposits",
    { params }
  );
  return data.data;
}

/** Get a single cash deposit by ID. */
export async function getDeposit(depositId: number): Promise<CashDepositRecord> {
  const { data } = await api.get<{ status: string; data: CashDepositRecord }>(
    `/api/v1/cash/deposits/${depositId}`
  );
  return data.data;
}

/** Create a new cash deposit. */
export async function createDeposit(
  payload: CashDepositCreate
): Promise<{ id: number; message: string }> {
  const { data } = await api.post<{ status: string; data: { id: number; message: string } }>(
    "/api/v1/cash/deposits",
    payload
  );
  return data.data;
}

/** Update a cash deposit. */
export async function updateDeposit(
  depositId: number,
  payload: Partial<CashDepositCreate>
): Promise<{ id: number; message: string }> {
  const { data } = await api.put<{ status: string; data: { id: number; message: string } }>(
    `/api/v1/cash/deposits/${depositId}`,
    payload
  );
  return data.data;
}

/** Soft-delete a cash deposit. */
export async function deleteDeposit(depositId: number): Promise<void> {
  await api.delete(`/api/v1/cash/deposits/${depositId}`);
}

/** Restore a soft-deleted cash deposit. */
export async function restoreDeposit(depositId: number): Promise<{ id: number; message: string }> {
  const { data } = await api.post<{ status: string; data: { id: number; message: string } }>(
    `/api/v1/cash/deposits/${depositId}/restore`
  );
  return data.data;
}

/** Export deposits as Excel file. Returns blob for download. */
export async function exportDepositsExcel(): Promise<Blob> {
  const { data } = await api.get("/api/v1/cash/deposits-export", {
    responseType: "blob",
  });
  return data;
}

/** Download sample template for deposit uploads. Returns blob. */
export async function downloadDepositsTemplate(): Promise<Blob> {
  const { data } = await api.get("/api/v1/cash/deposits-template", {
    responseType: "blob",
  });
  return data;
}

/** Import deposits from Excel upload. */
export async function importDepositsExcel(
  file: FormData,
  mode: "merge" | "replace" = "merge",
): Promise<{
  imported: number;
  skipped: number;
  total_rows: number;
  errors: Array<{ row: number; error: string }>;
  mode: string;
}> {
  const { data } = await api.post<{
    status: string;
    data: {
      imported: number;
      skipped: number;
      total_rows: number;
      errors: Array<{ row: number; error: string }>;
      mode: string;
    };
  }>(
    "/api/v1/cash/deposits-import",
    file,
    {
      headers: { "Content-Type": "multipart/form-data" },
      params: { mode },
    }
  );
  return data.data;
}

// ── Cash Balance API ────────────────────────────────────────────────

/** Get computed cash balances for all portfolios. */
export async function getCashBalances(
  force?: boolean
): Promise<Record<string, PortfolioCashBalance>> {
  const params = force ? { force: true } : {};
  const { data } = await api.get<{ status: string; data: Record<string, PortfolioCashBalance> }>(
    "/api/v1/analytics/cash-balances",
    { params }
  );
  return data.data;
}

/** Manually set/override cash balance for a portfolio. */
export async function setCashOverride(
  portfolio: string,
  balance: number,
  currency: string = "KWD"
): Promise<{ portfolio: string; balance: number; manual_override: boolean }> {
  const { data } = await api.put<{
    status: string;
    data: { portfolio: string; balance: number; currency: string; manual_override: boolean };
  }>(`/api/v1/analytics/cash-balances/${portfolio}`, { balance, currency });
  return data.data;
}

/** Clear manual override for a portfolio's cash balance. */
export async function clearCashOverride(
  portfolio: string
): Promise<{ portfolio: string; balance: number; manual_override: boolean }> {
  const { data } = await api.delete<{
    status: string;
    data: { portfolio: string; balance: number; manual_override: boolean };
  }>(`/api/v1/analytics/cash-balances/${portfolio}/override`);
  return data.data;
}

// ── Stock CRUD ──────────────────────────────────────────────────────

/** List all stocks. */
export async function getStocks(params?: {
  portfolio?: string;
  search?: string;
}): Promise<{ stocks: StockRecord[]; count: number }> {
  const { data } = await api.get<{ status: string; data: { stocks: StockRecord[]; count: number } }>(
    "/api/v1/stocks",
    { params }
  );
  return data.data;
}

/** Get stock by symbol. */
export async function getStockBySymbol(symbol: string): Promise<StockRecord> {
  const { data } = await api.get<{ status: string; data: StockRecord }>(
    `/api/v1/stocks/by-symbol/${symbol}`
  );
  return data.data;
}

/** Create a new stock entry. */
export async function createStock(payload: StockCreate): Promise<{ id: number; symbol: string; message: string }> {
  const { data } = await api.post<{ status: string; data: { id: number; symbol: string; message: string } }>(
    "/api/v1/stocks",
    payload
  );
  return data.data;
}

/** Update stock metadata. */
export async function updateStock(stockId: number, payload: Partial<StockCreate>): Promise<{ id: number; message: string }> {
  const { data } = await api.put<{ status: string; data: { id: number; message: string } }>(
    `/api/v1/stocks/${stockId}`,
    payload
  );
  return data.data;
}

/** Rename a stock by symbol (inline edit from trading table). */
export async function renameStockBySymbol(
  symbol: string,
  name: string
): Promise<{ stock_id: number; symbol: string; name: string; message: string }> {
  const { data } = await api.patch<{
    status: string;
    data: { stock_id: number; symbol: string; name: string; message: string };
  }>("/api/v1/portfolio/rename-stock", null, {
    params: { symbol, name },
  });
  return data.data;
}

/** Delete stock. */
export async function deleteStock(stockId: number): Promise<void> {
  await api.delete(`/api/v1/stocks/${stockId}`);
}

/** Merge two stock records: move all transactions from source into target, delete source. */
export async function mergeStocks(
  sourceStockId: number,
  targetStockId: number
): Promise<{ message: string; source_symbol: string; target_symbol: string; transactions_moved: number }> {
  const { data } = await api.post<{
    status: string;
    data: { message: string; source_symbol: string; target_symbol: string; transactions_moved: number };
  }>("/api/v1/stocks/merge", {
    source_stock_id: sourceStockId,
    target_stock_id: targetStockId,
  });
  return data.data;
}

/** Trigger price update for all stocks. */
export async function updatePrices(): Promise<{ message: string }> {
  const { data } = await api.post<{ status: string; data: { message: string } }>(
    "/api/v1/stocks/update-prices"
  );
  return data.data;
}

/** Get hardcoded stock reference list for Kuwait or US market. */
export async function getStockList(params?: {
  market?: string;
  search?: string;
}): Promise<{ stocks: StockListEntry[]; count: number; market: string }> {
  const { data } = await api.get<{
    status: string;
    data: { stocks: StockListEntry[]; count: number; market: string };
  }>("/api/v1/stocks/stock-list", { params });
  return data.data;
}

/** Fetch latest price for a single ticker via yfinance. */
export async function fetchStockPrice(
  yf_ticker: string,
  currency: string = "KWD"
): Promise<{ price: number | null; ticker: string; message?: string }> {
  const { data } = await api.post<{
    status: string;
    data: { price: number | null; ticker: string; message?: string };
  }>("/api/v1/stocks/fetch-price", { yf_ticker, currency });
  return data.data;
}

/** Export holdings as Excel file. Optionally filter by portfolio. */
export async function exportHoldingsExcel(portfolio?: string): Promise<Blob> {
  const params = portfolio ? { portfolio } : {};
  const { data } = await api.get("/api/v1/portfolio/holdings-export", {
    responseType: "blob",
    params,
  });
  return data;
}
