/**
 * WebSidebar — vertical sidebar navigation for web / desktop / tablet.
 *
 * Desktop  (>1024): Full 240px sidebar with labels
 * Tablet   (768–1024): Collapsed 64px icon-only rail, expandable on hover
 *
 * The sidebar is always visible on web ≥768px; on mobile (<768) the
 * parent layout renders a MobileDrawer overlay instead.
 */

import { useResponsive } from "@/hooks/useResponsive";
import { useAuthStore } from "@/services/authStore";
import { useThemeStore } from "@/services/themeStore";
import { ExpertiseLevel, useUserPrefsStore } from "@/src/store/userPrefsStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { usePathname, useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

// ── Nav items ───────────────────────────────────────────────────────

export interface NavItem {
  label: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  path: string;
  /** Group separator label shown above this item */
  section?: string;
  /** Only show to admin users */
  adminOnly?: boolean;
  /** Minimum expertise level required (default: "normal") */
  minLevel?: ExpertiseLevel;
}

export const NAV_ITEMS: NavItem[] = [
  { label: "overview", icon: "line-chart", path: "/(tabs)", section: "sectionDashboard" },
  { label: "market", icon: "globe", path: "/(tabs)/market" },
  { label: "holdings", icon: "briefcase", path: "/(tabs)/portfolio-analysis" },
  { label: "trading", icon: "bar-chart-o", path: "/(tabs)/trading", section: "sectionAnalysis", minLevel: "normal" },
  { label: "fundamentals", icon: "flask", path: "/(tabs)/fundamental-analysis", minLevel: "normal" },
  { label: "tracker", icon: "camera", path: "/(tabs)/portfolio-tracker" },
  { label: "dividends", icon: "money", path: "/(tabs)/dividends" },
  { label: "transactions", icon: "exchange", path: "/(tabs)/transactions", section: "sectionManagement" },
  { label: "deposits", icon: "bank", path: "/(tabs)/deposits" },
  { label: "alerts", icon: "bell", path: "/(tabs)/alerts", minLevel: "normal" },
  { label: "news", icon: "newspaper-o", path: "/(tabs)/news", minLevel: "normal" },
  { label: "planner", icon: "calculator", path: "/(tabs)/planner", minLevel: "normal" },
  { label: "pfm", icon: "pie-chart", path: "/(tabs)/pfm", minLevel: "advanced" },
  { label: "integrity", icon: "stethoscope", path: "/(tabs)/integrity", section: "sectionSystem", minLevel: "advanced" },
  { label: "backup", icon: "cloud-download", path: "/(tabs)/backup", minLevel: "advanced" },
  { label: "settings", icon: "cog", path: "/(tabs)/settings" },
  { label: "admin", icon: "shield", path: "/(tabs)/admin", section: "sectionAdmin", adminOnly: true },
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
  const { t } = useTranslation();
  const logout = useAuthStore((s) => s.logout);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const { colors, toggle, mode } = useThemeStore();
  const { isTablet } = useResponsive();
  const expertiseLevel = useUserPrefsStore((s) => s.preferences.expertiseLevel);

  const levelOrder: ExpertiseLevel[] = ["normal", "intermediate", "advanced"];
  const navItems = NAV_ITEMS.filter((item) => {
    // Hide admin-only items from non-admin users
    if (item.adminOnly && !isAdmin) return false;
    // Check expertise level
    const minLevel = item.minLevel ?? "normal";
    return levelOrder.indexOf(expertiseLevel) >= levelOrder.indexOf(minLevel);
  });

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
          borderEndColor: colors.borderColor,
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
          <Text style={[s.brandText, { color: colors.textPrimary }]}>{t('nav.portfolio')}</Text>
        )}
      </Pressable>

      {/* ── Scrollable Nav Links ── */}
      <ScrollView style={s.navScroll} showsVerticalScrollIndicator={false}>
        {navItems.map((item) => {
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
                  {t('nav.' + item.section)}
                </Text>
              )}
              <Pressable
                onPress={() => handleNav(item.path)}
                style={({ pressed, hovered }: any) => [
                  s.navItem,
                  isCollapsed && s.navItemCollapsed,
                  {
                    backgroundColor: active
                      ? colors.accentPrimary + "18"
                      : hovered
                      ? colors.bgCardHover
                      : pressed
                      ? colors.bgCardHover
                      : "transparent",
                    borderStartColor: active ? colors.accentPrimary : "transparent",
                  },
                  Platform.OS === "web" && ({ cursor: "pointer", transition: "background-color 0.15s" } as any),
                ]}
                accessibilityLabel={t('nav.' + item.label)}
                accessibilityRole="link"
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
                    {t('nav.' + item.label)}
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
          style={({ pressed, hovered }: any) => [
            s.actionBtn,
            isCollapsed && s.actionBtnCollapsed,
            { backgroundColor: hovered ? colors.bgCardHover : pressed ? colors.bgCardHover : "transparent" },
            Platform.OS === "web" && ({ cursor: "pointer", transition: "background-color 0.15s" } as any),
          ]}
          accessibilityLabel={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
        >
          <FontAwesome
            name={mode === "dark" ? "lightbulb-o" : "moon-o"}
            size={18}
            color={colors.textSecondary}
            style={s.navIcon}
          />
          {!isCollapsed && (
            <Text style={[s.navLabel, { color: colors.textSecondary }]}>
              {mode === "dark" ? t('nav.lightMode') : t('nav.darkMode')}
            </Text>
          )}
        </Pressable>

        <Pressable
          onPress={handleLogout}
          style={({ pressed, hovered }: any) => [
            s.actionBtn,
            isCollapsed && s.actionBtnCollapsed,
            { backgroundColor: hovered ? colors.bgCardHover : pressed ? colors.bgCardHover : "transparent" },
            Platform.OS === "web" && ({ cursor: "pointer", transition: "background-color 0.15s" } as any),
          ]}
          accessibilityLabel={t('nav.signOut')}
        >
          <FontAwesome
            name="sign-out"
            size={18}
            color={colors.danger}
            style={s.navIcon}
          />
          {!isCollapsed && (
            <Text style={[s.navLabel, { color: colors.danger }]}>{t('nav.signOut')}</Text>
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
    borderEndWidth: 1,
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
    borderStartWidth: 3,
    marginBottom: 1,
    minHeight: 44,
  },
  navItemCollapsed: {
    justifyContent: "center",
    paddingHorizontal: 0,
    borderStartWidth: 0,
  },
  navIcon: {
    width: 24,
    textAlign: "center",
    marginEnd: 12,
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

