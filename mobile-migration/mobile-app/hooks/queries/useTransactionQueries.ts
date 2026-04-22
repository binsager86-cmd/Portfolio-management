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
  list: (page?: number, perPage?: number, portfolio?: string, symbol?: string, type?: string) =>
    ["transactions", page, perPage, portfolio, symbol, type] as const,
  all: () => ["transactions", "all"] as const,
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
    queryKey: transactionKeys.list(params.page, params.perPage, params.portfolio, params.symbol, params.type),
    queryFn: () =>
      getTransactions({
        page: params.page,
        per_page: params.perPage ?? 50,
        portfolio: params.portfolio,
        symbol: params.symbol,
      }),
    placeholderData: (prev) => prev,
  });
}

/** All transactions (unpaginated) — used by HistoricalPerformance. */
export function useAllTransactions() {
  return useQuery<TransactionListResponse>({
    queryKey: transactionKeys.all(),
    queryFn: () => getTransactions({ page: 1, per_page: 10000 }),
    staleTime: 5 * 60 * 1000,
  });
}

/** Lightweight transaction count — cached briefly so UI visibility decisions stay
 *  in sync when transactions are added/removed elsewhere (other tab, mutation). */
export function useTransactionCount() {
  return useQuery({
    queryKey: ["transactions", "count"],
    queryFn: async () => {
      const data = await getTransactions({ page: 1, per_page: 1 });
      return data.count;
    },
    staleTime: 60_000,
  });
}

/** Single transaction for edit mode — cache for the duration of an edit
 *  session to avoid refetching on every modal open/remount. */
export function useTransaction(editId?: string) {
  return useQuery<TransactionRecord>({
    queryKey: transactionKeys.detail(editId),
    queryFn: () => getTransaction(Number(editId)),
    enabled: !!editId,
    staleTime: 30_000,
    refetchOnMount: false,
  });
}
