/* ── Shared TypeScript types for portfolio data ────────── */

export interface Transaction {
  id: number;
  symbol: string;
  date: string;
  portfolio: "KFH" | "BBYN" | "USA";
  type: "Buy" | "Sell" | "Deposit" | "Withdrawal" | "Dividend" | "Bonus Shares";
  category?: string;
  status: "Unrealized" | "Realized" | "Income" | "Bonus" | "Closed" | "";
  source: "MANUAL" | "UPLOAD" | "RESTORE" | "API" | "LEGACY";
  quantity: number;
  price: number;
  avgCost: number;
  currentPrice: number;
  sellPrice: number;
  value: number;
  pnl: number;
  pnlPct: number;
  fees: number;
  dividend: number;
  bonusShares: number;
  notes: string;
}

export interface KpiData {
  totalBuys: number;
  totalSells: number;
  totalDeposits: number;
  totalWithdrawals: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalPnl: number;
  totalTransactions: number;
  cashDividends: number;
  totalFees: number;
  netCashFlow: number;
  totalReturnPct: number;
  buyCount: number;
  sellCount: number;
  depositCount: number;
  withdrawalCount: number;
  dividendCount: number;
}

export interface PortfolioApiResponse {
  kpis: KpiData;
  transactions: Transaction[];
}

export type PortfolioFilter = "KFH" | "BBYN" | "USA" | "ALL";
export type TxnTypeFilter =
  | "Buy"
  | "Sell"
  | "Deposit"
  | "Withdrawal"
  | "Dividend"
  | "Bonus Shares";
export type SourceFilter = "MANUAL" | "UPLOAD" | "RESTORE" | "API" | "LEGACY";
