/**
 * Lightweight analytics logger.
 *
 * Currently logs to console in dev. Swap the implementation for
 * Firebase Analytics, Mixpanel, Amplitude, or PostHog when ready.
 *
 * Usage:
 *   analytics.logEvent("registration_attempted", { method: "email" });
 */

type EventParams = Record<string, string | number | boolean | undefined>;

/** Fire a named analytics event with optional key-value parameters. */
function logEvent(name: string, params?: EventParams): void {
  if (__DEV__) {
    console.log(`[Analytics] ${name}`, params ?? "");
  }
}

/** Convenience wrapper that logs a `screen_view` event. */
function logScreenView(screenName: string): void {
  logEvent("screen_view", { screen_name: screenName });
}

export const analytics = { logEvent, logScreenView } as const;
