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

import React, { useState } from "react";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { Tabs, useRouter } from "expo-router";
import { Platform, Pressable, View, Text, StyleSheet } from "react-native";
import { useAuthStore } from "@/services/authStore";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import WebSidebar from "@/components/WebSidebar";
import { MobileDrawer } from "@/components/MobileDrawer";

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
  const { colors, toggle, mode } = useThemeStore();
  const { isDesktop, isTablet, isPhone, showSidebar, showHamburger, touchTarget, fonts } = useResponsive();

  const [drawerOpen, setDrawerOpen] = useState(false);

  const handleLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  return (
    <View style={[ls.root, { backgroundColor: colors.bgPrimary }]}>
      {/* ── Sidebar (web tablet/desktop only) ── */}
      {showSidebar && <WebSidebar />}

      {/* ── Content area ── */}
      <View style={ls.content}>
        <Tabs
          screenOptions={{
            // Hide bottom tab bar when using sidebar; on mobile show it
            tabBarStyle: showSidebar
              ? { display: "none" }
              : {
                  backgroundColor: colors.tabBarBg,
                  borderTopColor: colors.tabBarBorder,
                  height: 56,
                  paddingBottom: Platform.OS === "ios" ? 20 : 6,
                },
            tabBarActiveTintColor: colors.accentPrimary,
            tabBarInactiveTintColor: colors.textMuted,
            tabBarLabelStyle: {
              fontSize: 12,
              fontWeight: "600",
            },
            tabBarIconStyle: {
              marginTop: 4,
            },
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
            // Right: theme toggle + logout
            headerRight: () =>
              showSidebar ? null : (
                <View style={ls.headerRightRow}>
                  <Pressable onPress={toggle} style={ls.headerBtn}>
                    {({ pressed }) => (
                      <FontAwesome
                        name={mode === "dark" ? "sun-o" : "moon-o"}
                        size={20}
                        color={colors.textSecondary}
                        style={{ opacity: pressed ? 0.5 : 1 }}
                      />
                    )}
                  </Pressable>
                  <Pressable onPress={handleLogout} style={ls.headerBtn}>
                    {({ pressed }) => (
                      <FontAwesome
                        name="sign-out"
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
          <Tabs.Screen
            name="index"
            options={{
              title: "Overview",
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="line-chart" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="portfolio-analysis"
            options={{
              title: "Holdings",
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="briefcase" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="transactions"
            options={{
              title: "Transactions",
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="exchange" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="deposits"
            options={{
              title: "Deposits",
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="bank" color={color} />
              ),
            }}
          />
          {/* Additional screens — visible in sidebar/drawer, hidden from bottom tabs */}
          <Tabs.Screen name="trading" options={{ href: null, title: "Trading" }} />
          <Tabs.Screen name="fundamental-analysis" options={{ href: null, title: "Fundamentals" }} />
          <Tabs.Screen name="two" options={{ href: null, title: "Holdings (Legacy)" }} />
          <Tabs.Screen name="portfolio-tracker" options={{ href: null, title: "Tracker" }} />
          <Tabs.Screen name="dividends" options={{ href: null, title: "Dividends" }} />
          <Tabs.Screen name="securities" options={{ href: null, title: "Securities" }} />
          <Tabs.Screen name="planner" options={{ href: null, title: "Planner" }} />
          <Tabs.Screen name="pfm" options={{ href: null, title: "PFM" }} />
          <Tabs.Screen name="integrity" options={{ href: null, title: "Integrity" }} />
          <Tabs.Screen name="backup" options={{ href: null, title: "Backup" }} />
          <Tabs.Screen name="settings" options={{ href: null, title: "Settings" }} />
          <Tabs.Screen name="holdings" options={{ href: null }} />
          <Tabs.Screen name="add-transaction" options={{ href: null, headerShown: false }} />
          <Tabs.Screen name="add-deposit" options={{ href: null, headerShown: false }} />
          <Tabs.Screen name="add-stock" options={{ href: null, headerShown: false }} />
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
