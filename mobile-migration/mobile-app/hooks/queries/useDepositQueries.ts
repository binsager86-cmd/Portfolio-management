/**
 * Deposit query hooks — paginated list.
 */

import { useQuery } from "@tanstack/react-query";
import { getDeposits, type CashDepositListResponse } from "@/services/api";

// ── Query key constants ─────────────────────────────────────────────

export const depositKeys = {
  list: (page?: number, portfolio?: string) =>
    ["deposits", page, portfolio] as const,
} as const;

// ── Hooks ───────────────────────────────────────────────────────────

/** Paginated deposits with optional portfolio filter. */
export function useDeposits(params: {
  page?: number;
  pageSize?: number;
  portfolio?: string;
}) {
  return useQuery<CashDepositListResponse>({
    queryKey: depositKeys.list(params.page, params.portfolio),
    queryFn: () =>
      getDeposits({
        page: params.page,
        page_size: params.pageSize ?? 25,
        portfolio: params.portfolio,
      }),
    placeholderData: (prev) => prev,
  });
}
