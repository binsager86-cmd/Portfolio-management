/**
 * React Query hooks for News & Market Data.
 *
 * Uses cursor-based infinite scrolling for the feed
 * and standard queries for detail views.
 */

import { newsApi } from "@/services/news/newsApi";
import type { NewsCategory, NewsHistoryResponse, NewsItem } from "@/services/news/types";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";

export const NEWS_KEYS = {
  all: ["news"] as const,
  feed: (filters: { symbols?: string[]; categories?: NewsCategory[]; lang?: string }) =>
    [...NEWS_KEYS.all, "feed", filters] as const,
  detail: (id: string) => [...NEWS_KEYS.all, "detail", id] as const,
  history: (filters: { symbols?: string[]; categories?: NewsCategory[]; lang?: string; dateFrom?: string; dateTo?: string; page?: number }) =>
    [...NEWS_KEYS.all, "history", filters] as const,
  historyInfinite: (filters: { symbols?: string[]; categories?: NewsCategory[]; lang?: string; dateFrom?: string; dateTo?: string }) =>
    [...NEWS_KEYS.all, "history-infinite", filters] as const,
};

/** Paginated news feed with cursor-based infinite scrolling */
export function useNewsFeed(options: {
  symbols?: string[];
  categories?: NewsCategory[];
  lang?: string;
  enabled?: boolean;
} = {}) {
  return useInfiniteQuery({
    queryKey: NEWS_KEYS.feed({ symbols: options.symbols, categories: options.categories, lang: options.lang }),
    queryFn: ({ pageParam }) =>
      newsApi.getFeed({
        symbols: options.symbols,
        categories: options.categories,
        cursor: pageParam as string | undefined,
        limit: 15,
        lang: options.lang,
      }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextPageCursor,
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
    enabled: options.enabled !== false,
  });
}

/** Single news item detail */
export function useNewsDetail(id: string, enabled = true) {
  return useQuery<NewsItem>({
    queryKey: NEWS_KEYS.detail(id),
    queryFn: () => newsApi.getItem(id),
    staleTime: 15 * 60_000,
    retry: 1,
    enabled: enabled && !!id,
  });
}

/** Paginated news history from stored articles */
export function useNewsHistory(options: {
  symbols?: string[];
  categories?: NewsCategory[];
  lang?: string;
  dateFrom?: string;
  dateTo?: string;
  page?: number;
  enabled?: boolean;
} = {}) {
  return useQuery<NewsHistoryResponse>({
    queryKey: NEWS_KEYS.history({
      symbols: options.symbols,
      categories: options.categories,
      lang: options.lang,
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
      page: options.page,
    }),
    queryFn: () =>
      newsApi.getHistory({
        symbols: options.symbols,
        categories: options.categories,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        page: options.page ?? 1,
        limit: 20,
        lang: options.lang,
      }),
    staleTime: 2 * 60_000,
    gcTime: 15 * 60_000,
    retry: 2,
    enabled: options.enabled !== false,
    placeholderData: (prev) => prev,
  });
}

/** Infinite-scroll news history — pages through stored articles */
export function useNewsHistoryInfinite(options: {
  symbols?: string[];
  categories?: NewsCategory[];
  lang?: string;
  dateFrom?: string;
  dateTo?: string;
  enabled?: boolean;
} = {}) {
  return useInfiniteQuery({
    queryKey: NEWS_KEYS.historyInfinite({
      symbols: options.symbols,
      categories: options.categories,
      lang: options.lang,
      dateFrom: options.dateFrom,
      dateTo: options.dateTo,
    }),
    queryFn: ({ pageParam }) =>
      newsApi.getHistory({
        symbols: options.symbols,
        categories: options.categories,
        dateFrom: options.dateFrom,
        dateTo: options.dateTo,
        page: pageParam as number,
        limit: 50,
        lang: options.lang,
      }),
    initialPageParam: 1,
    getNextPageParam: (lastPage) =>
      lastPage.page < lastPage.totalPages ? lastPage.page + 1 : undefined,
    staleTime: 2 * 60_000,
    gcTime: 15 * 60_000,
    retry: 2,
    enabled: options.enabled !== false,
  });
}
