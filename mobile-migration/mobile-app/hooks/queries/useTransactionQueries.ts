/**
 * Transaction query hooks — paginated list + single-transaction fetch.
 */

import { useQuery } from "@tanstack/react-query";
import {
  getTransactions,
  getTransaction,
  type TransactionListResponse,
  type TransactionRecord,
} from "@/services/api";

// ── Query key constants ─────────────────────────────────────────────

export const transactionKeys = {
  list: (page?: number, portfolio?: string, type?: string) =>
    ["transactions", page, portfolio, type] as const,
  detail: (id?: string) => ["transaction", id] as const,
} as const;

// ── Hooks ───────────────────────────────────────────────────────────

/** Paginated transaction list with optional filters. */
export function useTransactions(params: {
  page?: number;
  perPage?: number;
  portfolio?: string;
  symbol?: string;
  type?: string;
}) {
  return useQuery<TransactionListResponse>({
    queryKey: transactionKeys.list(params.page, params.portfolio, params.type),
    queryFn: () =>
      getTransactions({
        page: params.page,
        per_page: params.perPage ?? 50,
        portfolio: params.portfolio,
        symbol: params.symbol,
      }),
  });
}

/** Single transaction for edit mode. */
export function useTransaction(editId?: string) {
  return useQuery<TransactionRecord>({
    queryKey: transactionKeys.detail(editId),
    queryFn: () => getTransaction(Number(editId)),
    enabled: !!editId,
    staleTime: 0,
  });
}
