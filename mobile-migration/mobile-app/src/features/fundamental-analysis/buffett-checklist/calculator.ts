/**
 * Buffett Checklist — Calculation Engine.
 *
 * Pure, deterministic, unit-testable.
 * No side effects, no UI, no data fetching.
 */

import type { FinancialStatement, StockMetric, ValuationResult } from "@/services/api";

import {
  HARD_CAP_RULES,
  HISTORY_COVERAGE,
  QUALITATIVE_SECTIONS,
  QUANTITATIVE_SECTIONS,
  SCALE_CONFIGS,
  VERDICT_BANDS,
} from "./config";
import type {
  BuffettChecklistResult,
  BuffettSector,
  Confidence,
  HardCap,
  ItemBreakdown,
  ScaleMode,
  ScaleOption,
  SectionBreakdown,
  Verdict,
} from "./types";

// ── Scale helpers ─────────────────────────────────────────────────

/** Remap a normalized value (0–1) to the nearest option in the target scale. */
export function remapToScale(normalized: number, scaleMode: ScaleMode): number {
  const opts = SCALE_CONFIGS[scaleMode].options;
  let closest = opts[0];
  let minDist = Math.abs(normalized - closest.value);
  for (let i = 1; i < opts.length; i++) {
    const d = Math.abs(normalized - opts[i].value);
    if (d < minDist) {
      closest = opts[i];
      minDist = d;
    }
  }
  return closest.value;
}

/** Get the display label for a normalized value in a given scale. */
export function getScaleLabel(normalized: number, scaleMode: ScaleMode): string {
  const opts = SCALE_CONFIGS[scaleMode].options;
  let closest: ScaleOption = opts[0];
  let minDist = Math.abs(normalized - closest.value);
  for (let i = 1; i < opts.length; i++) {
    const d = Math.abs(normalized - opts[i].value);
    if (d < minDist) {
      closest = opts[i];
      minDist = d;
    }
  }
  return closest.label;
}

// ── Statement data extraction ─────────────────────────────────────

interface YearlyFinancials {
  year: number;
  revenue: number | null;
  netIncome: number | null;
  operatingIncome: number | null;
  grossProfit: number | null;
  ebitda: number | null;
  ebit: number | null;
  interestExpense: number | null;
  depreciation: number | null;
  capex: number | null;
  fcf: number | null;
  totalAssets: number | null;
  totalLiabilities: number | null;
  totalEquity: number | null;
  totalDebt: number | null;
  cash: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  operatingCashFlow: number | null;
  workingCapitalChange: number | null;
}

function findItem(items: { line_item_code: string; amount: number }[], ...codes: string[]): number | null {
  const upper = new Set(codes.map((c) => c.toUpperCase()));
  for (const li of items) {
    if (upper.has(li.line_item_code.toUpperCase()) && li.amount != null) {
      return li.amount;
    }
  }
  return null;
}

/** Extract yearly financials from raw statements. Annual only (quarter == null). */
export function extractYearlyData(statements: FinancialStatement[]): YearlyFinancials[] {
  // Group by fiscal_year, take only annual
  const yearMap = new Map<number, { income?: FinancialStatement; balance?: FinancialStatement; cashflow?: FinancialStatement }>();

  for (const stmt of statements) {
    if (stmt.fiscal_quarter != null) continue; // skip quarters
    const entry = yearMap.get(stmt.fiscal_year) ?? {};
    if (stmt.statement_type === "income") entry.income = stmt;
    else if (stmt.statement_type === "balance") entry.balance = stmt;
    else if (stmt.statement_type === "cashflow") entry.cashflow = stmt;
    yearMap.set(stmt.fiscal_year, entry);
  }

  const result: YearlyFinancials[] = [];
  for (const [year, s] of yearMap) {
    const inc = s.income?.line_items ?? [];
    const bal = s.balance?.line_items ?? [];
    const cf = s.cashflow?.line_items ?? [];

    const totalDebt = (() => {
      const ltd = findItem(bal, "LONG_TERM_DEBT", "LONG_TERM_BORROWINGS", "NON_CURRENT_BORROWINGS");
      const std = findItem(bal, "SHORT_TERM_DEBT", "SHORT_TERM_BORROWINGS", "CURRENT_PORTION_OF_LONG_TERM_DEBT");
      if (ltd != null || std != null) return (ltd ?? 0) + (std ?? 0);
      return null;
    })();

    result.push({
      year,
      revenue: findItem(inc, "REVENUE", "TOTAL_REVENUE", "NET_REVENUE", "SALES", "NET_SALES"),
      netIncome: findItem(inc, "NET_INCOME", "NET_PROFIT", "PROFIT_FOR_THE_YEAR"),
      operatingIncome: findItem(inc, "OPERATING_INCOME", "OPERATING_PROFIT", "INCOME_FROM_OPERATIONS"),
      grossProfit: findItem(inc, "GROSS_PROFIT"),
      ebitda: findItem(inc, "EBITDA"),
      ebit: findItem(inc, "EBIT"),
      interestExpense: findItem(inc, "INTEREST_EXPENSE", "FINANCE_COSTS", "FINANCE_COST"),
      depreciation: findItem(inc, "DEPRECIATION_AMORTIZATION", "DEPRECIATION", "AMORTIZATION")
        ?? findItem(cf, "DEPRECIATION_CF", "DEPRECIATION_AND_AMORTIZATION"),
      capex: findItem(cf, "CAPITAL_EXPENDITURES", "CAPEX", "PURCHASE_OF_PROPERTY_PLANT_AND_EQUIPMENT"),
      fcf: findItem(cf, "FREE_CASH_FLOW"),
      totalAssets: findItem(bal, "TOTAL_ASSETS"),
      totalLiabilities: findItem(bal, "TOTAL_LIABILITIES"),
      totalEquity: findItem(bal, "TOTAL_EQUITY", "TOTAL_SHAREHOLDERS_EQUITY"),
      totalDebt,
      cash: findItem(bal, "CASH", "CASH_AND_CASH_EQUIVALENTS", "CASH_EQUIVALENTS", "CASH_AND_BANK_BALANCES"),
      currentAssets: findItem(bal, "TOTAL_CURRENT_ASSETS"),
      currentLiabilities: findItem(bal, "TOTAL_CURRENT_LIABILITIES"),
      operatingCashFlow: findItem(cf, "CASH_FROM_OPERATIONS", "CASH_FROM_OPERATING_ACTIVITIES",
        "NET_CASH_FROM_OPERATING_ACTIVITIES"),
      workingCapitalChange: findItem(cf, "CHANGES_IN_WORKING_CAPITAL"),
    });
  }

  return result.sort((a, b) => a.year - b.year);
}

// ── Quantitative metric scorers ───────────────────────────────────

interface MetricScoreResult {
  points: number;
  rawValue: number | null;
  sourceDescription: string;
  isMissing: boolean;
  missingReason?: string;
}

function scoreMarginStability(data: YearlyFinancials[]): MetricScoreResult {
  // Use operating margin, fallback to net margin
  const margins: number[] = [];
  let usedType = "operating margin";

  for (const y of data) {
    if (y.operatingIncome != null && y.revenue != null && y.revenue !== 0) {
      margins.push(y.operatingIncome / y.revenue);
    }
  }

  if (margins.length < 3) {
    // Fallback to net margin
    margins.length = 0;
    usedType = "net margin";
    for (const y of data) {
      if (y.netIncome != null && y.revenue != null && y.revenue !== 0) {
        margins.push(y.netIncome / y.revenue);
      }
    }
  }

  if (margins.length < 3) {
    return { points: 0, rawValue: null, sourceDescription: "Insufficient margin data", isMissing: true, missingReason: "Less than 3 years of margin data available." };
  }

  const mean = margins.reduce((a, b) => a + b, 0) / margins.length;
  const absMean = Math.abs(mean);
  if (absMean === 0) {
    return { points: 0, rawValue: 0, sourceDescription: `${usedType} CV: N/A (mean is zero)`, isMissing: false };
  }
  const variance = margins.reduce((sum, m) => sum + (m - mean) ** 2, 0) / margins.length;
  const stdDev = Math.sqrt(variance);
  const cv = stdDev / absMean;

  let points: number;
  if (cv <= 0.10) points = 6;
  else if (cv <= 0.20) points = 4.5;
  else if (cv <= 0.35) points = 3;
  else if (cv <= 0.50) points = 1.5;
  else points = 0;

  return {
    points,
    rawValue: cv,
    sourceDescription: `${usedType} CV: ${(cv * 100).toFixed(1)}% over ${margins.length} years`,
    isMissing: false,
  };
}

function scorePositiveEps(data: YearlyFinancials[], metrics: StockMetric[]): MetricScoreResult {
  // Try EPS from metrics first
  const epsMetrics = metrics
    .filter((m) => m.metric_name === "EPS" && m.fiscal_quarter == null)
    .sort((a, b) => a.fiscal_year - b.fiscal_year);

  let values: { year: number; value: number }[] = [];

  if (epsMetrics.length >= 3) {
    values = epsMetrics.map((m) => ({ year: m.fiscal_year, value: m.metric_value }));
  } else {
    // Fallback: use net income as proxy
    for (const y of data) {
      if (y.netIncome != null) values.push({ year: y.year, value: y.netIncome });
    }
  }

  // Take last 10
  const recent = values.slice(-10);
  if (recent.length < 3) {
    return { points: 0, rawValue: null, sourceDescription: "Insufficient EPS/Net Income data", isMissing: true, missingReason: "Less than 3 years of earnings data." };
  }

  const positiveCount = recent.filter((v) => v.value > 0).length;
  const pct = positiveCount / recent.length;

  let points: number;
  if (pct >= 0.9) points = 5;
  else if (pct >= 0.75) points = 3.5;
  else if (pct >= 0.6) points = 2;
  else points = 0;

  return {
    points,
    rawValue: pct,
    sourceDescription: `${positiveCount}/${recent.length} years positive (${(pct * 100).toFixed(0)}%)`,
    isMissing: false,
  };
}

function scorePositiveFcf(data: YearlyFinancials[]): MetricScoreResult {
  const fcfValues: number[] = [];

  for (const y of data) {
    if (y.fcf != null) {
      fcfValues.push(y.fcf);
    } else if (y.operatingCashFlow != null && y.capex != null) {
      // Compute FCF = OCF - |Capex| (capex is typically negative)
      fcfValues.push(y.operatingCashFlow - Math.abs(y.capex));
    }
  }

  const recent = fcfValues.slice(-10);
  if (recent.length < 3) {
    return { points: 0, rawValue: null, sourceDescription: "Insufficient FCF data", isMissing: true, missingReason: "Less than 3 years of cash flow data." };
  }

  const positiveCount = recent.filter((v) => v > 0).length;
  const pct = positiveCount / recent.length;

  let points: number;
  if (pct >= 0.9) points = 5;
  else if (pct >= 0.75) points = 3.5;
  else if (pct >= 0.6) points = 2;
  else points = 0;

  return {
    points,
    rawValue: pct,
    sourceDescription: `${positiveCount}/${recent.length} years positive FCF (${(pct * 100).toFixed(0)}%)`,
    isMissing: false,
  };
}

function scoreRevenueStability(data: YearlyFinancials[]): MetricScoreResult {
  const revenues: { year: number; value: number }[] = [];
  for (const y of data) {
    if (y.revenue != null) revenues.push({ year: y.year, value: y.revenue });
  }

  if (revenues.length < 3) {
    return { points: 0, rawValue: null, sourceDescription: "Insufficient revenue data", isMissing: true, missingReason: "Less than 3 years of revenue data." };
  }

  const first = revenues[0].value;
  const last = revenues[revenues.length - 1].value;
  const years = revenues[revenues.length - 1].year - revenues[0].year;

  let cagr = 0;
  if (first > 0 && last > 0 && years > 0) {
    cagr = Math.pow(last / first, 1 / years) - 1;
  }

  let declineYears = 0;
  for (let i = 1; i < revenues.length; i++) {
    if (revenues[i].value < revenues[i - 1].value) declineYears++;
  }

  let points: number;
  if (cagr > 0.05 && declineYears <= 2) points = 5;
  else if (cagr >= 0 && cagr <= 0.05 && declineYears <= 3) points = 3.5;
  else if (cagr >= -0.05 && cagr < 0) points = 1.5;
  else points = 0;

  return {
    points,
    rawValue: cagr,
    sourceDescription: `Revenue CAGR: ${(cagr * 100).toFixed(1)}%, ${declineYears} decline year(s) over ${revenues.length} years`,
    isMissing: false,
  };
}

function scoreReturnOnCapital(
  data: YearlyFinancials[],
  metrics: StockMetric[],
  sector: BuffettSector,
): MetricScoreResult {
  const isFinancial = sector === "bank" || sector === "insurance" || sector === "other_financial";

  // Try ROIC first (non-financials), ROE for financials
  const preferredMetric = isFinancial ? "ROE" : "ROIC";
  const fallbackMetric = "ROE";

  let metricValues = metrics
    .filter((m) => m.metric_name === preferredMetric && m.fiscal_quarter == null)
    .map((m) => m.metric_value);

  if (metricValues.length < 3 && !isFinancial) {
    // Fallback to ROE
    metricValues = metrics
      .filter((m) => m.metric_name === fallbackMetric && m.fiscal_quarter == null)
      .map((m) => m.metric_value);
  }

  // Take last 5–10 values
  const recent = metricValues.slice(-10);

  if (recent.length < 2) {
    // Compute from statements
    const computed: number[] = [];
    for (const y of data) {
      if (y.netIncome != null && y.totalEquity != null && y.totalEquity !== 0) {
        computed.push(y.netIncome / y.totalEquity);
      }
    }
    if (computed.length < 2) {
      return { points: 0, rawValue: null, sourceDescription: `Insufficient ${preferredMetric} data`, isMissing: true, missingReason: `Less than 2 years of ${preferredMetric} data.` };
    }
    recent.length = 0;
    recent.push(...computed.slice(-10));
  }

  const avg = recent.reduce((a, b) => a + b, 0) / recent.length;
  // Metrics may be stored as decimals (0.15) or percentages (15). Normalize:
  const normalizedAvg = Math.abs(avg) < 1 ? avg : avg / 100;

  let points: number;
  if (normalizedAvg > 0.15) points = 10;
  else if (normalizedAvg > 0.12) points = 8;
  else if (normalizedAvg > 0.09) points = 6;
  else if (normalizedAvg > 0.06) points = 3;
  else points = 0;

  const metricUsed = metricValues.length >= 2 ? preferredMetric : "ROE (computed)";

  return {
    points,
    rawValue: normalizedAvg,
    sourceDescription: `Avg ${metricUsed}: ${(normalizedAvg * 100).toFixed(1)}% over ${recent.length} years`,
    isMissing: false,
  };
}

function scoreOwnerEarnings(data: YearlyFinancials[]): MetricScoreResult {
  // Owner Earnings = Net Income + D&A – Capex – working capital drag
  const ratios: number[] = [];
  const assumptions: string[] = [];

  for (const y of data) {
    if (y.netIncome == null || y.netIncome <= 0) continue;
    const da = y.depreciation ?? 0;
    const capex = y.capex != null ? Math.abs(y.capex) : 0;
    const wcDrag = y.workingCapitalChange != null ? -y.workingCapitalChange : 0; // negative = drag

    if (da === 0 && capex === 0) continue; // not enough data for meaningful calc

    const oe = y.netIncome + da - capex - wcDrag;
    ratios.push(oe / y.netIncome);
  }

  if (ratios.length < 2) {
    return { points: 0, rawValue: null, sourceDescription: "Insufficient data for owner earnings", isMissing: true, missingReason: "Need at least 2 years of Net Income, D&A, and Capex." };
  }

  if (data.some((y) => y.workingCapitalChange == null)) {
    assumptions.push("Working capital change unavailable; using total capex only.");
  }

  const avg = ratios.reduce((a, b) => a + b, 0) / ratios.length;

  let points: number;
  if (avg > 0.85) points = 5;
  else if (avg > 0.60) points = 3;
  else if (avg > 0.40) points = 1.5;
  else points = 0;

  return {
    points,
    rawValue: avg,
    sourceDescription: `Owner earnings / NI: ${(avg * 100).toFixed(0)}% avg over ${ratios.length} years` +
      (assumptions.length > 0 ? ` (${assumptions.join("; ")})` : ""),
    isMissing: false,
  };
}

function scoreLeverage(
  data: YearlyFinancials[],
  metrics: StockMetric[],
  sector: BuffettSector,
): MetricScoreResult {
  const isFinancial = sector === "bank" || sector === "insurance" || sector === "other_financial";

  if (isFinancial) {
    // For banks: use Debt-to-Equity as proxy for capital adequacy
    const deMetrics = metrics
      .filter((m) => m.metric_name === "Debt-to-Equity" && m.fiscal_quarter == null)
      .map((m) => m.metric_value);

    const recent = deMetrics.slice(-5);
    if (recent.length === 0) {
      // Compute from statements
      const latest = [...data].reverse().find((y) => y.totalDebt != null && y.totalEquity != null && y.totalEquity !== 0);
      if (!latest) {
        return { points: 0, rawValue: null, sourceDescription: "No capital structure data for financial", isMissing: true, missingReason: "Capital adequacy data not available." };
      }
      const ratio = latest.totalDebt! / latest.totalEquity!;
      // For banks, lower D/E is better: <5 = strong, <8 = adequate, <12 = borderline
      let points: number;
      if (ratio < 5) points = 6;
      else if (ratio < 8) points = 4;
      else if (ratio < 12) points = 2;
      else points = 0;
      return { points, rawValue: ratio, sourceDescription: `Bank D/E ratio: ${ratio.toFixed(1)}x`, isMissing: false };
    }
    const avgDE = recent.reduce((a, b) => a + b, 0) / recent.length;
    let points: number;
    if (avgDE < 5) points = 6;
    else if (avgDE < 8) points = 4;
    else if (avgDE < 12) points = 2;
    else points = 0;
    return { points, rawValue: avgDE, sourceDescription: `Bank avg D/E: ${avgDE.toFixed(1)}x`, isMissing: false };
  }

  // Non-financials: Net Debt / EBITDA
  const ndMetrics = metrics
    .filter((m) => m.metric_name === "Net Debt-to-EBITDA" && m.fiscal_quarter == null)
    .map((m) => m.metric_value);

  if (ndMetrics.length > 0) {
    const latest = ndMetrics[ndMetrics.length - 1];
    let points: number;
    if (latest <= 1.0) points = 6;
    else if (latest <= 2.0) points = 4;
    else if (latest <= 3.0) points = 2;
    else points = 0;
    return { points, rawValue: latest, sourceDescription: `Net Debt/EBITDA: ${latest.toFixed(1)}x`, isMissing: false };
  }

  // Fallback: compute from statements
  const latest = [...data].reverse().find((y) => y.totalDebt != null && y.cash != null);
  if (latest) {
    const netDebt = (latest.totalDebt ?? 0) - (latest.cash ?? 0);
    const ebitda = latest.ebitda ?? (latest.operatingIncome != null && latest.depreciation != null
      ? latest.operatingIncome + latest.depreciation
      : null);

    if (ebitda != null && ebitda > 0) {
      const ratio = netDebt / ebitda;
      let points: number;
      if (ratio <= 1.0) points = 6;
      else if (ratio <= 2.0) points = 4;
      else if (ratio <= 3.0) points = 2;
      else points = 0;
      return { points, rawValue: ratio, sourceDescription: `Net Debt/EBITDA: ${ratio.toFixed(1)}x (computed)`, isMissing: false };
    }
  }

  // Final fallback: Debt/Equity
  const deMetrics = metrics
    .filter((m) => m.metric_name === "Debt-to-Equity" && m.fiscal_quarter == null)
    .map((m) => m.metric_value);

  if (deMetrics.length > 0) {
    const latest = deMetrics[deMetrics.length - 1];
    // Map D/E to points: <0.5 = 6, <1.0 = 4, <1.5 = 2
    let points: number;
    if (latest <= 0.5) points = 6;
    else if (latest <= 1.0) points = 4;
    else if (latest <= 1.5) points = 2;
    else points = 0;
    return { points, rawValue: latest, sourceDescription: `Debt/Equity: ${latest.toFixed(2)}x (fallback)`, isMissing: false };
  }

  return { points: 0, rawValue: null, sourceDescription: "No leverage data", isMissing: true, missingReason: "Debt and EBITDA data not available." };
}

function scoreDebtSafety(
  data: YearlyFinancials[],
  metrics: StockMetric[],
  sector: BuffettSector,
): MetricScoreResult {
  const isFinancial = sector === "bank" || sector === "insurance" || sector === "other_financial";

  if (isFinancial) {
    // Use a simplified approach: if leverage score was OK, debt safety is adequate
    return { points: 0, rawValue: null, sourceDescription: "Interest coverage N/A for financials", isMissing: true, missingReason: "Standard interest coverage not applicable to financial institutions." };
  }

  // Non-financials: EBIT / Interest Expense (Interest Coverage)
  const icMetrics = metrics
    .filter((m) => m.metric_name === "Interest Coverage" && m.fiscal_quarter == null)
    .map((m) => m.metric_value);

  let coverage: number | null = null;

  if (icMetrics.length > 0) {
    coverage = icMetrics[icMetrics.length - 1];
  } else {
    // Compute from statements
    const latest = [...data].reverse().find(
      (y) => y.operatingIncome != null && y.interestExpense != null && y.interestExpense !== 0,
    );
    if (latest) {
      coverage = latest.operatingIncome! / Math.abs(latest.interestExpense!);
    }
  }

  if (coverage == null) {
    // If no interest expense, company may be debt-free
    const hasDebt = data.some((y) => y.totalDebt != null && y.totalDebt > 0);
    if (!hasDebt) {
      return { points: 4, rawValue: null, sourceDescription: "No debt detected — full score", isMissing: false };
    }
    return { points: 0, rawValue: null, sourceDescription: "Interest coverage data not available", isMissing: true, missingReason: "Operating income and/or interest expense data missing." };
  }

  let points: number;
  if (coverage > 8) points = 4;
  else if (coverage > 4) points = 2.5;
  else if (coverage > 2) points = 1;
  else points = 0;

  return {
    points,
    rawValue: coverage,
    sourceDescription: `Interest coverage: ${coverage.toFixed(1)}x`,
    isMissing: false,
  };
}

function scoreValuationDiscount(
  valuations: ValuationResult[],
  marketPrice: number | null,
): MetricScoreResult {
  if (marketPrice == null || marketPrice <= 0) {
    return { points: 0, rawValue: null, sourceDescription: "Market price not available", isMissing: true, missingReason: "Current market price is required for valuation scoring." };
  }

  // Collect valid intrinsic values
  const ivs = valuations
    .filter((v) => v.intrinsic_value != null && v.intrinsic_value > 0)
    .map((v) => v.intrinsic_value!);

  if (ivs.length === 0) {
    return { points: 0, rawValue: null, sourceDescription: "No intrinsic value estimates available", isMissing: true, missingReason: "Run at least one valuation model first." };
  }

  // Use average of available models (blended fair value)
  const avgIV = ivs.reduce((a, b) => a + b, 0) / ivs.length;
  const discount = (avgIV - marketPrice) / avgIV;

  let points: number;
  if (discount >= 0.25) points = 10;
  else if (discount >= 0.15) points = 8;
  else if (discount >= -0.15) points = 5;
  else if (discount >= -0.30) points = 2;
  else points = 0;

  const pct = (discount * 100).toFixed(0);
  const desc = discount >= 0
    ? `${pct}% discount to IV (avg IV: ${avgIV.toFixed(2)}, price: ${marketPrice.toFixed(2)})`
    : `${Math.abs(Number(pct))}% premium to IV (avg IV: ${avgIV.toFixed(2)}, price: ${marketPrice.toFixed(2)})`;

  return { points, rawValue: discount, sourceDescription: desc, isMissing: false };
}

// ── Main calculator ───────────────────────────────────────────────

export interface CalculatorInput {
  qualitativeAnswers: Record<string, number>; // item_id => normalized 0–1
  statements: FinancialStatement[];
  metrics: StockMetric[];
  valuations: ValuationResult[];
  sector: BuffettSector;
  marketPrice: number | null;
}

export function calculateBuffettScore(input: CalculatorInput): BuffettChecklistResult {
  const { qualitativeAnswers, statements, metrics, valuations, sector, marketPrice } = input;

  const yearlyData = extractYearlyData(statements);
  const itemBreakdown: ItemBreakdown[] = [];
  const assumptions: string[] = [];
  const missingData: string[] = [];

  // ── 1. Qualitative scoring ──────────────────────────────────────

  let qualitativeTotal = 0;
  let qualitativeMax = 0;
  let qualitativeAnswered = 0;
  let qualitativeCount = 0;

  for (const section of QUALITATIVE_SECTIONS) {
    for (const item of section.items) {
      qualitativeCount++;
      qualitativeMax += item.maxPoints;
      const answer = qualitativeAnswers[item.id];
      const hasAnswer = answer != null && answer >= 0;
      const normalized = hasAnswer ? answer : 0;
      const points = normalized * item.maxPoints;

      if (hasAnswer) {
        qualitativeAnswered++;
        qualitativeTotal += points;
      }

      itemBreakdown.push({
        id: item.id,
        label: item.question,
        type: "qualitative",
        section: section.key,
        pointsEarned: hasAnswer ? points : 0,
        maxPoints: item.maxPoints,
        rawValue: hasAnswer ? normalized : null,
        isMissing: !hasAnswer,
        missingReason: !hasAnswer ? "Not yet answered" : undefined,
      });
    }
  }

  // ── 2. Quantitative scoring ─────────────────────────────────────

  let quantitativeTotal = 0;
  let quantitativeMax = 0;
  let quantitativeComputed = 0;
  let quantitativeCount = 0;

  const metricResults: Record<string, MetricScoreResult> = {};

  // Compute each metric
  const scorers: Record<string, () => MetricScoreResult> = {
    m_margin_stability: () => scoreMarginStability(yearlyData),
    m_positive_eps: () => scorePositiveEps(yearlyData, metrics),
    m_positive_fcf: () => scorePositiveFcf(yearlyData),
    m_revenue_stability: () => scoreRevenueStability(yearlyData),
    m_return_on_capital: () => scoreReturnOnCapital(yearlyData, metrics, sector),
    m_owner_earnings: () => scoreOwnerEarnings(yearlyData),
    m_leverage: () => scoreLeverage(yearlyData, metrics, sector),
    m_debt_safety: () => scoreDebtSafety(yearlyData, metrics, sector),
    m_valuation_discount: () => scoreValuationDiscount(valuations, marketPrice),
  };

  for (const section of QUANTITATIVE_SECTIONS) {
    for (const metric of section.metrics) {
      quantitativeCount++;
      quantitativeMax += metric.maxPoints;

      const scorer = scorers[metric.id];
      const result = scorer ? scorer() : { points: 0, rawValue: null, sourceDescription: "Unknown metric", isMissing: true, missingReason: "Scorer not implemented." };

      metricResults[metric.id] = result;

      if (!result.isMissing) {
        quantitativeComputed++;
        quantitativeTotal += result.points;
      } else if (result.missingReason) {
        missingData.push(`${metric.label}: ${result.missingReason}`);
      }

      itemBreakdown.push({
        id: metric.id,
        label: metric.label,
        type: "quantitative",
        section: section.key,
        pointsEarned: result.points,
        maxPoints: metric.maxPoints,
        rawValue: result.rawValue,
        sourceDescription: result.sourceDescription,
        isMissing: result.isMissing,
        missingReason: result.missingReason,
      });
    }
  }

  // ── 3. Reweight quantitative if missing data ────────────────────

  // If some quantitative metrics are missing, reweight the available ones
  // to keep the quantitative section at its full weight
  let adjustedQuantitativeTotal = quantitativeTotal;
  if (quantitativeComputed > 0 && quantitativeComputed < quantitativeCount) {
    const computedMax = itemBreakdown
      .filter((b) => b.type === "quantitative" && !b.isMissing)
      .reduce((sum, b) => sum + b.maxPoints, 0);
    if (computedMax > 0) {
      adjustedQuantitativeTotal = (quantitativeTotal / computedMax) * 56;
    }
    assumptions.push(
      `${quantitativeCount - quantitativeComputed} quantitative metric(s) missing — reweighted within section.`,
    );
  }

  // ── 4. Raw score ────────────────────────────────────────────────

  const rawScore = qualitativeTotal + adjustedQuantitativeTotal;

  // ── 5. Hard caps ────────────────────────────────────────────────

  const activeCaps: HardCap[] = [];

  // Check each hard cap rule
  for (const rule of HARD_CAP_RULES) {
    let triggered = false;

    switch (rule.id) {
      case "cap_competence":
        triggered = (qualitativeAnswers["q_circle_of_competence"] ?? 0) < 0.25 &&
          qualitativeAnswers["q_circle_of_competence"] != null;
        break;
      case "cap_no_moat":
        triggered = (qualitativeAnswers["q_durable_moat"] ?? 0) < 0.25 &&
          qualitativeAnswers["q_durable_moat"] != null;
        break;
      case "cap_poor_earnings":
        triggered = (metricResults["m_positive_eps"]?.points === 0 && !metricResults["m_positive_eps"]?.isMissing) ||
          (metricResults["m_positive_fcf"]?.points === 0 && !metricResults["m_positive_fcf"]?.isMissing);
        break;
      case "cap_excessive_leverage":
        triggered = metricResults["m_leverage"]?.points === 0 && !metricResults["m_leverage"]?.isMissing;
        break;
      case "cap_overvalued":
        triggered = metricResults["m_valuation_discount"]?.points === 0 && !metricResults["m_valuation_discount"]?.isMissing;
        break;
    }

    if (triggered) {
      activeCaps.push({
        id: rule.id,
        label: rule.label,
        capValue: rule.capValue,
        reason: rule.checkDescription,
      });
    }
  }

  // ── 6. Apply caps ───────────────────────────────────────────────

  let finalScore = Math.round(rawScore);
  if (activeCaps.length > 0) {
    const lowestCap = Math.min(...activeCaps.map((c) => c.capValue));
    finalScore = Math.min(finalScore, lowestCap);
  }
  finalScore = Math.max(0, Math.min(100, finalScore));

  // ── 7. Verdict ──────────────────────────────────────────────────

  let verdict: Verdict = "Very Unlikely Buffett-Style Pick";
  for (const band of VERDICT_BANDS) {
    if (finalScore >= band.min && finalScore <= band.max) {
      verdict = band.verdict;
      break;
    }
  }

  // ── 8. Data coverage / confidence ───────────────────────────────

  const qualPct = qualitativeCount > 0 ? qualitativeAnswered / qualitativeCount : 0;
  const quantPct = quantitativeCount > 0 ? quantitativeComputed / quantitativeCount : 0;
  const historyYears = yearlyData.length;
  const historyPct = historyYears >= 8 ? 1.0 : historyYears >= 5 ? 0.8 : historyYears >= 3 ? 0.6 : 0.3;

  const dataCoveragePercent = Math.round(((qualPct * 0.3 + quantPct * 0.4 + historyPct * 0.3) * 100));

  let confidence: Confidence;
  if (dataCoveragePercent >= 85) confidence = "High";
  else if (dataCoveragePercent >= 65) confidence = "Medium";
  else confidence = "Low";

  // History assumptions
  if (historyYears < HISTORY_COVERAGE.MODERATE.minYears) {
    assumptions.push(`Only ${historyYears} year(s) of financial history available (< 5 years). Confidence reduced.`);
  } else if (historyYears < HISTORY_COVERAGE.FULL.minYears) {
    assumptions.push(`${historyYears} years of history available (< 8 years). Slightly lower confidence.`);
  }

  // ── 9. Section breakdown ────────────────────────────────────────

  const allSections = [
    ...QUALITATIVE_SECTIONS.map((s) => ({ key: s.key, label: s.label, maxPoints: s.maxPoints })),
    ...QUANTITATIVE_SECTIONS.map((s) => ({ key: s.key, label: s.label, maxPoints: s.maxPoints })),
  ];

  const sectionBreakdown: SectionBreakdown[] = allSections.map((s) => {
    const items = itemBreakdown.filter((b) => b.section === s.key);
    const earned = items.reduce((sum, b) => sum + b.pointsEarned, 0);
    return {
      key: s.key,
      label: s.label,
      pointsEarned: earned,
      maxPoints: s.maxPoints,
      percent: s.maxPoints > 0 ? Math.round((earned / s.maxPoints) * 100) : 0,
    };
  });

  // ── 10. Strengths & blockers ────────────────────────────────────

  const scoredItems = itemBreakdown
    .filter((b) => !b.isMissing)
    .map((b) => ({ ...b, pctOfMax: b.maxPoints > 0 ? b.pointsEarned / b.maxPoints : 0 }));

  const strengths = [...scoredItems]
    .sort((a, b) => b.pctOfMax - a.pctOfMax)
    .slice(0, 3)
    .map(({ pctOfMax: _, ...rest }) => rest);

  const blockers = [...scoredItems]
    .sort((a, b) => a.pctOfMax - b.pctOfMax)
    .slice(0, 3)
    .map(({ pctOfMax: _, ...rest }) => rest);

  return {
    finalScore,
    rawScore: Math.round(rawScore * 10) / 10,
    verdict,
    confidence,
    dataCoveragePercent,
    activeCaps,
    sectionBreakdown,
    itemBreakdown,
    strengths,
    blockers,
    assumptions,
    missingData,
  };
}
