/**
 * WhatsApp Briefing Service — daily portfolio summary via WhatsApp.
 *
 * Wraps the backend endpoint: POST /api/v1/briefings/whatsapp
 * Also supports email fallback: POST /api/v1/briefings/email
 *
 * The backend handles:
 *  - Scheduling (daily 8 AM KWT)
 *  - Message formatting
 *  - WhatsApp Business API integration
 *
 * This client manages:
 *  - Opt-in/out state (persisted locally)
 *  - Phone number registration
 *  - Preference sync
 */

import { Platform } from "react-native";

// ── Types ───────────────────────────────────────────────────────────

export type BriefingChannel = "whatsapp" | "email";

export interface BriefingPrefs {
  /** Whether the user has opted in to daily briefings */
  enabled: boolean;
  /** Preferred channel */
  channel: BriefingChannel;
  /** Phone number for WhatsApp (E.164 format, e.g. +96512345678) */
  phoneNumber: string;
  /** Email address for email channel */
  email: string;
  /** Schedule hour in 24h format (KWT timezone, default 8) */
  scheduleHour: number;
  /** What to include in the briefing */
  includeMarketPulse: boolean;
  includeDividendAlerts: boolean;
  includePriceAlerts: boolean;
}

export interface BriefingRegistration {
  channel: BriefingChannel;
  phone_number?: string;
  email?: string;
  schedule_hour: number;
  include_market_pulse: boolean;
  include_dividend_alerts: boolean;
  include_price_alerts: boolean;
}

export interface BriefingStatusResponse {
  active: boolean;
  channel: BriefingChannel;
  next_delivery?: string; // ISO datetime
  last_delivered?: string;
}

// ── Storage ──────────────────────────────────────────────────────────

const STORAGE_KEY = "briefing_prefs";

const DEFAULT_PREFS: BriefingPrefs = {
  enabled: false,
  channel: "whatsapp",
  phoneNumber: "",
  email: "",
  scheduleHour: 8,
  includeMarketPulse: true,
  includeDividendAlerts: true,
  includePriceAlerts: true,
};

export async function loadBriefingPrefs(): Promise<BriefingPrefs> {
  try {
    let raw: string | null = null;
    if (Platform.OS === "web") {
      raw = localStorage.getItem(STORAGE_KEY);
    } else {
      const SecureStore = await import("expo-secure-store");
      raw = await SecureStore.getItemAsync(STORAGE_KEY);
    }
    if (raw) {
      return { ...DEFAULT_PREFS, ...JSON.parse(raw) };
    }
  } catch {
    /* ignore load failures */
  }
  return DEFAULT_PREFS;
}

export async function saveBriefingPrefs(prefs: BriefingPrefs): Promise<void> {
  try {
    const raw = JSON.stringify(prefs);
    if (Platform.OS === "web") {
      localStorage.setItem(STORAGE_KEY, raw);
    } else {
      const SecureStore = await import("expo-secure-store");
      await SecureStore.setItemAsync(STORAGE_KEY, raw);
    }
  } catch {
    /* ignore save failures */
  }
}

// ── Validation ──────────────────────────────────────────────────────

const PHONE_REGEX = /^\+[1-9]\d{7,14}$/;
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validatePhone(phone: string): boolean {
  return PHONE_REGEX.test(phone);
}

export function validateEmail(email: string): boolean {
  return EMAIL_REGEX.test(email);
}

/**
 * Validate briefing prefs. Returns an i18n key on error, null if valid.
 */
export function validateBriefingPrefs(prefs: BriefingPrefs): string | null {
  if (!prefs.enabled) return null;

  if (prefs.channel === "whatsapp") {
    if (!prefs.phoneNumber) return "briefings.errors.phoneRequired";
    if (!validatePhone(prefs.phoneNumber)) return "briefings.errors.phoneInvalid";
  }

  if (prefs.channel === "email") {
    if (!prefs.email) return "briefings.errors.emailRequired";
    if (!validateEmail(prefs.email)) return "briefings.errors.emailInvalid";
  }

  if (prefs.scheduleHour < 0 || prefs.scheduleHour > 23)
    return "briefings.errors.scheduleInvalid";

  return null;
}

// ── API calls (deferred — requires backend endpoint) ────────────────

/**
 * Register or update briefing preferences with the backend.
 * This is a placeholder — the actual API call depends on your backend.
 */
export function buildRegistrationPayload(prefs: BriefingPrefs): BriefingRegistration {
  return {
    channel: prefs.channel,
    phone_number: prefs.channel === "whatsapp" ? prefs.phoneNumber : undefined,
    email: prefs.channel === "email" ? prefs.email : undefined,
    schedule_hour: prefs.scheduleHour,
    include_market_pulse: prefs.includeMarketPulse,
    include_dividend_alerts: prefs.includeDividendAlerts,
    include_price_alerts: prefs.includePriceAlerts,
  };
}
