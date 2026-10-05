/**
 * ScorePanel render tests — guards against the Score tab crashing
 * ("Cannot read properties of undefined (reading 'map')") with realistic
 * backend payloads: short and long score history, beginner / advanced
 * expertise, and expanding a sub-score breakdown.
 */

import { fireEvent, render, screen } from "@testing-library/react-native";
import React from "react";

import { ScorePanel } from "@/src/features/fundamental-analysis/components/ScorePanel";

let mockExpertise: "normal" | "advanced" = "advanced";
let mockScore: any;
let mockHistory: any[];

jest.mock("@tanstack/react-query", () => ({
  ...jest.requireActual("@tanstack/react-query"),
  useQueryClient: () => ({ invalidateQueries: jest.fn() }),
}));

jest.mock("@/hooks/queries", () => ({
  analysisKeys: { metrics: jest.fn(), growth: jest.fn(), score: jest.fn(), scoreHistory: jest.fn(), valuations: jest.fn() },
  useStockScore: () => ({ data: mockScore, isLoading: false, isError: false, error: null, refetch: jest.fn(), isFetching: false }),
  useScoreHistory: () => ({ data: { scores: mockHistory, count: mockHistory.length }, refetch: jest.fn() }),
  useValuations: () => ({ data: { valuations: [{ model_type: "dcf", intrinsic_value: 0.8 }], count: 1 } }),
  useStatements: () => ({ data: { statements: [] } }),
  useAnalysisStocks: () => ({ data: { stocks: [{ id: 1, currency: "KWD" }], count: 1 } }),
}));

jest.mock("@/services/api", () => ({ calculateMetrics: jest.fn() }));

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
});
