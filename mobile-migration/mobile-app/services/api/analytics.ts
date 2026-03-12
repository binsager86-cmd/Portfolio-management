/**
 * Analytics endpoints: performance, risk, snapshots, trading, dividends,
 * tracker, integrity, backup/restore, PFM, fundamental analysis,
 * securities master, and AI analyst.
 */

import api from "./client";
import { API_TIMEOUT_LONG } from "@/constants/layout";
import type {
  PerformanceData,
  RiskMetrics,
  RealizedProfitData,
  SnapshotRecord,
  TradingSummaryResponse,
  DividendListResponse,
  DividendByStock,
  BonusSharesResponse,
  SaveSnapshotResponse,
  IntegrityCheckResult,
  CashIntegrityResult,
  BackupImportResult,
  AIAnalysisResult,
  SecurityRecord,
  PfmSnapshotSummary,
  PfmSnapshotFull,
  PfmAsset,
  PfmLiability,
  PfmIncomeExpense,
  PaginationInfo,
  AnalysisStock,
  StockScoreSummary,
  FinancialStatement,
  StockMetric,
  StockScore,
  AIUploadResult,
  AIValidationResult,
  ValuationResult,
  ValuationRunResult,
} from "./types";

export type {
  PerformanceData,
  RiskMetrics,
  RealizedProfitDetail,
  RealizedProfitData,
  SnapshotRecord,
  TradingSummary,
  TradingTransaction,
  TradingSummaryResponse,
  DividendRecord,
  DividendListResponse,
  DividendByStock,
  BonusShareRecord,
  BonusByStock,
  BonusSharesResponse,
  SaveSnapshotResponse,
  IntegrityCheckResult,
  CashIntegrityResult,
  BackupImportResult,
  AIAnalysisResult,
  SecurityRecord,
  PfmSnapshotSummary,
  PfmAsset,
  PfmLiability,
  PfmIncomeExpense,
  PfmSnapshotFull,
  PaginationInfo,
  AnalysisStock,
  StockScoreSummary,
  FinancialStatement,
  FinancialLineItem,
  StockMetric,
  ValuationResult,
  StockScore,
  AIUploadResult,
  AIValidationResult,
  ValuationRunResult,
} from "./types";

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

// ── Dividends & Bonus Shares ────────────────────────────────────────

/** List all dividend entries. */
export async function getDividends(params?: {
  stock_symbol?: string;
  page?: number;
  page_size?: number;
}): Promise<DividendListResponse> {
  const { data } = await api.get<{ status: string; data: DividendListResponse }>(
    "/api/v1/dividends",
    { params }
  );
  return data.data;
}

/** Dividends grouped by stock with yield on cost. */
export async function getDividendsByStock(): Promise<{ stocks: DividendByStock[]; count: number }> {
  const { data } = await api.get<{ status: string; data: { stocks: DividendByStock[]; count: number } }>(
    "/api/v1/dividends/by-stock"
  );
  return data.data;
}

/** List bonus share transactions. */
export async function getBonusShares(params?: {
  page?: number;
  page_size?: number;
}): Promise<BonusSharesResponse> {
  const { data } = await api.get<{ status: string; data: BonusSharesResponse }>(
    "/api/v1/dividends/bonus-shares",
    { params }
  );
  return data.data;
}

/** Soft-delete a dividend record. */
export async function deleteDividend(dividendId: number): Promise<void> {
  await api.delete(`/api/v1/dividends/${dividendId}`);
}

// ── Portfolio Tracker ───────────────────────────────────────────────

/** Save today's portfolio snapshot. */
export async function saveSnapshot(payload?: {
  snapshot_date?: string;
  portfolio_value?: number;
  deposit_cash?: number;
  notes?: string;
}): Promise<SaveSnapshotResponse> {
  const { data } = await api.post<{ status: string; data: SaveSnapshotResponse }>(
    "/api/v1/tracker/save-snapshot",
    payload ?? {},
    { timeout: API_TIMEOUT_LONG },
  );
  return data.data;
}

/** Delete a single snapshot. */
export async function deleteSnapshot(snapshotId: number): Promise<void> {
  await api.delete(`/api/v1/tracker/snapshots/${snapshotId}`);
}

/** Delete all snapshots. */
export async function deleteAllSnapshots(): Promise<{ deleted_count: number; message: string }> {
  const { data } = await api.delete<{ status: string; data: { deleted_count: number; message: string } }>(
    "/api/v1/tracker/snapshots"
  );
  return data.data;
}

/** Recalculate all snapshot metrics. */
export async function recalculateSnapshots(): Promise<{ updated: number; message: string }> {
  const { data } = await api.post<{ status: string; data: { updated: number; message: string } }>(
    "/api/v1/tracker/recalculate",
    {},
    { timeout: API_TIMEOUT_LONG },
  );
  return data.data;
}

// ── Integrity ───────────────────────────────────────────────────────

/** Run full integrity check. */
export async function integrityCheck(): Promise<IntegrityCheckResult> {
  const { data } = await api.get<{ status: string; data: IntegrityCheckResult }>(
    "/api/v1/integrity/check"
  );
  return data.data;
}

/** Check cash balance for a portfolio. */
export async function checkCashIntegrity(portfolio: string): Promise<CashIntegrityResult> {
  const { data } = await api.get<{ status: string; data: CashIntegrityResult }>(
    `/api/v1/integrity/cash/${portfolio}`
  );
  return data.data;
}

// ── Backup & Restore ────────────────────────────────────────────────

/** Download full Excel backup as blob. */
export async function exportBackup(): Promise<Blob> {
  const response = await api.get("/api/v1/backup/export", {
    responseType: "blob",
  });
  return response.data;
}

/** Import transactions from Excel (Backup & Restore flow). */
export async function importBackup(
  file: FormData,
  mode: "merge" | "replace" = "merge",
  sheetName?: string,
): Promise<BackupImportResult> {
  const params: Record<string, string> = { mode };
  if (sheetName) params.sheet_name = sheetName;
  const { data } = await api.post<{ status: string; data: BackupImportResult }>(
    "/api/v1/backup/import",
    file,
    {
      headers: { "Content-Type": "multipart/form-data" },
      params,
    }
  );
  return data.data;
}

// ── AI Analyst ──────────────────────────────────────────────────────

/** Generate AI portfolio analysis. */
export async function analyzePortfolio(payload: {
  prompt?: string;
  include_holdings?: boolean;
  include_transactions?: boolean;
  include_performance?: boolean;
  language?: string;
}): Promise<AIAnalysisResult> {
  const { data } = await api.post<{ status: string; data: AIAnalysisResult }>(
    "/api/v1/ai/analyze",
    payload
  );
  return data.data;
}

/** Check AI service status. */
export async function getAIStatus(): Promise<{ configured: boolean; model: string }> {
  const { data } = await api.get<{ status: string; data: { configured: boolean; model: string } }>(
    "/api/v1/ai/status"
  );
  return data.data;
}

// ── Securities Master ───────────────────────────────────────────────

/** List securities. */
export async function getSecurities(params?: {
  exchange?: string;
  status?: string;
  search?: string;
}): Promise<{ securities: SecurityRecord[]; count: number }> {
  const { data } = await api.get<{ status: string; data: { securities: SecurityRecord[]; count: number } }>(
    "/api/v1/securities",
    { params }
  );
  return data.data;
}

/** Create security. */
export async function createSecurity(payload: {
  canonical_ticker: string;
  exchange: string;
  display_name?: string;
  currency?: string;
  country?: string;
  sector?: string;
}): Promise<{ security_id: string; message: string }> {
  const { data } = await api.post<{ status: string; data: { security_id: string; message: string } }>(
    "/api/v1/securities",
    payload
  );
  return data.data;
}

// ── PFM (Personal Finance Management) ───────────────────────────────

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

// ── Fundamental Analysis ────────────────────────────────────────────

/** List analysis stocks. */
export async function getAnalysisStocks(params?: { search?: string }): Promise<{ stocks: AnalysisStock[]; count: number }> {
  const { data } = await api.get<{ status: string; data: { stocks: AnalysisStock[]; count: number } }>(
    "/api/v1/fundamental/stocks",
    { params },
  );
  return data.data;
}

/** Get single analysis stock with summary. */
export async function getAnalysisStock(stockId: number): Promise<AnalysisStock> {
  const { data } = await api.get<{ status: string; data: AnalysisStock }>(
    `/api/v1/fundamental/stocks/${stockId}`,
  );
  return data.data;
}

/** Create analysis stock. */
export async function createAnalysisStock(payload: {
  symbol: string;
  company_name: string;
  exchange?: string;
  currency?: string;
  sector?: string;
  industry?: string;
  country?: string;
  outstanding_shares?: number;
}): Promise<{ id: number; symbol: string; message: string }> {
  const { data } = await api.post<{ status: string; data: { id: number; symbol: string; message: string } }>(
    "/api/v1/fundamental/stocks",
    payload,
  );
  return data.data;
}

/** Update analysis stock. */
export async function updateAnalysisStock(
  stockId: number,
  payload: Partial<{
    company_name: string;
    exchange: string;
    currency: string;
    sector: string;
    industry: string;
    outstanding_shares: number;
  }>,
): Promise<{ message: string }> {
  const { data } = await api.put<{ status: string; data: { message: string } }>(
    `/api/v1/fundamental/stocks/${stockId}`,
    payload,
  );
  return data.data;
}

/** Delete analysis stock (cascade). */
export async function deleteAnalysisStock(stockId: number): Promise<void> {
  await api.delete(`/api/v1/fundamental/stocks/${stockId}`);
}

/** Get financial statements with line items. */
export async function getStatements(
  stockId: number,
  statementType?: string,
): Promise<{ statements: FinancialStatement[]; count: number }> {
  const { data } = await api.get<{ status: string; data: { statements: FinancialStatement[]; count: number } }>(
    `/api/v1/fundamental/stocks/${stockId}/statements`,
    { params: statementType ? { statement_type: statementType } : undefined },
  );
  return data.data;
}

/** Create / upsert a financial statement with optional line items. */
export async function createStatement(
  stockId: number,
  payload: {
    statement_type: string;
    fiscal_year: number;
    fiscal_quarter?: number;
    period_end_date: string;
    extracted_by?: string;
    notes?: string;
    line_items?: Array<{ code: string; name: string; amount: number; is_total?: boolean }>;
  },
): Promise<{ id: number; message: string }> {
  const { data } = await api.post<{ status: string; data: { id: number; message: string } }>(
    `/api/v1/fundamental/stocks/${stockId}/statements`,
    payload,
  );
  return data.data;
}

/** Delete a financial statement. */
export async function deleteStatement(stockId: number, statementId: number): Promise<void> {
  await api.delete(`/api/v1/fundamental/stocks/${stockId}/statements/${statementId}`);
}

/** Update a single line item amount. */
export async function updateLineItem(
  itemId: number,
  amount: number,
): Promise<{ message: string }> {
  const { data } = await api.put<{ status: string; data: { message: string } }>(
    `/api/v1/fundamental/line-items/${itemId}`,
    { amount },
  );
  return data.data;
}

/**
 * Upload a financial report PDF for AI-powered extraction.
 */
export async function uploadFinancialStatement(
  stockId: number,
  fileUri: string,
  fileName: string,
  mimeType: string = "application/pdf",
): Promise<AIUploadResult> {
  const formData = new FormData();

  if (typeof window !== "undefined" && typeof window.document !== "undefined") {
    const response = await fetch(fileUri);
    const blob = await response.blob();
    const file = new File([blob], fileName, { type: mimeType });
    formData.append("file", file);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    formData.append("file", {
      uri: fileUri,
      name: fileName,
      type: mimeType,
    } as any);
  }

  const { data } = await api.post<{ status: string; data: AIUploadResult }>(
    `/api/v1/fundamental/stocks/${stockId}/upload-statement`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: API_TIMEOUT_LONG, // 5 min for AI extraction
    },
  );
  return data.data;
}

/**
 * Step 2: Validate extracted financial data against the PDF.
 * Sends the same PDF again — backend uses cached extraction for cross-check.
 */
export async function validateFinancialStatement(
  stockId: number,
  fileUri: string,
  fileName: string,
  mimeType: string = "application/pdf",
): Promise<AIValidationResult> {
  const formData = new FormData();

  if (typeof window !== "undefined" && typeof window.document !== "undefined") {
    const response = await fetch(fileUri);
    const blob = await response.blob();
    const file = new File([blob], fileName, { type: mimeType });
    formData.append("file", file);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    formData.append("file", {
      uri: fileUri,
      name: fileName,
      type: mimeType,
    } as any);
  }

  const { data } = await api.post<{ status: string; data: AIValidationResult }>(
    `/api/v1/fundamental/stocks/${stockId}/validate-statement`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: API_TIMEOUT_LONG, // 5 min for AI validation
    },
  );
  return data.data;
}

/**
 * Step 3: Verify every line item is placed in the correct statement type.
 * Sends the same PDF — backend uses cached data for AI placement check.
 */
export async function verifyStatementPlacement(
  stockId: number,
  fileUri: string,
  fileName: string,
  mimeType: string = "application/pdf",
): Promise<AIValidationResult> {
  const formData = new FormData();

  if (typeof window !== "undefined" && typeof window.document !== "undefined") {
    const response = await fetch(fileUri);
    const blob = await response.blob();
    const file = new File([blob], fileName, { type: mimeType });
    formData.append("file", file);
  } else {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    formData.append("file", {
      uri: fileUri,
      name: fileName,
      type: mimeType,
    } as any);
  }

  const { data } = await api.post<{ status: string; data: AIValidationResult }>(
    `/api/v1/fundamental/stocks/${stockId}/verify-placement`,
    formData,
    {
      headers: { "Content-Type": "multipart/form-data" },
      timeout: API_TIMEOUT_LONG, // 5 min for placement verification
    },
  );
  return data.data;
}

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

/** Get growth analysis. */
export async function getGrowthAnalysis(
  stockId: number,
): Promise<{ growth: Record<string, Array<{ period: string; prev_period: string; growth: number }>> }> {
  const { data } = await api.get<{ status: string; data: { growth: Record<string, Array<{ period: string; prev_period: string; growth: number }>> } }>(
    `/api/v1/fundamental/stocks/${stockId}/growth`,
  );
  return data.data;
}

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
