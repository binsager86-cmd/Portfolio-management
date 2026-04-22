/**
 * useMarketQueries — covers MARKET_KEYS shape + hook contract.
 */

import React from "react";
import { renderHook, waitFor, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  useMarketSummary,
  useMarketRefresh,
  MARKET_KEYS,
} from "@/hooks/queries/useMarketQueries";

const mockGetSummary = jest.fn();
const mockRefresh = jest.fn();

jest.mock("@/services/market/marketApi", () => ({
  marketApi: {
    getSummary: (...a: unknown[]) =>
      (mockGetSummary as (...x: unknown[]) => unknown)(...a),
    refresh: (...a: unknown[]) =>
      (mockRefresh as (...x: unknown[]) => unknown)(...a),
  },
}));

let client: QueryClient;
function wrapper({ children }: { children: React.ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
  client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
});

describe("MARKET_KEYS", () => {
  it("produces stable keys", () => {
    expect(MARKET_KEYS.all).toEqual(["market"]);
    expect(MARKET_KEYS.summary()).toEqual(["market", "summary"]);
  });
});

describe("useMarketSummary", () => {
  it("calls marketApi.getSummary when enabled", async () => {
    mockGetSummary.mockResolvedValueOnce({ symbols: [] });
    const { result } = renderHook(() => useMarketSummary(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetSummary).toHaveBeenCalledTimes(1);
  });

  it("does not fire when disabled", () => {
    renderHook(() => useMarketSummary(false), { wrapper });
    expect(mockGetSummary).not.toHaveBeenCalled();
  });
});

describe("useMarketRefresh", () => {
  it("seeds the summary cache with the refresh result", async () => {
    const fresh = { symbols: [{ ticker: "AAPL" }] };
    mockRefresh.mockResolvedValueOnce(fresh);

    const { result } = renderHook(() => useMarketRefresh(), { wrapper });

    await act(async () => {
      const out = await result.current();
      expect(out).toEqual(fresh);
    });

    expect(mockRefresh).toHaveBeenCalledTimes(1);
    expect(client.getQueryData(MARKET_KEYS.summary())).toEqual(fresh);
  });
});
