/**
 * Tab layout — fully adaptive navigation.
 *
 * Desktop (>1024 web): Full sidebar (240px) + content, no bottom tabs, no header.
 * Tablet  (768–1024 web): Collapsed sidebar (64px rail) + content, no bottom tabs.
 * Mobile  (<768 / native): Bottom tabs + hamburger drawer, proper header.
 *
 * All interactive targets ≥ 44px for touch-friendliness.
 * Fonts ≥ 14px on mobile for readability.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { BackHandler, Platform, Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { MobileDrawer } from "@/components/MobileDrawer";
import WebSidebar from "@/components/WebSidebar";
import { AnimatedTabBar } from "@/components/ui/AnimatedTabBar";
import { useKeyboardShortcuts, Shortcut } from "@/hooks/useKeyboardShortcuts";
import { useResponsive } from "@/hooks/useResponsive";
import { trackEvent } from "@/lib/gtag";
import { useAuthStore } from "@/services/authStore";
import { useThemeStore } from "@/services/themeStore";
import { ExpertiseLevel, useUserPrefsStore } from "@/src/store/userPrefsStore";
import { useTranslation } from "react-i18next";

// ── Shared icon helper ──────────────────────────────────────────────

function TabBarIcon(props: {
  name: React.ComponentProps<typeof FontAwesome>["name"];
  color: string;
}) {
  return <FontAwesome size={24} style={{ marginBottom: -3 }} {...props} />;
}

// ── Layout ──────────────────────────────────────────────────────────

export default function TabLayout() {
  const router = useRouter();
  const logout = useAuthStore((s) => s.logout);
  const token = useAuthStore((s) => s.token);
  const isLoading = useAuthStore((s) => s.isLoading);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const { colors, toggle, mode } = useThemeStore();
  const { showSidebar, showHamburger, fonts } = useResponsive();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();

  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sidebar collapse state — persisted via localStorage on web
  const [sidebarCollapsed, setSidebarCollapsed] = useState<boolean | null>(() => {
    if (Platform.OS !== "web") return null;
    try {
      const saved = localStorage.getItem("sidebar_collapsed");
      return saved === "true";
    } catch { return null; }
  });

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      if (Platform.OS === "web") {
        try { localStorage.setItem("sidebar_collapsed", String(next)); } catch {}
      }
      return next;
    });
  }, []);

  // Keyboard shortcuts: Ctrl+B sidebar, Ctrl+1-5 tab nav, Alt+←/→ browser nav
  const shortcuts = useMemo<Shortcut[]>(() => [
    { key: "b", ctrl: true, handler: toggleSidebar },
    { key: "1", ctrl: true, handler: () => router.push("/(tabs)/") },
    { key: "2", ctrl: true, handler: () => router.push("/(tabs)/dividends") },
    { key: "3", ctrl: true, handler: () => router.push("/(tabs)/market") },
    { key: "4", ctrl: true, handler: () => router.push("/(tabs)/news") },
    { key: "5", ctrl: true, handler: () => router.push("/(tabs)/settings") },
    { key: "ArrowLeft", alt: true, handler: () => { if (router.canGoBack()) router.back(); } },
  ], [toggleSidebar, router]);
  useKeyboardShortcuts(shortcuts);

  // Expertise-based progressive tab disclosure
  const expertiseLevel = useUserPrefsStore((s) => s.preferences.expertiseLevel);

  /** Returns true if the tab should be visible for the current expertise level */
  const tabVisible = (minLevel: ExpertiseLevel): boolean => {
    const order: ExpertiseLevel[] = ["normal", "intermediate", "advanced"];
    return order.indexOf(expertiseLevel) >= order.indexOf(minLevel);
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  // Redirect admin users to admin dashboard on mount
  useEffect(() => {
    if (isAdmin) {
      router.replace("/(tabs)/admin");
    }
  }, [isAdmin]);

  // Redirect to login when token is cleared (session expired)
  useEffect(() => {
    if (!isLoading && !token) {
      router.replace("/(auth)/login");
    }
  }, [token, isLoading]);

  // Android hardware back — go back if possible, otherwise let system handle
  useEffect(() => {
    if (Platform.OS !== "android") return;
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (drawerOpen) {
        setDrawerOpen(false);
        return true;
      }
      if (router.canGoBack()) {
        router.back();
        return true;
      }
      return false; // let Android handle (exit app)
    });
    return () => sub.remove();
  }, [drawerOpen, router]);

  return (
    <View style={[ls.root, { backgroundColor: colors.bgPrimary }]}>
      {/* ── Sidebar (web tablet/desktop only) ── */}
      {showSidebar && (
        <WebSidebar
          collapsed={sidebarCollapsed ?? undefined}
          onToggleCollapse={toggleSidebar}
        />
      )}

      {/* ── Content area ── */}
      <View style={ls.content}>
        <Tabs
          tabBar={(props) => null}
          screenListeners={{
            tabPress: (e) => {
              trackEvent("tab_press", "navigation", e.target?.split("-")[0]);
            },
          }}
          screenOptions={{
            // Bottom tabs are always hidden — navigation via sidebar (web) or drawer (native)
            tabBarStyle: { display: "none", height: 0, overflow: "hidden" as const },
            tabBarHideOnKeyboard: true,
            lazy: true,
            // Keep screens alive when switching tabs — preserves scroll position & state
            freezeOnBlur: true,
            tabBarActiveTintColor: colors.accentPrimary,
            tabBarInactiveTintColor: colors.textMuted,
            // Screen transition animation
            animation: "shift",
            headerStyle: {
              backgroundColor: colors.headerBg,
              ...(Platform.OS === "web"
                ? { height: 56 }
                : {}),
            },
            headerTintColor: colors.textPrimary,
            headerTitleStyle: {
              fontSize: fonts.body,
              fontWeight: "700",
            },
            // Sidebar mode hides header; mobile shows it
            headerShown: !showSidebar,
            // Left: hamburger menu on mobile
            headerLeft: () =>
              showHamburger ? (
                <Pressable
                  onPress={() => setDrawerOpen(true)}
                  style={ls.headerBtn}
                  accessibilityLabel="Open navigation menu"
                >
                  {({ pressed }) => (
                    <FontAwesome
                      name="bars"
                      size={22}
                      color={colors.textPrimary}
                      style={{ opacity: pressed ? 0.5 : 1 }}
                    />
                  )}
                </Pressable>
              ) : null,
            // Right: theme toggle
            headerRight: () =>
              showSidebar ? null : (
                <View style={ls.headerRightRow}>
                  <Pressable onPress={toggle} style={ls.headerBtn}>
                    {({ pressed }) => (
                      <FontAwesome
                        name={mode === "dark" ? "lightbulb-o" : "moon-o"}
                        size={20}
                        color={colors.textSecondary}
                        style={{ opacity: pressed ? 0.5 : 1 }}
                      />
                    )}
                  </Pressable>
                </View>
              ),
          }}
        >
          {/* ── Phone bottom bar: Overview, News, Holdings ── */}
          <Tabs.Screen
            name="index"
            options={{
              title: t("nav.overview"),
              headerShown: false,
              href: isAdmin ? null : undefined,
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="line-chart" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="news"
            options={{
              title: t("nav.news"),
              href: isAdmin ? null : undefined,
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="newspaper-o" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="market"
            options={{
              title: t("nav.market"),
              href: isAdmin ? null : undefined,
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="globe" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="portfolio-analysis"
            options={{
              title: t("nav.holdings"),
              href: isAdmin ? null : undefined,
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="briefcase" color={color} />
              ),
            }}
          />
          {/* ── Remaining tabs: sidebar/drawer only (hidden from phone bottom bar) ── */}
          <Tabs.Screen
            name="transactions"
            options={{
              title: t("nav.transactions"),
              href: isAdmin || !showSidebar ? null : undefined,
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="exchange" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="deposits"
            options={{
              title: t("nav.deposits"),
              href: isAdmin || !showSidebar ? null : undefined,
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="bank" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="trading"
            options={{
              title: t("nav.trading"),
              href: isAdmin || !showSidebar ? null : (tabVisible("intermediate") ? undefined : null),
              tabBarIcon: ({ color }) => <TabBarIcon name="bar-chart-o" color={color} />,
            }}
          />
          <Tabs.Screen
            name="fundamental-analysis"
            options={{
              title: t("tabs.analysis"),
              href: isAdmin || !showSidebar ? null : (tabVisible("intermediate") ? undefined : null),
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="flask" color={color} />
              ),
            }}
          />
          <Tabs.Screen name="two" options={{ href: null, title: "Holdings (Legacy)" }} />
          <Tabs.Screen
            name="portfolio-tracker"
            options={{
              title: t("nav.tracker"),
              href: isAdmin || !showSidebar ? null : undefined,
              tabBarIcon: ({ color }) => <TabBarIcon name="camera" color={color} />,
            }}
          />
          <Tabs.Screen
            name="dividends"
            options={{
              title: t("nav.dividends"),
              headerShown: false,
              href: isAdmin || !showSidebar ? null : undefined,
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="money" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="alerts"
            options={{
              title: t("nav.alerts"),
              href: isAdmin || !showSidebar ? null : (tabVisible("intermediate") ? undefined : null),
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="bell" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="planner"
            options={{
              title: t("nav.planner"),
              href: isAdmin || !showSidebar ? null : undefined,
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="calculator" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="pfm"
            options={{
              title: t("nav.pfm"),
              href: isAdmin || !showSidebar ? null : (tabVisible("advanced") ? undefined : null),
              tabBarIcon: ({ color }) => <TabBarIcon name="pie-chart" color={color} />,
            }}
          />
          <Tabs.Screen
            name="integrity"
            options={{
              title: t("nav.integrity"),
              href: isAdmin || !showSidebar ? null : (tabVisible("advanced") ? undefined : null),
              tabBarIcon: ({ color }) => <TabBarIcon name="stethoscope" color={color} />,
            }}
          />
          <Tabs.Screen
            name="backup"
            options={{
              title: t("nav.backup"),
              href: isAdmin || !showSidebar ? null : (tabVisible("advanced") ? undefined : null),
              tabBarIcon: ({ color }) => <TabBarIcon name="cloud-download" color={color} />,
            }}
          />
          <Tabs.Screen
            name="settings"
            options={{
              title: t("nav.settings"),
              href: isAdmin || !showSidebar ? null : undefined,
              tabBarIcon: ({ color }) => <TabBarIcon name="cog" color={color} />
            }}
          />
          <Tabs.Screen name="holdings" options={{ href: null }} />
          <Tabs.Screen name="add-transaction" options={{ href: null, headerShown: false }} />
          <Tabs.Screen name="add-deposit" options={{ href: null, headerShown: false }} />
          <Tabs.Screen name="add-stock" options={{ href: null, headerShown: false }} />
          <Tabs.Screen
            name="admin"
            options={{
              title: t("nav.admin"),
              href: isAdmin ? undefined : null,
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="shield" color={color} />
              ),
            }}
          />
          {/* If admin, redirect to admin tab on mount */}
        </Tabs>
      </View>

      {/* ── Mobile drawer overlay ── */}
      <MobileDrawer visible={drawerOpen} onClose={() => setDrawerOpen(false)} />
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const ls = StyleSheet.create({
  root: {
    flex: 1,
    flexDirection: "row",
  },
  content: {
    flex: 1,
  },
  headerBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
  },
  headerRightRow: {
    flexDirection: "row",
    alignItems: "center",
    marginRight: 4,
  },
});
