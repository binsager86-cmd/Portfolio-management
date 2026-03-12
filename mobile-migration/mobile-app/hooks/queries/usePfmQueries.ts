/**
 * Personal Finance Manager query hooks.
 */

import { useQuery } from "@tanstack/react-query";
import {
  getPfmSnapshots,
  getPfmSnapshot,
  type PfmSnapshotFull,
} from "@/services/api";

// ── Query key constants ─────────────────────────────────────────────

export const pfmKeys = {
  list: () => ["pfm-snapshots"] as const,
  detail: (id: number | null) => ["pfm-snapshot", id] as const,
} as const;

// ── Hooks ───────────────────────────────────────────────────────────

/** List of all PFM snapshots. */
export function usePfmSnapshots() {
  return useQuery({
    queryKey: pfmKeys.list(),
    queryFn: () => getPfmSnapshots({ page: 1, page_size: 100 }),
  });
}

/** Full PFM snapshot detail — enabled when id is non-null. */
export function usePfmSnapshot(id: number | null) {
  return useQuery<PfmSnapshotFull>({
    queryKey: pfmKeys.detail(id),
    queryFn: () => getPfmSnapshot(id!),
    enabled: id != null,
  });
}
