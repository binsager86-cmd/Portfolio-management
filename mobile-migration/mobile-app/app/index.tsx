/**
 * Root index — auth-aware entry point.
 *
 * When the user visits "/", this screen checks auth state and redirects
 * to the login page (unauthenticated) or the main tabs (authenticated).
 *
 * This exists because expo-router resolves "/" to the first available
 * index file, and without it the router falls through to (tabs)/index.tsx
 * which shows the portfolio overview before auth is resolved.
 */
import { Redirect } from "expo-router";

import { useAuthStore } from "@/services/authStore";

export default function Index() {
  const token = useAuthStore((s) => s.token);
  const isLoading = useAuthStore((s) => s.isLoading);

  // Wait for auth hydration before redirecting
  if (isLoading) {
    return null;
  }

  if (token) {
    return <Redirect href="/(tabs)" />;
  }

  return <Redirect href="/(auth)/login" />;
}
