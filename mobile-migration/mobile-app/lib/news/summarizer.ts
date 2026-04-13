/**
 * AI News Summarizer — adapts news content to user expertise level.
 *
 * Provides rule-based fallback summaries (instant, zero API cost)
 * and truncation for Normal-mode users.
 */

import type { NewsItem } from "@/services/news/types";
import type { ExpertiseLevel } from "@/src/store/userPrefsStore";

export interface SummaryOptions {
  expertiseLevel: ExpertiseLevel;
  language: "en" | "ar";
  maxLength?: number;
}

/**
 * Generate a user-facing summary adapted to expertise level and language.
 * Falls back to rule-based templates, then to truncated title.
 */
export function generateSummary(news: NewsItem, options: SummaryOptions): string {
  const { expertiseLevel, language, maxLength = 120 } = options;

  // FALLBACK 1: Rule-based summaries (instant, zero API cost)
  const ruleBased = getRuleBasedSummary(news, language);
  if (ruleBased) return ruleBased;

  // FALLBACK 2: If no summary at all, show title + source
  if (!news.summary && !ruleBased) {
    return `📰 ${news.title} (${news.source})`;
  }

  // Truncate for Normal mode if too long
  if (expertiseLevel === "normal" && news.summary.length > maxLength) {
    return news.summary.slice(0, maxLength).trim() + "...";
  }

  return news.summary || news.title;
}

function getRuleBasedSummary(news: NewsItem, lang: "en" | "ar"): string | null {
  const sym = news.relatedSymbols[0] || "Company";
  const dict =
    lang === "ar"
      ? {
          dividend: `💰 ${sym} أعلنت عن توزيعات أرباح`,
          earnings: `📊 ${sym} أعلنت نتائجها المالية`,
          regulatory: `📋 تحديث تنظيمي جديد يؤثر على ${sym}`,
        }
      : {
          dividend: `💰 ${sym} announced dividend payout`,
          earnings: `📊 ${sym} released financial results`,
          regulatory: `📋 Regulatory update affecting ${sym}`,
        };

  if (news.category === "dividend" && news.sentiment === "positive") return dict.dividend;
  if (news.category === "earnings") return dict.earnings;
  if (news.category === "regulatory") return dict.regulatory;
  return null;
}

/** Backward-compatible wrapper used by NewsCard & notifications */
export function summarizeForUser(news: NewsItem, expertiseLevel: ExpertiseLevel): string {
  return generateSummary(news, {
    expertiseLevel,
    language: news.language ?? "en",
  });
}

/** Impact color helper */
export function getImpactColor(impact: NewsItem["impact"]): string {
  switch (impact) {
    case "high":
      return "#ef4444";
    case "medium":
      return "#f59e0b";
    case "low":
      return "#10b981";
    default:
      return "#6b7280";
  }
}

/** Impact badge config for rendering */
export function getNewsImpactBadge(impact: NewsItem["impact"]) {
  switch (impact) {
    case "high":
      return { label: "High Impact", color: "#ef4444", icon: "exclamation-circle" as const };
    case "medium":
      return { label: "Medium", color: "#f59e0b", icon: "info-circle" as const };
    case "low":
      return { label: "Low Impact", color: "#10b981", icon: "check-circle" as const };
    default:
      return { label: "Info", color: "#6b7280", icon: "newspaper-o" as const };
  }
}

/** Sentiment color helper */
export function sentimentColor(sentiment: NewsItem["sentiment"]): string {
  switch (sentiment) {
    case "positive":
      return "#10b981";
    case "negative":
      return "#ef4444";
    case "mixed":
      return "#f59e0b";
    default:
      return "#6b7280";
  }
}

/** Source display label */
export function sourceLabel(source: NewsItem["source"]): string {
  const labels: Record<string, string> = {
    boursa_kuwait: "Boursa Kuwait",
    kuna: "KUNA",
    alrai: "Al-Rai",
    bloomberg_asharq: "Bloomberg Asharq",
    reuters: "Reuters",
    ai_insight: "AI Insight",
  };
  return labels[source] ?? source;
}
