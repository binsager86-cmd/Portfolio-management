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
import React, { useEffect, useState } from "react";
import { Platform, Pressable, StyleSheet, View } from "react-native";

import { MobileDrawer } from "@/components/MobileDrawer";
import WebSidebar from "@/components/WebSidebar";
import { useTransactions } from "@/hooks/queries";
import { useResponsive } from "@/hooks/useResponsive";
import { useAuthStore } from "@/services/authStore";
import { useThemeStore } from "@/services/themeStore";

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
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const { colors, toggle, mode } = useThemeStore();
  const { showSidebar, showHamburger, fonts } = useResponsive();

  const [drawerOpen, setDrawerOpen] = useState(false);

  // Fetch transaction count to determine user level for progressive disclosure
  const { data: txnData } = useTransactions({ page: 1, perPage: 1 });
  const transactionCount = txnData?.count ?? 0;
  const isNewUser = transactionCount === 0;
  const isPowerUser = transactionCount >= 10;

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
            lazy: true,
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
                        name={mode === "dark" ? "lightbulb-o" : "moon-o"}
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
              href: isAdmin ? null : undefined,
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="line-chart" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="portfolio-analysis"
            options={{
              title: "Holdings",
              href: isAdmin ? null : (isNewUser ? null : undefined),
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="briefcase" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="transactions"
            options={{
              title: "Transactions",
              href: isAdmin ? null : undefined,
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="exchange" color={color} />
              ),
            }}
          />
          <Tabs.Screen
            name="deposits"
            options={{
              title: "Deposits",
              href: isAdmin ? null : (isNewUser ? null : undefined),
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="bank" color={color} />
              ),
            }}
          />
          {/* Additional screens — visible in sidebar/drawer, hidden from bottom tabs */}
          <Tabs.Screen name="trading" options={{ href: null, title: "Trading" }} />
          <Tabs.Screen
            name="fundamental-analysis"
            options={{
              title: "Analysis",
              href: isAdmin ? null : (isPowerUser ? undefined : null),
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="flask" color={color} />
              ),
            }}
          />
          <Tabs.Screen name="two" options={{ href: null, title: "Holdings (Legacy)" }} />
          <Tabs.Screen name="portfolio-tracker" options={{ href: null, title: "Tracker" }} />
          <Tabs.Screen
            name="dividends"
            options={{
              title: "Dividends",
              href: isAdmin ? null : (isNewUser ? null : undefined),
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="money" color={color} />
              ),
            }}
          />
          <Tabs.Screen name="securities" options={{ href: null, title: "Securities" }} />
          <Tabs.Screen
            name="planner"
            options={{
              title: "Planner",
              href: isAdmin ? null : (isPowerUser ? undefined : null),
              tabBarIcon: ({ color }) => (
                <TabBarIcon name="calculator" color={color} />
              ),
            }}
          />
          <Tabs.Screen name="pfm" options={{ href: null, title: "PFM" }} />
          <Tabs.Screen name="integrity" options={{ href: null, title: "Integrity" }} />
          <Tabs.Screen name="backup" options={{ href: null, title: "Backup" }} />
          <Tabs.Screen name="financial-extraction" options={{ href: null, title: "Extraction" }} />
          <Tabs.Screen name="settings" options={{ href: null, title: "Settings" }} />
          <Tabs.Screen name="holdings" options={{ href: null }} />
          <Tabs.Screen name="add-transaction" options={{ href: null, headerShown: false }} />
          <Tabs.Screen name="add-deposit" options={{ href: null, headerShown: false }} />
          <Tabs.Screen name="add-stock" options={{ href: null, headerShown: false }} />
          <Tabs.Screen
            name="admin"
            options={{
              title: "Admin",
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
