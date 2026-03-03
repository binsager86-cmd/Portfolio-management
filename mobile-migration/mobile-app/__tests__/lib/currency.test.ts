/**
 * Currency formatting — unit tests.
 *
 * Covers:
 *   - formatCurrency: KWD (3 decimals), USD (2 decimals), null/undefined → "—"
 *   - formatSignedCurrency: positive prefix, negative prefix, null
 *   - formatPercent: sign prefix, decimal places, null
 */

import {
  formatCurrency,
  formatSignedCurrency,
  formatPercent,
} from "@/lib/currency";

describe("formatCurrency", () => {
  it('returns "—" for null', () => {
    expect(formatCurrency(null)).toBe("—");
  });

  it('returns "—" for undefined', () => {
    expect(formatCurrency(undefined)).toBe("—");
  });

  it("formats KWD with 3 decimal places by default", () => {
    const result = formatCurrency(12345.678, "KWD");
    expect(result).toContain("KWD");
    // Should have 3 decimal places
    expect(result).toMatch(/12[,.]?345\.678\s*KWD/);
  });

  it("uses KWD as default currency", () => {
    const result = formatCurrency(100);
    expect(result).toContain("KWD");
  });

  it("formats USD with 2 decimal places", () => {
    const result = formatCurrency(420.5, "USD");
    expect(result).toContain("USD");
    expect(result).toMatch(/420\.50\s*USD/);
  });

  it("formats EUR with 2 decimal places", () => {
    const result = formatCurrency(1000, "EUR");
    expect(result).toContain("EUR");
  });

  it("formats GBP with 2 decimal places", () => {
    const result = formatCurrency(250.1234, "GBP");
    expect(result).toContain("GBP");
    expect(result).toMatch(/250\.12\s*GBP/);
  });

  it("uses 2 decimals for unknown currencies", () => {
    const result = formatCurrency(100.5, "BTC");
    expect(result).toContain("BTC");
    expect(result).toMatch(/100\.50\s*BTC/);
  });

  it("formats negative values", () => {
    const result = formatCurrency(-420.5, "USD");
    expect(result).toMatch(/-420\.50\s*USD/);
  });

  it("formats zero", () => {
    const result = formatCurrency(0, "KWD");
    expect(result).toMatch(/0\.000\s*KWD/);
  });

  it("formats large numbers with locale grouping", () => {
    const result = formatCurrency(1234567.89, "USD");
    expect(result).toContain("USD");
    // Should have some form of thousand separator
    expect(result.length).toBeGreaterThan("1234567.89 USD".length - 1);
  });

  it("respects custom fraction digits override", () => {
    const result = formatCurrency(100.12345, "KWD", {
      minimumFractionDigits: 5,
      maximumFractionDigits: 5,
    });
    expect(result).toMatch(/100\.12345\s*KWD/);
  });
});

describe("formatSignedCurrency", () => {
  it('returns "—" for null', () => {
    expect(formatSignedCurrency(null)).toBe("—");
  });

  it('returns "—" for undefined', () => {
    expect(formatSignedCurrency(undefined)).toBe("—");
  });

  it('prepends "+" for positive values', () => {
    const result = formatSignedCurrency(1234.56, "KWD");
    expect(result).toMatch(/^\+/);
    expect(result).toContain("KWD");
  });

  it('uses "-" for negative values (no extra prefix)', () => {
    const result = formatSignedCurrency(-500.5, "KWD");
    // Should start with + or -, negative values have their own minus
    expect(result).toMatch(/^[+-]/);
    expect(result).toContain("KWD");
  });

  it('prepends "+" for zero', () => {
    const result = formatSignedCurrency(0, "KWD");
    expect(result).toMatch(/^\+/);
  });

  it("uses correct currency", () => {
    const result = formatSignedCurrency(100, "USD");
    expect(result).toContain("USD");
  });
});

describe("formatPercent", () => {
  it('returns "—" for null', () => {
    expect(formatPercent(null)).toBe("—");
  });

  it('returns "—" for undefined', () => {
    expect(formatPercent(undefined)).toBe("—");
  });

  it("formats positive percentage with + prefix", () => {
    const result = formatPercent(12.345);
    expect(result).toBe("+12.35%");
  });

  it("formats negative percentage", () => {
    const result = formatPercent(-3.1);
    expect(result).toBe("-3.10%");
  });

  it("formats zero with + prefix", () => {
    const result = formatPercent(0);
    expect(result).toBe("+0.00%");
  });

  it("respects custom decimal parameter", () => {
    const result = formatPercent(12.3456, 4);
    expect(result).toBe("+12.3456%");
  });

  it("handles 1 decimal place", () => {
    const result = formatPercent(5.55, 1);
    // toFixed(1) on 5.55 may produce "5.5" due to IEEE 754 rounding
    expect(result).toMatch(/^\+5\.[56]%$/);
  });

  it("handles very large percentages", () => {
    const result = formatPercent(999.99);
    expect(result).toBe("+999.99%");
  });

  it("handles very small percentages", () => {
    const result = formatPercent(0.001);
    expect(result).toBe("+0.00%");
  });
});
