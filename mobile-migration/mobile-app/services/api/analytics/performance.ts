/**
 * Performance, risk, snapshots & trading endpoints.
 */

import api from "../client";
import type {
  PerformanceData,
  RealizedProfitData,
  RiskMetrics,
  SnapshotRecord,
  TradingSummaryResponse,
} from "../types";

// ── Performance & Risk ──────────────────────────────────────────────

/** Get portfolio performance (TWR, MWRR, ROI). */
export async function getPerformance(params?: {
  portfolio?: string;
  period?: string;
}): Promise<PerformanceData> {
  const { data } = await api.get<{ status: string; data: PerformanceData }>(
    "/api/v1/analytics/performance",
    { params }
  );
  return data.data;
}

/** Get risk metrics (Sharpe, Sortino). */
export async function getRiskMetrics(params: {
  rf_rate: number;
  mar?: number;
}): Promise<RiskMetrics> {
  const { data } = await api.get<{ status: string; data: RiskMetrics }>(
    "/api/v1/analytics/risk-metrics",
    { params }
  );
  return data.data;
}

/** Get stored risk-free rate for current user. */
export async function getRfRate(): Promise<number | null> {
  const { data } = await api.get<{ status: string; data: { rf_rate: number | null } }>(
    "/api/v1/analytics/settings/rf-rate"
  );
  return data.data.rf_rate;
}

/** Save risk-free rate for current user (percentage, e.g. 4.25). */
export async function setRfRate(rfRate: number): Promise<number> {
  const { data } = await api.put<{ status: string; data: { rf_rate: number } }>(
    "/api/v1/analytics/settings/rf-rate",
    null,
    { params: { rf_rate: rfRate } }
  );
  return data.data.rf_rate;
}

/** Get realized profit breakdown. */
export async function getRealizedProfit(): Promise<RealizedProfitData> {
  const { data } = await api.get<{ status: string; data: RealizedProfitData }>(
    "/api/v1/analytics/realized-profit"
  );
  return data.data;
}

/** Get portfolio snapshots (date-filtered). */
export async function getSnapshots(params?: {
  portfolio?: string;
  start_date?: string;
  end_date?: string;
}): Promise<{ snapshots: SnapshotRecord[]; count: number }> {
  const { data } = await api.get<{ status: string; data: { snapshots: SnapshotRecord[]; count: number } }>(
    "/api/v1/analytics/snapshots",
    { params }
  );
  return data.data;
}

// ── Trading ─────────────────────────────────────────────────────────

/** Get trading section summary with enriched transactions. */
export async function getTradingSummary(params?: {
  portfolio?: string;
  txn_type?: string;
  search?: string;
  source?: string;
  date_from?: string;
  date_to?: string;
  page?: number;
  page_size?: number;
}): Promise<TradingSummaryResponse> {
  const { data } = await api.get<{ status: string; data: TradingSummaryResponse }>(
    "/api/v1/portfolio/trading-summary",
    { params }
  );
  return data.data;
}

/** Recalculate WAC for all positions and backfill avg_cost columns. */
export async function recalculateWAC(): Promise<{
  updated: number;
  positions_processed: number;
  errors: string[];
}> {
  const { data } = await api.post<{
    status: string;
    data: { updated: number; positions_processed: number; errors: string[] };
  }>("/api/v1/portfolio/trading-recalculate");
  return data.data;
}

/** Export trading data as Excel file. Returns blob URL for download/sharing. */
export async function exportTradingExcel(): Promise<Blob> {
  const { data } = await api.get("/api/v1/portfolio/trading-export", {
    responseType: "blob",
  });
  return data;
}
