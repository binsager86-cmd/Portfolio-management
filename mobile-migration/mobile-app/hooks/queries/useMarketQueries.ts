/**
 * React Query hooks for Market Data.
 */

import { marketApi, type MarketData } from "@/services/market/marketApi";
import { useQuery, useQueryClient } from "@tanstack/react-query";

export const MARKET_KEYS = {
  all: ["market"] as const,
  summary: () => [...MARKET_KEYS.all, "summary"] as const,
};

export function useMarketSummary(enabled = true) {
  return useQuery<MarketData>({
    queryKey: MARKET_KEYS.summary(),
    queryFn: () => marketApi.getSummary(),
    staleTime: 5 * 60_000,
    gcTime: 30 * 60_000,
    retry: 2,
    enabled,
  });
}

export function useMarketRefresh() {
  const queryClient = useQueryClient();
  return async () => {
    const data = await marketApi.refresh();
    queryClient.setQueryData(MARKET_KEYS.summary(), data);
    return data;
  };
}
