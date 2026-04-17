import { Platform } from "react-native";

const GA_ID = "G-KSKB3TGB13";

type GtagParams = Record<string, string | number | boolean | undefined>;

function gtag(...args: unknown[]): void {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const w = window as any;
  if (typeof w.gtag === "function") {
    w.gtag(...args);
  }
}

/** Track a virtual page view (SPA navigation). */
export function trackPageView(path: string, title?: string): void {
  gtag("config", GA_ID, {
    page_path: path,
    page_title: title ?? path,
  });
}

/** Fire a custom GA4 event. */
export function trackEvent(
  action: string,
  category: string,
  label?: string,
  value?: number,
): void {
  gtag("event", action, {
    event_category: category,
    event_label: label,
    value,
  });
}

/** Convenience: track user login. */
export function trackLogin(method: string): void {
  gtag("event", "login", { method });
}

/** Convenience: track user registration. */
export function trackSignUp(method: string): void {
  gtag("event", "sign_up", { method });
}
