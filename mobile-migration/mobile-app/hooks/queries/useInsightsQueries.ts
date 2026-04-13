/**
 * Local insights query hooks — Kuwait market pulse data.
 */

import {
    getKuwaitInsights,
    type KuwaitInsightsResponse,
} from "@/services/localInsights/boursaKuwait";
import { useQuery } from "@tanstack/react-query";

// ── Query key constants ─────────────────────────────────────────────

export const insightsKeys = {
  kuwait: () => ["insights", "kuwait"] as const,
} as const;

// ── Hooks ───────────────────────────────────────────────────────────

/**
 * Fetch Kuwait market insights — cached for 1 hour (both React Query + service layer).
 *
 * Only enabled when `enabled` is true (i.e., user has Kuwait holdings).
 */
export function useKuwaitInsights(enabled = true) {
  return useQuery<KuwaitInsightsResponse>({
    queryKey: insightsKeys.kuwait(),
    queryFn: getKuwaitInsights,
    staleTime: 60 * 60 * 1000, // 1 hour — matches service cache TTL
    gcTime: 2 * 60 * 60 * 1000, // keep in gc for 2 hours
    refetchOnMount: false,
    refetchOnWindowFocus: false,
    retry: 1,
    enabled,
  });
}
