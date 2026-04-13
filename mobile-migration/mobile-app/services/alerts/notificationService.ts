/**
 * Notification Service — schedules local notifications for triggered alerts.
 *
 * Uses expo-notifications for native push and Web Notification API on web.
 * Handles permission requests, scheduling, cancellation, and background checks.
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import {
    type AlertRule,
    evaluateAlertRule,
    formatAlertMessage,
} from "./alertRules";

// ── Configure notification behavior ─────────────────────────────────

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// ── Permission ───────────────────────────────────────────────────────

export async function requestNotificationPermissions(): Promise<boolean> {
  if (Platform.OS === "web") {
    if (typeof window.Notification !== "undefined") {
      if (window.Notification.permission === "granted") return true;
      if (window.Notification.permission !== "denied") {
        const result = await window.Notification.requestPermission();
        return result === "granted";
      }
    }
    return false;
  }

  const { status } = await Notifications.requestPermissionsAsync();
  return status === "granted";
}

// ── Schedule ─────────────────────────────────────────────────────────

export async function scheduleAlertNotification(
  rule: AlertRule,
  currentPrice: number,
  delaySeconds: number = 0,
) {
  const message = formatAlertMessage(rule, currentPrice);

  if (Platform.OS === "web") {
    if (
      typeof window.Notification !== "undefined" &&
      window.Notification.permission === "granted"
    ) {
      if (delaySeconds > 0) {
        setTimeout(() => {
          new window.Notification("Portfolio Alert", { body: message });
        }, delaySeconds * 1000);
      } else {
        new window.Notification("Portfolio Alert", { body: message });
      }
    }
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title: "Portfolio Alert",
      body: message,
      data: {
        ruleId: rule.id,
        stockSymbol: rule.symbol,
        type: rule.condition,
      },
      sound: "default",
    },
    trigger: delaySeconds > 0
      ? { type: Notifications.SchedulableTriggerInputTypes.TIME_INTERVAL, seconds: delaySeconds }
      : null,
  });
}

// ── Cancel ───────────────────────────────────────────────────────────

export async function cancelAlertNotification(ruleId: string) {
  if (Platform.OS === "web") return;

  const scheduled = await Notifications.getAllScheduledNotificationsAsync();
  for (const notif of scheduled) {
    if (notif.content.data?.ruleId === ruleId) {
      await Notifications.cancelScheduledNotificationAsync(notif.identifier);
    }
  }
}

// ── Background check runner ──────────────────────────────────────────

export async function checkAndTriggerAlerts(
  rules: AlertRule[],
  priceData: Record<string, { current: number; previous?: number }>,
): Promise<string[]> {
  const triggered: string[] = [];

  for (const rule of rules) {
    if (!rule.symbol || !rule.enabled) continue;
    const price = priceData[rule.symbol];
    if (!price) continue;

    if (evaluateAlertRule(rule, price.current, price.previous)) {
      await scheduleAlertNotification(rule, price.current);
      triggered.push(rule.id);
    }
  }

  return triggered;
}
