/**
 * Shared price-refresh hook.
 *
 * Calls the backend `updatePrices` endpoint (yfinance) then invalidates
 * every query whose data depends on stock prices.  This ensures that
 * refreshing from *any* tab (Overview, Holdings, …) propagates fresh
 * prices across the entire app.
 *
 * Usage:
 *   const { refresh, isRefreshing } = usePriceRefresh();
 *   <RefreshControl refreshing={isRefreshing} onRefresh={refresh} />
 */

import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { updatePrices } from "@/services/api";

// ── Query keys that depend on live prices ───────────────────────────

export const PRICE_DEPENDENT_QUERY_KEYS = [
  "portfolio-overview",
  "holdings",
  "performance",
  "risk-metrics",
  "realized-profit",
  "cash-balances",
  "trading-summary",
  "snapshots",
  "snapshots-chart",
  "tracker-data",
] as const;

// ── Hook ────────────────────────────────────────────────────────────

export function usePriceRefresh() {
  const queryClient = useQueryClient();
  const [isRefreshing, setIsRefreshing] = useState(false);

  /**
   * 1. Hit backend to fetch latest prices from yfinance (best-effort).
   * 2. Invalidate all price-dependent query caches so every screen
   *    picks up the new data on next render / focus.
   */
  const refresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      await updatePrices();
    } catch (e) {
      // Price update is best-effort; stale prices are still usable
      console.warn("Price update failed:", e);
    }

    // Invalidate (not refetch) so frozen/inactive tabs also go stale
    await Promise.all(
      PRICE_DEPENDENT_QUERY_KEYS.map((key) =>
        queryClient.invalidateQueries({ queryKey: [key] })
      )
    );

    setIsRefreshing(false);
  }, [queryClient]);

  return { refresh, isRefreshing } as const;
}
