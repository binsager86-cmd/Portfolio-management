/**
 * Auth store (Zustand) — manages JWT access + refresh tokens.
 *
 * Features:
 *   - Auto-login after registration (stores tokens immediately)
 *   - Google Sign-In support via backend token exchange
 *   - Structured error handling via authErrors.ts
 *   - Works on Web (localStorage) and Native (expo-secure-store)
 */

import { create } from "zustand";
import {
  getToken,
  setToken,
  removeToken,
  getRefreshToken,
  setRefreshToken,
  removeRefreshToken,
} from "@/services/tokenStorage";
import {
  login as apiLogin,
  register as apiRegister,
  LoginResponse,
} from "@/services/api";
import {
  mapAuthError,
  logAuthError,
  type AuthError,
} from "@/services/authErrors";
import { API_BASE_URL } from "@/constants/Config";

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
  /** True while any auth operation is in progress. */
  isLoading: boolean;
  /** User-facing error message (null = no error). */
  error: string | null;
  /** Structured error for analytics/Sentry (null = no error). */
  lastAuthError: AuthError | null;

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
    isLoading: false,
    error: null,
    lastAuthError: null,
  });
}

// ── Store ───────────────────────────────────────────────────────────

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  refreshToken: null,
  expiresIn: null,
  userId: null,
  username: null,
  name: null,
  isLoading: true, // start true — wait for hydration before navigating
  error: null,
  lastAuthError: null,

  clearError: () => set({ error: null, lastAuthError: null }),

  // ── Hydrate ─────────────────────────────────────────────────────

  hydrate: async () => {
    set({ isLoading: true });
    try {
      const [stored, storedRefresh] = await Promise.all([
        getToken(),
        getRefreshToken(),
      ]);
      if (__DEV__) console.log("[hydrate] stored token:", stored ? `${stored.substring(0, 20)}...` : "null");
      if (stored) {
        // Validate the stored token with a direct fetch to /me
        // (avoids circular dependency with api.ts)
        try {
          if (__DEV__) console.log("[hydrate] Validating token via", `${API_BASE_URL}/api/v1/auth/me`);
          const resp = await fetch(`${API_BASE_URL}/api/v1/auth/me`, {
            headers: { Authorization: `Bearer ${stored}` },
          });
          if (__DEV__) console.log("[hydrate] /me response status:", resp.status);
          if (!resp.ok) throw new Error(`Token invalid (${resp.status})`);
          const json = await resp.json();
          const me = json.data ?? json;
          if (__DEV__) console.log("[hydrate] Token valid, user:", me.username);
          set({
            token: stored,
            refreshToken: storedRefresh,
            userId: me.user_id,
            username: me.username,
            name: me.name ?? null,
            isLoading: false,
          });
        } catch (err) {
          if (__DEV__) console.log("[hydrate] Token invalid, clearing:", err);
          // Token invalid — clear everything and force login
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
        if (__DEV__) console.log("[hydrate] No stored token, showing login");
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
      const res: LoginResponse = await apiLogin(username, password);
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
      const res: LoginResponse = await apiRegister(username, password, name);

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
    if (__DEV__) console.log("[AuthStore] 🔵 googleSignIn called");
    set({ isLoading: true, error: null, lastAuthError: null });
    try {
      // Dynamic import to avoid bundling Google auth code when unused
      const { googleSignIn: apiGoogleSignIn } = await import(
        "@/services/api"
      );
      if (__DEV__) console.log("[AuthStore] 🔵 Calling POST /api/v1/auth/google…");
      const res: LoginResponse = await apiGoogleSignIn(idToken);
      if (__DEV__) console.log("[AuthStore] ✅ Backend returned tokens");
      await persistAndSetSession(res, set);
      if (__DEV__) console.log("[AuthStore] ✅ Session persisted, user is now authenticated");
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
      error: null,
      lastAuthError: null,
    });
  },
}));
