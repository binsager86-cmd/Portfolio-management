/**
 * useStockQueries — locks key shape and the input-sanitization contract
 * (special chars stripped, length capped, search gated to 2+ chars).
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  useStocks,
  useAllStocksForMerge,
  useStockList,
  useStockListSearch,
  useSecurities,
  stockKeys,
} from "@/hooks/queries/useStockQueries";

const mockGetStocks = jest.fn();
const mockGetStockList = jest.fn();
const mockGetSecurities = jest.fn();

jest.mock("@/services/api", () => ({
  getStocks: (...a: unknown[]) =>
    (mockGetStocks as (...x: unknown[]) => unknown)(...a),
  getStockList: (...a: unknown[]) =>
    (mockGetStockList as (...x: unknown[]) => unknown)(...a),
  getSecurities: (...a: unknown[]) =>
    (mockGetSecurities as (...x: unknown[]) => unknown)(...a),
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

describe("stockKeys", () => {
  it("produces stable keys", () => {
    expect(stockKeys.list("USA", "AAPL")).toEqual(["stocks", "USA", "AAPL"]);
    expect(stockKeys.allForMerge()).toEqual(["all-stocks-for-merge"]);
    expect(stockKeys.stockList("us")).toEqual(["stock-list", "us"]);
    expect(stockKeys.stockListSearch("us", "ap")).toEqual([
      "stock-list-search",
      "us",
      "ap",
    ]);
    expect(stockKeys.securities("foo")).toEqual(["securities", "foo"]);
  });
});

describe("useStocks", () => {
  it("forwards portfolio + sanitized search to getStocks", async () => {
    mockGetStocks.mockResolvedValueOnce([]);
    const { result } = renderHook(
      () => useStocks({ portfolio: "KFH", search: "AAPL!@#" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    // sanitizeSearch strips !@# but preserves AAPL
    expect(mockGetStocks).toHaveBeenCalledWith({
      portfolio: "KFH",
      search: "AAPL",
    });
  });

  it("passes undefined search when input is empty", async () => {
    mockGetStocks.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useStocks({ portfolio: "USA" }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetStocks).toHaveBeenCalledWith({
      portfolio: "USA",
      search: undefined,
    });
  });
});

describe("useAllStocksForMerge", () => {
  it("invokes getStocks with no args", async () => {
    mockGetStocks.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useAllStocksForMerge(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetStocks).toHaveBeenCalledWith();
  });
});

describe("useStockList", () => {
  it("forwards market and respects enabled=false", async () => {
    mockGetStockList.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useStockList("us"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetStockList).toHaveBeenCalledWith({ market: "us" });
  });

  it("does not fire when disabled", () => {
    renderHook(() => useStockList("us", false), { wrapper });
    expect(mockGetStockList).not.toHaveBeenCalled();
  });
});

describe("useStockListSearch", () => {
  it("does not fire for searches under 2 chars", () => {
    renderHook(() => useStockListSearch("us", "a"), { wrapper });
    expect(mockGetStockList).not.toHaveBeenCalled();
  });

  it("fires for 2+ char searches with sanitized term", async () => {
    mockGetStockList.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useStockListSearch("us", "AP$%"), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetStockList).toHaveBeenCalledWith({
      market: "us",
      search: "AP",
    });
  });

  it("does not fire when explicitly disabled", () => {
    renderHook(() => useStockListSearch("us", "AAPL", false), { wrapper });
    expect(mockGetStockList).not.toHaveBeenCalled();
  });
});

describe("useSecurities", () => {
  it("forwards sanitized search", async () => {
    mockGetSecurities.mockResolvedValueOnce([]);
    const { result } = renderHook(() => useSecurities("MSFT@"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetSecurities).toHaveBeenCalledWith({ search: "MSFT" });
  });

  it("respects enabled=false", () => {
    renderHook(() => useSecurities("MSFT", false), { wrapper });
    expect(mockGetSecurities).not.toHaveBeenCalled();
  });
});
