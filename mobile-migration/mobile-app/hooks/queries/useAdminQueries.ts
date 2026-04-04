/**
 * Admin query hooks — users list, activities feed, and user management mutations.
 */

import {
    adminCreateUser,
    adminDeleteUser,
    adminUpdatePassword,
    adminUpdateUsername,
    fetchAdminActivities,
    fetchAdminUsers,
    type AdminActivitiesResponse,
    type AdminUsersResponse,
} from "@/services/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ── Query key constants ─────────────────────────────────────────────

export const adminKeys = {
  users: () => ["admin", "users"] as const,
  activities: (page?: number, userId?: number, txnType?: string, stock?: string, dateFrom?: string, dateTo?: string) =>
    ["admin", "activities", page, userId, txnType, stock, dateFrom, dateTo] as const,
} as const;

// ── Hooks ───────────────────────────────────────────────────────────

/** All registered users with portfolio stats. */
export function useAdminUsers(enabled = true) {
  return useQuery<AdminUsersResponse>({
    queryKey: adminKeys.users(),
    queryFn: fetchAdminUsers,
    enabled,
  });
}

/** Paginated activity feed across all users. */
export function useAdminActivities(params: {
  page?: number;
  perPage?: number;
  userId?: number;
  txnType?: string;
  stockSymbol?: string;
  dateFrom?: string;
  dateTo?: string;
  enabled?: boolean;
}) {
  return useQuery<AdminActivitiesResponse>({
    queryKey: adminKeys.activities(params.page, params.userId, params.txnType, params.stockSymbol, params.dateFrom, params.dateTo),
    queryFn: () =>
      fetchAdminActivities({
        page: params.page,
        per_page: params.perPage ?? 50,
        user_id: params.userId,
        txn_type: params.txnType,
        stock_symbol: params.stockSymbol,
        date_from: params.dateFrom,
        date_to: params.dateTo,
      }),
    enabled: params.enabled ?? true,
  });
}

// ── Mutations ───────────────────────────────────────────────────────

export function useAdminCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { username: string; password: string; name?: string }) =>
      adminCreateUser(body),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.users() }),
  });
}

export function useAdminUpdateUsername() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, username }: { userId: number; username: string }) =>
      adminUpdateUsername(userId, username),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.users() }),
  });
}

export function useAdminUpdatePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ userId, password }: { userId: number; password: string }) =>
      adminUpdatePassword(userId, password),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.users() }),
  });
}

export function useAdminDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (userId: number) => adminDeleteUser(userId),
    onSuccess: () => qc.invalidateQueries({ queryKey: adminKeys.users() }),
  });
}
