/**
 * Stock & securities query hooks — user stocks, reference stock lists,
 * and securities master.
 */

import {
    getSecurities,
    getStockList,
    getStocks
} from "@/services/api";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

/** Strip non-alphanumeric chars (except spaces, hyphens, dots) and cap length. */
function sanitizeSearch(raw?: string): string | undefined {
  if (!raw) return undefined;
  return raw.replace(/[^a-zA-Z0-9\s.\-]/g, "").slice(0, 100).trim() || undefined;
}

// ── Query key constants ─────────────────────────────────────────────

export const stockKeys = {
  list: (portfolio?: string, search?: string) =>
    ["stocks", portfolio, search] as const,
  /** Separate key when querying all stocks for merge modal. */
  allForMerge: () => ["all-stocks-for-merge"] as const,
  stockList: (market: string) => ["stock-list", market] as const,
  stockListSearch: (market: string, search: string) =>
    ["stock-list-search", market, search] as const,
  securities: (search?: string) => ["securities", search] as const,
} as const;

// ── Hooks ───────────────────────────────────────────────────────────

/**
 * User's portfolio stocks with optional portfolio/search filters.
 * Stable 60 s cache for dropdown / picker use.
 */
export function useStocks(params?: { portfolio?: string; search?: string }) {
  const search = useMemo(() => sanitizeSearch(params?.search), [params?.search]);

  return useQuery({
    queryKey: stockKeys.list(params?.portfolio, search),
    queryFn: () =>
      getStocks({
        portfolio: params?.portfolio,
        search,
      }),
    staleTime: 60_000,
  });
}

/** All stocks (for merge modal). */
export function useAllStocksForMerge() {
  return useQuery({
    queryKey: stockKeys.allForMerge(),
    queryFn: () => getStocks(),
  });
}

/**
 * Reference/hardcoded stock list for a market (kuwait | us).
 * Static data — cached aggressively (Infinity staleTime, 24 h gcTime).
 */
export function useStockList(market: string, enabled = true) {
  return useQuery({
    queryKey: stockKeys.stockList(market),
    queryFn: () => getStockList({ market }),
    staleTime: Infinity,
    gcTime: 24 * 60 * 60_000,
    enabled,
  });
}

/**
 * Live server-side stock search — augments hardcoded list with yfinance
 * results for US market. Only fires when search has 2+ characters.
 */
export function useStockListSearch(market: string, search: string, enabled = true) {
  const clean = useMemo(() => sanitizeSearch(search), [search]);
  return useQuery({
    queryKey: stockKeys.stockListSearch(market, clean ?? ""),
    queryFn: () => getStockList({ market, search: clean }),
    enabled: enabled && !!clean && clean.length >= 2,
    staleTime: 30_000,
    gcTime: 5 * 60_000,
  });
}

/** Securities master list with optional search. */
export function useSecurities(search?: string, enabled = true) {
  const cleanSearch = useMemo(() => sanitizeSearch(search), [search]);

  return useQuery({
    queryKey: stockKeys.securities(cleanSearch),
    queryFn: () => getSecurities({ search: cleanSearch }),
    enabled,
  });
}
