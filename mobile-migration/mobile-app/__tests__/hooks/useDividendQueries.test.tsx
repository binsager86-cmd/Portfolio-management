/**
 * useDividendQueries — locks key shape, pagination defaults, and the
 * `enabled` gate for the bonus-shares lazy hook.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  useDividends,
  useAllDividends,
  useDividendsByStock,
  useBonusShares,
  dividendKeys,
} from "@/hooks/queries/useDividendQueries";

const mockGetDividends = jest.fn();
const mockGetDividendsByStock = jest.fn();
const mockGetBonusShares = jest.fn();

jest.mock("@/services/api", () => ({
  getDividends: (...a: unknown[]) =>
    (mockGetDividends as (...x: unknown[]) => unknown)(...a),
  getDividendsByStock: (...a: unknown[]) =>
    (mockGetDividendsByStock as (...x: unknown[]) => unknown)(...a),
  getBonusShares: (...a: unknown[]) =>
    (mockGetBonusShares as (...x: unknown[]) => unknown)(...a),
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("dividendKeys", () => {
  it("produces stable cache keys", () => {
    expect(dividendKeys.list(2)).toEqual(["dividends", 2]);
    expect(dividendKeys.all()).toEqual(["dividends", "all"]);
    expect(dividendKeys.byStock()).toEqual(["dividends-by-stock"]);
    expect(dividendKeys.bonus()).toEqual(["bonus-shares"]);
  });
});

describe("useDividends", () => {
  it("defaults to page 1 / page_size 50", async () => {
    mockGetDividends.mockResolvedValueOnce({ items: [] });
    const { result } = renderHook(() => useDividends(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetDividends).toHaveBeenCalledWith({ page: 1, page_size: 50 });
  });

  it("forwards explicit page + pageSize", async () => {
    mockGetDividends.mockResolvedValueOnce({ items: [] });
    const { result } = renderHook(() => useDividends(3, 25), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetDividends).toHaveBeenCalledWith({ page: 3, page_size: 25 });
  });
});

describe("useAllDividends", () => {
  it("requests page 1 with page_size 9999", async () => {
    mockGetDividends.mockResolvedValueOnce({ items: [] });
    const { result } = renderHook(() => useAllDividends(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetDividends).toHaveBeenCalledWith({ page: 1, page_size: 9999 });
  });
});

describe("useDividendsByStock", () => {
  it("invokes getDividendsByStock", async () => {
    mockGetDividendsByStock.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useDividendsByStock(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetDividendsByStock).toHaveBeenCalledWith();
  });
});

describe("useBonusShares", () => {
  it("fires when enabled (default)", async () => {
    mockGetBonusShares.mockResolvedValueOnce({ items: [] });
    const { result } = renderHook(() => useBonusShares(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetBonusShares).toHaveBeenCalledTimes(1);
  });

  it("does not fire when enabled=false", () => {
    renderHook(() => useBonusShares(false), { wrapper });
    expect(mockGetBonusShares).not.toHaveBeenCalled();
  });
});
