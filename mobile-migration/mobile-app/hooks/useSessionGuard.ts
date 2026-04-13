/**
 * Session guard — keeps the auth session alive and auto-logs out
 * when the backend becomes unreachable or the token expires.
 *
 * Three mechanisms:
 *   1. **Periodic heartbeat** — pings /auth/me every HEARTBEAT_MS while
 *      the user is logged in.  If the token is stale and refresh fails,
 *      calls logout().
 *   2. **Visibility / focus listener** — re-validates the token whenever
 *      the browser tab regains focus or the mobile app returns to the
 *      foreground.
 *   3. **Client-side expiry check** — on each heartbeat, checks the
 *      token payload locally so we can log out even if the network is
 *      completely down.
 */

import { useEffect, useRef } from "react";
import { AppState, AppStateStatus, Platform } from "react-native";

import { API_BASE_URL } from "@/constants/Config";
import { useAuthStore } from "@/services/authStore";
import {
    getRefreshToken,
    getToken,
    isTokenExpired,
    removeRefreshToken,
    removeToken,
    setRefreshToken,
    setToken,
} from "@/services/tokenStorage";

/** How often to ping the backend while the user is logged in (ms). */
const HEARTBEAT_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Try to validate the current session.  Returns `true` if the session
 * is still valid, `false` if the user should be logged out.
 */
async function validateSession(): Promise<boolean> {
  const token = await getToken();

  // ── 1. Client-side expiry check (no network needed) ────────────
  if (isTokenExpired(token, 0)) {
    // Token is expired — try refresh
    const refreshTok = await getRefreshToken();
    if (!refreshTok) return false;

    try {
      const resp = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: refreshTok }),
      });
      if (!resp.ok) return false;
      const data = await resp.json();
      await setToken(data.access_token);
      if (data.refresh_token) await setRefreshToken(data.refresh_token);
      return true;
    } catch {
      // Network error during refresh — can't confirm session
      return false;
    }
  }

  // ── 2. Server-side validation (confirm backend is alive) ───────
  try {
    const resp = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (resp.ok) return true;

    // 401 — token rejected by server, try refresh
    if (resp.status === 401) {
      const refreshTok = await getRefreshToken();
      if (!refreshTok) return false;
      try {
        const refreshResp = await fetch(
          `${API_BASE_URL}/api/v1/auth/refresh`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ refresh_token: refreshTok }),
          },
        );
        if (!refreshResp.ok) return false;
        const data = await refreshResp.json();
        await setToken(data.access_token);
        if (data.refresh_token) await setRefreshToken(data.refresh_token);
        return true;
      } catch {
        return false;
      }
    }

    // Other error codes (500, 503, etc.) — don't log out on transient
    // server errors, give the backend time to recover
    return true;
  } catch {
    // Network error (backend completely down).
    // Check if token is still locally valid — if so, don't force
    // logout yet (backend may be restarting). If expired, force logout.
    return !isTokenExpired(token, 0);
  }
}

/**
 * Hook: call once in the root layout to enable session guarding.
 * Automatically cleans up on unmount.
 */
export function useSessionGuard() {
  const token = useAuthStore((s) => s.token);
  const logout = useAuthStore((s) => s.logout);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!token) return; // not logged in — nothing to guard

    // ── Heartbeat timer ─────────────────────────────────────────
    async function heartbeat() {
      const valid = await validateSession();
      if (!valid) {
        if (__DEV__) console.log("[SessionGuard] Session invalid — logging out");
        await removeToken();
        await removeRefreshToken();
        logout();
      }
    }

    intervalRef.current = setInterval(heartbeat, HEARTBEAT_MS);

    // ── Visibility / focus listeners ────────────────────────────
    let removeVisibility: (() => void) | null = null;

    if (Platform.OS === "web" && typeof document !== "undefined") {
      // Web: visibilitychange fires when user switches tabs or minimises
      const onVisibility = () => {
        if (document.visibilityState === "visible") {
          heartbeat();
        }
      };
      document.addEventListener("visibilitychange", onVisibility);
      removeVisibility = () =>
        document.removeEventListener("visibilitychange", onVisibility);
    } else {
      // Native: AppState fires when app returns to foreground
      const subscription = AppState.addEventListener(
        "change",
        (state: AppStateStatus) => {
          if (state === "active") {
            heartbeat();
          }
        },
      );
      removeVisibility = () => subscription.remove();
    }

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      removeVisibility?.();
    };
  }, [token, logout]);
}
