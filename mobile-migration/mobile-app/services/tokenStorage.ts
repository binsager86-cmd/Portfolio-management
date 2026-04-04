/**
 * Token storage abstraction.
 *
 * Web    → sessionStorage (cleared when tab closes — limits XSS window).
 *          NOTE: For maximum security, migrate to httpOnly cookies via a
 *          backend proxy so tokens never touch JS at all.
 * Native → expo-secure-store (encrypted on-device keychain/keystore)
 */

import { Platform } from "react-native";

const TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "refresh_token";
const TOKEN_EXPIRY_KEY = "auth_token_expiry";
const REFRESH_EXPIRY_KEY = "refresh_token_expiry";

// ── Token expiration helpers ────────────────────────────────────────

interface JwtPayload {
  exp: number;
  iat: number;
}

/**
 * Decode the payload section of a JWT (no signature verification —
 * the backend is the authority; this is only for expiry timing).
 */
function decodeJwtPayload(token: string): JwtPayload | null {
  try {
    const base64 = token.split(".")[1];
    if (!base64) return null;
    // Handle URL-safe base64
    const padded = base64.replace(/-/g, "+").replace(/_/g, "/");
    const json = atob(padded);
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

/**
 * Returns `true` if the token is expired **or** will expire within
 * `bufferSeconds` (default 60 s).  Also returns `true` for un-parseable tokens.
 */
export function isTokenExpired(
  token: string | null,
  bufferSeconds = 60,
): boolean {
  if (!token) return true;
  const payload = decodeJwtPayload(token);
  if (!payload?.exp) return true;
  const nowSec = Date.now() / 1000;
  return payload.exp - nowSec < bufferSeconds;
}

// ── Platform-adaptive helpers ───────────────────────────────────────

/** Map token key → its expiry-timestamp key. */
function expiryKeyFor(key: string): string | null {
  if (key === TOKEN_KEY) return TOKEN_EXPIRY_KEY;
  if (key === REFRESH_TOKEN_KEY) return REFRESH_EXPIRY_KEY;
  return null;
}

async function getItem(key: string): Promise<string | null> {
  if (Platform.OS === "web") {
    const value = sessionStorage.getItem(key);
    if (!value) return null;

    // Auto-evict if the stored expiry has passed (defense-in-depth).
    const ek = expiryKeyFor(key);
    if (ek) {
      const storedExpiry = sessionStorage.getItem(ek);
      if (storedExpiry && Date.now() > Number(storedExpiry)) {
        sessionStorage.removeItem(key);
        sessionStorage.removeItem(ek);
        return null;
      }
    }

    return value;
  }
  const SecureStore = await import("expo-secure-store");
  return SecureStore.getItemAsync(key);
}

async function setItem(key: string, value: string): Promise<void> {
  if (Platform.OS === "web") {
    sessionStorage.setItem(key, value);

    // Persist the JWT expiry so getItem can auto-evict stale tokens.
    const ek = expiryKeyFor(key);
    if (ek) {
      const payload = decodeJwtPayload(value);
      if (payload?.exp) {
        sessionStorage.setItem(ek, String(payload.exp * 1000));
      }
    }
    return;
  }
  const SecureStore = await import("expo-secure-store");
  await SecureStore.setItemAsync(key, value);
}

async function removeItem(key: string): Promise<void> {
  if (Platform.OS === "web") {
    sessionStorage.removeItem(key);
    const ek = expiryKeyFor(key);
    if (ek) sessionStorage.removeItem(ek);
    return;
  }
  const SecureStore = await import("expo-secure-store");
  await SecureStore.deleteItemAsync(key);
}

// ── Public API ──────────────────────────────────────────────────────

export async function getToken(): Promise<string | null> {
  return getItem(TOKEN_KEY);
}

export async function setToken(token: string): Promise<void> {
  await setItem(TOKEN_KEY, token);
}

export async function removeToken(): Promise<void> {
  await removeItem(TOKEN_KEY);
}

export async function getRefreshToken(): Promise<string | null> {
  return getItem(REFRESH_TOKEN_KEY);
}

export async function setRefreshToken(token: string): Promise<void> {
  await setItem(REFRESH_TOKEN_KEY, token);
}

export async function removeRefreshToken(): Promise<void> {
  await removeItem(REFRESH_TOKEN_KEY);
}
