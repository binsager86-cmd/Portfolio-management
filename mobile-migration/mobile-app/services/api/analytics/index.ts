/**
 * Analytics barrel — re-exports all domain modules.
 *
 * Consumers continue to use: import { getPerformance } from "@/services/api"
 */

export type {
  AdminActivitiesResponse,
  AdminActivity,
  AdminUser,
  AdminUsersResponse,
  AIAnalysisResult,
  AIUploadResult,
  AIValidationResult,
  AnalysisStock,
  BackupImportResult,
  BonusByStock,
  BonusShareRecord,
  BonusSharesResponse,
  CashIntegrityResult,
  CategoryBreakdown,
  DividendByStock,
  DividendListResponse,
  DividendRecord,
  FinancialLineItem,
  FinancialStatement,
  IntegrityCheckResult,
  PaginationInfo,
  PeerMultiple,
  PerformanceData,
  PfmAsset,
  PfmIncomeExpense,
  PfmLiability,
  PfmSnapshotFull,
  PfmSnapshotSummary,
  RealizedProfitData,
  RealizedProfitDetail,
  RiskMetrics,
  SaveSnapshotResponse,
  ScoreBreakdown,
  ScoreMetricBreakdown,
  SecurityRecord,
  SnapshotRecord,
  StockMetric,
  StockScore,
  StockScoreSummary,
  TradingSummary,
  TradingSummaryResponse,
  TradingTransaction,
  ValuationDefaults,
  ValuationResult,
  ValuationRunResult,
} from "../types";

export * from "./performance";
export * from "./dividends";
export * from "./tracker";
export * from "./securities";
export * from "./pfm";
export * from "./fundamental";
export * from "./extraction";
export * from "./metrics";
