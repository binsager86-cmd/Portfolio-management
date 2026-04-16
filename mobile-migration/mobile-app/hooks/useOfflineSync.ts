import { useEffect, useRef, useState } from "react";
import NetInfo from "@react-native-community/netinfo";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Monitors network connectivity and syncs TanStack Query state.
 *
 * - On disconnect: marks all active queries as stale for offline cache use.
 * - On reconnect: invalidates stale queries so fresh data is fetched.
 *
 * Returns `true` when the device has no network connection.
 */
export const useOfflineSync = () => {
  const [isOffline, setIsOffline] = useState(false);
  const wasOfflineRef = useRef(false);
  const queryClient = useQueryClient();

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener((state) => {
      const offline = !state.isConnected;
      setIsOffline(offline);

      if (offline && !wasOfflineRef.current) {
        // Going offline — mark queries stale so cached data is served
        queryClient.invalidateQueries({ refetchType: "none" });
      } else if (!offline && wasOfflineRef.current) {
        // Coming back online — refetch stale data
        queryClient.invalidateQueries({ stale: true });
      }

      wasOfflineRef.current = offline;
    });
    return unsubscribe;
  }, [queryClient]);

  return isOffline;
};
