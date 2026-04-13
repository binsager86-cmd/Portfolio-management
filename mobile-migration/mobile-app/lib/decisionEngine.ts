/**
 * Decision Engine — generates actionable buy/hold/sell insights
 * based on composite scores, valuation, and user preferences.
 */

import type { StockScoreSummary } from "@/services/api";
import type { UserPreferences } from "@/src/store/userPrefsStore";

export type Recommendation = "strong_buy" | "buy" | "hold" | "sell" | "strong_sell";

export interface DecisionInsight {
  recommendation: Recommendation;
  confidence: number; // 0–100
  headline: string;
  reasons: string[];
  actionSteps: string[];
  riskWarnings: string[];
  targetPrice?: number;
  timeHorizon: "short" | "medium" | "long";
}

export function generateDecisionInsight(
  stockSymbol: string,
  currentPrice: number,
  fairValue: number | null,
  score: StockScoreSummary | null,
  hasPosition: boolean,
  prefs: UserPreferences,
): DecisionInsight {
  const isBeginner = prefs.expertiseLevel === "normal";

  // ── Upside calc ─────────────────────────────────────────────
  const upside =
    fairValue && currentPrice > 0
      ? ((fairValue - currentPrice) / currentPrice) * 100
      : 0;

  // ── Composite score (weighted) ──────────────────────────────
  const compositeScore = score
    ? ((score.fundamental_score ?? 50) * 0.3 +
        (score.quality_score ?? 50) * 0.25 +
        (score.growth_score ?? 50) * 0.2 +
        (score.valuation_score ?? 50) * 0.15 +
        (100 - (score.risk_score ?? 50)) * 0.1)
    : 50;

  // ── Recommendation logic ────────────────────────────────────
  let recommendation: Recommendation;
  let confidence: number;

  if (compositeScore >= 75 && upside > 15) {
    recommendation = "strong_buy";
    confidence = Math.min(90, Math.round(compositeScore + 10));
  } else if (compositeScore >= 65 && upside > 5) {
    recommendation = "buy";
    confidence = Math.round(compositeScore);
  } else if (compositeScore < 35 && upside < -20) {
    recommendation = "strong_sell";
    confidence = Math.min(90, Math.round(100 - compositeScore));
  } else if (compositeScore < 45 || upside < -15) {
    recommendation = "sell";
    confidence = Math.max(60, Math.round(100 - compositeScore));
  } else {
    recommendation = "hold";
    confidence = 55;
  }

  // ── Reasons / actions / warnings ────────────────────────────
  const reasons: string[] = [];
  const actionSteps: string[] = [];
  const riskWarnings: string[] = [];

  if (isBeginner) {
    // Plain-language explanations
    if (score?.fundamental_score != null && score.fundamental_score > 70)
      reasons.push("Company financials look healthy");
    if (score?.quality_score != null && score.quality_score > 70)
      reasons.push("Business quality is high");
    if (score?.growth_score != null && score.growth_score > 65)
      reasons.push("Company is growing well");
    if (upside > 15)
      reasons.push(`Stock may be undervalued (potential ${upside.toFixed(0)}% gain)`);
    if (upside < -10)
      reasons.push(`Stock looks expensive compared to its fair value`);
    if (score?.risk_score != null && score.risk_score > 60)
      riskWarnings.push("Higher risk — only invest what you can afford to lose");
    if (reasons.length === 0)
      reasons.push("Mixed signals — no clear advantage either way");

    if (recommendation === "strong_buy" || recommendation === "buy") {
      actionSteps.push("Consider buying in small amounts over time");
      actionSteps.push("Set a price alert for a better entry point");
    } else if (recommendation === "hold") {
      actionSteps.push("Keep monitoring for changes");
      if (hasPosition) actionSteps.push("No rush to sell if you already own it");
    } else {
      actionSteps.push("Consider reducing your position gradually");
      actionSteps.push("Look at alternative investments");
    }
  } else {
    // Technical / advanced details
    if (score) {
      reasons.push(`Composite: ${compositeScore.toFixed(0)}/100 (F:${score.fundamental_score?.toFixed(0) ?? "–"} Q:${score.quality_score?.toFixed(0) ?? "–"} G:${score.growth_score?.toFixed(0) ?? "–"} V:${score.valuation_score?.toFixed(0) ?? "–"})`);
      reasons.push(`Valuation gap: ${upside > 0 ? "+" : ""}${upside.toFixed(1)}% vs intrinsic value`);
      if (score.valuation_score != null && score.valuation_score >= 80)
        reasons.push("Attractive multiples relative to sector");
      if (score.growth_score != null && score.growth_score >= 70)
        reasons.push("Strong revenue/earnings growth trajectory");
      if (score.risk_score != null && score.risk_score >= 60)
        riskWarnings.push(`Elevated risk score: ${score.risk_score.toFixed(0)}/100`);
      if (score.risk_penalty_pct != null && score.risk_penalty_pct > 5)
        riskWarnings.push(`Risk penalty: −${score.risk_penalty_pct.toFixed(1)}% applied`);
    }
    if (reasons.length === 0)
      reasons.push("Insufficient data for detailed analysis");

    if (recommendation === "strong_buy") {
      actionSteps.push("Target allocation: 5–8% of portfolio");
      actionSteps.push(
        `Entry zone: ${currentPrice.toFixed(3)} – ${(currentPrice * 0.95).toFixed(3)} KWD`,
      );
      if (fairValue)
        actionSteps.push(`Target price: ${fairValue.toFixed(3)} KWD`);
    } else if (recommendation === "buy") {
      actionSteps.push("Target allocation: 3–5% of portfolio");
      actionSteps.push("Scale in on pullbacks");
    } else if (recommendation === "hold") {
      actionSteps.push("Maintain current weighting");
      actionSteps.push("Re-evaluate on next earnings release");
    } else {
      actionSteps.push("Trim position on strength");
      actionSteps.push("Set stop-loss at key support levels");
    }
  }

  // ── Headline ───────────────────────────────────────────────
  const headlines: Record<Recommendation, string> = isBeginner
    ? {
        strong_buy: `Great opportunity to buy ${stockSymbol}`,
        buy: `Good time to consider ${stockSymbol}`,
        hold: `Keep ${stockSymbol} on your watchlist`,
        sell: `Think twice about ${stockSymbol}`,
        strong_sell: `Avoid ${stockSymbol} for now`,
      }
    : {
        strong_buy: `${stockSymbol}: Strong Buy`,
        buy: `${stockSymbol}: Buy`,
        hold: `${stockSymbol}: Hold`,
        sell: `${stockSymbol}: Reduce / Sell`,
        strong_sell: `${stockSymbol}: Strong Sell`,
      };

  const timeHorizon: DecisionInsight["timeHorizon"] =
    recommendation === "strong_buy" || recommendation === "buy"
      ? "medium"
      : recommendation === "hold"
        ? "long"
        : "short";

  return {
    recommendation,
    confidence,
    headline: headlines[recommendation],
    reasons,
    actionSteps,
    riskWarnings,
    targetPrice: fairValue ?? undefined,
    timeHorizon,
  };
}
