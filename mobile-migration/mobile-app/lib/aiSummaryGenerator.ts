/**
 * AI Summary Generator — produces beginner-friendly or technical
 * stock summaries from score data and user preferences.
 */

import type { UserPreferences } from "@/src/store/userPrefsStore";

// ── Types ────────────────────────────────────────────────────────────

export interface ScoreInput {
  fundamental: number | null;
  valuation: number | null;
  growth: number | null;
  quality: number | null;
  risk: number | null;
}

export interface AISummary {
  headline: string;
  emoji: string;
  bullets: string[];
  actionHint?: string;
  riskLevel: "low" | "medium" | "high";
}

// ── Generator ────────────────────────────────────────────────────────

export function generateStockSummary(
  stockName: string,
  currentPrice: number,
  fairValue: number | null,
  score: ScoreInput | null,
  prefs: UserPreferences,
): AISummary {
  const isBeginner = prefs.expertiseLevel === "normal";

  // Calculate upside/downside
  const upside =
    fairValue != null && currentPrice > 0
      ? ((fairValue - currentPrice) / currentPrice) * 100
      : null;

  // Determine recommendation
  let headline: string;
  let emoji: string;
  let actionHint: string | undefined;

  if (upside !== null && upside > 15) {
    headline = isBeginner
      ? `Good time to consider buying ${stockName}`
      : `${stockName} appears undervalued (+${upside.toFixed(1)}% upside)`;
    emoji = "\u{1F7E2}"; // 🟢
    actionHint = isBeginner ? "Consider adding to watchlist" : undefined;
  } else if (upside !== null && upside < -15) {
    headline = isBeginner
      ? `${stockName} may be overpriced right now`
      : `${stockName} appears overvalued (${upside.toFixed(1)}% downside)`;
    emoji = "\u{1F534}"; // 🔴
    actionHint = isBeginner ? "Wait for better entry point" : undefined;
  } else {
    headline = isBeginner
      ? `${stockName} is fairly priced`
      : `${stockName} trading near fair value`;
    emoji = "\u{1F7E1}"; // 🟡
  }

  // Generate bullets based on expertise
  const bullets: string[] = [];

  if (isBeginner) {
    if (score?.fundamental != null && score.fundamental > 70) {
      bullets.push("Company financials look healthy");
    }
    if (score?.growth != null && score.growth > 70) {
      bullets.push("Profits have been growing");
    }
    if (score?.risk != null && score.risk < 40) {
      bullets.push("Lower risk compared to similar stocks");
    }
    if (score?.quality != null && score.quality > 70) {
      bullets.push("Good management quality");
    }
    if (bullets.length === 0) {
      bullets.push("Mixed signals \u2014 do more research before buying");
    }
  } else {
    // Technical bullets for intermediate/advanced
    if (score) {
      if (score.fundamental != null) {
        if (score.fundamental >= 80) bullets.push(`Strong fundamentals (${score.fundamental.toFixed(0)}/100)`);
        else if (score.fundamental <= 40) bullets.push(`Weak fundamentals (${score.fundamental.toFixed(0)}/100)`);
      }
      if (score.valuation != null) {
        if (score.valuation >= 80) bullets.push(`Attractive valuation (${score.valuation.toFixed(0)}/100)`);
        else if (score.valuation <= 40) bullets.push(`Expensive valuation (${score.valuation.toFixed(0)}/100)`);
      }
      if (score.growth != null) {
        if (score.growth >= 80) bullets.push(`Strong growth trajectory (${score.growth.toFixed(0)}/100)`);
        else if (score.growth <= 40) bullets.push(`Weak growth (${score.growth.toFixed(0)}/100)`);
      }
      if (score.quality != null) {
        if (score.quality >= 80) bullets.push(`High quality score (${score.quality.toFixed(0)}/100)`);
        else if (score.quality <= 40) bullets.push(`Low quality score (${score.quality.toFixed(0)}/100)`);
      }
      if (score.risk != null) {
        if (score.risk <= 30) bullets.push(`Low risk profile (${score.risk.toFixed(0)}/100)`);
        else if (score.risk >= 70) bullets.push(`High risk profile (${score.risk.toFixed(0)}/100)`);
      }
    }
    if (bullets.length === 0) {
      bullets.push("Scores are in the moderate range across all categories");
    }
  }

  // Determine risk level
  const riskLevel: AISummary["riskLevel"] =
    score?.risk != null && score.risk >= 70
      ? "high"
      : score?.risk != null && score.risk <= 30
        ? "low"
        : "medium";

  return { headline, emoji, bullets, actionHint, riskLevel };
}

// ── Plain-text formatter (for PDF export) ────────────────────────────

export function formatSummaryAsText(summary: AISummary): string {
  const lines: string[] = [];
  lines.push(`${summary.emoji} ${summary.headline}`);
  for (const b of summary.bullets) {
    lines.push(`  \u2022 ${b}`);
  }
  if (summary.actionHint) {
    lines.push(`  \u27A4 ${summary.actionHint}`);
  }
  lines.push(`  Risk: ${summary.riskLevel.toUpperCase()}`);
  return lines.join("\n");
}
