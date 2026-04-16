/**
 * useAdminGate — server-verified admin check.
 *
 * Calls GET /api/v1/auth/me and verifies `is_admin === true`.
 * Prevents client-only isAdmin spoofing from granting access.
 */

import { API_BASE_URL } from "@/constants/Config";
import { useAuthStore } from "@/services/authStore";
import { useQuery } from "@tanstack/react-query";
import { getToken } from "@/services/tokenStorage";

export function useAdminGate() {
  const clientIsAdmin = useAuthStore((s) => s.isAdmin);

  const { data: serverIsAdmin, isLoading } = useQuery({
    queryKey: ["admin-gate"],
    queryFn: async () => {
      const token = await getToken();
      if (!token) return false;
      const res = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) return false;
      const json = await res.json();
      const me = json.data ?? json;
      return me.is_admin === true;
    },
    enabled: clientIsAdmin,
    staleTime: 5 * 60 * 1000,
    retry: 1,
  });

  return {
    isAdmin: clientIsAdmin && serverIsAdmin === true,
    isLoading: clientIsAdmin && isLoading,
  };
}
