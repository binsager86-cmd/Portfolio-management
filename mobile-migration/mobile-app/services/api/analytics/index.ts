/**
 * Analytics barrel — re-exports all domain modules.
 *
 * Consumers continue to use: import { getPerformance } from "@/services/api"
 */

export type {
  AIAnalysisResult,
  AIUploadResult,
  AIValidationResult,
  AnalysisStock,
  BackupImportResult,
  BonusByStock,
  BonusShareRecord,
  BonusSharesResponse,
  CashIntegrityResult,
  DividendByStock,
  DividendListResponse,
  DividendRecord,
  FinancialLineItem,
  FinancialStatement,
  IntegrityCheckResult,
  PaginationInfo,
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
  SecurityRecord,
  SnapshotRecord,
  StockMetric,
  StockScore,
  StockScoreSummary,
  TradingSummary,
  TradingSummaryResponse,
  TradingTransaction,
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
