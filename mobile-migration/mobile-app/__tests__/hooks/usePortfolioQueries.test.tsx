/**
 * usePortfolioQueries — locks the public contract of the core dashboard
 * data hooks (overview, holdings, cash, performance, risk, realized).
 *
 * Why these matter: every render of the Overview tab depends on the key
 * shape and param-forwarding of these hooks. A silent break here breaks
 * cache hits and triggers refetch storms.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  usePortfolioOverview,
  useHoldings,
  useCashBalances,
  usePerformance,
  useRiskMetrics,
  useRealizedProfit,
  portfolioKeys,
} from "@/hooks/queries/usePortfolioQueries";

const mockGetOverview = jest.fn();
const mockGetHoldings = jest.fn();
const mockGetCashBalances = jest.fn();
const mockGetPerformance = jest.fn();
const mockGetRiskMetrics = jest.fn();
const mockGetRealizedProfit = jest.fn();

jest.mock("@/services/api", () => ({
  getOverview: (...a: unknown[]) =>
    (mockGetOverview as (...x: unknown[]) => unknown)(...a),
  getHoldings: (...a: unknown[]) =>
    (mockGetHoldings as (...x: unknown[]) => unknown)(...a),
  getCashBalances: (...a: unknown[]) =>
    (mockGetCashBalances as (...x: unknown[]) => unknown)(...a),
  getAccounts: jest.fn(),
  getDeposits: jest.fn(),
  getPerformance: (...a: unknown[]) =>
    (mockGetPerformance as (...x: unknown[]) => unknown)(...a),
  getSnapshots: jest.fn(),
  getRealizedProfit: (...a: unknown[]) =>
    (mockGetRealizedProfit as (...x: unknown[]) => unknown)(...a),
  getRiskMetrics: (...a: unknown[]) =>
    (mockGetRiskMetrics as (...x: unknown[]) => unknown)(...a),
}));

function makeClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
}

function wrapper({ children }: { children: React.ReactNode }) {
  return (
    <QueryClientProvider client={makeClient()}>{children}</QueryClientProvider>
  );
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("portfolioKeys", () => {
  it("produces stable keys for cache identity", () => {
    expect(portfolioKeys.overview(7)).toEqual(["portfolio-overview", 7]);
    expect(portfolioKeys.holdings("KFH")).toEqual(["holdings", "KFH"]);
    expect(portfolioKeys.holdings()).toEqual(["holdings", undefined]);
    expect(portfolioKeys.cashBalances()).toEqual(["cash-balances"]);
    expect(portfolioKeys.performance("USA", "1y")).toEqual([
      "performance",
      "USA",
      "1y",
    ]);
    expect(portfolioKeys.riskMetrics(4.25)).toEqual(["risk-metrics", 4.25]);
    expect(portfolioKeys.realizedProfit()).toEqual(["realized-profit"]);
  });
});

describe("usePortfolioOverview", () => {
  it("calls getOverview and exposes the data", async () => {
    mockGetOverview.mockResolvedValueOnce({ totalValue: 1000 });
    const { result } = renderHook(() => usePortfolioOverview(7), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetOverview).toHaveBeenCalledTimes(1);
    expect(result.current.data).toEqual({ totalValue: 1000 });
  });
});

describe("useHoldings", () => {
  it("forwards the portfolio filter to getHoldings", async () => {
    mockGetHoldings.mockResolvedValueOnce({ items: [] });
    const { result } = renderHook(() => useHoldings("BBYN"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetHoldings).toHaveBeenCalledWith("BBYN");
  });

  it("calls getHoldings with undefined when no portfolio passed", async () => {
    mockGetHoldings.mockResolvedValueOnce({ items: [] });
    const { result } = renderHook(() => useHoldings(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetHoldings).toHaveBeenCalledWith(undefined);
  });
});

describe("useCashBalances", () => {
  it("invokes getCashBalances with no args", async () => {
    mockGetCashBalances.mockResolvedValueOnce({});
    const { result } = renderHook(() => useCashBalances(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetCashBalances).toHaveBeenCalledWith();
  });
});

describe("usePerformance", () => {
  it("forwards portfolio + period as a single object", async () => {
    mockGetPerformance.mockResolvedValueOnce({});
    const { result } = renderHook(() => usePerformance("USA", "1y"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetPerformance).toHaveBeenCalledWith({
      portfolio: "USA",
      period: "1y",
    });
  });
});

describe("useRiskMetrics", () => {
  it("converts the rf_rate from percent to decimal", async () => {
    mockGetRiskMetrics.mockResolvedValueOnce({});
    const { result } = renderHook(() => useRiskMetrics(4.25), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetRiskMetrics).toHaveBeenCalledWith({ rf_rate: 0.0425 });
  });

  it("treats null rf_rate as 0", async () => {
    mockGetRiskMetrics.mockResolvedValueOnce({});
    const { result } = renderHook(() => useRiskMetrics(null), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetRiskMetrics).toHaveBeenCalledWith({ rf_rate: 0 });
  });

  it("respects enabled=false (does not fire the query)", () => {
    renderHook(() => useRiskMetrics(4.25, false), { wrapper });
    expect(mockGetRiskMetrics).not.toHaveBeenCalled();
  });
});

describe("useRealizedProfit", () => {
  it("invokes getRealizedProfit", async () => {
    mockGetRealizedProfit.mockResolvedValueOnce({ total: 0 });
    const { result } = renderHook(() => useRealizedProfit(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetRealizedProfit).toHaveBeenCalledWith();
  });
});
