/**
 * App-wide configuration constants.
 *
 * Production: Set EXPO_PUBLIC_API_URL env var to your deployed backend URL.
 *   - DigitalOcean: set in .do/app.yaml envs
 *   - Vercel: set in Project → Settings → Environment Variables
 *   - EAS:    set in eas.json per build profile
 *
 * Development:
 *   Web → 127.0.0.1:8004
 *   Mobile (physical device) → LAN IP
 */

import { Platform } from "react-native";

// ── Override via env var for production builds ──────────────────────
const ENV_API_URL =
  // @ts-ignore — Expo injects process.env.EXPO_PUBLIC_* at build time
  typeof process !== "undefined" ? process.env.EXPO_PUBLIC_API_URL : undefined;

// ── Local dev fallbacks ─────────────────────────────────────────────
// Change LAN IP if testing on a physical device over Wi-Fi
const LOCAL_LAN_API = "http://192.168.1.5:8004";
const LOCAL_WEB_API = "http://127.0.0.1:8004";

/**
 * Backend API base URL.
 *
 * Priority:
 *   1. EXPO_PUBLIC_API_URL env var (set in DO / Vercel / EAS / CI)
 *   2. Production web: "" (empty) → relative paths (same domain on DO)
 *   3. Dev web: localhost:8003
 *   4. Dev mobile: LAN IP (must set EXPO_PUBLIC_API_URL)
 */
const isLocalDev =
  Platform.OS === "web" &&
  typeof window !== "undefined" &&
  (window.location?.hostname === "localhost" || window.location?.hostname === "127.0.0.1");

export const API_BASE_URL: string =
  // Explicit override always wins (EAS build, CI, Vercel, etc.)
  (ENV_API_URL != null && ENV_API_URL !== "")
    ? ENV_API_URL
    : Platform.OS === "web"
      ? isLocalDev
        ? LOCAL_WEB_API        // Dev: http://127.0.0.1:8004
        : ""                   // Production web: relative paths (same domain)
      : LOCAL_LAN_API;         // Mobile native: use env var or LAN fallback

/** How long (ms) to wait before timing out API calls. */
export const API_TIMEOUT = 60_000;

/**
 * Google OAuth Web Client ID.
 *
 * Create one at https://console.cloud.google.com → APIs & Services → Credentials.
 * Type: "Web application". Add your redirect URIs (localhost + production).
 * Must be set via EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID env var.
 */
const ENV_GOOGLE_CLIENT_ID =
  // @ts-ignore — Expo injects process.env.EXPO_PUBLIC_* at build time
  typeof process !== "undefined"
    ? process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID
    : undefined;

export const GOOGLE_WEB_CLIENT_ID: string = ENV_GOOGLE_CLIENT_ID ?? "";
