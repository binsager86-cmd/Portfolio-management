import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
    DarkTheme as NavDark,
    DefaultTheme as NavLight,
    ThemeProvider,
} from "@react-navigation/native";
import { QueryClientProvider } from "@tanstack/react-query";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { I18nManager, Platform, View } from "react-native";
import { MD3DarkTheme, MD3LightTheme, PaperProvider } from "react-native-paper";
import "react-native-reanimated";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AppErrorBoundary } from "@/components/ui/ErrorBoundary";
import { NetworkBanner } from "@/components/ui/NetworkBanner";
import { ToastProvider } from "@/components/ui/ToastProvider";
import { useAuthCacheSync } from "@/hooks/useAuthCacheSync";
import { useOfflineSync } from "@/hooks/useOfflineSync";
import { usePageViewTracking } from "@/hooks/usePageViewTracking";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import { analytics } from "@/lib/analytics";
import i18n from "@/lib/i18n/config";
import { queryClient } from "@/lib/queryClient";
import { getHoldings, getOverview, getStockList } from "@/services/api";
import { useAuthStore } from "@/services/authStore";
import { marketApi } from "@/services/market/marketApi";
import { newsApi } from "@/services/news/newsApi";
import { registerPushToken } from "@/services/notifications/pushTokenService";
import { useThemeStore } from "@/services/themeStore";
import { useUserPrefsStore } from "@/src/store/userPrefsStore";

export {
    ErrorBoundary
} from "expo-router";

export const unstable_settings = {
  initialRouteName: "index",
};

SplashScreen.preventAutoHideAsync();

// ── Navigation themes derived from our palette ──────────────────────

function buildNavTheme(mode: "light" | "dark") {
  const base = mode === "dark" ? NavDark : NavLight;
  if (mode === "dark") {
    return {
      ...base,
      colors: {
        ...base.colors,
        background: "#0a0a15",
        card: "#121220",
        text: "#e6e6f0",
        border: "rgba(255,255,255,0.08)",
        primary: "#8a2be2",
      },
    };
  }
  return {
    ...base,
    colors: {
      ...base.colors,
      background: "#f8fafc",
      card: "#ffffff",
      text: "#1e293b",
      border: "rgba(203,213,225,0.6)",
      primary: "#6366f1",
    },
  };
}

export default function RootLayout() {
  const [loaded, error] = useFonts({
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    SpaceMono: require("../assets/fonts/SpaceMono-Regular.ttf"),
    ...FontAwesome.font,
  });

  useEffect(() => {
    if (error) throw error;
  }, [error]);

  useEffect(() => {
    if (loaded) {
      SplashScreen.hideAsync();
    }
  }, [loaded]);

  if (!loaded) {
    return null;
  }

  return <RootLayoutNav />;
}

function RootLayoutNav() {
  const token = useAuthStore((s) => s.token);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const googleSignIn = useAuthStore((s) => s.googleSignIn);
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const themeMode = useThemeStore((s) => s.mode);
  const hydrateUserPrefs = useUserPrefsStore((s) => s.hydrate);
  const language = useUserPrefsStore((s) => s.preferences.language);

  // ── Session guard: periodic heartbeat + focus re-validation ────
  useSessionGuard();

  // ── Google Analytics: track page views on route changes (web) ──
  usePageViewTracking();

  // ── Single init effect: theme → OAuth hash check → hydration ───
  // Must be one sequential async flow so nothing can redirect
  // before auth state is fully resolved.
  useEffect(() => {
    async function init() {
      hydrateTheme();
      hydrateUserPrefs();
      analytics.init();

      // Check for Google OAuth redirect (web only)
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const hash = window.location.hash;
        if (hash && hash.includes("access_token=")) {
          const params = new URLSearchParams(hash.substring(1));
          const accessToken = params.get("access_token");
          const returnedState = params.get("state");
          // CSRF defence: only accept the token if we initiated an OAuth
          // request in this session AND the returned state matches the
          // value we stashed in lib/googleAuth.ts. Drop everything
          // otherwise — protects against attacker-crafted hash injection.
          let expectedState: string | null = null;
          try { expectedState = window.sessionStorage.getItem("google_oauth_state"); } catch { /* storage may be disabled */ }
          // Always clean the URL so the token isn't visible / replayable.
          window.history.replaceState(
            null,
            "",
            window.location.pathname + window.location.search,
          );
          try { window.sessionStorage.removeItem("google_oauth_state"); } catch { /* noop */ }
          if (
            accessToken &&
            expectedState &&
            returnedState &&
            expectedState === returnedState
          ) {
            // Await the full sign-in flow — this sets token + loading:false
            await googleSignIn(accessToken);
            return; // skip hydration — googleSignIn already set session
          }
          if (__DEV__ && accessToken) {
            console.warn("[OAuth] Discarded callback: state mismatch or no pending request.");
          }
        }
      }

      // Normal path: hydrate from stored tokens (awaited so redirect
      // effect cannot fire before hydration finishes)
      await hydrateAuth();
    }
    init();
  }, []);

  // Sync i18n language + RTL direction when userPrefsStore language changes
  useEffect(() => {
    if (language && i18n.language !== language) {
      i18n.changeLanguage(language);
    }
    const shouldBeRTL = language === "ar";
    if (I18nManager.isRTL !== shouldBeRTL) {
      I18nManager.allowRTL(shouldBeRTL);
      I18nManager.forceRTL(shouldBeRTL);
    }
  }, [language]);



  // Prefetch critical data on login so first screens render instantly
  useEffect(() => {
    if (!token) return; // only after login

    // Portfolio overview — the first thing the user sees
    queryClient.prefetchQuery({
      queryKey: ["portfolio-overview", undefined],
      queryFn: getOverview,
      staleTime: 30_000,
    });

    // Stock reference lists (static data) so dropdowns load instantly
    queryClient.prefetchQuery({
      queryKey: ["stock-list", "kuwait"],
      queryFn: () => getStockList({ market: "kuwait" }),
      staleTime: Infinity,
    });
    queryClient.prefetchQuery({
      queryKey: ["stock-list", "us"],
      queryFn: () => getStockList({ market: "us" }),
      staleTime: Infinity,
    });

    // Next-likely screens: prefetch holdings, news, and market
    // so navigating feels instant instead of showing skeletons
    queryClient.prefetchQuery({
      queryKey: ["holdings", undefined],
      queryFn: () => getHoldings(),
      staleTime: 30_000,
    });
    queryClient.prefetchQuery({
      queryKey: ["news", "feed", {}],
      queryFn: () => newsApi.getFeed({ limit: 15 }),
      staleTime: 5 * 60_000,
    });
    queryClient.prefetchQuery({
      queryKey: ["market", "summary"],
      queryFn: () => marketApi.getSummary(),
      staleTime: 5 * 60_000,
    });

    // Register push token for real-time news notifications
    registerPushToken().catch((err) => {
      analytics.logEvent("push_registration_failed", {
        message: err instanceof Error ? err.message : String(err),
      });
    });
  }, [token]);

  // Foreground push handler: when a news push arrives while the app is open,
  // invalidate the news feed query so the new article appears immediately
  // instead of waiting for the next stale refetch.
  useEffect(() => {
    if (Platform.OS === "web") return;
    let sub: { remove: () => void } | undefined;
    let cancelled = false;
    (async () => {
      try {
        const Notifications = await import("expo-notifications");
        if (cancelled) return;
        sub = Notifications.addNotificationReceivedListener(() => {
          // Any incoming notification likely means new news; invalidate cheaply.
          // Backend's ETag/Last-Modified short-circuits if it really hasn't changed.
          queryClient.invalidateQueries({ queryKey: ["news"] });
        });
      } catch {
        // expo-notifications not available (e.g. Expo Go limitation) — ignore.
      }
    })();
    return () => {
      cancelled = true;
      sub?.remove();
    };
  }, [queryClient]);

  // Paper theme
  const paperTheme =
    themeMode === "dark"
      ? {
          ...MD3DarkTheme,
          colors: {
            ...MD3DarkTheme.colors,
            primary: "#8a2be2",
            secondary: "#4cc9f0",
            background: "#0a0a15",
            surface: "#1a1a2e",
            surfaceVariant: "#121220",
            onSurface: "#e6e6f0",
            onSurfaceVariant: "#a0a0b0",
            outline: "rgba(255,255,255,0.08)",
            error: "#ff4757",
          },
        }
      : {
          ...MD3LightTheme,
          colors: {
            ...MD3LightTheme.colors,
            primary: "#6366f1",
            secondary: "#3b82f6",
            background: "#f8fafc",
            surface: "#ffffff",
            surfaceVariant: "#f1f5f9",
            onSurface: "#1e293b",
            onSurfaceVariant: "#64748b",
            outline: "rgba(203,213,225,0.6)",
            error: "#ef4444",
          },
        };

  return (
    <SafeAreaProvider>
    <View style={{ flex: 1, direction: language === "ar" ? "rtl" : "ltr" }}>
    <StatusBar style={themeMode === "dark" ? "light" : "dark"} />
    <QueryClientProvider client={queryClient}>
      <OfflineSyncProvider />
      <AuthCacheSyncProvider />
      <PaperProvider theme={paperTheme}>
        <ThemeProvider value={buildNavTheme(themeMode)}>
          <AppErrorBoundary>
            <ToastProvider>
              <Stack>
                <Stack.Screen name="index" options={{ headerShown: false }} />
                <Stack.Screen name="(onboarding)" options={{ headerShown: false }} />
                <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
                <Stack.Screen name="(auth)" options={{ headerShown: false }} />
                <Stack.Screen name="modal" options={{ presentation: "modal" }} />
              </Stack>
            </ToastProvider>
          </AppErrorBoundary>
        </ThemeProvider>
      </PaperProvider>
    </QueryClientProvider>
    </View>
    </SafeAreaProvider>
  );
}

/** Runs useAuthCacheSync inside the QueryClientProvider tree. */
function AuthCacheSyncProvider() {
  useAuthCacheSync();
  return null;
}

/** Runs useOfflineSync + renders NetworkBanner inside QueryClientProvider. */
function OfflineSyncProvider() {
  const isOffline = useOfflineSync();
  return <NetworkBanner isOffline={isOffline} />;
}