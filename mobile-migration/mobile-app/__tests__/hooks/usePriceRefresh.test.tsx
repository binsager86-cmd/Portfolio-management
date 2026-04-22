/**
 * usePriceRefresh hook — unit tests.
 *
 * Covers:
 *   - Successful refresh: calls updatePrices, invalidates only price-dependent queries,
 *     fires push notification, toggles isRefreshing flag.
 *   - Backend failure: still invalidates caches, does NOT fire notification, exits cleanly.
 *   - Predicate selectivity: queries unrelated to PRICE_DEPENDENT_QUERY_KEYS are NOT invalidated.
 */

import React from "react";
import { renderHook, act } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import { usePriceRefresh, PRICE_DEPENDENT_QUERY_KEYS } from "@/hooks/usePriceRefresh";

const mockUpdatePrices = jest.fn() as jest.Mock<Promise<unknown>, []>;
const mockSendPriceUpdateNotification = jest.fn() as jest.Mock<
  Promise<void>,
  [unknown]
>;

jest.mock("@/services/api", () => ({
  updatePrices: () => mockUpdatePrices(),
}));

jest.mock("@/services/notifications/priceUpdateNotification", () => ({
  sendPriceUpdateNotification: (payload: unknown) =>
    mockSendPriceUpdateNotification(payload),
}));

function makeWrapper(client: QueryClient) {
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  };
}

function makeClientWithSampleQueries() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: Infinity } },
  });
  // Seed cache with one entry per price-dependent key + one unrelated key
  for (const key of PRICE_DEPENDENT_QUERY_KEYS) {
    client.setQueryData([key], { stub: true });
  }
  client.setQueryData(["unrelated-feature"], { stub: true });
  return client;
}

describe("usePriceRefresh", () => {
  beforeEach(() => {
    mockUpdatePrices.mockReset();
    mockSendPriceUpdateNotification.mockReset();
    mockSendPriceUpdateNotification.mockReturnValue(Promise.resolve());
  });

  it("calls updatePrices and toggles isRefreshing", async () => {
    mockUpdatePrices.mockResolvedValue({ updated_count: 5, message: "ok" });
    const client = makeClientWithSampleQueries();
    const { result } = renderHook(() => usePriceRefresh(), {
      wrapper: makeWrapper(client),
    });

    expect(result.current.isRefreshing).toBe(false);

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockUpdatePrices).toHaveBeenCalledTimes(1);
    expect(result.current.isRefreshing).toBe(false);
  });

  it("fires push notification with normalised count", async () => {
    mockUpdatePrices.mockResolvedValue({ updated_count: 7, message: "done" });
    const client = makeClientWithSampleQueries();
    const { result } = renderHook(() => usePriceRefresh(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockSendPriceUpdateNotification).toHaveBeenCalledWith({
      updatedCount: 7,
      message: "done",
    });
  });

  it("falls back to camelCase updatedCount when snake_case is absent", async () => {
    mockUpdatePrices.mockResolvedValue({ updatedCount: 3 });
    const client = makeClientWithSampleQueries();
    const { result } = renderHook(() => usePriceRefresh(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.refresh();
    });

    expect(mockSendPriceUpdateNotification).toHaveBeenCalledWith({
      updatedCount: 3,
      message: undefined,
    });
  });

  it("invalidates price-dependent queries but not unrelated queries", async () => {
    mockUpdatePrices.mockResolvedValue({ updated_count: 0 });
    const client = makeClientWithSampleQueries();
    const { result } = renderHook(() => usePriceRefresh(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.refresh();
    });

    for (const key of PRICE_DEPENDENT_QUERY_KEYS) {
      const state = client.getQueryState([key]);
      expect(state?.isInvalidated).toBe(true);
    }
    const unrelated = client.getQueryState(["unrelated-feature"]);
    expect(unrelated?.isInvalidated).toBe(false);
  });

  it("still invalidates caches when updatePrices throws and skips notification", async () => {
    const warnSpy = jest.spyOn(console, "warn").mockImplementation(() => {});
    mockUpdatePrices.mockRejectedValue(new Error("network down"));
    const client = makeClientWithSampleQueries();
    const { result } = renderHook(() => usePriceRefresh(), {
      wrapper: makeWrapper(client),
    });

    await act(async () => {
      await result.current.refresh();
    });

    // Caches still invalidated so UI can re-fetch when backend is reachable.
    const state = client.getQueryState(["holdings"]);
    expect(state?.isInvalidated).toBe(true);

    // Notification NOT fired when updatePrices fails.
    expect(mockSendPriceUpdateNotification).not.toHaveBeenCalled();
    expect(result.current.isRefreshing).toBe(false);

    warnSpy.mockRestore();
  });
});
