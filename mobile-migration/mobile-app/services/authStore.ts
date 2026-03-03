/**
 * Auth store (Zustand) — manages JWT access + refresh tokens.
 *
 * Works on Web (localStorage) and Native (expo-secure-store)
 * thanks to the tokenStorage abstraction.
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
import { login as apiLogin, register as apiRegister, LoginResponse } from "@/services/api";

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
  /** True while login/logout is in progress. */
  loading: boolean;
  /** Last error message (null = no error). */
  error: string | null;

  /** Hydrate tokens from storage on app start. */
  hydrate: () => Promise<void>;
  /** Login with username + password. */
  login: (username: string, password: string) => Promise<boolean>;
  /** Register a new user account. */
  register: (username: string, password: string, name?: string) => Promise<boolean>;
  /** Clear tokens and user data. */
  logout: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  refreshToken: null,
  expiresIn: null,
  userId: null,
  username: null,
  name: null,
  loading: true,   // start true — wait for hydration before navigating
  error: null,

  hydrate: async () => {
    set({ loading: true });
    try {
      const [stored, storedRefresh] = await Promise.all([
        getToken(),
        getRefreshToken(),
      ]);
      if (stored) {
        set({ token: stored, refreshToken: storedRefresh, loading: false });
      } else {
        set({ loading: false });
      }
    } catch {
      // Ignore storage errors — treat as logged out
      set({ loading: false });
    }
  },

  login: async (username: string, password: string) => {
    set({ loading: true, error: null });
    try {
      const res: LoginResponse = await apiLogin(username, password);

      // Store access token
      await setToken(res.access_token);

      // Store refresh token if provided
      if (res.refresh_token) {
        await setRefreshToken(res.refresh_token);
      }

      set({
        token: res.access_token,
        refreshToken: res.refresh_token ?? null,
        expiresIn: res.expires_in,
        userId: res.user_id,
        username: res.username,
        name: res.name ?? null,
        loading: false,
        error: null,
      });
      return true;
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ??
        err?.message ??
        "Login failed";
      set({ loading: false, error: msg });
      return false;
    }
  },

  register: async (username: string, password: string, name?: string) => {
    set({ loading: true, error: null });
    try {
      // Register the user — backend returns tokens but we don't auto-login.
      // Instead, we show a success message and redirect to login.
      await apiRegister(username, password, name);

      set({
        loading: false,
        error: null,
      });
      return true;
    } catch (err: any) {
      const msg =
        err?.response?.data?.detail ??
        err?.message ??
        "Registration failed";
      set({ loading: false, error: msg });
      return false;
    }
  },

  logout: async () => {
    await Promise.all([removeToken(), removeRefreshToken()]);
    set({
      token: null,
      refreshToken: null,
      expiresIn: null,
      userId: null,
      username: null,
      name: null,
      error: null,
    });
  },
}));
