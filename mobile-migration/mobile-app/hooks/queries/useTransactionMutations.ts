/**
 * Transaction mutation hooks with optimistic cache updates.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  type TransactionCreate,
  type TransactionListResponse,
} from "@/services/api";
import { transactionKeys } from "./useTransactionQueries";

/** Create a transaction with optimistic list append. */
export function useCreateTransaction() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (payload: TransactionCreate) => createTransaction(payload),
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey: ["transactions"] });

      const lists = qc.getQueriesData<TransactionListResponse>({
        queryKey: ["transactions"],
      });

      // Optimistic: increment counts so UI reflects immediately
      for (const [key, data] of lists) {
        if (!data) continue;
        qc.setQueryData<TransactionListResponse>(key, {
          ...data,
          count: data.count + 1,
        });
      }

      return { lists };
    },
    onError: (_err, _vars, ctx) => {
      // Rollback to previous cache
      if (ctx?.lists) {
        for (const [key, data] of ctx.lists) {
          qc.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      // Invalidate all data that depends on transactions
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["portfolio-overview"] });
      qc.invalidateQueries({ queryKey: ["holdings"] });
      qc.invalidateQueries({ queryKey: ["cash-balances"] });
    },
  });
}

/** Update a transaction with optimistic patch. */
export function useUpdateTransaction() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: ({ id, payload }: { id: number; payload: Partial<TransactionCreate> }) =>
      updateTransaction(id, payload),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["portfolio-overview"] });
      qc.invalidateQueries({ queryKey: ["holdings"] });
    },
  });
}

/** Delete a transaction with optimistic removal from list cache. */
export function useDeleteTransaction() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: (id: number) => deleteTransaction(id),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ["transactions"] });

      const lists = qc.getQueriesData<TransactionListResponse>({
        queryKey: ["transactions"],
      });

      for (const [key, data] of lists) {
        if (!data?.transactions) continue;
        qc.setQueryData<TransactionListResponse>(key, {
          ...data,
          count: data.count - 1,
          transactions: data.transactions.filter((t) => t.id !== id),
        });
      }

      return { lists };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.lists) {
        for (const [key, data] of ctx.lists) {
          qc.setQueryData(key, data);
        }
      }
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: ["transactions"] });
      qc.invalidateQueries({ queryKey: ["portfolio-overview"] });
      qc.invalidateQueries({ queryKey: ["holdings"] });
      qc.invalidateQueries({ queryKey: ["cash-balances"] });
    },
  });
}
