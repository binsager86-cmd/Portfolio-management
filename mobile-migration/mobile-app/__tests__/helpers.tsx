/**
 * Shared test helpers — mock data factories, render wrapper with providers,
 * and assertion utilities for the mobile app test suite.
 */
import React from "react";
import { render, RenderOptions } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Test QueryClient — no retries, instant stale ────────────────────

export function createTestQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: 0 },
      mutations: { retry: false },
    },
  });
}

// ── Wrapper component with providers ────────────────────────────────

interface WrapperOpts {
  queryClient?: QueryClient;
}

export function createWrapper(opts?: WrapperOpts) {
  const qc = opts?.queryClient ?? createTestQueryClient();
  return function TestWrapper({ children }: { children: React.ReactNode }) {
    return (
      <QueryClientProvider client={qc}>{children}</QueryClientProvider>
    );
  };
}

/**
 * Custom render that wraps component in QueryClientProvider.
 */
export function renderWithProviders(
  ui: React.ReactElement,
  options?: Omit<RenderOptions, "wrapper"> & WrapperOpts
) {
  const { queryClient, ...renderOpts } = options ?? {};
  const qc = queryClient ?? createTestQueryClient();
  return render(ui, { wrapper: createWrapper({ queryClient: qc }), ...renderOpts });
}

// ── Mock Data Factories ─────────────────────────────────────────────

export const MOCK_OVERVIEW_DATA = {
  total_deposits: 50000,
  total_withdrawals: 0,
  net_deposits: 50000,
  total_invested: 45000,
  total_divested: 5000,
  total_dividends: 1200,
  total_fees: 350,
  transaction_count: 42,
  portfolio_value: 52000,
  cash_balance: 3000,
  total_value: 55000,
  total_gain: 5000,
  roi_percent: 10.0,
  usd_kwd_rate: 0.307,
  by_portfolio: {
    KFH: {
      unrealized_pnl_kwd: 2500,
      realized_pnl_kwd: 1800,
      market_value_kwd: 30000,
      total_cost_kwd: 25700,
    },
    BBYN: {
      unrealized_pnl_kwd: -300,
      realized_pnl_kwd: 500,
      market_value_kwd: 15000,
      total_cost_kwd: 14800,
    },
    USA: {
      unrealized_pnl_kwd: 800,
      realized_pnl_kwd: 200,
      market_value_kwd: 10000,
      total_cost_kwd: 9000,
    },
  },
  portfolio_values: {
    KFH: {
      market_value: 30000,
      market_value_kwd: 30000,
      total_cost_kwd: 25700,
      currency: "KWD",
      holding_count: 8,
    },
    BBYN: {
      market_value: 15000,
      market_value_kwd: 15000,
      total_cost_kwd: 14800,
      currency: "KWD",
      holding_count: 5,
    },
    USA: {
      market_value: 32573,
      market_value_kwd: 10000,
      total_cost_kwd: 9000,
      currency: "USD",
      holding_count: 3,
    },
  },
  accounts: [],
};

export const MOCK_HOLDINGS = {
  holdings: [
    {
      company: "Humansoft Holding",
      symbol: "HUMANSOFT",
      shares_qty: 1000,
      avg_cost: 3.2,
      total_cost: 3200,
      market_price: 3.5,
      market_value: 3500,
      unrealized_pnl: 300,
      realized_pnl: 0,
      cash_dividends: 50,
      reinvested_dividends: 0,
      bonus_dividend_shares: 0,
      dividend_yield_on_cost_pct: 0.0156,
      total_pnl: 350,
      pnl_pct: 0.109,
      currency: "KWD",
      market_value_kwd: 3500,
      unrealized_pnl_kwd: 300,
      total_pnl_kwd: 350,
      total_cost_kwd: 3200,
      weight_by_cost: 0.15,
    },
    {
      company: "National Bank of Kuwait",
      symbol: "NBK",
      shares_qty: 2000,
      avg_cost: 1.05,
      total_cost: 2100,
      market_price: 1.12,
      market_value: 2240,
      unrealized_pnl: 140,
      realized_pnl: 80,
      cash_dividends: 120,
      reinvested_dividends: 0,
      bonus_dividend_shares: 0,
      dividend_yield_on_cost_pct: 0.057,
      total_pnl: 340,
      pnl_pct: 0.162,
      currency: "KWD",
      market_value_kwd: 2240,
      unrealized_pnl_kwd: 140,
      total_pnl_kwd: 340,
      total_cost_kwd: 2100,
      weight_by_cost: 0.1,
    },
  ],
  totals: {
    total_market_value_kwd: 5740,
    total_cost_kwd: 5300,
    total_unrealized_pnl_kwd: 440,
    total_realized_pnl_kwd: 80,
    total_pnl_kwd: 690,
    total_dividends_kwd: 170,
  },
  usd_kwd_rate: 0.307,
  count: 2,
};

export const MOCK_TRANSACTIONS = {
  transactions: [
    {
      id: 1,
      user_id: 1,
      portfolio: "KFH",
      stock_symbol: "HUMANSOFT",
      txn_date: "2024-01-15",
      txn_type: "Buy",
      shares: 500,
      purchase_cost: 1600,
      sell_value: null,
      bonus_shares: null,
      cash_dividend: null,
      reinvested_dividend: null,
      fees: 10,
      price_override: null,
      planned_cum_shares: null,
      broker: "KFH Capital",
      reference: null,
      notes: null,
      category: null,
      is_deleted: false,
      created_at: 1705315200,
    },
    {
      id: 2,
      user_id: 1,
      portfolio: "KFH",
      stock_symbol: "NBK",
      txn_date: "2024-02-01",
      txn_type: "Buy",
      shares: 2000,
      purchase_cost: 2100,
      sell_value: null,
      bonus_shares: null,
      cash_dividend: null,
      reinvested_dividend: null,
      fees: 15,
      price_override: null,
      planned_cum_shares: null,
      broker: null,
      reference: null,
      notes: null,
      category: null,
      is_deleted: false,
      created_at: 1706745600,
    },
    {
      id: 3,
      user_id: 1,
      portfolio: "BBYN",
      stock_symbol: "MABANEE",
      txn_date: "2024-03-10",
      txn_type: "Sell",
      shares: 100,
      purchase_cost: null,
      sell_value: 450,
      bonus_shares: null,
      cash_dividend: null,
      reinvested_dividend: null,
      fees: 5,
      price_override: null,
      planned_cum_shares: null,
      broker: null,
      reference: null,
      notes: "Partial exit",
      category: null,
      is_deleted: false,
      created_at: 1710028800,
    },
  ],
  count: 3,
  pagination: {
    page: 1,
    per_page: 50,
    total_pages: 1,
    total_items: 3,
  },
};

export const MOCK_LOGIN_RESPONSE = {
  access_token: "test-jwt-access-token-12345",
  refresh_token: "test-jwt-refresh-token-67890",
  token_type: "bearer",
  expires_in: 1800,
  user_id: 1,
  username: "testuser",
  name: "Test User",
};

export const MOCK_USER = {
  id: 1,
  username: "testuser",
  name: "Test User",
};
