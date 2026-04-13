/**
 * News & Market Data — Shared types.
 */

export type NewsSource =
  | "boursa_kuwait"
  | "kuna"
  | "alrai"
  | "bloomberg_asharq"
  | "reuters"
  | "ai_insight";

export type NewsCategory =
  | "company_announcement"
  | "financial"
  | "market_news"
  | "regulatory"
  | "earnings"
  | "dividend";

export interface NewsItem {
  id: string;
  title: string;
  summary: string;
  fullContent?: string;
  source: NewsSource;
  category: NewsCategory;
  publishedAt: string;
  url?: string;
  relatedSymbols: string[];
  sentiment: "positive" | "neutral" | "negative" | "mixed";
  impact: "high" | "medium" | "low" | "informational";
  language: "en" | "ar";
  isVerified: boolean;
  attachments?: Array<{ type: "pdf" | "image" | "link"; url: string }>;
}

export interface NewsFeedResponse {
  items: NewsItem[];
  nextPageCursor?: string;
  totalAvailable: number;
  updatedAt: string;
}

export interface NewsHistoryResponse {
  items: NewsItem[];
  page: number;
  totalPages: number;
  totalItems: number;
  updatedAt: string;
}
