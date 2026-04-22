/**
 * Auth store (Zustand) — manages JWT access + refresh tokens.
 *
 * Features:
 *   - Auto-login after registration (stores tokens immediately)
 *   - Google Sign-In support via backend token exchange
 *   - Structured error handling via authErrors.ts
 *   - Works on Web (localStorage) and Native (expo-secure-store)
 */

import { API_BASE_URL } from "@/constants/Config";
import type { LoginResponse } from "@/services/api/types";
import {
    logAuthError,
    mapAuthError,
    type AuthError,
} from "@/services/authErrors";
import {
    getRefreshToken,
    getToken,
    isTokenExpired,
    removeRefreshToken,
    removeToken,
    setRefreshToken,
    setToken,
} from "@/services/tokenStorage";
import { create } from "zustand";

// ── State shape ─────────────────────────────────────────────────────

interface AuthState {
  /** JWT access token (null = not logged in). */
  token: string | null;
  /** JWT refresh token (null = not logged in). */
  refreshToken: string | null;
  /** Seconds until the access token expires. */
  expiresIn: number | null;
  /** User info returned on login. */
  userId: number | null;
  username: string | null;
  name: string | null;
  /** Whether the user has admin privileges. */
  isAdmin: boolean;
  /** True while any auth operation is in progress. */
  isLoading: boolean;
  /** User-facing error message (null = no error). */
  error: string | null;
  /** Structured error for analytics/Sentry (null = no error). */
  lastAuthError: AuthError | null;
  /** True while a token refresh is in-flight. */
  isRefreshing: boolean;
  /** Consecutive refresh attempt counter (circuit breaker). */
  refreshAttemptCount: number;
  /** Refresh attempt counter used by api/client.ts circuit breaker. */
  refreshAttempts: number;

  /** Update refresh state (used by api/client.ts interceptor). */
  setRefreshState: (isRefreshing: boolean, attempts?: number) => void;

  /** Hydrate tokens from storage on app start. */
  hydrate: () => Promise<void>;
  /** Login with username + password. */
  login: (username: string, password: string) => Promise<boolean>;
  /** Register and auto-login (backend returns tokens). */
  register: (username: string, password: string, name?: string) => Promise<boolean>;
  /** Sign in via Google ID token (backend validates + creates/finds user). */
  googleSignIn: (idToken: string) => Promise<boolean>;
  /** Clear tokens and user data. */
  logout: () => Promise<void>;
  /** Clear the error state. */
  clearError: () => void;
}

// ── Helpers ─────────────────────────────────────────────────────────

/** Persist tokens and set user state from a LoginResponse. */
async function persistAndSetSession(
  res: LoginResponse,
  set: (partial: Partial<AuthState>) => void,
) {
  // DATA INTEGRITY: ensure required fields exist before persisting
  if (!res.access_token) {
    throw new Error("Server returned an empty access token.");
  }

  await setToken(res.access_token);
  if (res.refresh_token) {
    await setRefreshToken(res.refresh_token);
  }

  set({
    token: res.access_token,
    refreshToken: res.refresh_token ?? null,
    expiresIn: res.expires_in ?? null,
    userId: res.user_id ?? null,
    username: res.username ?? null,
    name: res.name ?? null,
    isAdmin: res.is_admin ?? false,
    isLoading: false,
    error: null,
    lastAuthError: null,
  });
}

async function authRequest(
  path: "/api/v1/auth/login" | "/api/v1/auth/register",
  payload: Record<string, unknown>,
): Promise<LoginResponse> {
  const resp = await fetch(`${API_BASE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  const json = await resp.json().catch(() => ({} as Record<string, unknown>));
  if (!resp.ok) {
    const message =
      (typeof json?.detail === "string" && json.detail) ||
      (typeof json?.message === "string" && json.message) ||
      `Auth request failed (${resp.status})`;
    throw new Error(message);
  }

  const data = (json as { data?: unknown })?.data ?? json;
  return data as LoginResponse;
}

// ── Store ───────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  refreshToken: null,
  expiresIn: null,
  userId: null,
  username: null,
  name: null,
  isAdmin: false,
  isLoading: true, // start true — wait for hydration before navigating
  error: null,
  lastAuthError: null,
  isRefreshing: false,
  refreshAttemptCount: 0,
  refreshAttempts: 0,

  clearError: () => set({ error: null, lastAuthError: null }),

  setRefreshState: (isRefreshing, attempts = 0) =>
    set({ isRefreshing, refreshAttempts: attempts }),

  // ── Hydrate ─────────────────────────────────────────────────────

  hydrate: async () => {
    set({ isLoading: true });
    try {
      const [stored, storedRefresh] = await Promise.all([
        getToken(),
        getRefreshToken(),
      ]);
      if (__DEV__) console.info("[hydrate] stored token:", stored ? `${stored.substring(0, 20)}...` : "null");
      if (stored) {
        // If the access token is expired, skip /me and go straight to refresh
        const tokenExpired = isTokenExpired(stored, 0);
        if (tokenExpired && storedRefresh) {
          if (__DEV__) console.info("[hydrate] Access token expired, skipping /me — refreshing directly");
        }

        if (!tokenExpired) {
        // Validate the stored token with a direct fetch to /me
        // (avoids circular dependency with api.ts)
        try {
          if (__DEV__) console.info("[hydrate] Validating token via", `${API_BASE_URL}/api/v1/auth/me`);
          const resp = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
            headers: { Authorization: `Bearer ${stored}` },
          });
          if (__DEV__) console.info("[hydrate] /me response status:", resp.status);
          if (!resp.ok) throw new Error(`Token invalid (${resp.status})`);
          const json = await resp.json();
          const me = json.data ?? json;
          if (__DEV__) console.info("[hydrate] Token valid, user:", me.username);
          set({
            token: stored,
            refreshToken: storedRefresh,
            userId: me.user_id,
            username: me.username,
            name: me.name ?? null,
            isAdmin: me.is_admin ?? false,
            isLoading: false,
          });
        } catch (err) {
          if (__DEV__) console.info("[hydrate] Access token invalid, attempting refresh:", err);

          // Access token expired — try silent refresh before logging out
          if (storedRefresh) {
            try {
              const refreshResp = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refresh_token: storedRefresh }),
              });
              if (!refreshResp.ok) throw new Error(`Refresh failed (${refreshResp.status})`, { cause: err });
              const refreshJson = await refreshResp.json();
              const newAccess: string = refreshJson.access_token;
              const newRefresh: string | undefined = refreshJson.refresh_token;

              // Persist new tokens
              await setToken(newAccess);
              if (newRefresh) await setRefreshToken(newRefresh);

              // Validate the new access token
              const meResp = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
                headers: { Authorization: `Bearer ${newAccess}` },
              });
              if (!meResp.ok) throw new Error(`New token invalid (${meResp.status})`, { cause: err });
              const meJson = await meResp.json();
              const me = meJson.data ?? meJson;
              if (__DEV__) console.info("[hydrate] Refresh succeeded, user:", me.username);
              set({
                token: newAccess,
                refreshToken: newRefresh ?? storedRefresh,
                userId: me.user_id,
                username: me.username,
                name: me.name ?? null,
                isAdmin: me.is_admin ?? false,
                isLoading: false,
              });
              return; // Success — don't fall through to logout
            } catch (refreshErr) {
              if (__DEV__) console.info("[hydrate] Refresh also failed:", refreshErr);
            }
          }

          // Both access and refresh tokens are invalid — force login
          await Promise.all([removeToken(), removeRefreshToken()]);
          set({
            token: null,
            refreshToken: null,
            userId: null,
            username: null,
            name: null,
            isLoading: false,
          });
        }
        } // end if (!tokenExpired)

        // ── Token was already expired — skip /me, go straight to refresh ──
        if (tokenExpired) {
          if (storedRefresh) {
            try {
              const refreshResp = await fetch(`${API_BASE_URL}/api/v1/auth/refresh`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ refresh_token: storedRefresh }),
              });
              if (!refreshResp.ok) throw new Error(`Refresh failed (${refreshResp.status})`);
              const refreshJson = await refreshResp.json();
              const newAccess: string = refreshJson.access_token;
              const newRefresh: string | undefined = refreshJson.refresh_token;
              await setToken(newAccess);
              if (newRefresh) await setRefreshToken(newRefresh);
              const meResp = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
                headers: { Authorization: `Bearer ${newAccess}` },
              });
              if (!meResp.ok) throw new Error(`New token invalid (${meResp.status})`);
              const meJson = await meResp.json();
              const me = meJson.data ?? meJson;
              if (__DEV__) console.info("[hydrate] Refresh succeeded (expired token path), user:", me.username);
              set({
                token: newAccess,
                refreshToken: newRefresh ?? storedRefresh,
                userId: me.user_id,
                username: me.username,
                name: me.name ?? null,
                isAdmin: me.is_admin ?? false,
                isLoading: false,
              });
              return;
            } catch (refreshErr) {
              if (__DEV__) console.info("[hydrate] Refresh failed (expired token path):", refreshErr);
            }
          }
          // Expired token + no refresh or refresh failed — force login
          await Promise.all([removeToken(), removeRefreshToken()]);
          set({
            token: null,
            refreshToken: null,
            userId: null,
            username: null,
            name: null,
            isLoading: false,
          });
        }
      } else {
        if (__DEV__) console.info("[hydrate] No stored token, showing login");
        set({ isLoading: false });
      }
    } catch {
      // Ignore storage errors — treat as logged out
      set({ isLoading: false });
    }
  },

  // ── Login ───────────────────────────────────────────────────────

  login: async (username: string, password: string) => {
    set({ isLoading: true, error: null, lastAuthError: null });
    try {
      const res: LoginResponse = await authRequest("/api/v1/auth/login", {
        username,
        password,
      });
      await persistAndSetSession(res, set);
      return true;
    } catch (err: unknown) {
      const mapped = mapAuthError(err, "login");
      logAuthError(mapped, "login");
      set({ isLoading: false, error: mapped.message, lastAuthError: mapped });
      return false;
    }
  },

  // ── Register (auto-login) ──────────────────────────────────────

  register: async (username: string, password: string, name?: string) => {
    set({ isLoading: true, error: null, lastAuthError: null });
    try {
      const res: LoginResponse = await authRequest("/api/v1/auth/register", {
        username,
        password,
        name,
      });

      // DATA INTEGRITY: backend /register already returns a TokenResponse
      // identical to /login, so we can auto-login immediately.
      if (!res.access_token) {
        throw new Error(
          "Registration succeeded but the server did not return an access token. Please log in manually.",
        );
      }

      await persistAndSetSession(res, set);
      return true;
    } catch (err: unknown) {
      const mapped = mapAuthError(err, "register");
      logAuthError(mapped, "register");
      set({ isLoading: false, error: mapped.message, lastAuthError: mapped });
      return false;
    }
  },

  // ── Google Sign-In ─────────────────────────────────────────────

  googleSignIn: async (idToken: string) => {
    if (__DEV__) console.info("[AuthStore] 🔵 googleSignIn called");
    set({ isLoading: true, error: null, lastAuthError: null });
    try {
      if (__DEV__) console.info("[AuthStore] 🔵 Calling POST /api/v1/auth/google…");
      const googleResp = await fetch(`${API_BASE_URL}/api/v1/auth/google`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id_token: idToken }),
      });
      const googleJson = await googleResp.json().catch(() => ({} as Record<string, unknown>));
      if (!googleResp.ok) {
        const message =
          (typeof googleJson?.detail === "string" && googleJson.detail) ||
          (typeof googleJson?.message === "string" && googleJson.message) ||
          `Google sign-in failed (${googleResp.status})`;
        throw new Error(message);
      }
      const normalized = ((googleJson as { data?: unknown })?.data ?? googleJson) as LoginResponse;
      if (__DEV__) console.info("[AuthStore] ✅ Backend returned tokens");
      await persistAndSetSession(normalized, set);
      if (__DEV__) console.info("[AuthStore] ✅ Session persisted, user is now authenticated");
      return true;
    } catch (err: unknown) {
      if (__DEV__) console.error("[AuthStore] ❌ googleSignIn error:", err);
      const mapped = mapAuthError(err, "google");
      logAuthError(mapped, "googleSignIn");
      set({ isLoading: false, error: mapped.message, lastAuthError: mapped });
      return false;
    }
  },

  // ── Logout ─────────────────────────────────────────────────────

  logout: async () => {
    try {
      await Promise.all([removeToken(), removeRefreshToken()]);
    } catch {
      // Best-effort — clear state even if storage fails
    }
    set({
      token: null,
      refreshToken: null,
      expiresIn: null,
      userId: null,
      username: null,
      name: null,
      isAdmin: false,
      isLoading: false,
      error: null,
      lastAuthError: null,
    });
  },
}));
