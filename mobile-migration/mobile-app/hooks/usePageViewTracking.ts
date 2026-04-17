import { usePathname } from "expo-router";
import { useEffect, useRef } from "react";

import { trackPageView } from "@/lib/gtag";

/**
 * Sends a GA4 page_view on every expo-router path change (web only).
 * Drop into the root layout — fires once per navigation.
 */
export function usePageViewTracking(): void {
  const pathname = usePathname();
  const prevPath = useRef<string | null>(null);

  useEffect(() => {
    if (pathname && pathname !== prevPath.current) {
      prevPath.current = pathname;
      trackPageView(pathname);
    }
  }, [pathname]);
}
