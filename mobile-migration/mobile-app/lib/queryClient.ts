/**
 * React Query client — shared singleton.
 *
 * Default options:
 *  - staleTime: 30s (data stays "fresh" for 30s before background refetch)
 *  - retry: 1 (one automatic retry on failure)
 *  - refetchOnWindowFocus: true (web) / ignored (native)
 */

import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      retry: 1,
      refetchOnWindowFocus: true,
    },
  },
});
