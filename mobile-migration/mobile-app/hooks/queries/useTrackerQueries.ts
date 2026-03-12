/**
 * Portfolio Tracker query hooks — snapshots.
 */

import { useQuery } from "@tanstack/react-query";
import { getSnapshots } from "@/services/api";

// ── Query key constants ─────────────────────────────────────────────

export const trackerKeys = {
  snapshots: () => ["snapshots"] as const,
} as const;

// ── Hooks ───────────────────────────────────────────────────────────

/** All portfolio snapshots. */
export function useSnapshots() {
  return useQuery({
    queryKey: trackerKeys.snapshots(),
    queryFn: () => getSnapshots(),
  });
}
