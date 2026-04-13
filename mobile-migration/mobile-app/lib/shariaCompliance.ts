/**
 * Sharia Compliance — screening based on Musaffa.com data.
 *
 * Source: https://musaffa.com/ — a certified Sharia screening provider.
 * Stocks with known compliance status are hardcoded below.
 * Unknown stocks default to "unknown" and link to Musaffa for manual check.
 */

// ── Types ────────────────────────────────────────────────────────────

export interface ShariaCriteria {
  /** Whether the core business activity is halal (no alcohol, gambling, etc.) */
  businessActivityCompliant: boolean;
  /** Total debt / total equity — threshold: < 33% */
  debtToEquityRatio: number;
  /** Interest income / total revenue — threshold: < 5% */
  interestIncomeRatio: number;
  /** Accounts receivable / total assets — threshold: < 49% */
  accountsReceivableRatio: number;
  /** (Cash + interest-bearing securities) / total assets — threshold: < 33% */
  cashInterestBearingRatio: number;
}

export type ShariaStatus = "compliant" | "non-compliant" | "unknown" | "under-review";

// ── Known compliance from Musaffa.com ─────────────────────────────────
// Add/update entries here based on Musaffa screening results.
// Key: uppercase stock symbol. Value: Musaffa compliance status.

const MUSAFFA_COMPLIANCE: Record<string, ShariaStatus> = {
  // ── Non-compliant (conventional banks / interest-based) ──
  NBK: "non-compliant",    // National Bank of Kuwait
  ABK: "non-compliant",    // Al Ahli Bank of Kuwait
  BURGAN: "non-compliant", // Burgan Bank
  GBK: "non-compliant",    // Gulf Bank
  CBK: "non-compliant",    // Commercial Bank of Kuwait
  // ── Compliant ──
  KFH: "compliant",        // Kuwait Finance House (Islamic bank)
  KIB: "compliant",        // Kuwait International Bank (Islamic)
  WARBA: "compliant",      // Warba Bank (Islamic)
  ZAIN: "compliant",       // Zain Telecom
  STC: "compliant",        // Kuwait Telecom (STC)
  AGILITY: "compliant",    // Agility Public Warehousing
  HUMANSOFT: "compliant",  // Humansoft Holding
};

/**
 * Get Musaffa compliance status for a stock.
 * Returns the known status or undefined if not in our database.
 */
export function getMusaffaStatus(symbol: string): ShariaStatus | undefined {
  return MUSAFFA_COMPLIANCE[symbol.toUpperCase()];
}

/**
 * Build the Musaffa.com URL for a stock's compliance page.
 * Kuwait stocks use the /stocks/kw/{SYMBOL} pattern.
 */
export function getMusaffaUrl(symbol: string): string {
  return `https://musaffa.com/stocks/kw/${encodeURIComponent(symbol.toUpperCase())}`;
}

// ── Evaluation ───────────────────────────────────────────────────────

export function evaluateShariaCompliance(
  criteria: Partial<ShariaCriteria>,
): ShariaStatus {
  // If any critical field missing, return unknown
  if (
    criteria.businessActivityCompliant === undefined ||
    criteria.debtToEquityRatio === undefined ||
    criteria.interestIncomeRatio === undefined
  ) {
    return "unknown";
  }

  // Business activity is binary filter
  if (!criteria.businessActivityCompliant) {
    return "non-compliant";
  }

  // Financial ratios (AAOIFI thresholds)
  if (
    criteria.debtToEquityRatio < 0.33 &&
    criteria.interestIncomeRatio < 0.05 &&
    (criteria.accountsReceivableRatio === undefined || criteria.accountsReceivableRatio < 0.49) &&
    (criteria.cashInterestBearingRatio === undefined || criteria.cashInterestBearingRatio < 0.33)
  ) {
    return "compliant";
  }

  return "non-compliant";
}

// ── Badge Helpers ────────────────────────────────────────────────────

export interface ShariaBadgeInfo {
  label: string;
  color: string;
  icon: "check-circle" | "times-circle" | "clock-o" | "question-circle";
}

export function getShariaBadgeProps(status: ShariaStatus): ShariaBadgeInfo {
  switch (status) {
    case "compliant":
      return { label: "Sharia Compliant", color: "#10b981", icon: "check-circle" };
    case "non-compliant":
      return { label: "Not Compliant", color: "#ef4444", icon: "times-circle" };
    case "under-review":
      return { label: "Under Review", color: "#f59e0b", icon: "clock-o" };
    default:
      return { label: "Unknown", color: "#6b7280", icon: "question-circle" };
  }
}

// ── Details (for expanded view) ──────────────────────────────────────

export interface ShariaCheckDetail {
  label: string;
  value: string;
  threshold: string;
  passed: boolean | null;
}

export function getShariaDetails(criteria: Partial<ShariaCriteria>): ShariaCheckDetail[] {
  const details: ShariaCheckDetail[] = [];

  details.push({
    label: "Business Activity",
    value: criteria.businessActivityCompliant === undefined ? "N/A" : criteria.businessActivityCompliant ? "Halal" : "Non-Halal",
    threshold: "Must be Halal",
    passed: criteria.businessActivityCompliant ?? null,
  });

  details.push({
    label: "Debt / Equity",
    value: criteria.debtToEquityRatio !== undefined ? `${(criteria.debtToEquityRatio * 100).toFixed(1)}%` : "N/A",
    threshold: "< 33%",
    passed: criteria.debtToEquityRatio !== undefined ? criteria.debtToEquityRatio < 0.33 : null,
  });

  details.push({
    label: "Interest Income / Revenue",
    value: criteria.interestIncomeRatio !== undefined ? `${(criteria.interestIncomeRatio * 100).toFixed(1)}%` : "N/A",
    threshold: "< 5%",
    passed: criteria.interestIncomeRatio !== undefined ? criteria.interestIncomeRatio < 0.05 : null,
  });

  details.push({
    label: "Receivables / Assets",
    value: criteria.accountsReceivableRatio !== undefined ? `${(criteria.accountsReceivableRatio * 100).toFixed(1)}%` : "N/A",
    threshold: "< 49%",
    passed: criteria.accountsReceivableRatio !== undefined ? criteria.accountsReceivableRatio < 0.49 : null,
  });

  details.push({
    label: "Cash & Interest-Bearing / Assets",
    value: criteria.cashInterestBearingRatio !== undefined ? `${(criteria.cashInterestBearingRatio * 100).toFixed(1)}%` : "N/A",
    threshold: "< 33%",
    passed: criteria.cashInterestBearingRatio !== undefined ? criteria.cashInterestBearingRatio < 0.33 : null,
  });

  return details;
}
