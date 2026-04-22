/**
 * Root index — auth-aware entry point.
 *
 * When the user visits "/", this screen checks auth state and redirects
 * to the login page (unauthenticated) or the main tabs (authenticated).
 * First-time users are sent through the onboarding flow.
 *
 * This exists because expo-router resolves "/" to the first available
 * index file, and without it the router falls through to (tabs)/index.tsx
 * which shows the portfolio overview before auth is resolved.
 */
import { Redirect } from "expo-router";
import { useEffect, useState } from "react";
import { Platform } from "react-native";

import { queryClient } from "@/lib/queryClient";
import { useAuthStore } from "@/services/authStore";

const ONBOARDING_KEY = "onboarding_seen";

// ── Platform-aware persistence helpers ──────────────────────────────

async function getFlag(key: string): Promise<boolean> {
  try {
    if (Platform.OS === "web") {
      return localStorage.getItem(key) === "1";
    }
    const SecureStore = await import("expo-secure-store");
    return (await SecureStore.getItemAsync(key)) === "1";
  } catch {
    return false;
  }
}

async function setFlag(key: string): Promise<void> {
  try {
    if (Platform.OS === "web") {
      localStorage.setItem(key, "1");
    } else {
      const SecureStore = await import("expo-secure-store");
      await SecureStore.setItemAsync(key, "1");
    }
  } catch {
    return;
  }
}

export async function markOnboardingSeen(): Promise<void> {
  await setFlag(ONBOARDING_KEY);
}

export default function Index() {
  const token = useAuthStore((s) => s.token);
  const isLoading = useAuthStore((s) => s.isLoading);
  const [onboardingSeen, setOnboardingSeen] = useState<boolean | null>(null);

  useEffect(() => {
    async function check() {
      const seen = await getFlag(ONBOARDING_KEY);
      if (seen) {
        setOnboardingSeen(true);
        return;
      }
      // Existing users (already authenticated before onboarding existed)
      // should skip onboarding and setup wizard — auto-set both flags.
      const { token: currentToken } = useAuthStore.getState();
      if (currentToken) {
        await Promise.all([setFlag(ONBOARDING_KEY), setFlag("onboarding_complete")]);
        setOnboardingSeen(true);
      } else if (Platform.OS === "web") {
        // On web, skip pre-auth onboarding — visitors go straight to login.
        // New users see onboarding AFTER registration (redirected from register screen).
        setOnboardingSeen(true);
      } else {
        setOnboardingSeen(false);
      }
    }
    check();
  }, []);

  // Clear stale authenticated cache when session is gone (e.g. web tab reopen)
  useEffect(() => {
    if (!isLoading && !token) {
      queryClient.clear();
    }
  }, [token, isLoading]);

  // Wait for auth hydration + onboarding check before redirecting
  if (isLoading || onboardingSeen === null) {
    return null;
  }

  if (!onboardingSeen) {
    return <Redirect href="/(onboarding)/welcome" />;
  }

  if (token) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}
