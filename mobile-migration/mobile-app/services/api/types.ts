/**
 * Shared TypeScript types for the Portfolio API.
 */

// ── Auth ────────────────────────────────────────────────────────────

export interface LoginResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
  user_id: number;
  username: string;
  name?: string;
}

export interface RefreshResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in: number;
}

// ── Portfolio / Overview ────────────────────────────────────────────

export interface PortfolioBreakdown {
  market_value_kwd?: number;
  total_cost_kwd?: number;
  unrealized_pnl_kwd?: number;
  realized_pnl_kwd?: number;
  holding_count?: number;
  currency?: string;
  [key: string]: unknown;
}

export interface PortfolioValueEntry {
  market_value?: number;
  market_value_kwd?: number;
  total_cost_kwd?: number;
  currency?: string;
  holding_count?: number;
  [key: string]: unknown;
}

export interface AccountEntry {
  id: number;
  name: string;
  balance?: number;
  currency?: string;
  [key: string]: unknown;
}

export interface OverviewData {
  total_deposits: number;
  total_withdrawals: number;
  net_deposits: number;
  total_invested: number;
  total_divested: number;
  total_dividends: number;
  total_fees: number;
  transaction_count: number;
  portfolio_value: number;
  cash_balance: number;
  total_value: number;
  total_gain: number;
  roi_percent: number;
  usd_kwd_rate: number;
  by_portfolio: Record<string, PortfolioBreakdown>;
  portfolio_values: Record<string, PortfolioValueEntry>;
  accounts: AccountEntry[];
  daily_movement?: number;
  daily_movement_pct?: number;
  prev_snapshot_value?: number;
  prev_snapshot_date?: string;
  cagr_percent?: number;
  cagr_years?: number;
  cagr_start_value?: number;
  cagr_start_date?: string;
  mwrr_percent?: number | null;
}

// ── Holdings ────────────────────────────────────────────────────────

export interface Holding {
  company: string;
  symbol: string;
  pe_ratio: number | null;
  shares_qty: number;
  avg_cost: number;
  total_cost: number;
  market_price: number;
  market_value: number;
  unrealized_pnl: number;
  realized_pnl: number;
  cash_dividends: number;
  reinvested_dividends: number;
  bonus_dividend_shares: number;
  bonus_share_value: number;
  dividend_yield_on_cost_pct: number;
  total_pnl: number;
  pnl_pct: number;
  currency: string;
  market_value_kwd: number;
  unrealized_pnl_kwd: number;
  total_pnl_kwd: number;
  total_cost_kwd: number;
  weight_by_cost: number;
  weighted_dividend_yield_on_cost: number;
}

export interface HoldingsResponse {
  holdings: Holding[];
  totals: {
    total_market_value_kwd: number;
    total_cost_kwd: number;
    total_unrealized_pnl_kwd: number;
    total_realized_pnl_kwd: number;
    total_pnl_kwd: number;
    total_dividends_kwd: number;
  };
  total_portfolio_value_kwd: number;
  cash_balance_kwd: number;
  usd_kwd_rate: number;
  count: number;
}

// ── Transactions ────────────────────────────────────────────────────

export interface TransactionCreate {
  portfolio: string;
  stock_symbol: string;
  txn_date: string; // YYYY-MM-DD
  txn_type: "Buy" | "Sell" | "DIVIDEND_ONLY";
  shares: number;
  purchase_cost?: number | null;
  sell_value?: number | null;
  bonus_shares?: number | null;
  cash_dividend?: number | null;
  reinvested_dividend?: number | null;
  fees?: number | null;
  price_override?: number | null;
  planned_cum_shares?: number | null;
  broker?: string | null;
  reference?: string | null;
  notes?: string | null;
}

export interface TransactionRecord {
  id: number;
  user_id: number;
  portfolio: string;
  stock_symbol: string;
  txn_date: string;
  txn_type: string;
  shares: number;
  purchase_cost: number | null;
  sell_value: number | null;
  bonus_shares: number | null;
  cash_dividend: number | null;
  reinvested_dividend: number | null;
  fees: number | null;
  price_override: number | null;
  planned_cum_shares: number | null;
  broker: string | null;
  reference: string | null;
  notes: string | null;
  category: string | null;
  is_deleted: boolean;
  created_at: number;
}

export interface TransactionListResponse {
  transactions: TransactionRecord[];
  count: number;
  pagination: {
    page: number;
    per_page: number;
    total_pages: number;
    total_items: number;
  };
}

export interface TransactionMutationResponse {
  id: number;
  message: string;
  cash_balance: number;
  total_value: number;
}

export interface TransactionImportResult {
  imported: number;
  skipped?: number;
  message?: string;
  [key: string]: unknown;
}

// ── Cash Deposits ───────────────────────────────────────────────────

export interface CashDepositCreate {
  portfolio: string;
  deposit_date: string; // YYYY-MM-DD
  amount: number;
  currency?: string;
  bank_name?: string | null;
  source?: string; // "deposit" | "withdrawal"
  notes?: string | null;
}

export interface CashDepositRecord {
  id: number;
  user_id: number;
  portfolio: string;
  deposit_date: string;
  amount: number;
  currency: string;
  bank_name: string | null;
  source: string | null;
  notes: string | null;
  is_deleted: number;
  created_at: number | null;
}

export interface CashDepositListResponse {
  deposits: CashDepositRecord[];
  count: number;
  total_kwd: number;
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}

// ── Cash Balances ───────────────────────────────────────────────────

export interface PortfolioCashBalance {
  balance: number;
  currency: string;
  manual_override: boolean;
}

// ── Analytics ───────────────────────────────────────────────────────

export interface PerformanceData {
  period: string;
  start_date: string;
  end_date: string;
  twr_percent: number;
  mwrr_percent: number;
  roi_percent: number;
  total_gain_kwd: number;
  starting_value: number;
  ending_value: number;
  net_deposits: number;
  snapshots_count: number;
}

export interface RiskMetrics {
  sharpe_ratio: number;
  sortino_ratio: number;
  rf_rate: number;
  mar: number;
}

export interface RealizedProfitDetail {
  id: number;
  symbol: string;
  portfolio: string;
  txn_date: string;
  shares: number;
  sell_value: number;
  avg_cost_at_txn: number;
  realized_pnl: number;
  realized_pnl_kwd: number;
  currency: string;
  source: string;
}

export interface RealizedProfitData {
  total_realized_kwd: number;
  total_profit_kwd: number;
  total_loss_kwd: number;
  details: RealizedProfitDetail[];
}

export interface SnapshotRecord {
  id: number;
  snapshot_date: string;
  portfolio_value: number;
  daily_movement: number;
  beginning_difference: number | null;
  deposit_cash: number;
  accumulated_cash: number;
  net_gain: number;
  change_percent: number;
  roi_percent: number;
  twr_percent: number | null;
  mwrr_percent: number | null;
  created_at: number;
}

// ── Trading ─────────────────────────────────────────────────────────

export interface TradingSummary {
  total_buys: number;
  buy_count: number;
  total_sells: number;
  sell_count: number;
  total_deposits: number;
  deposit_count: number;
  total_withdrawals: number;
  withdrawal_count: number;
  unrealized_pnl: number;
  realized_pnl: number;
  total_pnl: number;
  total_dividends: number;
  dividend_count: number;
  total_fees: number;
  net_cash_flow: number;
  total_return_pct: number;
  total_transactions: number;
  total_trades: number;
}

export interface TradingTransaction {
  id: number;
  date: string | null;
  symbol: string | null;
  company_name: string | null;
  stock_id: number | null;
  portfolio: string;
  type: string;
  status: string;
  source: string;
  quantity: number;
  avg_cost: number;
  price: number;
  current_price: number;
  sell_price: number;
  value: number;
  pnl: number;
  pnl_pct: number;
  fees: number;
  dividend: number;
  bonus_shares: number;
  notes: string | null;
}

export interface TradingSummaryResponse {
  summary: TradingSummary;
  transactions: TradingTransaction[];
  pagination: {
    page: number;
    page_size: number;
    total_items: number;
    total_pages: number;
  };
}

// ── Dividends ───────────────────────────────────────────────────────

export interface DividendRecord {
  id: number;
  stock_symbol: string;
  portfolio: string;
  txn_date: string;
  cash_dividend: number;
  bonus_shares: number;
  reinvested_dividend: number;
  currency: string;
  cash_dividend_kwd: number;
  reinvested_kwd: number;
  notes: string | null;
}

export interface DividendListResponse {
  dividends: DividendRecord[];
  count: number;
  totals: {
    total_cash_dividend_kwd: number;
    total_bonus_shares: number;
    total_reinvested_kwd: number;
    unique_stocks: number;
  };
  pagination: { page: number; page_size: number; total_items: number; total_pages: number };
}

export interface DividendByStock {
  stock_symbol: string;
  total_cash_dividend_kwd: number;
  total_bonus_shares: number;
  total_reinvested_kwd: number;
  dividend_count: number;
  total_cost: number;
  yield_on_cost_pct: number;
}

// ── Bonus Shares ────────────────────────────────────────────────────

export interface BonusShareRecord {
  id: number;
  stock_symbol: string;
  portfolio: string;
  txn_date: string;
  bonus_shares: number;
  shares: number;
  currency: string;
  notes: string | null;
}

export interface BonusByStock {
  stock_symbol: string;
  total_bonus_shares: number;
  bonus_count: number;
}

export interface BonusSharesResponse {
  records: BonusShareRecord[];
  count: number;
  total_bonus_shares: number;
  by_stock: BonusByStock[];
  pagination?: { page: number; page_size: number; total_items: number; total_pages: number };
}

// ── Stocks ──────────────────────────────────────────────────────────

export interface StockRecord {
  id: number;
  symbol: string;
  name: string | null;
  portfolio: string;
  currency: string;
  current_price: number | null;
  yf_ticker: string | null;
  tradingview_symbol: string | null;
  tradingview_exchange: string | null;
  price_source: string | null;
  last_updated: string | null;
}

export interface StockCreate {
  symbol: string;
  name?: string;
  portfolio: string;
  currency?: string;
  current_price?: number;
  yf_ticker?: string;
}

export interface StockListEntry {
  symbol: string;
  name: string;
  yf_ticker: string;
}

// ── Portfolio Tracker ───────────────────────────────────────────────

export interface SaveSnapshotResponse {
  id: number;
  snapshot_date: string;
  portfolio_value: number;
  daily_movement: number;
  beginning_difference: number;
  deposit_cash: number;
  accumulated_cash: number;
  net_gain: number;
  roi_percent: number;
  change_percent: number;
  action: string;
  message: string;
}

// ── Integrity ───────────────────────────────────────────────────────

export interface IntegrityCheckResult {
  status: string;
  checks: Array<{ name: string; passed: boolean; details?: string }>;
  [key: string]: unknown;
}

export interface CashIntegrityResult {
  portfolio: string;
  expected: number;
  actual: number;
  difference: number;
  [key: string]: unknown;
}

// ── Backup ──────────────────────────────────────────────────────────

export interface BackupImportResult {
  imported: number;
  skipped: number;
  message: string;
  [key: string]: unknown;
}

// ── PFM ─────────────────────────────────────────────────────────────

export interface PfmSnapshotSummary {
  id: number;
  snapshot_date: string;
  notes: string | null;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
  created_at: number;
}

export interface PfmAsset {
  asset_type: string;
  category: string;
  name: string;
  quantity: number;
  price: number;
  currency: string;
  value_kwd: number;
}

export interface PfmLiability {
  category: string;
  amount_kwd: number;
  is_current: boolean;
  is_long_term: boolean;
}

export interface PfmIncomeExpense {
  kind: string;
  category: string;
  monthly_amount: number;
  is_finance_cost: boolean;
  is_gna: boolean;
  sort_order: number;
}

export interface PfmSnapshotFull extends PfmSnapshotSummary {
  assets: PfmAsset[];
  liabilities: PfmLiability[];
  income_expenses: PfmIncomeExpense[];
}

export interface PaginationInfo {
  page: number;
  page_size: number;
  total_pages: number;
  total_count: number;
}

// ── Fundamental Analysis ────────────────────────────────────────────

export interface AnalysisStock {
  id: number;
  user_id: number;
  symbol: string;
  company_name: string;
  exchange: string;
  currency: string;
  sector: string | null;
  industry: string | null;
  country: string | null;
  isin: string | null;
  cik: string | null;
  description: string | null;
  website: string | null;
  outstanding_shares: number | null;
  created_at: number;
  updated_at: number;
  statement_count?: number;
  metric_count?: number;
  valuation_count?: number;
  latest_score?: StockScoreSummary | null;
}

export interface StockScoreSummary {
  overall_score: number | null;
  fundamental_score: number | null;
  valuation_score: number | null;
  growth_score: number | null;
  quality_score: number | null;
  scoring_date?: string;
}

export interface FinancialStatement {
  id: number;
  stock_id: number;
  statement_type: string;
  fiscal_year: number;
  fiscal_quarter: number | null;
  period_end_date: string;
  filing_date: string | null;
  source_file: string | null;
  extracted_by: string;
  confidence_score: number | null;
  notes: string | null;
  created_at: number;
  line_items: FinancialLineItem[];
}

export interface FinancialLineItem {
  id: number;
  statement_id: number;
  line_item_code: string;
  line_item_name: string;
  amount: number;
  currency: string;
  order_index: number | null;
  is_total: boolean;
  manually_edited: boolean;
}

export interface StockMetric {
  id: number;
  stock_id: number;
  fiscal_year: number;
  fiscal_quarter: number | null;
  period_end_date: string;
  metric_type: string;
  metric_name: string;
  metric_value: number;
  created_at: number;
}

export interface ValuationResult {
  id: number;
  stock_id: number;
  model_type: string;
  valuation_date: string;
  intrinsic_value: number | null;
  parameters: Record<string, number | string | null>;
  assumptions: Record<string, number | string | null>;
  created_by_user_id: number | null;
  created_at: number;
}

export interface StockScore {
  id: number;
  stock_id: number;
  scoring_date: string;
  overall_score: number | null;
  fundamental_score: number | null;
  valuation_score: number | null;
  growth_score: number | null;
  quality_score: number | null;
  details: Record<string, number>;
  analyst_notes: string | null;
  created_at: number;
}

export interface AIUploadResult {
  message: string;
  upload_id?: string;
  statements: Array<{
    statement_id: number;
    statement_type: string;
    period_end_date: string;
    fiscal_year: number;
    line_items_count: number;
    currency: string;
  }>;
  source_file: string;
  pages_processed: number;
  model: string;
  confidence: number;
  cached: boolean;
  audit: {
    checks_total: number;
    checks_passed: number;
    checks_failed: number;
    retries_used: number;
    validation_corrections: number;
    details: Array<{
      statement_type: string;
      period: string;
      rule: string;
      expected: number;
      actual: number;
      passed: boolean;
      detail: string;
      discrepancy: number;
    }>;
  };
}

export interface AIValidationResult {
  message: string;
  corrections_applied: number;
  confidence: number;
  statements?: Array<{
    statement_id: number;
    statement_type: string;
    period_end_date: string;
    fiscal_year: number;
    line_items_count: number;
    currency: string;
  }>;
}

export interface ValuationRunResult {
  id: number;
  model_type: string;
  intrinsic_value: number | null;
  parameters: Record<string, number | string | null>;
  assumptions: Record<string, number | string | null>;
  message?: string;
  [key: string]: unknown;
}

export interface StatementAuditLog {
  id: number;
  statement_id: number;
  line_item_id: number;
  action: "extracted" | "validated" | "manually_edited" | "ai_corrected";
  old_value: number | null;
  new_value: number;
  changed_by: "ai" | "user";
  timestamp: number;
  notes?: string;
}

// ── Securities Master ───────────────────────────────────────────────

export interface SecurityRecord {
  security_id: string;
  exchange: string;
  canonical_ticker: string;
  display_name: string | null;
  isin: string | null;
  currency: string | null;
  country: string | null;
  status: string | null;
  sector: string | null;
}

// ── AI Analyst ──────────────────────────────────────────────────────

export interface AIAnalysisResult {
  analysis: string;
  model: string;
  prompt_tokens?: number;
  completion_tokens?: number;
  [key: string]: unknown;
}

// ── Financial Extraction Pipeline ───────────────────────────────────

/** A single line item extracted from a financial document. */
export interface ExtractedLineItem {
  code: string;
  name: string;
  amount: number;
  is_total?: boolean;
  section?: string;
}

/** Scratchpad reasoning trace from the AI's internal calculation pass. */
export interface ScratchpadEntry {
  section: string;
  items: Array<{ name: string; amount: number }>;
  computed_sum: number;
  reported_total: number;
  matches: boolean;
  discrepancy?: number;
  note?: string;
}

/** Result of a single extraction pass (one page or section). */
export interface ExtractionPassResult {
  statement_type: string;
  fiscal_year: number;
  fiscal_quarter?: number;
  period_end_date: string;
  currency: string;
  line_items: ExtractedLineItem[];
  scratchpad: ScratchpadEntry[];
  overall_confidence: number;
  model: string;
}

/** Audit discrepancy found during verification. */
export interface AuditDiscrepancy {
  section: string;
  reported_total: number;
  computed_sum: number;
  difference: number;
  possible_cause: string;
  resolved: boolean;
  resolution?: string;
}

/** Full pipeline result returned after extraction + verification. */
export interface ExtractionPipelineResult {
  status: "verified" | "discrepancies_found" | "retry_required";
  message: string;
  passes_completed: number;
  statements: ExtractionPassResult[];
  audit: {
    total_checks: number;
    passed: number;
    failed: number;
    discrepancies: AuditDiscrepancy[];
  };
  pages_processed: number;
  source_file: string;
  model: string;
}

/** Request payload for the extraction pipeline endpoint. */
export interface ExtractionPipelineRequest {
  /** Max retry passes when discrepancies found (default: 2) */
  max_retries?: number;
  /** Focus columns/sections for retry pass */
  focus_sections?: string[];
  /** Whether to apply automatic corrections */
  auto_correct?: boolean;
}
