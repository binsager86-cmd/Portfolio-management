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
import { ToastProvider } from "@/components/ui/ToastProvider";
import { useSessionGuard } from "@/hooks/useSessionGuard";
import i18n from "@/lib/i18n/config";
import { queryClient } from "@/lib/queryClient";
import { getStockList } from "@/services/api";
import { useAuthStore } from "@/services/authStore";
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

  // ── Single init effect: theme → OAuth hash check → hydration ───
  // Must be one sequential async flow so nothing can redirect
  // before auth state is fully resolved.
  useEffect(() => {
    async function init() {
      hydrateTheme();
      hydrateUserPrefs();

      // Check for Google OAuth redirect (web only)
      if (Platform.OS === "web" && typeof window !== "undefined") {
        const hash = window.location.hash;
        if (hash && hash.includes("access_token=")) {
          const params = new URLSearchParams(hash.substring(1));
          const accessToken = params.get("access_token");
          if (accessToken) {
            if (__DEV__) console.log("[Layout] Found OAuth access_token in URL hash");
            // Clean the URL so the token isn't visible
            window.history.replaceState(
              null,
              "",
              window.location.pathname + window.location.search,
            );
            // Await the full sign-in flow — this sets token + loading:false
            await googleSignIn(accessToken);
            return; // skip hydration — googleSignIn already set session
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

  // Prefetch stock reference lists (static data) so dropdowns load instantly
  useEffect(() => {
    if (!token) return; // only after login
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

    // Register push token for real-time news notifications
    registerPushToken().catch((err) => {
      if (__DEV__) console.warn("[Push] Registration failed:", err);
    });
  }, [token]);

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
