/**
 * Personal Finance Management (PFM) endpoints.
 */

import api from "../client";
import type {
  PaginationInfo,
  PfmAsset,
  PfmIncomeExpense,
  PfmLiability,
  PfmSnapshotFull,
  PfmSnapshotSummary,
} from "../types";

/** List PFM snapshots. */
export async function getPfmSnapshots(params?: {
  page?: number;
  page_size?: number;
}): Promise<{ snapshots: PfmSnapshotSummary[]; count: number; pagination: PaginationInfo }> {
  const { data } = await api.get<{ status: string; data: { snapshots: PfmSnapshotSummary[]; count: number; pagination: PaginationInfo } }>(
    "/api/v1/pfm/snapshots",
    { params }
  );
  return data.data;
}

/** Get full PFM snapshot with assets/liabilities/income. */
export async function getPfmSnapshot(snapshotId: number): Promise<PfmSnapshotFull> {
  const { data } = await api.get<{ status: string; data: PfmSnapshotFull }>(
    `/api/v1/pfm/snapshots/${snapshotId}`
  );
  return data.data;
}

/** Create PFM snapshot. */
export async function createPfmSnapshot(payload: {
  snapshot_date: string;
  notes?: string;
  assets: Omit<PfmAsset, "value_kwd">[];
  liabilities: PfmLiability[];
  income_expenses: PfmIncomeExpense[];
}): Promise<{ id: number; net_worth: number; message: string }> {
  const { data } = await api.post<{ status: string; data: { id: number; net_worth: number; message: string } }>(
    "/api/v1/pfm/snapshots",
    payload
  );
  return data.data;
}

/** Delete PFM snapshot. */
export async function deletePfmSnapshot(snapshotId: number): Promise<void> {
  await api.delete(`/api/v1/pfm/snapshots/${snapshotId}`);
}
