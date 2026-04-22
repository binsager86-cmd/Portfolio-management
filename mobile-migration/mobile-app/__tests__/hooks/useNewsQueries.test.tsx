/**
 * useNewsQueries — locks NEWS_KEYS shape, infinite-query pagination,
 * detail enabled-gating, and history defaults.
 */

import React from "react";
import { renderHook, waitFor } from "@testing-library/react-native";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

import {
  useNewsFeed,
  useNewsDetail,
  useNewsHistory,
  useNewsHistoryInfinite,
  NEWS_KEYS,
} from "@/hooks/queries/useNewsQueries";

const mockGetFeed = jest.fn();
const mockGetItem = jest.fn();
const mockGetHistory = jest.fn();

jest.mock("@/services/news/newsApi", () => ({
  newsApi: {
    getFeed: (...a: unknown[]) =>
      (mockGetFeed as (...x: unknown[]) => unknown)(...a),
    getItem: (...a: unknown[]) =>
      (mockGetItem as (...x: unknown[]) => unknown)(...a),
    getHistory: (...a: unknown[]) =>
      (mockGetHistory as (...x: unknown[]) => unknown)(...a),
  },
}));

function wrapper({ children }: { children: React.ReactNode }) {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
    },
  });
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}

beforeEach(() => {
  jest.clearAllMocks();
});

describe("NEWS_KEYS", () => {
  it("produces stable, filter-aware keys", () => {
    expect(NEWS_KEYS.all).toEqual(["news"]);
    expect(NEWS_KEYS.feed({ lang: "en" })).toEqual([
      "news",
      "feed",
      { symbols: undefined, categories: undefined, lang: "en" },
    ]);
    expect(NEWS_KEYS.detail("abc")).toEqual(["news", "detail", "abc"]);
    expect(NEWS_KEYS.history({ page: 2 })).toEqual([
      "news",
      "history",
      {
        symbols: undefined,
        categories: undefined,
        lang: undefined,
        dateFrom: undefined,
        dateTo: undefined,
        page: 2,
      },
    ]);
  });
});

describe("useNewsFeed", () => {
  it("calls getFeed with limit=15 and forwards filters", async () => {
    mockGetFeed.mockResolvedValueOnce({
      items: [],
      nextPageCursor: undefined,
    });
    const { result } = renderHook(
      () => useNewsFeed({ symbols: ["AAPL"], lang: "en" }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetFeed).toHaveBeenCalledWith({
      symbols: ["AAPL"],
      categories: undefined,
      cursor: undefined,
      limit: 15,
      lang: "en",
    });
  });

  it("respects enabled=false", () => {
    renderHook(() => useNewsFeed({ enabled: false }), { wrapper });
    expect(mockGetFeed).not.toHaveBeenCalled();
  });
});

describe("useNewsDetail", () => {
  it("does not fire when id is empty", () => {
    renderHook(() => useNewsDetail(""), { wrapper });
    expect(mockGetItem).not.toHaveBeenCalled();
  });

  it("calls getItem with the provided id", async () => {
    mockGetItem.mockResolvedValueOnce({ id: "n1" });
    const { result } = renderHook(() => useNewsDetail("n1"), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetItem).toHaveBeenCalledWith("n1");
  });

  it("respects explicit enabled=false even with id", () => {
    renderHook(() => useNewsDetail("n1", false), { wrapper });
    expect(mockGetItem).not.toHaveBeenCalled();
  });
});

describe("useNewsHistory", () => {
  it("defaults page=1 and limit=20", async () => {
    mockGetHistory.mockResolvedValueOnce({ items: [], page: 1, totalPages: 1 });
    const { result } = renderHook(() => useNewsHistory({ lang: "ar" }), {
      wrapper,
    });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetHistory).toHaveBeenCalledWith({
      symbols: undefined,
      categories: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      page: 1,
      limit: 20,
      lang: "ar",
    });
  });
});

describe("useNewsHistoryInfinite", () => {
  it("starts at page=1 and uses limit=50", async () => {
    mockGetHistory.mockResolvedValueOnce({
      items: [],
      page: 1,
      totalPages: 1,
    });
    const { result } = renderHook(() => useNewsHistoryInfinite(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockGetHistory).toHaveBeenCalledWith({
      symbols: undefined,
      categories: undefined,
      dateFrom: undefined,
      dateTo: undefined,
      page: 1,
      limit: 50,
      lang: undefined,
    });
  });
});
