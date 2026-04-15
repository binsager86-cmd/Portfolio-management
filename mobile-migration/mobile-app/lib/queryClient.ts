/**
 * React Query client — shared singleton.
 *
 * Default options:
 *  - staleTime: 30s (data stays "fresh" for 30s before background refetch)
 *  - retry: skip 401s (auth errors redirect to login, not retry)
 *  - refetchOnWindowFocus: true (web) / ignored (native)
 */

import { QueryClient } from "@tanstack/react-query";
import { AxiosError } from "axios";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: (failureCount, error) => {
        // Never retry 401 — the interceptor handles refresh/logout
        if ((error as AxiosError)?.response?.status === 401) return false;
        return failureCount < 1;
      },
      refetchOnWindowFocus: true,
    },
  },
});
