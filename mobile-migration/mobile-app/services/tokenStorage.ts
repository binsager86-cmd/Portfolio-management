/**
 * Token storage abstraction.
 *
 * Web    → sessionStorage for access tokens (cleared when tab closes),
 *          localStorage for refresh tokens (persistent across tabs).
 * Native → expo-secure-store (encrypted on-device keychain/keystore)
 *
 * Uses crash-safe timestamp-based expiry tracking instead of JWT decode.
 * Clock-skew tolerance: 60 s buffer for network/device clock drift.
 */

import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// ── Constants ───────────────────────────────────────────────────────

const CLOCK_SKEW_MS = 60_000; // 60s buffer for network/device clock drift

// SSR guards — sessionStorage/localStorage may not exist during
// Expo Router's Node.js server-side render pass.
const hasSessionStorage = typeof sessionStorage !== "undefined";
const hasLocalStorage = typeof localStorage !== "undefined";

// ── New API ─────────────────────────────────────────────────────────

export const setTokens = async (
  access: string,
  refresh: string,
  expiresIn?: number,
): Promise<void> => {
  if (Platform.OS === "web") {
    if (hasSessionStorage) sessionStorage.setItem("access_token", access);
    if (hasLocalStorage) {
      localStorage.setItem("refresh_token", refresh);
      if (expiresIn)
        localStorage.setItem(
          "token_expires_at",
          String(Date.now() + expiresIn * 1000),
        );
    }
  } else {
    await SecureStore.setItemAsync("access_token", access);
    await SecureStore.setItemAsync("refresh_token", refresh);
    if (expiresIn)
      await SecureStore.setItemAsync(
        "token_expires_at",
        String(Date.now() + expiresIn * 1000),
      );
  }
};

export const getTokens = async () => {
  if (Platform.OS === "web") {
    return {
      access: hasSessionStorage
        ? sessionStorage.getItem("access_token")
        : null,
      refresh: hasLocalStorage
        ? localStorage.getItem("refresh_token")
        : null,
      expiresAt: hasLocalStorage
        ? localStorage.getItem("token_expires_at")
        : null,
    };
  }
  return {
    access: await SecureStore.getItemAsync("access_token"),
    refresh: await SecureStore.getItemAsync("refresh_token"),
    expiresAt: await SecureStore.getItemAsync("token_expires_at"),
  };
};

export const clearTokens = async (): Promise<void> => {
  if (Platform.OS === "web") {
    if (hasSessionStorage) sessionStorage.removeItem("access_token");
    if (hasLocalStorage) {
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("token_expires_at");
    }
  } else {
    await SecureStore.deleteItemAsync("access_token");
    await SecureStore.deleteItemAsync("refresh_token");
    await SecureStore.deleteItemAsync("token_expires_at");
  }
};

export const getStoredAccessToken = async (): Promise<string | null> => {
  if (Platform.OS === "web") {
    return hasSessionStorage
      ? sessionStorage.getItem("access_token")
      : null;
  }
  return SecureStore.getItemAsync("access_token");
};

// ── Expiry checking ─────────────────────────────────────────────────

// Legacy JWT decode helper — kept for backward compat with hydrate/session guard.
interface JwtPayload {
  exp: number;
  iat: number;
}

function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const base64 = parts[1];
    if (!base64) return null;
    const padded = base64
      .replace(/-/g, "+")
      .replace(/_/g, "/")
      .padEnd(base64.length + ((4 - (base64.length % 4)) % 4), "=");
    const json = atob(padded);
    const parsed = JSON.parse(json);
    if (typeof parsed?.exp !== "number") return null;
    return parsed as JwtPayload;
  } catch {
    return null;
  }
}

const CLOCK_SKEW_SECONDS = 30;

/**
 * Check if a token or expiry timestamp indicates expiration.
 *
 * Supports two calling conventions:
 *   - `isTokenExpired(expiresAt)` — new: checks a stored ms-timestamp string
 *   - `isTokenExpired(jwt, bufferSeconds)` — legacy: decodes a JWT payload
 *
 * Detection: if `bufferSeconds` is provided or the string contains dots
 * (JWT format), uses JWT decode. Otherwise treats as a numeric timestamp.
 */
export function isTokenExpired(
  tokenOrExpiresAt: string | null,
  bufferSeconds?: number,
): boolean {
  if (!tokenOrExpiresAt) return true;

  // Legacy path: JWT decode (when bufferSeconds given, or string looks like JWT)
  if (bufferSeconds !== undefined || tokenOrExpiresAt.includes(".")) {
    const payload = decodeJwtPayload(tokenOrExpiresAt);
    if (!payload?.exp) return true;
    const nowSec = Date.now() / 1000;
    const buffer = bufferSeconds ?? 60;
    return payload.exp - nowSec < buffer + CLOCK_SKEW_SECONDS;
  }

  // New path: stored timestamp
  const expiry = Number(tokenOrExpiresAt);
  if (isNaN(expiry)) return true;
  return Date.now() >= expiry - CLOCK_SKEW_MS;
}

// ── Backward-compatible API ─────────────────────────────────────────
// These aliases allow existing consumers (authStore hydrate, useSessionGuard,
// newsApi, marketApi, etc.) to work without changes.

export async function getToken(): Promise<string | null> {
  return getStoredAccessToken();
}

export async function setToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    if (hasSessionStorage) sessionStorage.setItem("access_token", token);
  } else {
    await SecureStore.setItemAsync("access_token", token);
  }
}

export async function removeToken(): Promise<void> {
  if (Platform.OS === "web") {
    if (hasSessionStorage) sessionStorage.removeItem("access_token");
  } else {
    await SecureStore.deleteItemAsync("access_token");
  }
}

export async function getRefreshToken(): Promise<string | null> {
  if (Platform.OS === "web") {
    return hasLocalStorage ? localStorage.getItem("refresh_token") : null;
  }
  return SecureStore.getItemAsync("refresh_token");
}

export async function setRefreshToken(token: string): Promise<void> {
  if (Platform.OS === "web") {
    if (hasLocalStorage) localStorage.setItem("refresh_token", token);
  } else {
    await SecureStore.setItemAsync("refresh_token", token);
  }
}

export async function removeRefreshToken(): Promise<void> {
  if (Platform.OS === "web") {
    if (hasLocalStorage) {
      localStorage.removeItem("refresh_token");
      localStorage.removeItem("token_expires_at");
    }
  } else {
    await SecureStore.deleteItemAsync("refresh_token");
    await SecureStore.deleteItemAsync("token_expires_at");
  }
}
