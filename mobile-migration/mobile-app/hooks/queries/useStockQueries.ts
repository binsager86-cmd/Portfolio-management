/**
 * Stock & securities query hooks — user stocks, reference stock lists,
 * and securities master.
 */

import { useQuery } from "@tanstack/react-query";
import {
  getStocks,
  getStockList,
  getSecurities,
  type StockListEntry,
} from "@/services/api";

// ── Query key constants ─────────────────────────────────────────────

export const stockKeys = {
  list: (portfolio?: string, search?: string) =>
    ["stocks", portfolio, search] as const,
  /** Separate key when querying all stocks for merge modal. */
  allForMerge: () => ["all-stocks-for-merge"] as const,
  stockList: (market: string) => ["stock-list", market] as const,
  securities: (search?: string) => ["securities", search] as const,
} as const;

// ── Hooks ───────────────────────────────────────────────────────────

/**
 * User's portfolio stocks with optional portfolio/search filters.
 * Stable 60 s cache for dropdown / picker use.
 */
export function useStocks(params?: { portfolio?: string; search?: string }) {
  return useQuery({
    queryKey: stockKeys.list(params?.portfolio, params?.search),
    queryFn: () =>
      getStocks({
        portfolio: params?.portfolio,
        search: params?.search || undefined,
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

/** Securities master list with optional search. */
export function useSecurities(search?: string, enabled = true) {
  return useQuery({
    queryKey: stockKeys.securities(search),
    queryFn: () => getSecurities({ search: search || undefined }),
    enabled,
  });
}
