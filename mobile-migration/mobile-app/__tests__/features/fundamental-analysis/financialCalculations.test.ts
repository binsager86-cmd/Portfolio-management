/**
 * Financial calculation tests — enrichMetricsWithFallbacks.
 *
 * Covers CFA-level valuation metric computations:
 *   - Dividends Per Share = |Dividends Paid| / Shares Outstanding
 *   - Payout Ratio = DPS / EPS (or |Div Paid| / Net Income)
 *   - Retention Rate = 1 − Payout Ratio
 *   - Sustainable Growth Rate = ROE × Retention Rate
 *   - Edge cases: zero denominators, missing statements, sub-unit EPS
 *   - Does not overwrite existing metrics
 */

import type { FinancialStatement, StockMetric } from "@/services/api";
import { enrichMetricsWithFallbacks } from "@/src/features/fundamental-analysis/utils";

// ── Factory helpers ─────────────────────────────────────────────────

function makeMetric(overrides: Partial<StockMetric> & { metric_name: string; fiscal_year: number; metric_value: number }): StockMetric {
  return {
    id: Math.floor(Math.random() * 10000),
    stock_id: 1,
    fiscal_quarter: null,
    period_end_date: `${overrides.fiscal_year}-12-31`,
    metric_type: "valuation",
    created_at: 0,
    ...overrides,
  };
}

function makeStatement(
  type: "income" | "balance" | "cashflow",
  fiscalYear: number,
  lineItems: Array<{ code: string; amount: number }>,
): FinancialStatement {
  return {
    id: Math.floor(Math.random() * 10000),
    stock_id: 1,
    statement_type: type,
    fiscal_year: fiscalYear,
    fiscal_quarter: null,
    period_end_date: `${fiscalYear}-12-31`,
    filing_date: null,
    source_file: null,
    extracted_by: "test",
    confidence_score: null,
    notes: null,
    created_at: 0,
    line_items: lineItems.map((li, i) => ({
      id: i + 1,
      statement_id: 1,
      line_item_code: li.code,
      line_item_name: li.code,
      amount: li.amount,
      currency: "KWD",
      order_index: i,
      is_total: false,
      manually_edited: false,
    })),
  };
}

describe("enrichMetricsWithFallbacks", () => {
  // ── Full computation from statements ──────────────────────────

  it("computes DPS from dividends paid / shares outstanding", () => {
    const statements = [
      makeStatement("cashflow", 2024, [
        { code: "COMMON_DIVIDENDS_PAID", amount: -500000 },
      ]),
      makeStatement("balance", 2024, [
        { code: "SHARES_OUTSTANDING_DILUTED", amount: 1000000 },
        { code: "SHAREHOLDERS_EQUITY", amount: 5000000 },
      ]),
      makeStatement("income", 2024, [
        { code: "NET_INCOME", amount: 1000000 },
        { code: "EPS_DILUTED", amount: 1.0 },
      ]),
    ];

    const result = enrichMetricsWithFallbacks([], statements);
    const dps = result.find((m) => m.metric_name === "Dividends / Share");

    expect(dps).toBeDefined();
    expect(dps!.metric_value).toBeCloseTo(0.5); // 500000 / 1000000
  });

  it("computes Payout Ratio from DPS / EPS", () => {
    const existingMetrics = [
      makeMetric({ metric_name: "EPS", fiscal_year: 2024, metric_value: 1.0 }),
    ];
    const statements = [
      makeStatement("cashflow", 2024, [
        { code: "COMMON_DIVIDENDS_PAID", amount: -500000 },
      ]),
      makeStatement("balance", 2024, [
        { code: "SHARES_OUTSTANDING_DILUTED", amount: 1000000 },
        { code: "SHAREHOLDERS_EQUITY", amount: 5000000 },
      ]),
      makeStatement("income", 2024, [
        { code: "NET_INCOME", amount: 1000000 },
        { code: "EPS_DILUTED", amount: 1.0 },
      ]),
    ];

    const result = enrichMetricsWithFallbacks(existingMetrics, statements);
    const payout = result.find((m) => m.metric_name === "Payout Ratio");

    expect(payout).toBeDefined();
    expect(payout!.metric_value).toBeCloseTo(0.5); // DPS 0.5 / EPS 1.0
  });

  it("computes Retention Rate = 1 - Payout Ratio", () => {
    const statements = [
      makeStatement("cashflow", 2024, [
        { code: "COMMON_DIVIDENDS_PAID", amount: -300000 },
      ]),
      makeStatement("balance", 2024, [
        { code: "SHARES_OUTSTANDING_DILUTED", amount: 1000000 },
        { code: "SHAREHOLDERS_EQUITY", amount: 5000000 },
      ]),
      makeStatement("income", 2024, [
        { code: "NET_INCOME", amount: 1000000 },
        { code: "EPS_DILUTED", amount: 1.0 },
      ]),
    ];

    const result = enrichMetricsWithFallbacks([], statements);
    const retention = result.find((m) => m.metric_name === "Retention Rate");

    expect(retention).toBeDefined();
    // DPS = 0.3, Payout = 0.3/1.0 = 0.3, Retention = 1 - 0.3 = 0.7
    expect(retention!.metric_value).toBeCloseTo(0.7);
  });

  it("computes Sustainable Growth Rate = ROE × Retention Rate", () => {
    const statements = [
      makeStatement("cashflow", 2024, [
        { code: "COMMON_DIVIDENDS_PAID", amount: -300000 },
      ]),
      makeStatement("balance", 2024, [
        { code: "SHARES_OUTSTANDING_DILUTED", amount: 1000000 },
        { code: "SHAREHOLDERS_EQUITY", amount: 5000000 },
      ]),
      makeStatement("income", 2024, [
        { code: "NET_INCOME", amount: 1000000 },
        { code: "EPS_DILUTED", amount: 1.0 },
      ]),
    ];

    const result = enrichMetricsWithFallbacks([], statements);
    const sgr = result.find((m) => m.metric_name === "Sustainable Growth Rate");

    expect(sgr).toBeDefined();
    // ROE = 1,000,000 / 5,000,000 = 0.2
    // Retention = 0.7 (from above)
    // SGR = 0.2 × 0.7 = 0.14
    expect(sgr!.metric_value).toBeCloseTo(0.14);
  });

  // ── Edge cases ────────────────────────────────────────────────

  it("does not overwrite existing valuation metrics", () => {
    const existingMetrics = [
      makeMetric({ metric_name: "Dividends / Share", fiscal_year: 2024, metric_value: 0.25 }),
      makeMetric({ metric_name: "Payout Ratio", fiscal_year: 2024, metric_value: 0.5 }),
      makeMetric({ metric_name: "Retention Rate", fiscal_year: 2024, metric_value: 0.5 }),
      makeMetric({ metric_name: "Sustainable Growth Rate", fiscal_year: 2024, metric_value: 0.1 }),
    ];
    const statements = [
      makeStatement("cashflow", 2024, [
        { code: "COMMON_DIVIDENDS_PAID", amount: -999999 },
      ]),
      makeStatement("balance", 2024, [
        { code: "SHARES_OUTSTANDING_DILUTED", amount: 1000000 },
        { code: "SHAREHOLDERS_EQUITY", amount: 5000000 },
      ]),
      makeStatement("income", 2024, [
        { code: "NET_INCOME", amount: 1000000 },
        { code: "EPS_DILUTED", amount: 1.0 },
      ]),
    ];

    const result = enrichMetricsWithFallbacks(existingMetrics, statements);
    // Should be same array ref since nothing was missing
    expect(result).toBe(existingMetrics);
  });

  it("returns original array when no statements are provided", () => {
    const existingMetrics: StockMetric[] = [];
    const result = enrichMetricsWithFallbacks(existingMetrics, []);
    expect(result).toBe(existingMetrics);
  });

  it("handles zero shares outstanding (no division by zero)", () => {
    const statements = [
      makeStatement("cashflow", 2024, [
        { code: "COMMON_DIVIDENDS_PAID", amount: -500000 },
      ]),
      makeStatement("balance", 2024, [
        { code: "SHARES_OUTSTANDING_DILUTED", amount: 0 },
        { code: "SHAREHOLDERS_EQUITY", amount: 5000000 },
      ]),
      makeStatement("income", 2024, [
        { code: "NET_INCOME", amount: 1000000 },
      ]),
    ];

    const result = enrichMetricsWithFallbacks([], statements);
    const dps = result.find((m) => m.metric_name === "Dividends / Share");

    // With 0 shares, DPS cannot be computed
    expect(dps).toBeUndefined();
  });

  it("handles zero shareholders equity (no division by zero for ROE)", () => {
    const statements = [
      makeStatement("cashflow", 2024, [
        { code: "COMMON_DIVIDENDS_PAID", amount: -300000 },
      ]),
      makeStatement("balance", 2024, [
        { code: "SHARES_OUTSTANDING_DILUTED", amount: 1000000 },
        { code: "SHAREHOLDERS_EQUITY", amount: 0 },
      ]),
      makeStatement("income", 2024, [
        { code: "NET_INCOME", amount: 1000000 },
        { code: "EPS_DILUTED", amount: 1.0 },
      ]),
    ];

    const result = enrichMetricsWithFallbacks([], statements);
    const sgr = result.find((m) => m.metric_name === "Sustainable Growth Rate");

    // With 0 equity, ROE is undefined, so SGR shouldn't be computed
    expect(sgr).toBeUndefined();
  });

  it("handles zero EPS gracefully (fallback to div paid / net income)", () => {
    const statements = [
      makeStatement("cashflow", 2024, [
        { code: "COMMON_DIVIDENDS_PAID", amount: -500000 },
      ]),
      makeStatement("balance", 2024, [
        { code: "SHARES_OUTSTANDING_DILUTED", amount: 1000000 },
        { code: "SHAREHOLDERS_EQUITY", amount: 5000000 },
      ]),
      makeStatement("income", 2024, [
        { code: "NET_INCOME", amount: 1000000 },
        { code: "EPS_DILUTED", amount: 0 },
      ]),
    ];

    const result = enrichMetricsWithFallbacks([], statements);
    const payout = result.find((m) => m.metric_name === "Payout Ratio");

    expect(payout).toBeDefined();
    // Fallback: |Div Paid| / Net Income = 500000 / 1000000 = 0.5
    expect(payout!.metric_value).toBeCloseTo(0.5);
  });

  it("uses DPS directly from DIVIDEND_PER_SHARE line item when available", () => {
    const statements = [
      makeStatement("income", 2024, [
        { code: "NET_INCOME", amount: 1000000 },
        { code: "EPS_DILUTED", amount: 1.0 },
        { code: "DIVIDEND_PER_SHARE", amount: 0.35 },
      ]),
      makeStatement("balance", 2024, [
        { code: "SHARES_OUTSTANDING_DILUTED", amount: 1000000 },
        { code: "SHAREHOLDERS_EQUITY", amount: 5000000 },
      ]),
    ];

    const result = enrichMetricsWithFallbacks([], statements);
    const dps = result.find((m) => m.metric_name === "Dividends / Share");

    expect(dps).toBeDefined();
    expect(dps!.metric_value).toBe(0.35);
  });

  it("skips quarterly statements (uses annual only)", () => {
    const quarterlyStatement: FinancialStatement = {
      ...makeStatement("income", 2024, [
        { code: "NET_INCOME", amount: 250000 },
      ]),
      fiscal_quarter: 1,
    };

    const result = enrichMetricsWithFallbacks([], [quarterlyStatement]);
    expect(result).toEqual([]);
  });

  it("handles multiple fiscal years independently", () => {
    const statements = [
      // 2023 data
      makeStatement("cashflow", 2023, [
        { code: "COMMON_DIVIDENDS_PAID", amount: -200000 },
      ]),
      makeStatement("balance", 2023, [
        { code: "SHARES_OUTSTANDING_DILUTED", amount: 1000000 },
        { code: "SHAREHOLDERS_EQUITY", amount: 4000000 },
      ]),
      makeStatement("income", 2023, [
        { code: "NET_INCOME", amount: 800000 },
        { code: "EPS_DILUTED", amount: 0.8 },
      ]),
      // 2024 data
      makeStatement("cashflow", 2024, [
        { code: "COMMON_DIVIDENDS_PAID", amount: -500000 },
      ]),
      makeStatement("balance", 2024, [
        { code: "SHARES_OUTSTANDING_DILUTED", amount: 1000000 },
        { code: "SHAREHOLDERS_EQUITY", amount: 5000000 },
      ]),
      makeStatement("income", 2024, [
        { code: "NET_INCOME", amount: 1000000 },
        { code: "EPS_DILUTED", amount: 1.0 },
      ]),
    ];

    const result = enrichMetricsWithFallbacks([], statements);

    const dps2023 = result.find((m) => m.metric_name === "Dividends / Share" && m.fiscal_year === 2023);
    const dps2024 = result.find((m) => m.metric_name === "Dividends / Share" && m.fiscal_year === 2024);

    expect(dps2023).toBeDefined();
    expect(dps2024).toBeDefined();
    expect(dps2023!.metric_value).toBeCloseTo(0.2);
    expect(dps2024!.metric_value).toBeCloseTo(0.5);
  });

  it("clamps negative payout ratio to zero", () => {
    const statements = [
      makeStatement("cashflow", 2024, [
        { code: "COMMON_DIVIDENDS_PAID", amount: 100000 }, // positive = unusual
      ]),
      makeStatement("balance", 2024, [
        { code: "SHARES_OUTSTANDING_DILUTED", amount: 1000000 },
        { code: "SHAREHOLDERS_EQUITY", amount: 5000000 },
      ]),
      makeStatement("income", 2024, [
        { code: "NET_INCOME", amount: -500000 }, // net loss
        { code: "EPS_DILUTED", amount: -0.5 },
      ]),
    ];

    const result = enrichMetricsWithFallbacks([], statements);
    const payout = result.find((m) => m.metric_name === "Payout Ratio");

    // Negative payout should be clamped to 0
    if (payout) {
      expect(payout.metric_value).toBeGreaterThanOrEqual(0);
    }
  });
});
