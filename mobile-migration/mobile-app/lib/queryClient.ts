/**
 * React Query client — shared singleton with MMKV offline persistence.
 *
 * Default options:
 *  - staleTime: 30s (data stays "fresh" for 30s before background refetch)
 *  - gcTime: 24h  (keep unused cache entries for offline resilience)
 *  - retry: skip 401s (auth errors redirect to login, not retry)
 *  - refetchOnWindowFocus: true (web) / ignored (native)
 *
 * Persistence: MMKV on native, localStorage on web — queries survive
 * app restarts so screens render immediately while background refetches.
 */

import { QueryClient } from "@tanstack/react-query";
import { createSyncStoragePersister } from "@tanstack/query-sync-storage-persister";
import { persistQueryClient } from "@tanstack/react-query-persist-client";
import { AxiosError } from "axios";
import { Platform } from "react-native";

// ── MMKV storage (native) or localStorage (web) ─────────────────────

function createStorage() {
  if (Platform.OS === "web") {
    // Web: use localStorage directly (guard for SSR where it doesn't exist)
    const hasLocalStorage = typeof localStorage !== "undefined";
    return {
      getItem: (key: string) =>
        hasLocalStorage ? localStorage.getItem(key) ?? undefined : undefined,
      setItem: (key: string, value: string) => {
        if (hasLocalStorage) localStorage.setItem(key, value);
      },
      removeItem: (key: string) => {
        if (hasLocalStorage) localStorage.removeItem(key);
      },
    };
  }

  // Native: use MMKV for fast synchronous storage
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { MMKV } = require("react-native-mmkv");
  const mmkv = new MMKV({ id: "react-query" });
  return {
    getItem: (key: string) => mmkv.getString(key) ?? undefined,
    setItem: (key: string, value: string) => mmkv.set(key, value),
    removeItem: (key: string) => mmkv.delete(key),
  };
}

// ── Query client ────────────────────────────────────────────────────

const ONE_DAY_MS = 1000 * 60 * 60 * 24;

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: ONE_DAY_MS,
      retry: (failureCount, error) => {
        // Never retry 401 — the interceptor handles refresh/logout
        if ((error as AxiosError)?.response?.status === 401) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: true,
    },
  },
});

// ── Persist cache to storage ────────────────────────────────────────

const persister = createSyncStoragePersister({ storage: createStorage() });
persistQueryClient({ queryClient, persister, maxAge: ONE_DAY_MS });
