/**
 * ScorePanel render tests — guards against the Score tab crashing
 * ("Cannot read properties of undefined (reading 'map')") with realistic
 * backend payloads: short and long score history, beginner / advanced
 * expertise, and expanding a sub-score breakdown.
 */

import { act, fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { ScorePanel } from "@/src/features/fundamental-analysis/components/ScorePanel";

let mockExpertise: "normal" | "advanced" = "advanced";
let mockScore: any;
let mockHistory: any[];

const mockFetchQuery = jest.fn(({ queryFn }: { queryFn: () => Promise<unknown> }) => queryFn());
const mockInvalidate = jest.fn();
jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({ invalidateQueries: mockInvalidate, fetchQuery: mockFetchQuery }),
}));

jest.mock("@/hooks/queries", () => ({
  analysisKeys: { metrics: jest.fn(), growth: jest.fn(), score: jest.fn(), scoreHistory: jest.fn(), valuations: jest.fn(), statements: jest.fn() },
  useStockScore: () => ({ data: mockScore, isLoading: false, isError: false, error: null, refetch: jest.fn(), isFetching: false }),
  useScoreHistory: () => ({ data: { scores: mockHistory, count: mockHistory.length }, refetch: jest.fn() }),
  useValuations: () => ({ data: { valuations: [{ model_type: "dcf", intrinsic_value: 0.8 }], count: 1 } }),
  useAnalysisStocks: () => ({ data: { stocks: [{ id: 1, currency: "KWD" }], count: 1 } }),
}));

const mockGetStatements = jest.fn();
const mockCalculateMetrics = jest.fn();
jest.mock("@/services/api", () => ({
  calculateMetrics: (...args: unknown[]) => mockCalculateMetrics(...args),
  getStatements: (...args: unknown[]) => mockGetStatements(...args),
}));

jest.mock("@/src/store/userPrefsStore", () => ({
  useUserPrefsStore: (sel: (s: any) => any) =>
    sel({ preferences: { expertiseLevel: mockExpertise, language: "en" } }),
}));

const colors: any = new Proxy({}, { get: () => "#888888" });

const category = (n: number) => ({
  base: 50,
  metrics: Array.from({ length: n }, (_, i) => ({ metric: `M${i}`, value: i % 2 ? null : 0.123, points: i - 1, reason: "r" })),
});

function makeScore() {
  return {
    overall_score: 62.4,
    fundamental_score: 70,
    valuation_score: 55,
    growth_score: 48,
    quality_score: 66,
    risk_score: 40,
    risk_penalty_pct: 9,
    details: { "Current Price": 0.512, ROE: 0.14, "Net Margin": null, P_E: 12 },
    score_breakdown: {
      fundamental: category(3), valuation: category(2), growth: category(2), quality: category(2), risk: category(2),
    },
  };
}

const historyRow = (i: number) => ({
  id: i, stock_id: 1, scoring_date: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`,
  overall_score: 60 + (i % 5), fundamental_score: 70, valuation_score: null, growth_score: 48,
  quality_score: 66, risk_score: i % 2 ? null : 40, details: {}, analyst_notes: null, created_at: 0,
});

const renderPanel = () =>
  render(<ScorePanel stockId={1} stockSymbol="NBK" colors={colors} isDesktop={false} />);

beforeEach(() => {
  jest.clearAllMocks();
  mockGetStatements.mockResolvedValue({
    statements: [
      { period_end_date: "2024-12-31", fiscal_year: 2024, fiscal_quarter: null },
      { period_end_date: "2024-12-31", fiscal_year: 2024, fiscal_quarter: null }, // same period, other statement type
      { period_end_date: "2024-09-30", fiscal_year: 2024, fiscal_quarter: 3 },
    ],
    count: 3,
  });
  mockCalculateMetrics.mockResolvedValue({});
  mockExpertise = "advanced";
  mockScore = makeScore();
  mockHistory = [historyRow(1), historyRow(2), historyRow(3)];
});

describe("ScorePanel", () => {
  it("renders for an advanced user with a short history", () => {
    renderPanel();
    expect(screen.getByText("Interpretation Scale")).toBeTruthy();
    expect(screen.getByText("Sub-Scores")).toBeTruthy();
  });

  it("renders with a long (virtualized) score history", () => {
    mockHistory = Array.from({ length: 60 }, (_, i) => historyRow(i + 1));
    renderPanel();
    expect(screen.getByText("Score History")).toBeTruthy();
  });

  it("renders for a beginner and toggles technical details", () => {
    mockExpertise = "normal";
    renderPanel();
    fireEvent.press(screen.getByText(/Show technical details/));
    expect(screen.getByText("Sub-Scores")).toBeTruthy();
  });

  it("expands a sub-score breakdown", () => {
    renderPanel();
    fireEvent.press(screen.getByText("Fundamental"));
    expect(screen.getByText("Base: 50 pts")).toBeTruthy();
  });

  it("renders when the payload has no breakdown or details", () => {
    mockScore = { ...makeScore(), score_breakdown: undefined, details: {} };
    renderPanel();
    expect(screen.getByText("Sub-Scores")).toBeTruthy();
  });

  it("does not download the statements just to open the Score tab", () => {
    renderPanel();
    expect(mockGetStatements).not.toHaveBeenCalled();
    expect(mockFetchQuery).not.toHaveBeenCalled();
  });

  it("loads the statements when Refresh is pressed and recalculates each distinct period once", async () => {
    renderPanel();
    await act(async () => {
      fireEvent.press(screen.getByLabelText("Refresh score"));
    });
    expect(mockGetStatements).toHaveBeenCalledTimes(1);
    expect(mockGetStatements).toHaveBeenCalledWith(1);
    expect(mockCalculateMetrics).toHaveBeenCalledTimes(2); // 2024-12-31 (deduplicated) + 2024-09-30
    expect(mockCalculateMetrics).toHaveBeenCalledWith(1, { period_end_date: "2024-09-30", fiscal_year: 2024, fiscal_quarter: 3 });
    expect(mockInvalidate).toHaveBeenCalled();
  });
});
