/**
 * Dividend & bonus-share query hooks.
 */

import { useQuery } from "@tanstack/react-query";
import {
  getDividends,
  getDividendsByStock,
  getBonusShares,
  type DividendListResponse,
  type BonusSharesResponse,
} from "@/services/api";

// ── Query key constants ─────────────────────────────────────────────

export const dividendKeys = {
  list: (page?: number) => ["dividends", page] as const,
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
