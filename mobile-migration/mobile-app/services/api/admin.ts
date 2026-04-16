/**
 * Admin endpoints: user management, activity logs.
 */

import api from "./client";
import type { AdminActivitiesResponse, AdminUsersResponse } from "./types";

export async function fetchAdminUsers(): Promise<AdminUsersResponse> {
  const { data } = await api.get<AdminUsersResponse>("/api/v1/admin/users");
  return data;
}

export async function fetchAdminActivities(params?: {
  page?: number;
  per_page?: number;
  user_id?: number;
  txn_type?: string;
  stock_symbol?: string;
  date_from?: string;
  date_to?: string;
}): Promise<AdminActivitiesResponse> {
  const { data } = await api.get<AdminActivitiesResponse>(
    "/api/v1/admin/activities",
    { params },
  );
  return data;
}

export async function adminCreateUser(body: {
  username: string;
  password: string;
  name?: string;
}): Promise<{ status: string; message: string }> {
  const { data } = await api.post("/api/v1/admin/users", body);
  return data;
}

export async function adminUpdateUsername(
  userId: number,
  username: string,
): Promise<{ status: string; message: string }> {
  const { data } = await api.put(`/api/v1/admin/users/${userId}/username`, { username });
  return data;
}

export async function adminUpdatePassword(
  userId: number,
  password: string,
): Promise<{ status: string; message: string }> {
  const { data } = await api.put(`/api/v1/admin/users/${userId}/password`, { password });
  return data;
}

export async function adminDeleteUser(
  userId: number,
): Promise<{ status: string; message: string }> {
  const { data } = await api.delete(`/api/v1/admin/users/${userId}`);
  return data;
}
