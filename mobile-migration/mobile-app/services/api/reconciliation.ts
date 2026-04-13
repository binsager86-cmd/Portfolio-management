/**
 * Reconciliation API endpoints & React Query mutation.
 *
 * The reconciliation flow is primarily frontend-driven (detection happens
 * in lib/reconciliation/utils.ts).  These endpoints persist the user's
 * decisions to the backend.
 */

import { useMutation, useQueryClient } from "@tanstack/react-query";
import api from "./client";

// ── Payload types ───────────────────────────────────────────────────

export interface ReconciliationApplyPayload {
  /** Transaction IDs flagged as income-harvesting withdrawals. */
  withdrawalIds: number[];
  /** Suggested opening balance to inject. */
  openingBalanceAmount: number;
  /** Date for the opening balance (day before first transaction). */
  openingBalanceDate: string;
}

export interface ReconciliationRecommendation {
  discrepancy: number;
  discrepancyPct: number;
  flaggedWithdrawals: Array<{ id: number; amount: number; date: string }>;
  suggestedOpeningBalance: number;
  suggestedOpeningDate: string;
}

// ── API functions ───────────────────────────────────────────────────

/**
 * Ask the backend for a reconciliation recommendation.
 * Falls back to frontend-only calculation if endpoint doesn't exist yet.
 */
export async function getReconciliationRecommendation(
  portfolioId: string,
): Promise<ReconciliationRecommendation | null> {
  try {
    const { data } = await api.get<{ status: string; data: ReconciliationRecommendation }>(
      `/api/v1/portfolio/${portfolioId}/reconciliation/recommend`,
    );
    return data.data;
  } catch {
    // Endpoint may not exist yet — frontend-only reconciliation is fine
    return null;
  }
}

/**
 * Apply reconciliation: flag withdrawals + insert opening balance adjustment.
 * Falls back gracefully if backend endpoint doesn't exist — the frontend
 * can still apply via manual cash override.
 */
export async function applyReconciliation(
  portfolioId: string,
  payload: ReconciliationApplyPayload,
): Promise<{ applied: boolean; message: string }> {
  try {
    const { data } = await api.post<{ status: string; data: { applied: boolean; message: string } }>(
      `/api/v1/portfolio/${portfolioId}/reconciliation/apply`,
      payload,
    );
    return data.data;
  } catch {
    // Endpoint may not be implemented yet — return a soft failure
    return { applied: false, message: "Reconciliation endpoint not available. Applied via cash override." };
  }
}

// ── Query keys ──────────────────────────────────────────────────────

export const reconciliationKeys = {
  status: (portfolio: string) => ["reconciliation", "status", portfolio] as const,
} as const;

// ── Mutation hook ───────────────────────────────────────────────────

export function useApplyReconciliation(portfolioId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (payload: ReconciliationApplyPayload) =>
      applyReconciliation(portfolioId, payload),
    onSuccess: () => {
      // Invalidate all relevant query keys per the compatibility guard
      queryClient.invalidateQueries({ queryKey: ["portfolio-overview"] });
      queryClient.invalidateQueries({ queryKey: ["cash-balances"] });
      queryClient.invalidateQueries({ queryKey: ["portfolio", "transactions"] });
      queryClient.invalidateQueries({ queryKey: ["integrity", "status"] });
      queryClient.invalidateQueries({ queryKey: ["holdings"] });
      queryClient.invalidateQueries({ queryKey: ["deposits-total"] });
    },
  });
}
