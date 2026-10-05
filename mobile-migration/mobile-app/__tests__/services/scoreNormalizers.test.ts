/**
 * Score response normalizers — also applied to cached (persisted) responses,
 * so a payload of an unexpected/older shape must never reach the UI.
 */

jest.mock("@/services/api/client", () => ({ __esModule: true, default: { get: jest.fn() } }));

import { normalizeScore, normalizeScoreHistory, normalizeValuations } from "@/services/api/analytics/metrics";

describe("normalizeScore", () => {
  it("returns an object with empty details for null/undefined input", () => {
    expect(normalizeScore(undefined).details).toEqual({});
    expect(normalizeScore(null).details).toEqual({});
  });

  it("drops breakdown categories that have no metrics array", () => {
    const score = normalizeScore({
      details: { ROE: 0.1 },
      score_breakdown: {
        fundamental: { base: 50, metrics: [{ metric: "ROE", value: 0.1, points: 5, reason: "ok" }] },
        valuation: { base: 50 },
        growth: [] as any,
      } as any,
    });
    expect(score.score_breakdown?.fundamental.metrics).toHaveLength(1);
    expect(score.score_breakdown?.valuation).toBeUndefined();
    expect(score.score_breakdown?.growth).toBeUndefined();
  });

  it("clears a non-object breakdown", () => {
    expect(normalizeScore({ score_breakdown: "oops" as any }).score_breakdown).toBeUndefined();
  });
});

describe("normalizeScoreHistory / normalizeValuations", () => {
  it("always returns arrays", () => {
    expect(normalizeScoreHistory(undefined)).toEqual({ scores: [], count: 0 });
    expect(normalizeScoreHistory({ scores: null })).toEqual({ scores: [], count: 0 });
    expect(normalizeValuations({} as any)).toEqual({ valuations: [], count: 0 });
  });

  it("drops null / non-object rows", () => {
    const out = normalizeScoreHistory({ scores: [null as any, { id: 1 } as any, 3 as any] });
    expect(out.scores).toEqual([{ id: 1 }]);
    expect(out.count).toBe(1);
  });
});
