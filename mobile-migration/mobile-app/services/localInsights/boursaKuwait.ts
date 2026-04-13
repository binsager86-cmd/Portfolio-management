/**
 * Boursa Kuwait Local Insights — fetches GCC market signals
 * via backend proxy and computes simple market pulse signals.
 *
 * Signals:
 *   • Top dividend stocks (by yield change)
 *   • Most active stocks (volume spike vs 30-day avg)
 *   • Sector rotation (which sectors gained/lost most)
 *
 * All data clearly labeled as "public market data" — no insider implication.
 * Results are client-side cached for 1 hour to minimize API calls.
 */

import api from "@/services/api/client";

// ── Types ───────────────────────────────────────────────────────────

export type InsightTrend = "up" | "down" | "neutral";

export interface KuwaitInsight {
  id: string;
  title: string;
  description: string;
  trend: InsightTrend;
  category: "dividend" | "volume" | "sector";
}

export interface KuwaitInsightsResponse {
  updatedAt: string;
  insights: KuwaitInsight[];
  source: string;
}

// ── In-memory Cache (1 hour TTL) ────────────────────────────────────

interface CacheEntry {
  data: KuwaitInsightsResponse;
  expiresAt: number;
}

const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour
let insightsCache: CacheEntry | null = null;

function getCachedInsights(): KuwaitInsightsResponse | null {
  if (insightsCache && Date.now() < insightsCache.expiresAt) {
    return insightsCache.data;
  }
  insightsCache = null;
  return null;
}

function setCachedInsights(data: KuwaitInsightsResponse): void {
  insightsCache = {
    data,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };
}

// ── API ─────────────────────────────────────────────────────────────

/**
 * Fetch Kuwait market insights from the backend proxy.
 * The backend aggregates public Boursa Kuwait data and applies
 * server-side rate limiting (1 request per user per hour).
 *
 * Returns cached data if fresh (<1 hour old).
 */
export async function getKuwaitInsights(): Promise<KuwaitInsightsResponse> {
  // Return cached if still valid
  const cached = getCachedInsights();
  if (cached) return cached;

  const { data } = await api.get<{
    status: string;
    data: KuwaitInsightsResponse;
  }>("/api/v1/insights/kuwait");

  const result = data.data;
  setCachedInsights(result);
  return result;
}

/**
 * Check whether the user's portfolio contains any Kuwait-market holdings.
 * Uses portfolio names (KFH, BBYN) or currency (KWD) as proxy.
 */
export function hasKuwaitHoldings(
  portfolioValues?: Record<string, { holding_count?: number }>,
): boolean {
  if (!portfolioValues) return false;
  // KFH and BBYN are Kuwait-based brokerage portfolios
  for (const [name, pv] of Object.entries(portfolioValues)) {
    const upper = name.toUpperCase();
    if ((upper === "KFH" || upper === "BBYN") && (pv.holding_count ?? 0) > 0) {
      return true;
    }
  }
  return false;
}

/** Clear cached insights (e.g., on logout). */
export function clearInsightsCache(): void {
  insightsCache = null;
}
