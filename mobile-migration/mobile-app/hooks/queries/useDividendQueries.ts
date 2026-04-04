/**
 * Dividend & bonus-share query hooks.
 */

import {
    getBonusShares,
    getDividends,
    getDividendsByStock,
    type BonusSharesResponse,
    type DividendListResponse,
} from "@/services/api";
import { useQuery } from "@tanstack/react-query";

// ── Query key constants ─────────────────────────────────────────────

export const dividendKeys = {
  list: (page?: number) => ["dividends", page] as const,
  all: () => ["dividends", "all"] as const,
  byStock: () => ["dividends-by-stock"] as const,
  bonus: () => ["bonus-shares"] as const,
} as const;

// ── Hooks ───────────────────────────────────────────────────────────

/** Paginated dividend list. */
export function useDividends(page = 1, pageSize = 50) {
  return useQuery<DividendListResponse>({
    queryKey: dividendKeys.list(page),
    queryFn: () => getDividends({ page, page_size: pageSize }),
  });
}

/** All dividends (for charting — large page_size). */
export function useAllDividends() {
  return useQuery<DividendListResponse>({
    queryKey: dividendKeys.all(),
    queryFn: () => getDividends({ page: 1, page_size: 9999 }),
    staleTime: 5 * 60 * 1000,
  });
}

/** Dividends grouped by stock with yield on cost. */
export function useDividendsByStock() {
  return useQuery({
    queryKey: dividendKeys.byStock(),
    queryFn: () => getDividendsByStock(),
  });
}

/** Bonus share transactions (lazy — enable via `enabled`). */
export function useBonusShares(enabled = true) {
  return useQuery<BonusSharesResponse>({
    queryKey: dividendKeys.bonus(),
    queryFn: () => getBonusShares(),
    enabled,
  });
}
