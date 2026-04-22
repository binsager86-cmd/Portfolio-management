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

import { updatePrices } from "@/services/api";
import { sendPriceUpdateNotification } from "@/services/notifications/priceUpdateNotification";
import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useState } from "react";

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
    let result: Awaited<ReturnType<typeof updatePrices>> | undefined;
    try {
      result = await updatePrices();
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

    // Fire push notification for the daily price update
    if (result) {
      sendPriceUpdateNotification({
        updatedCount: result.updated_count ?? result.updatedCount ?? 0,
        message: result.message,
      }).catch(() => {});
    }

    setIsRefreshing(false);
  }, [queryClient]);

  return { refresh, isRefreshing } as const;
}
