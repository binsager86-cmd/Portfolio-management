/**
 * Market API service — fetches Boursa Kuwait market summary from backend.
 */

import { API_BASE_URL } from "@/constants/Config";
import { getToken } from "@/services/tokenStorage";

const MARKET_API = `${API_BASE_URL}/api/v1/market`;

async function authHeaders(): Promise<Record<string, string>> {
  const token = await getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export interface MarketIndex {
  name: string;
  value: number | null;
  change: number | null;
  changePercent: number | null;
}

export interface MarketMover {
  symbol: string;
  last: number | null;
  change: number | null;
  changePercent: number | null;
  volume: number | null;
}

export interface SectorIndex {
  name: string;
  changePercent: number | null;
  last: number | null;
}

export interface MarketSummary {
  volume: number | null;
  value_traded: number | null;
  trades: number | null;
  market_cap: number | null;
  gainers: number;
  losers: number;
  neutral: number;
  stock_gainers: number;
  stock_losers: number;
}

export interface PerMarketSummary {
  volume: number | null;
  value_traded: number | null;
  trades: number | null;
  market_cap?: number | null;
}

export interface MarketData {
  indices: MarketIndex[];
  market_summary: MarketSummary;
  premier_summary: PerMarketSummary;
  main_summary: PerMarketSummary;
  top_gainers: MarketMover[];
  top_losers: MarketMover[];
  top_value: MarketMover[];
  sectors: SectorIndex[];
  date: string | null;
  status: string | null;
  _cached: boolean;
  _fetched_at: number;
  _trade_date?: string;
  _stale?: boolean;
}

export const marketApi = {
  async getSummary(): Promise<MarketData> {
    const headers = await authHeaders();
    const res = await fetch(`${MARKET_API}/summary`, { headers });
    if (!res.ok) throw new Error(`Market API error: ${res.status}`);
    const json = await res.json();
    return json.data;
  },

  async refresh(): Promise<MarketData> {
    const headers = await authHeaders();
    const res = await fetch(`${MARKET_API}/refresh`, { headers });
    if (!res.ok) throw new Error(`Market refresh error: ${res.status}`);
    const json = await res.json();
    return json.data;
  },
};
