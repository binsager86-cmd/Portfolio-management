import { SCORE_THRESHOLDS } from "@/src/features/fundamental-analysis/types";
import {
    formatMetricValue,
    formatScoreDate,
    safeFormatMetric,
    scoreColor,
    scoreLabel,
} from "@/src/features/fundamental-analysis/utils";

const mockColors = {
  success: "#22c55e",
  warning: "#f59e0b",
  danger: "#ef4444",
} as any;

describe("scoreLabel", () => {
  it("returns Exceptional for scores >= 85", () => {
    expect(scoreLabel(85)).toBe("Exceptional");
    expect(scoreLabel(100)).toBe("Exceptional");
  });

  it("returns Strong for scores >= 70 and < 85", () => {
    expect(scoreLabel(70)).toBe("Strong");
    expect(scoreLabel(84)).toBe("Strong");
  });

  it("returns Acceptable for 55-69", () => {
    expect(scoreLabel(55)).toBe("Acceptable");
    expect(scoreLabel(69)).toBe("Acceptable");
  });

  it("returns Weak for 40-54", () => {
    expect(scoreLabel(40)).toBe("Weak");
    expect(scoreLabel(54)).toBe("Weak");
  });

  it("returns Avoid for scores < 40", () => {
    expect(scoreLabel(0)).toBe("Avoid");
    expect(scoreLabel(39)).toBe("Avoid");
  });
});

describe("scoreColor", () => {
  it("returns success for scores >= EXCEPTIONAL threshold", () => {
    expect(scoreColor(SCORE_THRESHOLDS.EXCEPTIONAL, mockColors)).toBe(mockColors.success);
    expect(scoreColor(90, mockColors)).toBe(mockColors.success);
  });

  it("returns green for STRONG scores", () => {
    expect(scoreColor(SCORE_THRESHOLDS.STRONG, mockColors)).toBe("#22c55e");
    expect(scoreColor(75, mockColors)).toBe("#22c55e");
  });

  it("returns warning for ACCEPTABLE scores", () => {
    expect(scoreColor(SCORE_THRESHOLDS.ACCEPTABLE, mockColors)).toBe(mockColors.warning);
    expect(scoreColor(65, mockColors)).toBe(mockColors.warning);
  });

  it("returns orange for WEAK scores", () => {
    expect(scoreColor(SCORE_THRESHOLDS.WEAK, mockColors)).toBe("#f97316");
    expect(scoreColor(45, mockColors)).toBe("#f97316");
  });

  it("returns danger for scores below WEAK", () => {
    expect(scoreColor(30, mockColors)).toBe(mockColors.danger);
    expect(scoreColor(0, mockColors)).toBe(mockColors.danger);
  });
});

describe("safeFormatMetric", () => {
  it("returns formatted value for valid numbers", () => {
    expect(safeFormatMetric("Revenue", 1234567)).toBe("1,234,567");
  });

  it("returns – for null", () => {
    expect(safeFormatMetric("Revenue", null)).toBe("–");
  });

  it("returns – for undefined", () => {
    expect(safeFormatMetric("Revenue", undefined)).toBe("–");
  });

  it("returns – for NaN", () => {
    expect(safeFormatMetric("Revenue", NaN)).toBe("–");
  });

  it("returns – for strings", () => {
    expect(safeFormatMetric("Revenue", "not a number")).toBe("–");
  });
});

describe("formatMetricValue", () => {
  it("formats percentage metrics correctly", () => {
    expect(formatMetricValue("Gross Margin", 0.45)).toBe("45.0%");
    expect(formatMetricValue("ROE", 0.12)).toBe("12.0%");
  });

  it("formats days metrics correctly", () => {
    expect(formatMetricValue("Days Sales Outstanding", 45.7)).toBe("46 days");
  });

  it("formats multiplier metrics correctly", () => {
    expect(formatMetricValue("Asset Turnover", 1.5)).toBe("1.50x");
    expect(formatMetricValue("Current Ratio", 2.1)).toBe("2.10x");
  });

  it("formats EPS correctly", () => {
    expect(formatMetricValue("EPS", 3.14)).toBe("3.140");
  });

  it("formats Book Value Per Share to 3 decimal places", () => {
    expect(formatMetricValue("Book Value Per Share", 1.2)).toBe("1.200");
    expect(formatMetricValue("Book Value Per Share", 0.12345)).toBe("0.123");
  });

  it("formats generic numbers", () => {
    expect(formatMetricValue("Revenue", 1000000)).toBe("1,000,000");
  });
});

describe("formatScoreDate", () => {
  it("formats ISO date strings", () => {
    expect(formatScoreDate("2025-03-15")).toBe("Mar 15, 2025");
  });

  it("returns – for null/undefined", () => {
    expect(formatScoreDate(null)).toBe("–");
    expect(formatScoreDate(undefined)).toBe("–");
  });

  it("returns original string for invalid dates", () => {
    expect(formatScoreDate("not-a-date")).toBe("not-a-date");
  });
});
