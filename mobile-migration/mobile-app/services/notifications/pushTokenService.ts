/**
 * Push Token Service — registers the device's Expo push token with the backend.
 *
 * Called at app startup (after login) to enable server-initiated push notifications
 * for real-time news alerts on holding stocks.
 */

import * as Notifications from "expo-notifications";
import { Platform } from "react-native";

import { API_BASE_URL } from "@/constants/Config";
import { getToken } from "@/services/tokenStorage";

/**
 * Register for push notifications and send the token to the backend.
 *
 * - Requests notification permissions
 * - Gets the Expo push token
 * - POSTs it to /api/v1/notifications/register-token
 */
export async function registerPushToken(): Promise<string | null> {
  // Web uses a different notification flow
  if (Platform.OS === "web") {
    if (__DEV__) console.log("[Push] Web platform — skipping Expo push token");
    return null;
  }

  // Request permissions
  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== "granted") {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== "granted") {
    if (__DEV__) console.log("[Push] Permission not granted");
    return null;
  }

  // Get the Expo push token
  try {
    const tokenData = await Notifications.getExpoPushTokenAsync();
    const pushToken = tokenData.data;

    if (__DEV__) console.log("[Push] Token:", pushToken);

    // Send to backend
    const jwt = await getToken();
    if (!jwt) {
      if (__DEV__) console.log("[Push] No auth token — skipping registration");
      return pushToken;
    }

    const platform =
      Platform.OS === "ios" ? "ios" : Platform.OS === "android" ? "android" : "web";

    const resp = await fetch(`${API_BASE_URL}/api/v1/notifications/register-token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ token: pushToken, platform }),
    });

    if (resp.ok) {
      if (__DEV__) console.log("[Push] Token registered with backend");
    } else {
      const err = await resp.text();
      console.warn("[Push] Backend registration failed:", resp.status, err);
    }

    return pushToken;
  } catch (error) {
    console.warn("[Push] Registration error:", error);
    return null;
  }
}

/**
 * Unregister push token from the backend (e.g., on logout).
 */
export async function unregisterPushToken(pushToken: string): Promise<void> {
  try {
    const jwt = await getToken();
    if (!jwt) return;

    await fetch(`${API_BASE_URL}/api/v1/notifications/unregister-token`, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${jwt}`,
      },
      body: JSON.stringify({ token: pushToken }),
    });
  } catch (error) {
    console.warn("[Push] Unregister error:", error);
  }
}
