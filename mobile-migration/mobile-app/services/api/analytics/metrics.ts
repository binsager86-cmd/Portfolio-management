/**
 * Metrics, growth, scores & valuation endpoints.
 */

import api from "../client";
import type {
  StockMetric,
  StockScore,
  StockScoreSummary,
  ValuationResult,
  ValuationRunResult,
} from "../types";

// ── Metrics ─────────────────────────────────────────────────────────

/** Get metrics for a stock. */
export async function getStockMetrics(
  stockId: number,
  metricType?: string,
): Promise<{ metrics: StockMetric[]; grouped: Record<string, StockMetric[]>; count: number }> {
  const { data } = await api.get<{ status: string; data: { metrics: StockMetric[]; grouped: Record<string, StockMetric[]>; count: number } }>(
    `/api/v1/fundamental/stocks/${stockId}/metrics`,
    { params: metricType ? { metric_type: metricType } : undefined },
  );
  return data.data;
}

/** Calculate (recalculate) metrics for a period. */
export async function calculateMetrics(
  stockId: number,
  payload: { period_end_date: string; fiscal_year: number; fiscal_quarter?: number },
): Promise<{ metrics: Record<string, Record<string, number | null>> }> {
  const { data } = await api.post<{ status: string; data: { metrics: Record<string, Record<string, number | null>> } }>(
    `/api/v1/fundamental/stocks/${stockId}/metrics/calculate`,
    payload,
  );
  return data.data;
}

// ── Growth ──────────────────────────────────────────────────────────

/** Get growth analysis. */
export async function getGrowthAnalysis(
  stockId: number,
): Promise<{ growth: Record<string, Array<{ period: string; prev_period: string; growth: number }>> }> {
  const { data } = await api.get<{ status: string; data: { growth: Record<string, Array<{ period: string; prev_period: string; growth: number }>> } }>(
    `/api/v1/fundamental/stocks/${stockId}/growth`,
  );
  return data.data;
}

// ── Scores ──────────────────────────────────────────────────────────

/** Get / compute stock score. */
export async function getStockScore(stockId: number): Promise<StockScoreSummary & { details?: Record<string, number>; error?: string }> {
  const { data } = await api.get<{ status: string; data: StockScoreSummary & { details?: Record<string, number>; error?: string } }>(
    `/api/v1/fundamental/stocks/${stockId}/score`,
  );
  return data.data;
}

/** Get score history. */
export async function getScoreHistory(stockId: number): Promise<{ scores: StockScore[]; count: number }> {
  const { data } = await api.get<{ status: string; data: { scores: StockScore[]; count: number } }>(
    `/api/v1/fundamental/stocks/${stockId}/scores/history`,
  );
  return data.data;
}

// ── Valuations ──────────────────────────────────────────────────────

/** Get saved valuations. */
export async function getValuations(stockId: number): Promise<{ valuations: ValuationResult[]; count: number }> {
  const { data } = await api.get<{ status: string; data: { valuations: ValuationResult[]; count: number } }>(
    `/api/v1/fundamental/stocks/${stockId}/valuations`,
  );
  return data.data;
}

/** Run Graham Number valuation. */
export async function runGrahamValuation(
  stockId: number,
  payload: { eps: number; book_value_per_share: number; multiplier?: number },
): Promise<ValuationRunResult> {
  const { data } = await api.post<{ status: string; data: ValuationRunResult }>(
    `/api/v1/fundamental/stocks/${stockId}/valuations/graham`,
    payload,
  );
  return data.data;
}

/** Run DCF valuation. */
export async function runDCFValuation(
  stockId: number,
  payload: {
    fcf: number;
    growth_rate_stage1: number;
    growth_rate_stage2: number;
    discount_rate: number;
    stage1_years?: number;
    stage2_years?: number;
    terminal_growth?: number;
    shares_outstanding?: number;
  },
): Promise<ValuationRunResult> {
  const { data } = await api.post<{ status: string; data: ValuationRunResult }>(
    `/api/v1/fundamental/stocks/${stockId}/valuations/dcf`,
    payload,
  );
  return data.data;
}

/** Run DDM valuation. */
export async function runDDMValuation(
  stockId: number,
  payload: {
    last_dividend: number;
    growth_rate: number;
    required_return: number;
    high_growth_years?: number;
    high_growth_rate?: number;
  },
): Promise<ValuationRunResult> {
  const { data } = await api.post<{ status: string; data: ValuationRunResult }>(
    `/api/v1/fundamental/stocks/${stockId}/valuations/ddm`,
    payload,
  );
  return data.data;
}

/** Run Comparable Multiples valuation. */
export async function runMultiplesValuation(
  stockId: number,
  payload: {
    metric_value: number;
    peer_multiple: number;
    multiple_type?: string;
    shares_outstanding?: number;
  },
): Promise<ValuationRunResult> {
  const { data } = await api.post<{ status: string; data: ValuationRunResult }>(
    `/api/v1/fundamental/stocks/${stockId}/valuations/multiples`,
    payload,
  );
  return data.data;
}

// ── Local Market Insights ───────────────────────────────────────────

export { clearInsightsCache, getKuwaitInsights, hasKuwaitHoldings } from "../../localInsights/boursaKuwait";
export type { InsightTrend, KuwaitInsight, KuwaitInsightsResponse } from "../../localInsights/boursaKuwait";
