import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  DarkTheme as NavDark,
  DefaultTheme as NavLight,
  ThemeProvider,
} from "@react-navigation/native";
import { useFonts } from "expo-font";
import { Stack, useRouter, useSegments } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { useEffect } from "react";
import "react-native-reanimated";
import { PaperProvider, MD3DarkTheme, MD3LightTheme } from "react-native-paper";
import { QueryClientProvider } from "@tanstack/react-query";

import { useAuthStore } from "@/services/authStore";
import { useThemeStore } from "@/services/themeStore";
import { queryClient } from "@/lib/queryClient";
import { getStockList } from "@/services/api";

export {
  ErrorBoundary,
} from "expo-router";

export const unstable_settings = {
  initialRouteName: "(tabs)",
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
  const router = useRouter();
  const segments = useSegments();
  const token = useAuthStore((s) => s.token);
  const authLoading = useAuthStore((s) => s.loading);
  const hydrateAuth = useAuthStore((s) => s.hydrate);
  const hydrateTheme = useThemeStore((s) => s.hydrate);
  const themeMode = useThemeStore((s) => s.mode);

  // Hydrate auth + theme from storage on first mount
  useEffect(() => {
    hydrateAuth();
    hydrateTheme();
  }, []);

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
  }, [token]);

  // Redirect based on auth state — only after hydration completes
  useEffect(() => {
    if (authLoading) return;

    const inAuthGroup = segments[0] === "(auth)";

    if (!token && !inAuthGroup) {
      router.replace("/(auth)/login");
    } else if (token && inAuthGroup) {
      router.replace("/(tabs)");
    }
  }, [token, authLoading, segments]);

  // While hydrating, render nothing (keep splash visible)
  if (authLoading) {
    return null;
  }

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
    <QueryClientProvider client={queryClient}>
      <PaperProvider theme={paperTheme}>
        <ThemeProvider value={buildNavTheme(themeMode)}>
          <Stack>
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="modal" options={{ presentation: "modal" }} />
          </Stack>
        </ThemeProvider>
      </PaperProvider>
    </QueryClientProvider>
  );
}
