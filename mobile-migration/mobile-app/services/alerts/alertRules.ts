/**
 * Alert Rules — types and evaluation logic for price/portfolio alerts.
 *
 * Supports price-above, price-below, daily-change, and portfolio-value triggers.
 * Rules are persisted via the user prefs persistence pattern (localStorage / SecureStore).
 */

import { Platform } from "react-native";

// ── Types ────────────────────────────────────────────────────────────

export type AlertCondition = "price-above" | "price-below" | "daily-change-pct" | "portfolio-value-above" | "portfolio-value-below";

export interface AlertRule {
  id: string;
  /** Stock symbol — null for portfolio-level alerts */
  symbol: string | null;
  condition: AlertCondition;
  /** Threshold value (price in currency, or percentage for daily-change) */
  threshold: number;
  /** Whether this rule is currently active */
  enabled: boolean;
  /** Optional user note */
  label?: string;
  /** ISO timestamp of creation */
  createdAt: string;
  /** ISO timestamp of last trigger (prevents repeat firing) */
  lastTriggeredAt?: string;
}

export interface AlertEvalContext {
  symbol: string;
  currentPrice: number;
  previousClose?: number;
  portfolioValue?: number;
}

export interface TriggeredAlert {
  rule: AlertRule;
  message: string;
  value: number;
}

// ── Evaluation ───────────────────────────────────────────────────────

export function evaluateAlerts(
  rules: AlertRule[],
  context: AlertEvalContext,
): TriggeredAlert[] {
  const triggered: TriggeredAlert[] = [];

  for (const rule of rules) {
    if (!rule.enabled) continue;

    // Skip if recently triggered (within 1 hour)
    if (rule.lastTriggeredAt) {
      const elapsed = Date.now() - new Date(rule.lastTriggeredAt).getTime();
      if (elapsed < 3600_000) continue;
    }

    switch (rule.condition) {
      case "price-above":
        if (rule.symbol === context.symbol && context.currentPrice >= rule.threshold) {
          triggered.push({
            rule,
            message: `${context.symbol} hit ${context.currentPrice.toFixed(3)} (above ${rule.threshold.toFixed(3)})`,
            value: context.currentPrice,
          });
        }
        break;

      case "price-below":
        if (rule.symbol === context.symbol && context.currentPrice <= rule.threshold) {
          triggered.push({
            rule,
            message: `${context.symbol} dropped to ${context.currentPrice.toFixed(3)} (below ${rule.threshold.toFixed(3)})`,
            value: context.currentPrice,
          });
        }
        break;

      case "daily-change-pct":
        if (
          rule.symbol === context.symbol &&
          context.previousClose &&
          context.previousClose > 0
        ) {
          const changePct =
            ((context.currentPrice - context.previousClose) / context.previousClose) * 100;
          if (Math.abs(changePct) >= rule.threshold) {
            triggered.push({
              rule,
              message: `${context.symbol} moved ${changePct >= 0 ? "+" : ""}${changePct.toFixed(1)}% today`,
              value: changePct,
            });
          }
        }
        break;

      case "portfolio-value-above":
        if (rule.symbol === null && context.portfolioValue !== undefined && context.portfolioValue >= rule.threshold) {
          triggered.push({
            rule,
            message: `Portfolio value reached ${context.portfolioValue.toFixed(2)} (above ${rule.threshold.toFixed(2)})`,
            value: context.portfolioValue,
          });
        }
        break;

      case "portfolio-value-below":
        if (rule.symbol === null && context.portfolioValue !== undefined && context.portfolioValue <= rule.threshold) {
          triggered.push({
            rule,
            message: `Portfolio value dropped to ${context.portfolioValue.toFixed(2)} (below ${rule.threshold.toFixed(2)})`,
            value: context.portfolioValue,
          });
        }
        break;
    }
  }

  return triggered;
}

// ── Persistence ──────────────────────────────────────────────────────

const STORAGE_KEY = "alert_rules";

export async function loadAlertRules(): Promise<AlertRule[]> {
  try {
    let raw: string | null = null;
    if (Platform.OS === "web") {
      raw = localStorage.getItem(STORAGE_KEY);
    } else {
      const SecureStore = await import("expo-secure-store");
      raw = await SecureStore.getItemAsync(STORAGE_KEY);
    }
    if (raw) return JSON.parse(raw);
  } catch (err) {
    if (__DEV__) console.warn("[AlertRules] Failed to load:", err);
  }
  return [];
}

export async function saveAlertRules(rules: AlertRule[]): Promise<void> {
  try {
    const raw = JSON.stringify(rules);
    if (Platform.OS === "web") {
      localStorage.setItem(STORAGE_KEY, raw);
    } else {
      const SecureStore = await import("expo-secure-store");
      await SecureStore.setItemAsync(STORAGE_KEY, raw);
    }
  } catch (err) {
    if (__DEV__) console.warn("[AlertRules] Failed to save:", err);
  }
}

// ── Helpers ──────────────────────────────────────────────────────────

export function createAlertRule(
  partial: Pick<AlertRule, "symbol" | "condition" | "threshold"> & { label?: string },
): AlertRule {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    symbol: partial.symbol,
    condition: partial.condition,
    threshold: partial.threshold,
    enabled: true,
    label: partial.label,
    createdAt: new Date().toISOString(),
  };
}

export function conditionLabel(condition: AlertCondition): string {
  switch (condition) {
    case "price-above":
      return "Price Above";
    case "price-below":
      return "Price Below";
    case "daily-change-pct":
      return "Daily Change %";
    case "portfolio-value-above":
      return "Portfolio Above";
    case "portfolio-value-below":
      return "Portfolio Below";
  }
}

/** Format a human-readable alert message for a triggered rule. */
export function formatAlertMessage(rule: AlertRule, currentPrice: number): string {
  const sym = rule.symbol ?? "Portfolio";
  switch (rule.condition) {
    case "price-above":
      return `${sym} hit ${currentPrice.toFixed(3)} (above ${rule.threshold.toFixed(3)})`;
    case "price-below":
      return `${sym} dropped to ${currentPrice.toFixed(3)} (below ${rule.threshold.toFixed(3)})`;
    case "daily-change-pct":
      return `${sym} moved ${currentPrice >= 0 ? "+" : ""}${currentPrice.toFixed(1)}% today`;
    case "portfolio-value-above":
      return `Portfolio value reached ${currentPrice.toFixed(2)} (above ${rule.threshold.toFixed(2)})`;
    case "portfolio-value-below":
      return `Portfolio value dropped to ${currentPrice.toFixed(2)} (below ${rule.threshold.toFixed(2)})`;
  }
}

/**
 * Evaluate a single rule against current price data.
 * Returns true if the rule should fire.
 */
export function evaluateAlertRule(
  rule: AlertRule,
  currentPrice: number,
  previousClose?: number,
): boolean {
  if (!rule.enabled) return false;

  // Cooldown: skip if triggered within the last hour
  if (rule.lastTriggeredAt) {
    const elapsed = Date.now() - new Date(rule.lastTriggeredAt).getTime();
    if (elapsed < 3600_000) return false;
  }

  switch (rule.condition) {
    case "price-above":
      return currentPrice >= rule.threshold;
    case "price-below":
      return currentPrice <= rule.threshold;
    case "daily-change-pct":
      if (!previousClose || previousClose <= 0) return false;
      return (
        Math.abs(((currentPrice - previousClose) / previousClose) * 100) >= rule.threshold
      );
    case "portfolio-value-above":
      return currentPrice >= rule.threshold;
    case "portfolio-value-below":
      return currentPrice <= rule.threshold;
  }
}
