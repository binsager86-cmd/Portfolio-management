/**
 * Axios API client for the Portfolio FastAPI backend (v1).
 *
 * - Automatically attaches the JWT Bearer token to every request.
 * - On 401, attempts a silent refresh using the stored refresh token.
 * - Provides typed helper functions for each endpoint.
 */

import axios, {
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from "axios";
import { API_BASE_URL, API_TIMEOUT } from "@/constants/Config";
import {
  getToken,
  setToken,
  getRefreshToken,
  setRefreshToken,
  removeToken,
  removeRefreshToken,
} from "./tokenStorage";
import { useAuthStore } from "./authStore";

// ── Axios instance ──────────────────────────────────────────────────

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: API_TIMEOUT,
  headers: { "Content-Type": "application/json" },
});

// ── Request interceptor: attach access token ────────────────────────

api.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getToken();
  if (token && config.headers) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// ── Response interceptor: silent refresh on 401 ─────────────────────

let isRefreshing = false;
let refreshSubscribers: Array<(token: string) => void> = [];

function subscribeTokenRefresh(cb: (token: string) => void) {
  refreshSubscribers.push(cb);
}

function onTokenRefreshed(newToken: string) {
  refreshSubscribers.forEach((cb) => cb(newToken));
  refreshSubscribers = [];
}

api.interceptors.response.use(
  (response: AxiosResponse) => response,
  async (error: AxiosError) => {
    const originalRequest = error.config as InternalAxiosRequestConfig & {
      _retry?: boolean;
    };

    // Only attempt refresh on 401 and if we haven't retried yet
    if (error.response?.status !== 401 || originalRequest._retry) {
      return Promise.reject(error);
    }

    // Don't refresh on auth endpoints themselves
    const url = originalRequest.url ?? "";
    if (url.includes("/auth/login") || url.includes("/auth/refresh")) {
      return Promise.reject(error);
    }

    originalRequest._retry = true;

    if (!isRefreshing) {
      isRefreshing = true;
      try {
        const refreshTok = await getRefreshToken();
        if (!refreshTok) {
          throw new Error("No refresh token");
        }

        const { data } = await axios.post<RefreshResponse>(
          `${API_BASE_URL}/api/v1/auth/refresh`,
          { refresh_token: refreshTok },
          { headers: { "Content-Type": "application/json" } }
        );

        await setToken(data.access_token);
        onTokenRefreshed(data.access_token);

        // Retry the original request with the new token
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${data.access_token}`;
        }
        return api(originalRequest);
      } catch {
        // Refresh failed — clear tokens and reset auth state
        // This triggers the auth guard redirect to login
        await removeToken();
        await removeRefreshToken();
        useAuthStore.getState().logout();
        refreshSubscribers = [];
        return Promise.reject(error);
      } finally {
        isRefreshing = false;
      }
    }

    // Another request is already refreshing — queue and wait
    return new Promise<AxiosResponse>((resolve) => {
      subscribeTokenRefresh((newToken: string) => {
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`;
        }
        resolve(api(originalRequest));
      });
    });
  }
);

// ── Types ───────────────────────────────────────────────────────────

export interface LoginResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  user_id: number;
  username: string;
  name?: string;
}

export interface RefreshResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
}

export interface OverviewData {
  total_deposits: number;
  total_withdrawals: number;
  net_deposits: number;
  total_invested: number;
  total_divested: number;
  total_dividends: number;
  total_fees: number;
  transaction_count: number;
  portfolio_value: number;
  cash_balance: number;
  total_value: number;
  total_gain: number;
  roi_percent: number;
  usd_kwd_rate: number;
  by_portfolio: Record<string, any>;
  portfolio_values: Record<string, any>;
  accounts: any[];
  // Daily movement (live value vs previous snapshot)
  daily_movement?: number;
  daily_movement_pct?: number;
  prev_snapshot_value?: number;
  prev_snapshot_date?: string;
  // CAGR (CFA: first deposit → current)
  cagr_percent?: number;
  cagr_years?: number;
  cagr_start_value?: number;
  cagr_start_date?: string;
}

export interface Holding {
  company: string;
  symbol: string;
  pe_ratio: number | null;
  shares_qty: number;
  avg_cost: number;
  total_cost: number;
  market_price: number;
  market_value: number;
  unrealized_pnl: number;
  realized_pnl: number;
  cash_dividends: number;
  reinvested_dividends: number;
  bonus_dividend_shares: number;
  bonus_share_value: number;
  dividend_yield_on_cost_pct: number;
  total_pnl: number;
  pnl_pct: number;
  currency: string;
  market_value_kwd: number;
  unrealized_pnl_kwd: number;
  total_pnl_kwd: number;
  total_cost_kwd: number;
  weight_by_cost: number;
  weighted_dividend_yield_on_cost: number;
}

export interface HoldingsResponse {
  holdings: Holding[];
  totals: {
    total_market_value_kwd: number;
    total_cost_kwd: number;
    total_unrealized_pnl_kwd: number;
    total_realized_pnl_kwd: number;
    total_pnl_kwd: number;
    total_dividends_kwd: number;
  };
  total_portfolio_value_kwd: number;
  cash_balance_kwd: number;
  usd_kwd_rate: number;
  count: number;
}

// ── API functions ───────────────────────────────────────────────────

/** Login using JSON body (v1). Returns JWT access + refresh tokens + user info. */
export async function login(
  username: string,
  password: string
): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/api/v1/auth/login", {
    username,
    password,
  });
  return data;
}

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
  const { data } = await api.get<{ status: string; data: any }>(
    `/api/portfolio/table/${portfolioName}`
  );
  return data.data;
}

/** Get current USD→KWD rate. */
export async function getFxRate(): Promise<{
  usd_kwd: number;
  source: string;
}> {
  const { data } = await api.get<{ status: string; data: any }>(
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

// ── Transaction types ───────────────────────────────────────────────

export interface TransactionCreate {
  portfolio: string;
  stock_symbol: string;
  txn_date: string; // YYYY-MM-DD
  txn_type: "Buy" | "Sell" | "DIVIDEND_ONLY";
  shares: number;
  purchase_cost?: number | null;
  sell_value?: number | null;
  bonus_shares?: number | null;
  cash_dividend?: number | null;
  reinvested_dividend?: number | null;
  fees?: number | null;
  price_override?: number | null;
  planned_cum_shares?: number | null;
  broker?: string | null;
  reference?: string | null;
  notes?: string | null;
}

export interface TransactionRecord {
  id: number;
  user_id: number;
  portfolio: string;
  stock_symbol: string;
  txn_date: string;
  txn_type: string;
  shares: number;
  purchase_cost: number | null;
  sell_value: number | null;
  bonus_shares: number | null;
  cash_dividend: number | null;
  reinvested_dividend: number | null;
  fees: number | null;
  price_override: number | null;
  planned_cum_shares: number | null;
  broker: string | null;
  reference: string | null;
  notes: string | null;
  category: string | null;
  is_deleted: boolean;
  created_at: number;
}

export interface TransactionListResponse {
  transactions: TransactionRecord[];
  count: number;
  pagination: {
    page: number;
    per_page: number;
    total_pages: number;
    total_items: number;
  };
}

/** Response from create / update / delete / restore mutations. */
export interface TransactionMutationResponse {
  id: number;
  message: string;
  cash_balance: number;
  total_value: number;
}

// ── Transaction API functions ───────────────────────────────────────

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

// ── Cash Deposit types ──────────────────────────────────────────────

export interface CashDepositCreate {
  portfolio: string;
  deposit_date: string; // YYYY-MM-DD
  amount: number;
  currency?: string;
  bank_name?: string | null;
  source?: string; // "deposit" | "withdrawal"
  notes?: string | null;
}

export interface CashDepositRecord {
  id: number;
  user_id: number;
  portfolio: string;
  deposit_date: string;
  amount: number;
  currency: string;
  bank_name: string | null;
  source: string | null;
  notes: string | null;
  is_deleted: number;
  created_at: number | null;
}

export interface CashDepositListResponse {
  deposits: CashDepositRecord[];
  count: number;
  total_kwd: number;
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}

// ── Cash Deposit API functions ──────────────────────────────────────

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

// ── Portfolio Cash Balances ─────────────────────────────────────────

export interface PortfolioCashBalance {
  balance: number;
  currency: string;
  manual_override: boolean;
}

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

// ── Analytics types & API ───────────────────────────────────────────

export interface PerformanceData {
  period: string;
  start_date: string;
  end_date: string;
  twr_percent: number;
  mwrr_percent: number;
  roi_percent: number;
  total_gain_kwd: number;
  starting_value: number;
  ending_value: number;
  net_deposits: number;
  snapshots_count: number;
}

export interface RiskMetrics {
  sharpe_ratio: number;
  sortino_ratio: number;
  rf_rate: number;
  mar: number;
}

export interface RealizedProfitDetail {
  id: number;
  symbol: string;
  portfolio: string;
  txn_date: string;
  shares: number;
  sell_value: number;
  avg_cost_at_txn: number;
  realized_pnl: number;
  realized_pnl_kwd: number;
  currency: string;
  source: string;
}

export interface RealizedProfitData {
  total_realized_kwd: number;
  total_profit_kwd: number;
  total_loss_kwd: number;
  details: RealizedProfitDetail[];
}

export interface SnapshotRecord {
  id: number;
  snapshot_date: string;
  portfolio_value: number;
  daily_movement: number;
  beginning_difference: number | null;
  deposit_cash: number;
  accumulated_cash: number;
  net_gain: number;
  change_percent: number;
  roi_percent: number;
  twr_percent: number | null;
  mwrr_percent: number | null;
  created_at: number;
}

/** Get portfolio performance (TWR, MWRR, ROI). */
export async function getPerformance(params?: {
  portfolio?: string;
  period?: string;
}): Promise<PerformanceData> {
  const { data } = await api.get<{ status: string; data: PerformanceData }>(
    "/api/v1/analytics/performance",
    { params }
  );
  return data.data;
}

/** Get risk metrics (Sharpe, Sortino). */
export async function getRiskMetrics(params: {
  rf_rate: number;
  mar?: number;
}): Promise<RiskMetrics> {
  const { data } = await api.get<{ status: string; data: RiskMetrics }>(
    "/api/v1/analytics/risk-metrics",
    { params }
  );
  return data.data;
}

/** Get stored risk-free rate for current user. */
export async function getRfRate(): Promise<number | null> {
  const { data } = await api.get<{ status: string; data: { rf_rate: number | null } }>(
    "/api/v1/analytics/settings/rf-rate"
  );
  return data.data.rf_rate;
}

/** Save risk-free rate for current user (percentage, e.g. 4.25). */
export async function setRfRate(rfRate: number): Promise<number> {
  const { data } = await api.put<{ status: string; data: { rf_rate: number } }>(
    "/api/v1/analytics/settings/rf-rate",
    null,
    { params: { rf_rate: rfRate } }
  );
  return data.data.rf_rate;
}

/** Get realized profit breakdown. */
export async function getRealizedProfit(): Promise<RealizedProfitData> {
  const { data } = await api.get<{ status: string; data: RealizedProfitData }>(
    "/api/v1/analytics/realized-profit"
  );
  return data.data;
}

/** Get portfolio snapshots (date-filtered). */
export async function getSnapshots(params?: {
  portfolio?: string;
  start_date?: string;
  end_date?: string;
}): Promise<{ snapshots: SnapshotRecord[]; count: number }> {
  const { data } = await api.get<{ status: string; data: { snapshots: SnapshotRecord[]; count: number } }>(
    "/api/v1/analytics/snapshots",
    { params }
  );
  return data.data;
}

// ── Trading Section types & API ─────────────────────────────────────

export interface TradingSummary {
  total_buys: number;
  buy_count: number;
  total_sells: number;
  sell_count: number;
  total_deposits: number;
  deposit_count: number;
  total_withdrawals: number;
  withdrawal_count: number;
  unrealized_pnl: number;
  realized_pnl: number;
  total_pnl: number;
  total_dividends: number;
  dividend_count: number;
  total_fees: number;
  net_cash_flow: number;
  total_return_pct: number;
  total_transactions: number;
  total_trades: number;
}

export interface TradingTransaction {
  id: number;
  date: string | null;
  symbol: string | null;
  portfolio: string;
  type: string;
  status: string;
  source: string;
  quantity: number;
  avg_cost: number;
  price: number;
  current_price: number;
  sell_price: number;
  value: number;
  pnl: number;
  pnl_pct: number;
  fees: number;
  dividend: number;
  bonus_shares: number;
  notes: string | null;
}

export interface TradingSummaryResponse {
  summary: TradingSummary;
  transactions: TradingTransaction[];
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}

/** Get trading section summary with enriched transactions. */
export async function getTradingSummary(params?: {
  portfolio?: string;
  txn_type?: string;
  search?: string;
  source?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}): Promise<TradingSummaryResponse> {
  const { data } = await api.get<{ status: string; data: TradingSummaryResponse }>(
    "/api/v1/portfolio/trading-summary",
    { params }
  );
  return data.data;
}

/** Recalculate WAC for all positions and backfill avg_cost columns. */
export async function recalculateWAC(): Promise<{
  updated: number;
  positions_processed: number;
  errors: string[];
}> {
  const { data } = await api.post<{
    status: string;
    data: { updated: number; positions_processed: number; errors: string[] };
  }>("/api/v1/portfolio/trading-recalculate");
  return data.data;
}

/** Export trading data as Excel file. Returns blob URL for download/sharing. */
export async function exportTradingExcel(): Promise<Blob> {
  const { data } = await api.get("/api/v1/portfolio/trading-export", {
    responseType: "blob",
  });
  return data;
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

// ── Dividends types & API ───────────────────────────────────────────

export interface DividendRecord {
  id: number;
  stock_symbol: string;
  portfolio: string;
  txn_date: string;
  cash_dividend: number;
  bonus_shares: number;
  reinvested_dividend: number;
  currency: string;
  cash_dividend_kwd: number;
  reinvested_kwd: number;
  notes: string | null;
}

export interface DividendListResponse {
  dividends: DividendRecord[];
  count: number;
  totals: {
    total_cash_dividend_kwd: number;
    total_bonus_shares: number;
    total_reinvested_kwd: number;
    unique_stocks: number;
  };
  pagination: { page: number; page_size: number; total_items: number; total_pages: number };
}

export interface DividendByStock {
  stock_symbol: string;
  total_cash_dividend_kwd: number;
  total_bonus_shares: number;
  total_reinvested_kwd: number;
  dividend_count: number;
  total_cost: number;
  yield_on_cost_pct: number;
}

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

// ── Bonus Shares types & API ────────────────────────────────────────

export interface BonusShareRecord {
  id: number;
  stock_symbol: string;
  portfolio: string;
  txn_date: string;
  bonus_shares: number;
  shares: number;
  currency: string;
  notes: string | null;
}

export interface BonusByStock {
  stock_symbol: string;
  total_bonus_shares: number;
  bonus_count: number;
}

export interface BonusSharesResponse {
  records: BonusShareRecord[];
  count: number;
  total_bonus_shares: number;
  by_stock: BonusByStock[];
  pagination?: { page: number; page_size: number; total_items: number; total_pages: number };
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

// ── Stocks types & API ──────────────────────────────────────────────

export interface StockRecord {
  id: number;
  symbol: string;
  name: string | null;
  portfolio: string;
  currency: string;
  current_price: number | null;
  yf_ticker: string | null;
  tradingview_symbol: string | null;
  tradingview_exchange: string | null;
  price_source: string | null;
  last_updated: string | null;
}

export interface StockCreate {
  symbol: string;
  name?: string;
  portfolio: string;
  currency?: string;
  current_price?: number;
  yf_ticker?: string;
}

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

/** Delete stock. */
export async function deleteStock(stockId: number): Promise<void> {
  await api.delete(`/api/v1/stocks/${stockId}`);
}

/** Trigger price update for all stocks. */
export async function updatePrices(): Promise<{ message: string }> {
  const { data } = await api.post<{ status: string; data: { message: string } }>(
    "/api/v1/stocks/update-prices"
  );
  return data.data;
}

// ── Stock Reference List & Price Fetch ──────────────────────────────

export interface StockListEntry {
  symbol: string;
  name: string;
  yf_ticker: string;
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

// ── Portfolio Tracker API ───────────────────────────────────────────

export interface SaveSnapshotResponse {
  id: number;
  snapshot_date: string;
  portfolio_value: number;
  daily_movement: number;
  beginning_difference: number;
  deposit_cash: number;
  accumulated_cash: number;
  net_gain: number;
  roi_percent: number;
  change_percent: number;
  action: string;
  message: string;
}

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
    { timeout: 120_000 }, // allow up to 2 min — live valuation can be slow
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

/** Recalculate all snapshot metrics (daily_movement, beginning_diff, accumulated_cash, net_gain, etc). */
export async function recalculateSnapshots(): Promise<{ updated: number; message: string }> {
  const { data } = await api.post<{ status: string; data: { updated: number; message: string } }>(
    "/api/v1/tracker/recalculate",
    {},
    { timeout: 120_000 }, // allow up to 2 min for large snapshot sets
  );
  return data.data;
}

// ── Integrity API ───────────────────────────────────────────────────

/** Run full integrity check. */
export async function integrityCheck(): Promise<any> {
  const { data } = await api.get<{ status: string; data: any }>(
    "/api/v1/integrity/check"
  );
  return data.data;
}

/** Check cash balance for a portfolio. */
export async function checkCashIntegrity(portfolio: string): Promise<any> {
  const { data } = await api.get<{ status: string; data: any }>(
    `/api/v1/integrity/cash/${portfolio}`
  );
  return data.data;
}

// ── Backup & Restore API ────────────────────────────────────────────

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
): Promise<any> {
  const params: Record<string, string> = { mode };
  if (sheetName) params.sheet_name = sheetName;
  const { data } = await api.post<{ status: string; data: any }>(
    "/api/v1/backup/import",
    file,
    {
      headers: { "Content-Type": "multipart/form-data" },
      params,
    }
  );
  return data.data;
}

// ── PFM types & API ────────────────────────────────────────────────

export interface PfmSnapshotSummary {
  id: number;
  snapshot_date: string;
  notes: string | null;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  created_at: number;
}

export interface PfmAsset {
  asset_type: string;
  category: string;
  name: string;
  quantity: number;
  price: number;
  currency: string;
  value_kwd: number;
}

export interface PfmLiability {
  category: string;
  amount_kwd: number;
  is_current: boolean;
  is_long_term: boolean;
}

export interface PfmIncomeExpense {
  kind: string;
  category: string;
  monthly_amount: number;
  is_finance_cost: boolean;
  is_gna: boolean;
  sort_order: number;
}

export interface PfmSnapshotFull extends PfmSnapshotSummary {
  assets: PfmAsset[];
  liabilities: PfmLiability[];
  income_expenses: PfmIncomeExpense[];
}

/** List PFM snapshots. */
export async function getPfmSnapshots(params?: {
  page?: number;
  page_size?: number;
}): Promise<{ snapshots: PfmSnapshotSummary[]; count: number; pagination: any }> {
  const { data } = await api.get<{ status: string; data: any }>(
    "/api/v1/pfm/snapshots",
    { params }
  );
  return data.data;
}

/** Get full PFM snapshot with assets/liabilities/income. */
export async function getPfmSnapshot(snapshotId: number): Promise<PfmSnapshotFull> {
  const { data } = await api.get<{ status: string; data: PfmSnapshotFull }>(
    `/api/v1/pfm/snapshots/${snapshotId}`
  );
  return data.data;
}

/** Create PFM snapshot. */
export async function createPfmSnapshot(payload: {
  snapshot_date: string;
  notes?: string;
  assets: Omit<PfmAsset, "value_kwd">[];
  liabilities: PfmLiability[];
  income_expenses: PfmIncomeExpense[];
}): Promise<{ id: number; net_worth: number; message: string }> {
  const { data } = await api.post<{ status: string; data: any }>(
    "/api/v1/pfm/snapshots",
    payload
  );
  return data.data;
}

/** Delete PFM snapshot. */
export async function deletePfmSnapshot(snapshotId: number): Promise<void> {
  await api.delete(`/api/v1/pfm/snapshots/${snapshotId}`);
}

// ── Fundamental Analysis API ─────────────────────────────────────────

export interface AnalysisStock {
  id: number;
  user_id: number;
  symbol: string;
  company_name: string;
  exchange: string;
  currency: string;
  sector: string | null;
  industry: string | null;
  country: string | null;
  isin: string | null;
  cik: string | null;
  description: string | null;
  website: string | null;
  outstanding_shares: number | null;
  created_at: number;
  updated_at: number;
  // summary fields (from detail endpoint)
  statement_count?: number;
  metric_count?: number;
  valuation_count?: number;
  latest_score?: StockScoreSummary | null;
}

export interface StockScoreSummary {
  overall_score: number | null;
  fundamental_score: number | null;
  valuation_score: number | null;
  growth_score: number | null;
  quality_score: number | null;
  scoring_date?: string;
}

export interface FinancialStatement {
  id: number;
  stock_id: number;
  statement_type: string;
  fiscal_year: number;
  fiscal_quarter: number | null;
  period_end_date: string;
  filing_date: string | null;
  source_file: string | null;
  extracted_by: string;
  confidence_score: number | null;
  notes: string | null;
  created_at: number;
  line_items: FinancialLineItem[];
}

export interface FinancialLineItem {
  id: number;
  statement_id: number;
  line_item_code: string;
  line_item_name: string;
  amount: number;
  currency: string;
  order_index: number | null;
  is_total: boolean;
  manually_edited: boolean;
}

export interface StockMetric {
  id: number;
  stock_id: number;
  fiscal_year: number;
  fiscal_quarter: number | null;
  period_end_date: string;
  metric_type: string;
  metric_name: string;
  metric_value: number;
  created_at: number;
}

export interface ValuationResult {
  id: number;
  stock_id: number;
  model_type: string;
  valuation_date: string;
  intrinsic_value: number | null;
  parameters: Record<string, any>;
  assumptions: Record<string, any>;
  created_by_user_id: number | null;
  created_at: number;
}

export interface StockScore {
  id: number;
  stock_id: number;
  scoring_date: string;
  overall_score: number | null;
  fundamental_score: number | null;
  valuation_score: number | null;
  growth_score: number | null;
  quality_score: number | null;
  details: Record<string, number>;
  analyst_notes: string | null;
  created_at: number;
}

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
  const { data } = await api.post<{ status: string; data: any }>(
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
  const { data } = await api.put<{ status: string; data: any }>(
    `/api/v1/fundamental/stocks/${stockId}`,
    payload,
  );
  return data.data;
}

/** Delete analysis stock (cascade). */
export async function deleteAnalysisStock(stockId: number): Promise<void> {
  await api.delete(`/api/v1/fundamental/stocks/${stockId}`);
}

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
  const { data } = await api.post<{ status: string; data: any }>(
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

/** AI Upload response types. */
export interface AIUploadResult {
  message: string;
  statements: Array<{
    statement_id: number;
    statement_type: string;
    period_end_date: string;
    fiscal_year: number;
    line_items_count: number;
    currency: string;
  }>;
  source_file: string;
  pages_processed: number;
  model: string;
}

/**
 * Upload a financial report PDF for AI-powered extraction.
 * Sends PDF to Gemini Vision → extracts statements + line items → saves to DB.
 */
export async function uploadFinancialStatement(
  stockId: number,
  fileUri: string,
  fileName: string,
  mimeType: string = "application/pdf",
): Promise<AIUploadResult> {
  const formData = new FormData();

  // On web, fetch the blob from the URI and append as a File object.
  // The RN-style {uri, name, type} object doesn't work on web — the
  // server receives a plain string instead of an actual file upload.
  if (typeof window !== "undefined" && typeof window.document !== "undefined") {
    // Web platform
    const response = await fetch(fileUri);
    const blob = await response.blob();
    const file = new File([blob], fileName, { type: mimeType });
    formData.append("file", file);
  } else {
    // React Native (mobile)
    formData.append("file", {
      uri: fileUri,
      name: fileName,
      type: mimeType,
    } as any);
  }

  const { data } = await api.post<{ status: string; data: AIUploadResult }>(
    `/api/v1/fundamental/stocks/${stockId}/upload-statement`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: 120_000, // 2 min timeout for AI processing
    },
  );
  return data.data;
}

/** Get metrics for a stock. */
export async function getStockMetrics(
  stockId: number,
  metricType?: string,
): Promise<{ metrics: StockMetric[]; grouped: Record<string, StockMetric[]>; count: number }> {
  const { data } = await api.get<{ status: string; data: any }>(
    `/api/v1/fundamental/stocks/${stockId}/metrics`,
    { params: metricType ? { metric_type: metricType } : undefined },
  );
  return data.data;
}

/** Calculate (recalculate) metrics for a period. */
export async function calculateMetrics(
  stockId: number,
  payload: { period_end_date: string; fiscal_year: number; fiscal_quarter?: number },
): Promise<{ metrics: Record<string, Record<string, number | null>> }> {
  const { data } = await api.post<{ status: string; data: any }>(
    `/api/v1/fundamental/stocks/${stockId}/metrics/calculate`,
    payload,
  );
  return data.data;
}

/** Get growth analysis. */
export async function getGrowthAnalysis(
  stockId: number,
): Promise<{ growth: Record<string, Array<{ period: string; prev_period: string; growth: number }>> }> {
  const { data } = await api.get<{ status: string; data: any }>(
    `/api/v1/fundamental/stocks/${stockId}/growth`,
  );
  return data.data;
}

/** Get / compute stock score. */
export async function getStockScore(stockId: number): Promise<StockScoreSummary & { details?: Record<string, number>; error?: string }> {
  const { data } = await api.get<{ status: string; data: any }>(
    `/api/v1/fundamental/stocks/${stockId}/score`,
  );
  return data.data;
}

/** Get score history. */
export async function getScoreHistory(stockId: number): Promise<{ scores: StockScore[]; count: number }> {
  const { data } = await api.get<{ status: string; data: any }>(
    `/api/v1/fundamental/stocks/${stockId}/scores/history`,
  );
  return data.data;
}

/** Get saved valuations. */
export async function getValuations(stockId: number): Promise<{ valuations: ValuationResult[]; count: number }> {
  const { data } = await api.get<{ status: string; data: any }>(
    `/api/v1/fundamental/stocks/${stockId}/valuations`,
  );
  return data.data;
}

/** Run Graham Number valuation. */
export async function runGrahamValuation(
  stockId: number,
  payload: { eps: number; book_value_per_share: number; multiplier?: number },
): Promise<any> {
  const { data } = await api.post<{ status: string; data: any }>(
    `/api/v1/fundamental/stocks/${stockId}/valuations/graham`,
    payload,
  );
  return data.data;
}

/** Run DCF valuation. */
export async function runDCFValuation(
  stockId: number,
  payload: {
    fcf: number;
    growth_rate_stage1: number;
    growth_rate_stage2: number;
    discount_rate: number;
    stage1_years?: number;
    stage2_years?: number;
    terminal_growth?: number;
    shares_outstanding?: number;
  },
): Promise<any> {
  const { data } = await api.post<{ status: string; data: any }>(
    `/api/v1/fundamental/stocks/${stockId}/valuations/dcf`,
    payload,
  );
  return data.data;
}

/** Run DDM valuation. */
export async function runDDMValuation(
  stockId: number,
  payload: {
    last_dividend: number;
    growth_rate: number;
    required_return: number;
    high_growth_years?: number;
    high_growth_rate?: number;
  },
): Promise<any> {
  const { data } = await api.post<{ status: string; data: any }>(
    `/api/v1/fundamental/stocks/${stockId}/valuations/ddm`,
    payload,
  );
  return data.data;
}

/** Run Comparable Multiples valuation. */
export async function runMultiplesValuation(
  stockId: number,
  payload: {
    metric_value: number;
    peer_multiple: number;
    multiple_type?: string;
    shares_outstanding?: number;
  },
): Promise<any> {
  const { data } = await api.post<{ status: string; data: any }>(
    `/api/v1/fundamental/stocks/${stockId}/valuations/multiples`,
    payload,
  );
  return data.data;
}

// ── Securities Master API ───────────────────────────────────────────

export interface SecurityRecord {
  security_id: string;
  exchange: string;
  canonical_ticker: string;
  display_name: string | null;
  isin: string | null;
  currency: string | null;
  country: string | null;
  status: string | null;
  sector: string | null;
}

/** List securities. */
export async function getSecurities(params?: {
  exchange?: string;
  status?: string;
  search?: string;
}): Promise<{ securities: SecurityRecord[]; count: number }> {
  const { data } = await api.get<{ status: string; data: { securities: SecurityRecord[]; count: number } }>(
    "/api/v1/securities",
    { params }
  );
  return data.data;
}

/** Create security. */
export async function createSecurity(payload: {
  canonical_ticker: string;
  exchange: string;
  display_name?: string;
  currency?: string;
  country?: string;
  sector?: string;
}): Promise<{ security_id: string; message: string }> {
  const { data } = await api.post<{ status: string; data: any }>(
    "/api/v1/securities",
    payload
  );
  return data.data;
}

// ── AI Analyst API ──────────────────────────────────────────────────

/** Generate AI portfolio analysis. */
export async function analyzePortfolio(payload: {
  prompt?: string;
  include_holdings?: boolean;
  include_transactions?: boolean;
  include_performance?: boolean;
  language?: string;
}): Promise<any> {
  const { data } = await api.post<{ status: string; data: any }>(
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

/** Save user's Gemini API key. */
export async function saveApiKey(apiKey: string): Promise<{ message: string }> {
  const { data } = await api.put<{ status: string; data: { message: string } }>(
    "/api/v1/auth/api-key",
    { api_key: apiKey }
  );
  return data.data;
}

/** Get user's saved API key (masked). */
export async function getApiKey(): Promise<{ has_key: boolean; masked_key: string | null }> {
  const { data } = await api.get<{ status: string; data: { has_key: boolean; masked_key: string | null } }>(
    "/api/v1/auth/api-key"
  );
  return data.data;
}

// ── Auth extras ─────────────────────────────────────────────────────

/** Register new user. */
export async function register(
  username: string,
  password: string,
  name?: string
): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/api/v1/auth/register", {
    username,
    password,
    name,
  });
  return data;
}

/** Exchange a Google ID token for a JWT session. */
export async function googleSignIn(idToken: string): Promise<LoginResponse> {
  const { data } = await api.post<LoginResponse>("/api/v1/auth/google", {
    id_token: idToken,
  });
  return data;
}

/** Change password. */
export async function changePassword(
  currentPassword: string,
  newPassword: string
): Promise<{ message: string }> {
  const { data } = await api.put<{ status: string; data: { message: string } }>(
    "/api/v1/auth/change-password",
    { current_password: currentPassword, new_password: newPassword }
  );
  return data.data;
}

/** Get current user info. */
export async function getMe(): Promise<{ user_id: number; username: string; name: string }> {
  const { data } = await api.get<{ status: string; data: any }>("/api/v1/auth/me");
  return data.data;
}

/** Get account/cash balances. */
export async function getAccounts(): Promise<{ total_cash_kwd: number; accounts: any[] }> {
  const { data } = await api.get<{ status: string; data: any }>("/api/portfolio/accounts");
  return data.data;
}

// ── Bulk Transaction Operations ─────────────────────────────────────

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
): Promise<any> {
  const formData = new FormData();
  formData.append("file", file);
  const params: Record<string, string> = { portfolio, mode };
  if (sheetName) params.sheet_name = sheetName;
  const { data } = await api.post<{ status: string; data: any }>(
    "/api/v1/backup/import",
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      params,
    }
  );
  return data.data;
}

export default api;
