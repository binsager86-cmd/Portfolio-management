/**
 * Analytics & Error Tracking
 *
 * Uses @sentry/react-native when installed and configured via
 * EXPO_PUBLIC_SENTRY_DSN. Falls back to console-only logging.
 *
 * Usage:
 *   analytics.logEvent("registration_attempted", { method: "email" });
 *   analytics.captureError(error, { screen: "holdings" });
 */

type EventParams = Record<string, string | number | boolean | undefined>;

let Sentry: typeof import("@sentry/react-native") | null = null;

/** Call once at app startup (before navigation mounts). */
async function init(): Promise<void> {
  const dsn = process.env.EXPO_PUBLIC_SENTRY_DSN;
  if (!dsn) {
    if (__DEV__) console.log("[Analytics] No EXPO_PUBLIC_SENTRY_DSN — Sentry disabled");
    return;
  }

  try {
    Sentry = await import("@sentry/react-native");
    Sentry.init({
      dsn,
      tracesSampleRate: __DEV__ ? 1.0 : 0.2,
      enableAutoSessionTracking: true,
      debug: __DEV__,
    });
  } catch {
    if (__DEV__) console.warn("[Analytics] @sentry/react-native not installed — skipping");
    Sentry = null;
  }
}

/** Fire a named analytics event with optional key-value parameters. */
function logEvent(name: string, params?: EventParams): void {
  if (__DEV__) {
    console.log(`[Analytics] ${name}`, params ?? "");
  }
  Sentry?.addBreadcrumb({ category: "event", message: name, data: params });
}

/** Convenience wrapper that logs a `screen_view` event. */
function logScreenView(screenName: string): void {
  logEvent("screen_view", { screen_name: screenName });
}

/** Capture an error to Sentry with optional extra context. */
function captureError(error: unknown, context?: Record<string, string>): void {
  if (__DEV__) console.error("[Analytics] captureError", error);
  if (Sentry) {
    Sentry.captureException(error, context ? { extra: context } : undefined);
  }
}

/** Identify the current user for error/event attribution. */
function setUser(id: string, email?: string): void {
  Sentry?.setUser({ id, email });
}

/** Clear user identity on logout. */
function clearUser(): void {
  Sentry?.setUser(null);
}

export const analytics = {
  init,
  logEvent,
  logScreenView,
  captureError,
  setUser,
  clearUser,
} as const;
