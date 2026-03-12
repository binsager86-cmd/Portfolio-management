/**
 * Shared transaction mutation hooks with consistent
 * cache invalidation and cash-impact feedback.
 *
 * Every transaction CRUD (create / update / delete / restore) returns
 * cash_balance + total_value from the backend. These hooks:
 *   1. Invalidate all dependent query caches in parallel
 *   2. Surface a user-facing success message with the updated cash balance
 */

import { Platform, Alert } from "react-native";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { showErrorAlert } from "@/lib/errorHandling";
import { ALERT_DEFER_MS } from "@/constants/layout";
import {
  createTransaction,
  updateTransaction,
  deleteTransaction,
  restoreTransaction,
  TransactionCreate,
  TransactionMutationResponse,
} from "@/services/api";
import { formatCurrency } from "@/lib/currency";

// ── Query keys invalidated after any transaction mutation ──────────

export const TXN_DEPENDENT_QUERY_KEYS = [
  "portfolio-overview",
  "cash-balances",
  "transactions",
  "holdings",
  "performance",
  "risk-metrics",
  "realized-profit",
  "trading-summary",
  "deposits",
  "deposits-total",
  "snapshots",
  "snapshots-chart",
  "tracker-data",
] as const;

/** Invalidate all caches that depend on transaction data.
 * Uses invalidateQueries (not refetchQueries) so that INACTIVE queries
 * on other tabs are also marked stale and will refetch on next mount.
 */
async function invalidateTransactionCaches(
  queryClient: ReturnType<typeof useQueryClient>
) {
  await Promise.all(
    TXN_DEPENDENT_QUERY_KEYS.map((key) =>
      queryClient.invalidateQueries({ queryKey: [key] })
    )
  );
}

// ── User feedback helper ────────────────────────────────────────────

function showCashAlert(
  title: string,
  message: string,
  cashBalance: number | null | undefined
) {
  const cashLine =
    cashBalance != null
      ? `\nCash Balance: ${formatCurrency(cashBalance, "KWD")}`
      : "";
  const fullMsg = `${message}${cashLine}`;

  if (Platform.OS === "web") {
    window.alert(fullMsg);
  } else {
    Alert.alert(title, fullMsg);
  }
}

// Error display now handled by @/lib/errorHandling

// ── Hooks ───────────────────────────────────────────────────────────

/**
 * Create transaction mutation.
 *
 * @param onSuccessCallback – optional extra callback (e.g. navigate back)
 */
export function useCreateTransaction(onSuccessCallback?: () => void) {
  const queryClient = useQueryClient();

  return useMutation<TransactionMutationResponse, Error, TransactionCreate>({
    mutationFn: createTransaction,
    onSuccess: async (result) => {
      await invalidateTransactionCaches(queryClient);

      // Fire optional callback first (e.g. navigation)
      onSuccessCallback?.();

      // Deferred feedback so it doesn't block navigation
      setTimeout(() => {
        showCashAlert(
          "Success",
          "Transaction added successfully!",
          result.cash_balance
        );
      }, ALERT_DEFER_MS);
    },
    onError: (err) => showErrorAlert("Error", err),
  });
}

/**
 * Update transaction mutation.
 */
export function useUpdateTransaction(onSuccessCallback?: () => void) {
  const queryClient = useQueryClient();

  return useMutation<
    TransactionMutationResponse,
    Error,
    { txnId: number; payload: Partial<TransactionCreate> }
  >({
    mutationFn: ({ txnId, payload }) => updateTransaction(txnId, payload),
    onSuccess: async (result) => {
      await invalidateTransactionCaches(queryClient);
      onSuccessCallback?.();
      setTimeout(() => {
        showCashAlert(
          "Updated",
          "Transaction updated.",
          result.cash_balance
        );
      }, ALERT_DEFER_MS);
    },
    onError: (err) => showErrorAlert("Error", err),
  });
}

/**
 * Delete (soft-delete) transaction mutation.
 */
export function useDeleteTransaction(onSuccessCallback?: () => void) {
  const queryClient = useQueryClient();

  return useMutation<TransactionMutationResponse, Error, number>({
    mutationFn: deleteTransaction,
    onSuccess: async (result) => {
      await invalidateTransactionCaches(queryClient);
      onSuccessCallback?.();
      showCashAlert(
        "Deleted",
        "Transaction deleted.",
        result.cash_balance
      );
    },
    onError: (err) => showErrorAlert("Error", err),
  });
}

/**
 * Restore a soft-deleted transaction.
 */
export function useRestoreTransaction(onSuccessCallback?: () => void) {
  const queryClient = useQueryClient();

  return useMutation<TransactionMutationResponse, Error, number>({
    mutationFn: restoreTransaction,
    onSuccess: async (result) => {
      await invalidateTransactionCaches(queryClient);
      onSuccessCallback?.();
      showCashAlert(
        "Restored",
        "Transaction restored.",
        result.cash_balance
      );
    },
    onError: (err) => showErrorAlert("Error", err),
  });
}
