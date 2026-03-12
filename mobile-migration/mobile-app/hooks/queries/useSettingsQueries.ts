/**
 * Settings / user query hooks — user info, API key, risk-free rate, AI status.
 */

import { useQuery } from "@tanstack/react-query";
import { getMe, getApiKey, getRfRate, getAIStatus } from "@/services/api";

// ── Query key constants ─────────────────────────────────────────────

export const settingsKeys = {
  me: () => ["me"] as const,
  apiKey: () => ["api-key"] as const,
  rfRate: () => ["rf-rate-setting"] as const,
  aiStatus: () => ["ai-status"] as const,
} as const;

// ── Hooks ───────────────────────────────────────────────────────────

/** Current user info. */
export function useMe() {
  return useQuery({
    queryKey: settingsKeys.me(),
    queryFn: getMe,
  });
}

/** User's saved API key (masked). */
export function useApiKey() {
  return useQuery({
    queryKey: settingsKeys.apiKey(),
    queryFn: getApiKey,
  });
}

/** Stored risk-free rate — static after first load. */
export function useRfRateSetting() {
  return useQuery({
    queryKey: settingsKeys.rfRate(),
    queryFn: getRfRate,
    staleTime: Infinity,
  });
}

/** AI service status. */
export function useAiStatus() {
  return useQuery({
    queryKey: settingsKeys.aiStatus(),
    queryFn: () => getAIStatus(),
  });
}
