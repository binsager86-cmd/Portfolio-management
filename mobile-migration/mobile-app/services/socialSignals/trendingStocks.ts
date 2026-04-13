/**
 * Social Signal Service — anonymized trending stocks aggregation.
 *
 * Provides:
 *  - Trending stocks based on community activity (buy/sell/watch)
 *  - Anonymized — no user-level data exposed
 *  - Consent-based opt-in
 *
 * Backend endpoints (deferred):
 *  - GET  /api/v1/signals/trending  → TrendingStock[]
 *  - POST /api/v1/signals/opt-in    → { status: "opted_in" }
 *  - POST /api/v1/signals/opt-out   → { status: "opted_out" }
 */

import { Platform } from "react-native";

// ── Types ───────────────────────────────────────────────────────────

export type SignalDirection = "bullish" | "bearish" | "neutral";

export interface TrendingStock {
  /** Stock symbol */
  symbol: string;
  /** Company name */
  company: string;
  /** Number of users watching/trading (anonymized count bucket) */
  activityLevel: "low" | "medium" | "high" | "very_high";
  /** Aggregate sentiment direction */
  direction: SignalDirection;
  /** Percentage of watchers who are bullish */
  bullishPct: number;
  /** Number of unique watchers (rounded to nearest 10 for anonymization) */
  watcherCount: number;
  /** 24h price change percent */
  priceChangePct: number;
  /** Trending rank (1 = most trending) */
  rank: number;
}

export interface SocialSignalPrefs {
  /** User has opted in to contribute anonymized data */
  optedIn: boolean;
  /** Show trending panel on overview */
  showTrending: boolean;
}

// ── Storage ──────────────────────────────────────────────────────────

const STORAGE_KEY = "social_signal_prefs";

const DEFAULT_PREFS: SocialSignalPrefs = {
  optedIn: false,
  showTrending: true,
};

export async function loadSignalPrefs(): Promise<SocialSignalPrefs> {
  try {
    let raw: string | null = null;
    if (Platform.OS === "web") {
      raw = localStorage.getItem(STORAGE_KEY);
    } else {
      const SecureStore = await import("expo-secure-store");
      raw = await SecureStore.getItemAsync(STORAGE_KEY);
    }
    if (raw) return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
  } catch {
    /* ignore */
  }
  return DEFAULT_PREFS;
}

export async function saveSignalPrefs(prefs: SocialSignalPrefs): Promise<void> {
  try {
    const raw = JSON.stringify(prefs);
    if (Platform.OS === "web") {
      localStorage.setItem(STORAGE_KEY, raw);
    } else {
      const SecureStore = await import("expo-secure-store");
      await SecureStore.setItemAsync(STORAGE_KEY, raw);
    }
  } catch {
    /* ignore */
  }
}

// ── Mock data (until backend endpoint is available) ─────────────────

export function getMockTrendingStocks(): TrendingStock[] {
  return [
    {
      symbol: "NBK",
      company: "National Bank of Kuwait",
      activityLevel: "very_high",
      direction: "bullish",
      bullishPct: 78,
      watcherCount: 340,
      priceChangePct: 2.3,
      rank: 1,
    },
    {
      symbol: "ZAIN",
      company: "Zain Telecom",
      activityLevel: "high",
      direction: "bullish",
      bullishPct: 65,
      watcherCount: 210,
      priceChangePct: 1.1,
      rank: 2,
    },
    {
      symbol: "KFH",
      company: "Kuwait Finance House",
      activityLevel: "high",
      direction: "neutral",
      bullishPct: 52,
      watcherCount: 190,
      priceChangePct: -0.4,
      rank: 3,
    },
    {
      symbol: "AGILITY",
      company: "Agility Public Warehousing",
      activityLevel: "medium",
      direction: "bearish",
      bullishPct: 35,
      watcherCount: 120,
      priceChangePct: -1.8,
      rank: 4,
    },
    {
      symbol: "STC",
      company: "Kuwait Telecom (STC)",
      activityLevel: "medium",
      direction: "bullish",
      bullishPct: 71,
      watcherCount: 90,
      priceChangePct: 0.8,
      rank: 5,
    },
  ];
}

// ── Helpers ──────────────────────────────────────────────────────────

export function directionEmoji(direction: SignalDirection): string {
  switch (direction) {
    case "bullish":
      return "🟢";
    case "bearish":
      return "🔴";
    case "neutral":
      return "⚪";
  }
}

export function activityEmoji(level: TrendingStock["activityLevel"]): string {
  switch (level) {
    case "very_high":
      return "🔥";
    case "high":
      return "📈";
    case "medium":
      return "📊";
    case "low":
      return "📉";
  }
}
