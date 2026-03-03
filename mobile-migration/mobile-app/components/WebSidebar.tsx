/**
 * WebSidebar — vertical sidebar navigation for web / desktop / tablet.
 *
 * Desktop  (>1024): Full 240px sidebar with labels
 * Tablet   (768–1024): Collapsed 64px icon-only rail, expandable on hover
 *
 * The sidebar is always visible on web ≥768px; on mobile (<768) the
 * parent layout renders a MobileDrawer overlay instead.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Platform,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter, usePathname } from "expo-router";
import { useAuthStore } from "@/services/authStore";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import type { ThemePalette } from "@/constants/theme";

// ── Nav items ───────────────────────────────────────────────────────

export interface NavItem {
  label: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  path: string;
  /** Group separator label shown above this item */
  section?: string;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "Overview", icon: "line-chart", path: "/(tabs)", section: "Dashboard" },
  { label: "Holdings", icon: "briefcase", path: "/(tabs)/portfolio-analysis" },
  { label: "Transactions", icon: "exchange", path: "/(tabs)/transactions" },
  { label: "Deposits", icon: "bank", path: "/(tabs)/deposits" },
  { label: "Trading", icon: "bar-chart-o", path: "/(tabs)/trading", section: "Analysis" },
  { label: "Fundamentals", icon: "flask", path: "/(tabs)/fundamental-analysis" },
  { label: "Tracker", icon: "camera", path: "/(tabs)/portfolio-tracker" },
  { label: "Dividends", icon: "money", path: "/(tabs)/dividends" },
  { label: "Add Stock", icon: "plus-square", path: "/(tabs)/add-stock", section: "Management" },
  { label: "Planner", icon: "calculator", path: "/(tabs)/planner" },
  { label: "Integrity", icon: "stethoscope", path: "/(tabs)/integrity", section: "System" },
  { label: "Backup", icon: "cloud-download", path: "/(tabs)/backup" },
  { label: "Settings", icon: "cog", path: "/(tabs)/settings" },
];

// ── Widths ───────────────────────────────────────────────────────────
export const SIDEBAR_WIDTH_FULL = 240;
export const SIDEBAR_WIDTH_RAIL = 64;

// ── Component ───────────────────────────────────────────────────────

interface WebSidebarProps {
  /** Force collapsed (icon-only) mode */
  collapsed?: boolean;
  /** Callback when user clicks the collapse/expand toggle */
  onToggleCollapse?: () => void;
}

export default function WebSidebar({ collapsed: collapsedProp, onToggleCollapse }: WebSidebarProps = {}) {
  const router = useRouter();
  const pathname = usePathname();
  const logout = useAuthStore((s) => s.logout);
  const { colors, toggle, mode } = useThemeStore();
  const { isTablet, isDesktop } = useResponsive();

  // Auto-collapse on tablet unless prop overrides
  const isCollapsed = collapsedProp ?? isTablet;
  const sidebarWidth = isCollapsed ? SIDEBAR_WIDTH_RAIL : SIDEBAR_WIDTH_FULL;

  const handleLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
  };

  const isActive = (navPath: string) => {
    const clean = navPath.replace("/(tabs)", "");
    if (navPath === "/(tabs)") return pathname === "/" || pathname === "/(tabs)";
    return pathname === clean || pathname === navPath;
  };

  const handleNav = (path: string) => {
    router.push(path as any);
  };

  return (
    <View
      style={[
        s.sidebar,
        {
          width: sidebarWidth,
          backgroundColor: colors.bgSecondary,
          borderRightColor: colors.borderColor,
        },
      ]}
    >
      {/* ── Brand / Logo ── */}
      <Pressable
        style={[s.brand, isCollapsed && s.brandCollapsed]}
        onPress={onToggleCollapse}
        accessibilityLabel={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
      >
        <FontAwesome name="pie-chart" size={isCollapsed ? 24 : 28} color={colors.accentPrimary} />
        {!isCollapsed && (
          <Text style={[s.brandText, { color: colors.textPrimary }]}>Portfolio</Text>
        )}
      </Pressable>

      {/* ── Scrollable Nav Links ── */}
      <ScrollView style={s.navScroll} showsVerticalScrollIndicator={false}>
        {NAV_ITEMS.map((item) => {
          const active = isActive(item.path);
          return (
            <React.Fragment key={item.path}>
              {/* Section header (only in expanded mode) */}
              {item.section && !isCollapsed && (
                <Text
                  style={[
                    s.sectionLabel,
                    { color: colors.textMuted },
                  ]}
                >
                  {item.section}
                </Text>
              )}
              <Pressable
                onPress={() => handleNav(item.path)}
                style={({ pressed }) => [
                  s.navItem,
                  isCollapsed && s.navItemCollapsed,
                  {
                    backgroundColor: active
                      ? colors.accentPrimary + "18"
                      : pressed
                      ? colors.bgCardHover
                      : "transparent",
                    borderLeftColor: active ? colors.accentPrimary : "transparent",
                  },
                ]}
                accessibilityLabel={item.label}
              >
                <FontAwesome
                  name={item.icon}
                  size={18}
                  color={active ? colors.accentPrimary : colors.textSecondary}
                  style={s.navIcon}
                />
                {!isCollapsed && (
                  <Text
                    style={[
                      s.navLabel,
                      {
                        color: active ? colors.accentPrimary : colors.textSecondary,
                        fontWeight: active ? "700" : "500",
                      },
                    ]}
                  >
                    {item.label}
                  </Text>
                )}
              </Pressable>
            </React.Fragment>
          );
        })}
      </ScrollView>

      {/* ── Bottom actions ── */}
      <View style={[s.bottomSection, { borderTopColor: colors.borderColor }]}>
        <Pressable
          onPress={toggle}
          style={({ pressed }) => [
            s.actionBtn,
            isCollapsed && s.actionBtnCollapsed,
            { backgroundColor: pressed ? colors.bgCardHover : "transparent" },
          ]}
          accessibilityLabel={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          <FontAwesome
            name={mode === "dark" ? "sun-o" : "moon-o"}
            size={18}
            color={colors.textSecondary}
            style={s.navIcon}
          />
          {!isCollapsed && (
            <Text style={[s.navLabel, { color: colors.textSecondary }]}>
              {mode === "dark" ? "Light Mode" : "Dark Mode"}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={handleLogout}
          style={({ pressed }) => [
            s.actionBtn,
            isCollapsed && s.actionBtnCollapsed,
            { backgroundColor: pressed ? colors.bgCardHover : "transparent" },
          ]}
          accessibilityLabel="Sign out"
        >
          <FontAwesome
            name="sign-out"
            size={18}
            color={colors.danger}
            style={s.navIcon}
          />
          {!isCollapsed && (
            <Text style={[s.navLabel, { color: colors.danger }]}>Sign Out</Text>
          )}
        </Pressable>
      </View>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const SIDEBAR_WIDTH = SIDEBAR_WIDTH_FULL; // backward compat export

const s = StyleSheet.create({
  sidebar: {
    borderRightWidth: 1,
    paddingTop: 24,
    paddingBottom: 16,
  },
  brand: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingBottom: 20,
    gap: 12,
  },
  brandCollapsed: {
    justifyContent: "center",
    paddingHorizontal: 0,
  },
  brandText: {
    fontSize: 22,
    fontWeight: "800",
    letterSpacing: -0.3,
  },
  navScroll: {
    flex: 1,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 4,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 11,
    paddingHorizontal: 20,
    borderLeftWidth: 3,
    marginBottom: 1,
    minHeight: 44,
  },
  navItemCollapsed: {
    justifyContent: "center",
    paddingHorizontal: 0,
    borderLeftWidth: 0,
  },
  navIcon: {
    width: 24,
    textAlign: "center",
    marginRight: 12,
  },
  navLabel: {
    fontSize: 15,
  },
  bottomSection: {
    borderTopWidth: 1,
    paddingTop: 12,
    gap: 2,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderRadius: 6,
    marginHorizontal: 8,
    minHeight: 44,
  },
  actionBtnCollapsed: {
    justifyContent: "center",
    paddingHorizontal: 0,
    marginHorizontal: 0,
  },
});

export { SIDEBAR_WIDTH };
