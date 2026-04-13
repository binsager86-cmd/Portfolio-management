/**
 * Price Update Notification — fires a push notification after daily price refresh.
 *
 * Gated by the user's `dailyPriceUpdates` notification preference.
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { useUserPrefsStore } from "@/src/store/userPrefsStore";

export interface PriceUpdateResult {
  updatedCount: number;
  failedCount?: number;
  message?: string;
}

/**
 * Send a push notification summarizing the daily price update result.
 * Only fires if the user has `dailyPriceUpdates` enabled in notification preferences.
 */
export async function sendPriceUpdateNotification(
  result?: PriceUpdateResult,
): Promise<void> {
  const { preferences } = useUserPrefsStore.getState();
  if (!preferences.notifications.dailyPriceUpdates) return;

  const count = result?.updatedCount ?? 0;
  const title = "📊 Prices Updated";
  const body =
    result?.message ??
    `${count} stock${count !== 1 ? "s" : ""} updated with latest prices.`;

  if (Platform.OS === "web") {
    if (
      typeof window.Notification !== "undefined" &&
      window.Notification.permission === "granted"
    ) {
      new window.Notification(title, { body });
    }
    return;
  }

  await Notifications.scheduleNotificationAsync({
    content: {
      title,
      body,
      data: { type: "price_update" },
      sound: "default",
    },
    trigger: null,
  });
}
