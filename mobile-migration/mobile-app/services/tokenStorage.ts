/**
 * Token storage abstraction.
 *
 * Web  → localStorage (no expo-secure-store on web)
 * Native → expo-secure-store (encrypted on-device)
 *
 * Stores both access token and refresh token.
 */

import { Platform } from "react-native";

const TOKEN_KEY = "auth_token";
const REFRESH_TOKEN_KEY = "refresh_token";

// ── Web helpers ─────────────────────────────────────────────────────

async function getTokenWeb(): Promise<string | null> {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

async function setTokenWeb(token: string): Promise<void> {
  try {
    localStorage.setItem(TOKEN_KEY, token);
  } catch {}
}

async function removeTokenWeb(): Promise<void> {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {}
}

async function getRefreshTokenWeb(): Promise<string | null> {
  try {
    return localStorage.getItem(REFRESH_TOKEN_KEY);
  } catch {
    return null;
  }
}

async function setRefreshTokenWeb(token: string): Promise<void> {
  try {
    localStorage.setItem(REFRESH_TOKEN_KEY, token);
  } catch {}
}

async function removeRefreshTokenWeb(): Promise<void> {
  try {
    localStorage.removeItem(REFRESH_TOKEN_KEY);
  } catch {}
}

// ── Native helpers ──────────────────────────────────────────────────

async function getTokenNative(): Promise<string | null> {
  const SecureStore = await import("expo-secure-store");
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function setTokenNative(token: string): Promise<void> {
  const SecureStore = await import("expo-secure-store");
  await SecureStore.setItemAsync(TOKEN_KEY, token);
}

async function removeTokenNative(): Promise<void> {
  const SecureStore = await import("expo-secure-store");
  await SecureStore.deleteItemAsync(TOKEN_KEY);
}

async function getRefreshTokenNative(): Promise<string | null> {
  const SecureStore = await import("expo-secure-store");
  return SecureStore.getItemAsync(REFRESH_TOKEN_KEY);
}

async function setRefreshTokenNative(token: string): Promise<void> {
  const SecureStore = await import("expo-secure-store");
  await SecureStore.setItemAsync(REFRESH_TOKEN_KEY, token);
}

async function removeRefreshTokenNative(): Promise<void> {
  const SecureStore = await import("expo-secure-store");
  await SecureStore.deleteItemAsync(REFRESH_TOKEN_KEY);
}

// ── Public API (auto-selects platform) ──────────────────────────────

const isWeb = Platform.OS === "web";

export const getToken         = isWeb ? getTokenWeb         : getTokenNative;
export const setToken         = isWeb ? setTokenWeb         : setTokenNative;
export const removeToken      = isWeb ? removeTokenWeb      : removeTokenNative;
export const getRefreshToken  = isWeb ? getRefreshTokenWeb  : getRefreshTokenNative;
export const setRefreshToken  = isWeb ? setRefreshTokenWeb  : setRefreshTokenNative;
export const removeRefreshToken = isWeb ? removeRefreshTokenWeb : removeRefreshTokenNative;
