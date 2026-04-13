/**
 * News Notification Service — sends push notifications for high-impact news.
 *
 * Features:
 *  • Deduplication via in-memory Set (no spam for same story)
 *  • Targeting: only fires for user's portfolio symbols or high-impact market news
 *  • Gated by notification preferences
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { generateSummary } from "@/lib/news/summarizer";
import type { NewsItem } from "@/services/news/types";
import { useUserPrefsStore } from "@/src/store/userPrefsStore";

// In-memory dedup set (survives for app session, clears on restart)
const notifiedIds = new Set<string>();

/**
 * Send a push notification for a news item.
 * Includes deduplication + preference gating.
 */
export async function handleNewsNotification(news: NewsItem): Promise<void> {
  const { preferences } = useUserPrefsStore.getState();
  if (!preferences.notifications.newsNotifications) return;

  // Deduplication: skip if already notified for this news id
  if (notifiedIds.has(news.id)) return;

  const body = generateSummary(news, {
    expertiseLevel: preferences.expertiseLevel,
    language: preferences.language,
  });
  const symbols = news.relatedSymbols.join(", ");

  if (Platform.OS === "web") {
    if (
      typeof window.Notification !== "undefined" &&
      window.Notification.permission === "granted"
    ) {
      new window.Notification(`📰 ${symbols || "Market"} Update`, { body });
    }
  } else {
    await Notifications.scheduleNotificationAsync({
      content: {
        title: `📰 ${symbols || "Market"} Update`,
        body,
        data: { newsId: news.id, type: "news", deepLink: `/news/${news.id}` },
        sound: "default",
      },
      trigger: null,
    });
  }

  // Mark as notified
  notifiedIds.add(news.id);
}

/**
 * Check a list of news items and send notifications for high-impact ones
 * that relate to the user's portfolio symbols.
 */
export async function processNewsNotifications(
  newsItems: NewsItem[],
  userSymbols: string[],
): Promise<void> {
  const symbolSet = new Set(userSymbols.map((s) => s.toUpperCase()));

  for (const item of newsItems) {
    if (item.impact !== "high") continue;

    // Targeting: only notify if user holds related stocks
    const isRelevant = item.relatedSymbols.some((s) => symbolSet.has(s.toUpperCase()));
    if (!isRelevant) continue;

    await handleNewsNotification(item);
  }
}

/** Backward-compatible alias */
export const sendNewsNotification = handleNewsNotification;
