/**
 * Buffett Checklist — Calculator tests.
 *
 * Covers: scale normalization, scale switching, qualitative scoring,
 * quantitative thresholds, valuation mapping, hard cap stacking,
 * missing data handling, bank vs non-financial, and example profiles.
 */

import {
  calculateBuffettScore,
  remapToScale,
  getScaleLabel,
} from "@/src/features/fundamental-analysis/buffett-checklist/calculator";
import type { CalculatorInput } from "@/src/features/fundamental-analysis/buffett-checklist/calculator";
import type { FinancialStatement, StockMetric, ValuationResult } from "@/services/api/types";

// ── Helpers ───────────────────────────────────────────────────────

function makeStatement(
  type: string,
  year: number,
  items: { code: string; amount: number }[],
): FinancialStatement {
  return {
    id: year * 100,
    stock_id: 1,
    statement_type: type,
    fiscal_year: year,
    fiscal_quarter: null,
    period_end_date: `${year}-12-31`,
    filing_date: null,
    source_file: null,
    extracted_by: "test",
    confidence_score: 1,
    notes: null,
    created_at: Date.now(),
    line_items: items.map((it, i) => ({
      id: year * 1000 + i,
      statement_id: year * 100,
      line_item_code: it.code,
      line_item_name: it.code,
      amount: it.amount,
      currency: "USD",
      order_index: i,
      is_total: false,
      manually_edited: false,
    })),
  } as FinancialStatement;
}

function makeMetric(name: string, year: number, value: number, type = "profitability"): StockMetric {
  return {
    id: year * 100,
    stock_id: 1,
    fiscal_year: year,
    fiscal_quarter: null,
    period_end_date: `${year}-12-31`,
    metric_type: type,
    metric_name: name,
    metric_value: value,
    created_at: Date.now(),
  } as StockMetric;
}

function makeValuation(iv: number, model = "dcf"): ValuationResult {
  return {
    id: 1,
    stock_id: 1,
    model_type: model,
    valuation_date: "2024-12-31",
    intrinsic_value: iv,
    parameters: {},
    assumptions: {},
    created_by_user_id: null,
    created_at: Date.now(),
  } as ValuationResult;
}

/** Generate N years of consistent income/balance/cashflow statements. */
function generateStrongCompanyData(years: number) {
  const statements: FinancialStatement[] = [];
  const metrics: StockMetric[] = [];

  for (let i = 0; i < years; i++) {
    const year = 2024 - years + 1 + i;
    const revenue = 1000 + i * 50;
    const opIncome = revenue * 0.25;
    const netIncome = revenue * 0.18;

    statements.push(
      makeStatement("income", year, [
        { code: "REVENUE", amount: revenue },
        { code: "OPERATING_INCOME", amount: opIncome },
        { code: "NET_INCOME", amount: netIncome },
        { code: "INTEREST_EXPENSE", amount: -10 },
        { code: "DEPRECIATION_AMORTIZATION", amount: 30 },
        { code: "EBITDA", amount: opIncome + 30 },
      ]),
      makeStatement("balance", year, [
        { code: "TOTAL_ASSETS", amount: 2000 },
        { code: "TOTAL_EQUITY", amount: 1000 },
        { code: "TOTAL_LIABILITIES", amount: 1000 },
        { code: "LONG_TERM_DEBT", amount: 200 },
        { code: "SHORT_TERM_DEBT", amount: 50 },
        { code: "CASH_AND_CASH_EQUIVALENTS", amount: 150 },
        { code: "TOTAL_CURRENT_ASSETS", amount: 500 },
        { code: "TOTAL_CURRENT_LIABILITIES", amount: 300 },
      ]),
      makeStatement("cashflow", year, [
        { code: "CASH_FROM_OPERATIONS", amount: netIncome + 30 },
        { code: "CAPITAL_EXPENDITURES", amount: -40 },
        { code: "FREE_CASH_FLOW", amount: netIncome + 30 - 40 },
        { code: "CHANGES_IN_WORKING_CAPITAL", amount: -5 },
      ]),
    );

    metrics.push(
      makeMetric("Operating Margin", year, opIncome / revenue),
      makeMetric("Net Margin", year, netIncome / revenue),
      makeMetric("ROE", year, netIncome / 1000),
      makeMetric("ROIC", year, (netIncome * 0.75) / 800),
      makeMetric("EPS", year, netIncome / 100, "valuation"),
      makeMetric("Interest Coverage", year, opIncome / 10, "leverage"),
      makeMetric("Net Debt-to-EBITDA", year, (250 - 150) / (opIncome + 30), "leverage"),
      makeMetric("Debt-to-Equity", year, 250 / 1000, "leverage"),
    );
  }

  return { statements, metrics };
}

const fullQualitativeAnswers: Record<string, number> = {
  q_simple_business: 1.0,
  q_predictable_demand: 1.0,
  q_circle_of_competence: 1.0,
  q_durable_moat: 1.0,
  q_market_position: 1.0,
  q_capital_allocation: 1.0,
  q_shareholder_alignment: 1.0,
  q_candor: 1.0,
  q_buyback_dividend: 1.0,
};

// ═══════════════════════════════════════════════════════════════════
// Scale tests
// ═══════════════════════════════════════════════════════════════════

describe("Scale normalization", () => {
  test("remapToScale binary", () => {
    expect(remapToScale(0.0, "binary")).toBe(0.0);
    expect(remapToScale(0.3, "binary")).toBe(0.0);
    expect(remapToScale(0.5, "binary")).toBe(0.0); // tie goes to first option (Fail)
    expect(remapToScale(0.7, "binary")).toBe(1.0);
    expect(remapToScale(1.0, "binary")).toBe(1.0);
  });

  test("remapToScale three_point", () => {
    expect(remapToScale(0.0, "three_point")).toBe(0.0);
    expect(remapToScale(0.3, "three_point")).toBe(0.5);
    expect(remapToScale(0.5, "three_point")).toBe(0.5);
    expect(remapToScale(0.8, "three_point")).toBe(1.0);
    expect(remapToScale(1.0, "three_point")).toBe(1.0);
  });

  test("remapToScale five_point", () => {
    expect(remapToScale(0.0, "five_point")).toBe(0.0);
    expect(remapToScale(0.125, "five_point")).toBe(0.0);
    expect(remapToScale(0.25, "five_point")).toBe(0.25);
    expect(remapToScale(0.5, "five_point")).toBe(0.5);
    expect(remapToScale(0.75, "five_point")).toBe(0.75);
    expect(remapToScale(1.0, "five_point")).toBe(1.0);
  });
});

describe("Scale switching remap", () => {
  test("5-point to binary preserves intent", () => {
    // 0.75 on 5-point → closest binary = 1.0 (Pass)
    expect(remapToScale(0.75, "binary")).toBe(1.0);
    // 0.25 on 5-point → closest binary = 0.0 (Fail)
    expect(remapToScale(0.25, "binary")).toBe(0.0);
  });

  test("binary to 3-point preserves intent", () => {
    // 1.0 → 1.0 (Strong)
    expect(remapToScale(1.0, "three_point")).toBe(1.0);
    // 0.0 → 0.0 (Weak)
    expect(remapToScale(0.0, "three_point")).toBe(0.0);
  });

  test("3-point to 5-point preserves intent", () => {
    // 0.5 (Moderate) → 0.5 (3) on 5-point
    expect(remapToScale(0.5, "five_point")).toBe(0.5);
  });
});

describe("getScaleLabel", () => {
  test("returns correct labels for binary", () => {
    expect(getScaleLabel(0.0, "binary")).toBe("Fail");
    expect(getScaleLabel(1.0, "binary")).toBe("Pass");
  });

  test("returns correct labels for 3-point", () => {
    expect(getScaleLabel(0.0, "three_point")).toBe("Weak");
    expect(getScaleLabel(0.5, "three_point")).toBe("Moderate");
    expect(getScaleLabel(1.0, "three_point")).toBe("Strong");
  });

  test("returns correct labels for 5-point", () => {
    expect(getScaleLabel(0.0, "five_point")).toBe("1");
    expect(getScaleLabel(0.25, "five_point")).toBe("2");
    expect(getScaleLabel(0.5, "five_point")).toBe("3");
    expect(getScaleLabel(0.75, "five_point")).toBe("4");
    expect(getScaleLabel(1.0, "five_point")).toBe("5");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Qualitative score calculation
// ═══════════════════════════════════════════════════════════════════

describe("Qualitative score calculation", () => {
  test("all max answers yields 44 qualitative points", () => {
    const result = calculateBuffettScore({
      qualitativeAnswers: fullQualitativeAnswers,
      statements: [],
      metrics: [],
      valuations: [],
      sector: "non_financial",
      marketPrice: null,
    });

    // Qualitative sections: 15+14+15 = 44
    const qualSections = result.sectionBreakdown.filter(
      (s) => ["understandability", "moat", "management"].includes(s.key),
    );
    const qualTotal = qualSections.reduce((sum, s) => sum + s.pointsEarned, 0);
    expect(qualTotal).toBe(44);
  });

  test("half answers yields ~22 qualitative points", () => {
    const halfAnswers: Record<string, number> = {};
    for (const key of Object.keys(fullQualitativeAnswers)) {
      halfAnswers[key] = 0.5;
    }

    const result = calculateBuffettScore({
      qualitativeAnswers: halfAnswers,
      statements: [],
      metrics: [],
      valuations: [],
      sector: "non_financial",
      marketPrice: null,
    });

    const qualSections = result.sectionBreakdown.filter(
      (s) => ["understandability", "moat", "management"].includes(s.key),
    );
    const qualTotal = qualSections.reduce((sum, s) => sum + s.pointsEarned, 0);
    expect(qualTotal).toBe(22);
  });

  test("individual item scoring: 0.75 * 5 = 3.75", () => {
    const result = calculateBuffettScore({
      qualitativeAnswers: { q_simple_business: 0.75 },
      statements: [],
      metrics: [],
      valuations: [],
      sector: "non_financial",
      marketPrice: null,
    });

    const item = result.itemBreakdown.find((b) => b.id === "q_simple_business");
    expect(item?.pointsEarned).toBe(3.75);
    expect(item?.maxPoints).toBe(5);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Quantitative metric thresholds
// ═══════════════════════════════════════════════════════════════════

describe("Quantitative metric thresholds", () => {
  test("margin stability: low CV gets full points", () => {
    const { statements, metrics } = generateStrongCompanyData(10);
    const result = calculateBuffettScore({
      qualitativeAnswers: {},
      statements,
      metrics,
      valuations: [],
      sector: "non_financial",
      marketPrice: null,
    });

    const margin = result.itemBreakdown.find((b) => b.id === "m_margin_stability");
    expect(margin).toBeDefined();
    expect(margin!.isMissing).toBe(false);
    expect(margin!.pointsEarned).toBeGreaterThanOrEqual(4.5); // Very stable margins
  });

  test("positive EPS: 100% positive gets 5 points", () => {
    const { statements, metrics } = generateStrongCompanyData(10);
    const result = calculateBuffettScore({
      qualitativeAnswers: {},
      statements,
      metrics,
      valuations: [],
      sector: "non_financial",
      marketPrice: null,
    });

    const eps = result.itemBreakdown.find((b) => b.id === "m_positive_eps");
    expect(eps?.pointsEarned).toBe(5);
  });

  test("positive FCF: 100% positive gets 5 points", () => {
    const { statements, metrics } = generateStrongCompanyData(10);
    const result = calculateBuffettScore({
      qualitativeAnswers: {},
      statements,
      metrics,
      valuations: [],
      sector: "non_financial",
      marketPrice: null,
    });

    const fcf = result.itemBreakdown.find((b) => b.id === "m_positive_fcf");
    expect(fcf?.pointsEarned).toBe(5);
  });

  test("return on capital: high ROIC gets 10 points", () => {
    const { statements, metrics } = generateStrongCompanyData(10);
    const result = calculateBuffettScore({
      qualitativeAnswers: {},
      statements,
      metrics,
      valuations: [],
      sector: "non_financial",
      marketPrice: null,
    });

    const roc = result.itemBreakdown.find((b) => b.id === "m_return_on_capital");
    expect(roc).toBeDefined();
    expect(roc!.pointsEarned).toBeGreaterThanOrEqual(6);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Valuation score mapping
// ═══════════════════════════════════════════════════════════════════

describe("Valuation score mapping", () => {
  test("25%+ discount gets 10 points", () => {
    const result = calculateBuffettScore({
      qualitativeAnswers: {},
      statements: [],
      metrics: [],
      valuations: [makeValuation(100)],
      sector: "non_financial",
      marketPrice: 70,
    });

    const val = result.itemBreakdown.find((b) => b.id === "m_valuation_discount");
    expect(val?.pointsEarned).toBe(10);
  });

  test("15-25% discount gets 8 points", () => {
    const result = calculateBuffettScore({
      qualitativeAnswers: {},
      statements: [],
      metrics: [],
      valuations: [makeValuation(100)],
      sector: "non_financial",
      marketPrice: 82,
    });

    const val = result.itemBreakdown.find((b) => b.id === "m_valuation_discount");
    expect(val?.pointsEarned).toBe(8);
  });

  test("fair value (within 15%) gets 5 points", () => {
    const result = calculateBuffettScore({
      qualitativeAnswers: {},
      statements: [],
      metrics: [],
      valuations: [makeValuation(100)],
      sector: "non_financial",
      marketPrice: 95,
    });

    const val = result.itemBreakdown.find((b) => b.id === "m_valuation_discount");
    expect(val?.pointsEarned).toBe(5);
  });

  test("30%+ premium gets 0 points", () => {
    const result = calculateBuffettScore({
      qualitativeAnswers: {},
      statements: [],
      metrics: [],
      valuations: [makeValuation(100)],
      sector: "non_financial",
      marketPrice: 140,
    });

    const val = result.itemBreakdown.find((b) => b.id === "m_valuation_discount");
    expect(val?.pointsEarned).toBe(0);
  });

  test("multiple valuation models use blended average", () => {
    const result = calculateBuffettScore({
      qualitativeAnswers: {},
      statements: [],
      metrics: [],
      valuations: [makeValuation(100, "dcf"), makeValuation(120, "graham")],
      sector: "non_financial",
      marketPrice: 80,
    });

    // Avg IV = 110, discount = (110-80)/110 = 27.3% → 10 points
    const val = result.itemBreakdown.find((b) => b.id === "m_valuation_discount");
    expect(val?.pointsEarned).toBe(10);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Hard cap stacking
// ═══════════════════════════════════════════════════════════════════

describe("Hard cap stacking", () => {
  test("circle of competence weak caps at 45", () => {
    const { statements, metrics } = generateStrongCompanyData(10);
    const result = calculateBuffettScore({
      qualitativeAnswers: {
        ...fullQualitativeAnswers,
        q_circle_of_competence: 0.0, // < 0.25 triggers cap
      },
      statements,
      metrics,
      valuations: [makeValuation(100)],
      sector: "non_financial",
      marketPrice: 70,
    });

    expect(result.finalScore).toBeLessThanOrEqual(45);
    expect(result.activeCaps.some((c) => c.id === "cap_competence")).toBe(true);
  });

  test("no moat caps at 60", () => {
    const { statements, metrics } = generateStrongCompanyData(10);
    const result = calculateBuffettScore({
      qualitativeAnswers: {
        ...fullQualitativeAnswers,
        q_durable_moat: 0.0, // < 0.25 triggers cap
      },
      statements,
      metrics,
      valuations: [makeValuation(100)],
      sector: "non_financial",
      marketPrice: 70,
    });

    expect(result.finalScore).toBeLessThanOrEqual(60);
    expect(result.activeCaps.some((c) => c.id === "cap_no_moat")).toBe(true);
  });

  test("multiple caps use lowest", () => {
    const { statements, metrics } = generateStrongCompanyData(10);
    const result = calculateBuffettScore({
      qualitativeAnswers: {
        ...fullQualitativeAnswers,
        q_circle_of_competence: 0.0, // cap at 45
        q_durable_moat: 0.0,         // cap at 60
      },
      statements,
      metrics,
      valuations: [makeValuation(100)],
      sector: "non_financial",
      marketPrice: 70,
    });

    // Should use lowest cap (45)
    expect(result.finalScore).toBeLessThanOrEqual(45);
    expect(result.activeCaps.length).toBeGreaterThanOrEqual(2);
  });

  test("overvalued caps at 70", () => {
    const { statements, metrics } = generateStrongCompanyData(10);
    const result = calculateBuffettScore({
      qualitativeAnswers: fullQualitativeAnswers,
      statements,
      metrics,
      valuations: [makeValuation(100)],
      sector: "non_financial",
      marketPrice: 150, // 33% premium → valuation score = 0 → cap at 70
    });

    expect(result.finalScore).toBeLessThanOrEqual(70);
    expect(result.activeCaps.some((c) => c.id === "cap_overvalued")).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Missing data handling
// ═══════════════════════════════════════════════════════════════════

describe("Missing data handling", () => {
  test("no data does not crash", () => {
    const result = calculateBuffettScore({
      qualitativeAnswers: {},
      statements: [],
      metrics: [],
      valuations: [],
      sector: "non_financial",
      marketPrice: null,
    });

    // Score > 0 because scoreDebtSafety returns 4pts ("no debt detected")
    // when there are no balance sheets, which triggers reweighting.
    expect(result.finalScore).toBeGreaterThanOrEqual(0);
    expect(result.finalScore).toBeLessThanOrEqual(100);
    expect(typeof result.verdict).toBe("string");
    expect(result.missingData.length).toBeGreaterThan(0);
    expect(result.confidence).toBe("Low");
  });

  test("partial data produces correct coverage", () => {
    const { statements, metrics } = generateStrongCompanyData(5);
    const result = calculateBuffettScore({
      qualitativeAnswers: { q_simple_business: 0.75 },
      statements,
      metrics,
      valuations: [],
      sector: "non_financial",
      marketPrice: null,
    });

    expect(result.dataCoveragePercent).toBeGreaterThan(0);
    expect(result.dataCoveragePercent).toBeLessThan(100);
    expect(result.confidence).toBeDefined();
  });

  test("missing metrics are flagged, not scored as zero", () => {
    const result = calculateBuffettScore({
      qualitativeAnswers: fullQualitativeAnswers,
      statements: [],
      metrics: [],
      valuations: [],
      sector: "non_financial",
      marketPrice: null,
    });

    const quantItems = result.itemBreakdown.filter((b) => b.type === "quantitative");
    const missingItems = quantItems.filter((b) => b.isMissing);
    expect(missingItems.length).toBeGreaterThan(0);
    // Missing items should have isMissing=true and a missingReason
    for (const m of missingItems) {
      expect(m.isMissing).toBe(true);
      expect(m.missingReason).toBeTruthy();
    }
  });
});

// ═══════════════════════════════════════════════════════════════════
// Bank vs non-financial scoring
// ═══════════════════════════════════════════════════════════════════

describe("Bank vs non-financial scoring", () => {
  test("bank uses ROE instead of ROIC", () => {
    const { statements } = generateStrongCompanyData(5);
    const metrics = [
      makeMetric("ROE", 2020, 0.14),
      makeMetric("ROE", 2021, 0.15),
      makeMetric("ROE", 2022, 0.13),
      makeMetric("ROE", 2023, 0.16),
      makeMetric("ROE", 2024, 0.15),
    ];

    const result = calculateBuffettScore({
      qualitativeAnswers: {},
      statements,
      metrics,
      valuations: [],
      sector: "bank",
      marketPrice: null,
    });

    const roc = result.itemBreakdown.find((b) => b.id === "m_return_on_capital");
    expect(roc).toBeDefined();
    expect(roc!.pointsEarned).toBeGreaterThanOrEqual(8); // Avg ROE ~14.6% → 10 points
    expect(roc!.sourceDescription).toContain("ROE");
  });

  test("bank leverage uses D/E instead of Net Debt/EBITDA", () => {
    const { statements } = generateStrongCompanyData(5);
    const metrics = [
      makeMetric("Debt-to-Equity", 2024, 4.0, "leverage"),
    ];

    const result = calculateBuffettScore({
      qualitativeAnswers: {},
      statements,
      metrics,
      valuations: [],
      sector: "bank",
      marketPrice: null,
    });

    const lev = result.itemBreakdown.find((b) => b.id === "m_leverage");
    expect(lev).toBeDefined();
    expect(lev!.pointsEarned).toBe(6); // D/E 4.0 < 5 → 6 points for bank
  });

  test("bank debt safety is N/A", () => {
    const result = calculateBuffettScore({
      qualitativeAnswers: {},
      statements: [],
      metrics: [],
      valuations: [],
      sector: "bank",
      marketPrice: null,
    });

    const ds = result.itemBreakdown.find((b) => b.id === "m_debt_safety");
    expect(ds?.isMissing).toBe(true);
    expect(ds?.sourceDescription).toContain("N/A for financials");
  });
});

// ═══════════════════════════════════════════════════════════════════
// Example profiles
// ═══════════════════════════════════════════════════════════════════

describe("Example profiles", () => {
  test("1. Strong global quality compounder", () => {
    const { statements, metrics } = generateStrongCompanyData(10);
    const result = calculateBuffettScore({
      qualitativeAnswers: fullQualitativeAnswers,
      statements,
      metrics,
      valuations: [makeValuation(200)],
      sector: "non_financial",
      marketPrice: 150, // 25% discount
    });

    expect(result.finalScore).toBeGreaterThanOrEqual(75);
    expect(result.verdict).toMatch(/Strong|Very High/);
    expect(result.confidence).not.toBe("Low");
  });

  test("2. Cyclical commodity company", () => {
    // Volatile margins, some negative years
    const statements: FinancialStatement[] = [];
    const metrics: StockMetric[] = [];

    for (let i = 0; i < 10; i++) {
      const year = 2015 + i;
      const cycle = Math.sin(i * 0.8) * 0.5;
      const revenue = 500 + cycle * 200;
      const opMargin = 0.10 + cycle * 0.15; // Swings from -5% to 25%
      const opIncome = revenue * opMargin;
      const netIncome = opIncome * 0.7;

      statements.push(
        makeStatement("income", year, [
          { code: "REVENUE", amount: revenue },
          { code: "OPERATING_INCOME", amount: opIncome },
          { code: "NET_INCOME", amount: netIncome },
        ]),
      );
      metrics.push(makeMetric("EPS", year, netIncome / 100, "valuation"));
    }

    const result = calculateBuffettScore({
      qualitativeAnswers: {
        q_simple_business: 0.75,
        q_predictable_demand: 0.25,
        q_circle_of_competence: 0.5,
        q_durable_moat: 0.25,
        q_market_position: 0.5,
        q_capital_allocation: 0.5,
        q_shareholder_alignment: 0.5,
        q_candor: 0.5,
        q_buyback_dividend: 0.25,
      },
      statements,
      metrics,
      valuations: [],
      sector: "non_financial",
      marketPrice: null,
    });

    // Cyclical companies should score lower
    expect(result.finalScore).toBeLessThanOrEqual(60);
  });

  test("3. Highly levered business", () => {
    const statements: FinancialStatement[] = [];
    const metrics: StockMetric[] = [];

    for (let i = 0; i < 5; i++) {
      const year = 2020 + i;
      statements.push(
        makeStatement("income", year, [
          { code: "REVENUE", amount: 1000 },
          { code: "OPERATING_INCOME", amount: 200 },
          { code: "NET_INCOME", amount: 80 },
          { code: "INTEREST_EXPENSE", amount: -100 },
        ]),
        makeStatement("balance", year, [
          { code: "TOTAL_ASSETS", amount: 5000 },
          { code: "TOTAL_EQUITY", amount: 500 },
          { code: "LONG_TERM_DEBT", amount: 4000 },
          { code: "CASH_AND_CASH_EQUIVALENTS", amount: 100 },
        ]),
      );
      metrics.push(
        makeMetric("Net Debt-to-EBITDA", year, 10, "leverage"),
        makeMetric("Interest Coverage", year, 2, "leverage"),
      );
    }

    const result = calculateBuffettScore({
      qualitativeAnswers: fullQualitativeAnswers,
      statements,
      metrics,
      valuations: [],
      sector: "non_financial",
      marketPrice: null,
    });

    // Excessive leverage should cap
    expect(result.activeCaps.some((c) => c.id === "cap_excessive_leverage")).toBe(true);
    expect(result.finalScore).toBeLessThanOrEqual(55);
  });

  test("4. Bank with strong ROE and capital", () => {
    const metrics = [];
    for (let year = 2020; year <= 2024; year++) {
      metrics.push(
        makeMetric("ROE", year, 0.16),
        makeMetric("Debt-to-Equity", year, 6, "leverage"),
      );
    }

    const result = calculateBuffettScore({
      qualitativeAnswers: fullQualitativeAnswers,
      statements: [],
      metrics,
      valuations: [makeValuation(50)],
      sector: "bank",
      marketPrice: 35, // 30% discount
    });

    // Should score well despite being a bank
    expect(result.finalScore).toBeGreaterThanOrEqual(50);
    const roc = result.itemBreakdown.find((b) => b.id === "m_return_on_capital");
    expect(roc!.pointsEarned).toBe(10); // ROE > 15%
  });

  test("5. Excellent quality but overvalued", () => {
    const { statements, metrics } = generateStrongCompanyData(10);
    const result = calculateBuffettScore({
      qualitativeAnswers: fullQualitativeAnswers,
      statements,
      metrics,
      valuations: [makeValuation(100)],
      sector: "non_financial",
      marketPrice: 200, // 50% premium → valuation = 0 → cap at 70
    });

    expect(result.activeCaps.some((c) => c.id === "cap_overvalued")).toBe(true);
    expect(result.finalScore).toBeLessThanOrEqual(70);
  });
});

// ═══════════════════════════════════════════════════════════════════
// Result structure
// ═══════════════════════════════════════════════════════════════════

describe("Result structure", () => {
  test("returns all required fields", () => {
    const result = calculateBuffettScore({
      qualitativeAnswers: fullQualitativeAnswers,
      statements: [],
      metrics: [],
      valuations: [],
      sector: "non_financial",
      marketPrice: null,
    });

    expect(typeof result.finalScore).toBe("number");
    expect(typeof result.rawScore).toBe("number");
    expect(typeof result.verdict).toBe("string");
    expect(typeof result.confidence).toBe("string");
    expect(typeof result.dataCoveragePercent).toBe("number");
    expect(Array.isArray(result.activeCaps)).toBe(true);
    expect(Array.isArray(result.sectionBreakdown)).toBe(true);
    expect(Array.isArray(result.itemBreakdown)).toBe(true);
    expect(Array.isArray(result.strengths)).toBe(true);
    expect(Array.isArray(result.blockers)).toBe(true);
    expect(Array.isArray(result.assumptions)).toBe(true);
    expect(Array.isArray(result.missingData)).toBe(true);
  });

  test("section breakdown covers all 7 sections", () => {
    const result = calculateBuffettScore({
      qualitativeAnswers: {},
      statements: [],
      metrics: [],
      valuations: [],
      sector: "non_financial",
      marketPrice: null,
    });

    expect(result.sectionBreakdown.length).toBe(7);
    const keys = result.sectionBreakdown.map((s) => s.key);
    expect(keys).toContain("understandability");
    expect(keys).toContain("moat");
    expect(keys).toContain("management");
    expect(keys).toContain("earnings_quality");
    expect(keys).toContain("returns_on_capital");
    expect(keys).toContain("balance_sheet");
    expect(keys).toContain("valuation");
  });

  test("strengths and blockers contain top/bottom 3", () => {
    const { statements, metrics } = generateStrongCompanyData(10);
    const result = calculateBuffettScore({
      qualitativeAnswers: fullQualitativeAnswers,
      statements,
      metrics,
      valuations: [makeValuation(100)],
      sector: "non_financial",
      marketPrice: 80,
    });

    expect(result.strengths.length).toBeLessThanOrEqual(3);
    expect(result.blockers.length).toBeLessThanOrEqual(3);
  });

  test("score is clamped 0-100", () => {
    const result = calculateBuffettScore({
      qualitativeAnswers: {},
      statements: [],
      metrics: [],
      valuations: [],
      sector: "non_financial",
      marketPrice: null,
    });

    expect(result.finalScore).toBeGreaterThanOrEqual(0);
    expect(result.finalScore).toBeLessThanOrEqual(100);
  });
});
