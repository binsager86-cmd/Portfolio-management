/**
 * Buffett Checklist — Configuration.
 *
 * All scoring rules, question text, scale definitions, sector options,
 * and hard-cap rules are defined here — not inline in UI or calculator.
 */

import type {
  BuffettSector,
  ChecklistFramework,
  HardCapRule,
  QualitativeSectionConfig,
  QuantitativeSectionConfig,
  ScaleConfig,
  ScaleMode,
  SectorOption,
  VerdictBand,
} from "./types";

// ── Scale definitions ─────────────────────────────────────────────

export const SCALE_CONFIGS: Record<ScaleMode, ScaleConfig> = {
  binary: {
    key: "binary",
    label: "Binary",
    options: [
      { label: "Fail", value: 0.0 },
      { label: "Pass", value: 1.0 },
    ],
  },
  three_point: {
    key: "three_point",
    label: "3-Point",
    options: [
      { label: "Weak", value: 0.0 },
      { label: "Moderate", value: 0.5 },
      { label: "Strong", value: 1.0 },
    ],
  },
  five_point: {
    key: "five_point",
    label: "5-Point",
    options: [
      { label: "1", value: 0.0 },
      { label: "2", value: 0.25 },
      { label: "3", value: 0.5 },
      { label: "4", value: 0.75 },
      { label: "5", value: 1.0 },
    ],
  },
};

export const DEFAULT_SCALE: ScaleMode = "five_point";

// ── Sector options ────────────────────────────────────────────────

export const SECTOR_OPTIONS: SectorOption[] = [
  { key: "non_financial", label: "Non-Financial" },
  { key: "bank", label: "Bank" },
  { key: "insurance", label: "Insurance" },
  { key: "utility", label: "Utility / Infrastructure" },
  { key: "reit", label: "REIT / Property" },
  { key: "other_financial", label: "Other Financial" },
];

/** Map raw sector/industry strings to BuffettSector. */
export function detectSector(
  sector: string | null | undefined,
  industry: string | null | undefined,
): BuffettSector {
  const s = (sector ?? "").toLowerCase();
  const i = (industry ?? "").toLowerCase();

  if (
    i.includes("bank") || s.includes("bank") ||
    i.includes("banking")
  )
    return "bank";
  if (
    i.includes("insurance") || s.includes("insurance") ||
    i.includes("reinsurance")
  )
    return "insurance";
  if (
    i.includes("reit") || i.includes("real estate investment trust") ||
    s.includes("real estate") || i.includes("property")
  )
    return "reit";
  if (
    i.includes("utility") || i.includes("utilities") ||
    s.includes("utilities") || i.includes("infrastructure") ||
    i.includes("electric") || i.includes("water") || i.includes("gas distribution")
  )
    return "utility";
  if (
    s.includes("financial") || s.includes("finance") ||
    i.includes("capital markets") || i.includes("asset management") ||
    i.includes("brokerage") || i.includes("investment")
  )
    return "other_financial";

  return "non_financial";
}

// ── Qualitative sections ──────────────────────────────────────────

export const QUALITATIVE_SECTIONS: QualitativeSectionConfig[] = [
  {
    key: "understandability",
    label: "Understandability",
    maxPoints: 15,
    icon: "lightbulb-o",
    color: "#f59e0b",
    tooltip:
      "Buffett prefers businesses that are simple to understand and whose economics can be assessed with confidence.",
    items: [
      {
        id: "q_simple_business",
        section: "understandability",
        question:
          "The business is simple and easy to explain in plain language.",
        maxPoints: 5,
        tooltip: "Can you describe the business model in one or two sentences?",
      },
      {
        id: "q_predictable_demand",
        section: "understandability",
        question:
          "The company's products/services are likely to remain relevant and needed 10 years from now.",
        maxPoints: 5,
        tooltip: "Is this a durable product with lasting demand?",
      },
      {
        id: "q_circle_of_competence",
        section: "understandability",
        question:
          "The business economics are easy for the investor to understand with confidence.",
        maxPoints: 5,
        tooltip: "Do you truly understand how this business makes money?",
      },
    ],
  },
  {
    key: "moat",
    label: "Moat / Competitive Advantage",
    maxPoints: 14,
    icon: "shield",
    color: "#6366f1",
    tooltip:
      "A durable moat may come from brand, cost advantage, switching costs, regulation, network effects, or distribution strength.",
    items: [
      {
        id: "q_durable_moat",
        section: "moat",
        question:
          "The company has a durable competitive advantage (brand, switching costs, network effects, cost advantage, regulation, or distribution power).",
        maxPoints: 8,
        tooltip:
          "Can competitors easily replicate the company's advantage?",
      },
      {
        id: "q_market_position",
        section: "moat",
        question:
          "The company's market position appears durable and difficult to displace.",
        maxPoints: 6,
        tooltip:
          "Would a well-funded competitor struggle to take significant market share?",
      },
    ],
  },
  {
    key: "management",
    label: "Management & Capital Allocation",
    maxPoints: 15,
    icon: "users",
    color: "#10b981",
    tooltip:
      "Strong management should reinvest intelligently, avoid bad acquisitions, and handle debt, dividends, and buybacks rationally.",
    items: [
      {
        id: "q_capital_allocation",
        section: "management",
        question:
          "Management allocates capital rationally through reinvestment, acquisitions, debt usage, dividends, and buybacks.",
        maxPoints: 6,
        tooltip:
          "Does management prioritize high-return reinvestment over empire building?",
      },
      {
        id: "q_shareholder_alignment",
        section: "management",
        question:
          "Management appears aligned with shareholders and focused on per-share value creation.",
        maxPoints: 3,
        tooltip:
          "Do insiders own meaningful stakes? Is compensation tied to long-term results?",
      },
      {
        id: "q_candor",
        section: "management",
        question:
          "Management communication and financial reporting appear candid, transparent, and trustworthy.",
        maxPoints: 3,
        tooltip:
          "Does management discuss mistakes openly and avoid excessive spin?",
      },
      {
        id: "q_buyback_dividend",
        section: "management",
        question:
          "The company's dividend and/or buyback policy appears disciplined and sensible.",
        maxPoints: 3,
        tooltip:
          "Are buybacks done when shares are undervalued? Are dividends sustainable?",
      },
    ],
  },
];

// ── Quantitative sections ─────────────────────────────────────────

export const QUANTITATIVE_SECTIONS: QuantitativeSectionConfig[] = [
  {
    key: "earnings_quality",
    label: "Earnings Quality & Predictability",
    maxPoints: 21,
    icon: "bar-chart",
    color: "#3b82f6",
    tooltip:
      "Buffett looks for consistent, predictable earnings with stable margins and positive cash flow.",
    metrics: [
      {
        id: "m_margin_stability",
        section: "earnings_quality",
        label: "Margin Stability",
        maxPoints: 6,
        tooltip: "Coefficient of variation of operating/net margin over available history.",
      },
      {
        id: "m_positive_eps",
        section: "earnings_quality",
        label: "Positive EPS History",
        maxPoints: 5,
        tooltip: "Percentage of years with positive earnings per share.",
      },
      {
        id: "m_positive_fcf",
        section: "earnings_quality",
        label: "Positive FCF History",
        maxPoints: 5,
        tooltip: "Percentage of years with positive free cash flow.",
      },
      {
        id: "m_revenue_stability",
        section: "earnings_quality",
        label: "Revenue Stability / Predictability",
        maxPoints: 5,
        tooltip: "Revenue CAGR plus count of negative revenue years.",
      },
    ],
  },
  {
    key: "returns_on_capital",
    label: "Returns on Capital / Business Economics",
    maxPoints: 15,
    icon: "trophy",
    color: "#10b981",
    tooltip:
      "High and consistent returns on capital indicate a business with a durable competitive advantage.",
    metrics: [
      {
        id: "m_return_on_capital",
        section: "returns_on_capital",
        label: "Return on Capital Quality",
        maxPoints: 10,
        tooltip: "Uses ROIC for non-financials, ROE for banks/insurers. 5-year average preferred.",
        sectorAware: true,
      },
      {
        id: "m_owner_earnings",
        section: "returns_on_capital",
        label: "Owner Earnings Conversion",
        maxPoints: 5,
        tooltip: "Net Income + D&A – Capex – working capital drag, as ratio to Net Income.",
      },
    ],
  },
  {
    key: "balance_sheet",
    label: "Balance Sheet Conservatism",
    maxPoints: 10,
    icon: "building",
    color: "#f59e0b",
    tooltip:
      "Buffett strongly prefers companies with conservative balance sheets and manageable debt levels.",
    metrics: [
      {
        id: "m_leverage",
        section: "balance_sheet",
        label: "Leverage",
        maxPoints: 6,
        tooltip: "Net Debt/EBITDA for non-financials; capital adequacy proxy for banks.",
        sectorAware: true,
      },
      {
        id: "m_debt_safety",
        section: "balance_sheet",
        label: "Debt Safety / Coverage",
        maxPoints: 4,
        tooltip: "EBIT / Interest Expense for non-financials.",
        sectorAware: true,
      },
    ],
  },
  {
    key: "valuation",
    label: "Valuation / Margin of Safety",
    maxPoints: 10,
    icon: "calculator",
    color: "#ec4899",
    tooltip:
      "Even a great business can be a poor investment if bought at too high a price.",
    metrics: [
      {
        id: "m_valuation_discount",
        section: "valuation",
        label: "Discount to Intrinsic Value",
        maxPoints: 10,
        tooltip: "Uses existing intrinsic value estimates vs. current market price.",
      },
    ],
  },
];

// ── Hard-cap rules ────────────────────────────────────────────────

export const HARD_CAP_RULES: HardCapRule[] = [
  {
    id: "cap_competence",
    label: "Circle of competence very weak",
    capValue: 45,
    checkDescription:
      'Qualitative item "Circle of competence" normalized score < 0.25',
  },
  {
    id: "cap_no_moat",
    label: "No real moat",
    capValue: 60,
    checkDescription:
      'Qualitative item "Durable moat" normalized score < 0.25',
  },
  {
    id: "cap_poor_earnings",
    label: "Poor earnings consistency",
    capValue: 50,
    checkDescription: "EPS history score == 0 OR FCF history score == 0",
  },
  {
    id: "cap_excessive_leverage",
    label: "Excessive leverage",
    capValue: 55,
    checkDescription: "Leverage score == 0",
  },
  {
    id: "cap_overvalued",
    label: "Clearly overvalued",
    capValue: 70,
    checkDescription: "Valuation score == 0",
  },
];

// ── Verdict bands ─────────────────────────────────────────────────

export const VERDICT_BANDS: VerdictBand[] = [
  { min: 90, max: 100, verdict: "Very High Buffett Fit" },
  { min: 75, max: 89, verdict: "Strong Buffett Fit" },
  { min: 60, max: 74, verdict: "Partial Buffett Fit" },
  { min: 40, max: 59, verdict: "Low Buffett Fit" },
  { min: 0, max: 39, verdict: "Very Unlikely Buffett-Style Pick" },
];

// ── Framework assembly ────────────────────────────────────────────

export const BUFFETT_FRAMEWORK: ChecklistFramework = {
  id: "buffett",
  name: "Buffett Compatibility Score",
  description:
    "Buffett-inspired checklist based on business quality, predictability, capital allocation, balance sheet strength, and valuation. It is a compatibility model, not a prediction of Buffett's actual purchase decision.",
  totalPoints: 100,
  qualitativePoints: 44,
  quantitativePoints: 56,
  qualitativeSections: QUALITATIVE_SECTIONS,
  quantitativeSections: QUANTITATIVE_SECTIONS,
  hardCaps: HARD_CAP_RULES,
  verdictBands: VERDICT_BANDS,
};

// ── History coverage thresholds ───────────────────────────────────

export const HISTORY_COVERAGE = {
  FULL: { minYears: 8, penalty: 0 },
  MODERATE: { minYears: 5, penalty: 0.1 }, // slight confidence reduction
  LIMITED: { minYears: 0, penalty: 0.25 }, // stronger warning
} as const;

// ── Assessment version ────────────────────────────────────────────

export const ASSESSMENT_VERSION = 1;
