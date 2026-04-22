/**
 * MobileDrawer — full-screen slide-in navigation overlay for phones.
 *
 * Triggered by the hamburger button in the mobile header.
 * Uses Reanimated spring physics for natural feel, with staggered
 * nav item entrance animations.
 */

import { NAV_ITEMS } from "@/components/WebSidebar";
import type { ThemePalette } from "@/constants/theme";
import { useAuthStore } from "@/services/authStore";
import { useThemeStore } from "@/services/themeStore";
import { ExpertiseLevel, useUserPrefsStore } from "@/src/store/userPrefsStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { usePathname, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
  ViewStyle,
} from "react-native";
import Animated, {
    useAnimatedStyle,
    useSharedValue,
    withDelay,
    withSpring,
    withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { Motion } from "@/constants/motion";

const DRAWER_WIDTH = 280;

interface MobileDrawerProps {
  visible: boolean;
  onClose: () => void;
}

/** Individual nav item with staggered entrance */
function DrawerNavItem({
  item,
  index,
  active,
  colors,
  onPress,
  t,
  visible,
}: {
  item: (typeof NAV_ITEMS)[number];
  index: number;
  active: boolean;
  colors: ThemePalette;
  onPress: () => void;
  t: (key: string) => string;
  visible: boolean;
}) {
  const translateX = useSharedValue(-40);
  const opacity = useSharedValue(0);
  const pressScale = useSharedValue(1);

  useEffect(() => {
    if (visible) {
      const delay = 60 + index * 35;
      translateX.value = withDelay(delay, withSpring(0, Motion.spring.gentle));
      opacity.value = withDelay(delay, withTiming(1, { duration: Motion.duration.normal }));
    } else {
      translateX.value = -40;
      opacity.value = 0;
    }
  }, [visible]);

  const animStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }, { scale: pressScale.value }],
    opacity: opacity.value,
  }));

  const handlePressIn = useCallback(() => {
    pressScale.value = withSpring(0.97, Motion.spring.snappy);
  }, []);
  const handlePressOut = useCallback(() => {
    pressScale.value = withSpring(1, Motion.spring.gentle);
  }, []);

  return (
    <Animated.View style={animStyle}>
      {item.section && (
        <Text style={[s.sectionLabel, { color: colors.textMuted }]}>
          {t('nav.' + item.section)}
        </Text>
      )}
      <Pressable
        onPress={onPress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        accessibilityRole="menuitem"
        accessibilityLabel={t('nav.' + item.label)}
        accessibilityState={{ selected: active }}
        style={[
          s.navItem,
          {
            backgroundColor: active
              ? colors.accentPrimary + "18"
              : "transparent",
            borderLeftColor: active ? colors.accentPrimary : "transparent",
            borderLeftWidth: 3,
          },
        ]}
      >
        <FontAwesome
          name={item.icon}
          size={20}
          color={active ? colors.accentPrimary : colors.textSecondary}
          style={s.navIcon}
        />
        <Text
          style={[
            s.navLabel,
            {
              color: active ? colors.accentPrimary : colors.textPrimary,
              fontWeight: active ? "700" : "500",
            },
          ]}
        >
          {t('nav.' + item.label)}
        </Text>
      </Pressable>
    </Animated.View>
  );
}

export function MobileDrawer({ visible, onClose }: MobileDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { t } = useTranslation();
  const logout = useAuthStore((s) => s.logout);
  const isAdmin = useAuthStore((s) => s.isAdmin);
  const { colors, toggle, mode } = useThemeStore();
  const insets = useSafeAreaInsets();

  const expertiseLevel = useUserPrefsStore((s) => s.preferences.expertiseLevel);
  const levelOrder: ExpertiseLevel[] = ["normal", "intermediate", "advanced"];

  const navItems = useMemo(
    () => NAV_ITEMS.filter((item) => {
      // Hide admin-only items from non-admin users
      if (item.adminOnly && !isAdmin) return false;
      // Check expertise level
      const minLevel = item.minLevel ?? "normal";
      return levelOrder.indexOf(expertiseLevel) >= levelOrder.indexOf(minLevel);
    }),
    [isAdmin, expertiseLevel],
  );

  // Reanimated shared values
  const drawerX = useSharedValue(-DRAWER_WIDTH);
  const backdropOpacity = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      drawerX.value = withSpring(0, Motion.spring.gentle);
      backdropOpacity.value = withTiming(1, { duration: Motion.duration.normal });
    } else {
      drawerX.value = withSpring(-DRAWER_WIDTH, Motion.spring.smooth);
      backdropOpacity.value = withTiming(0, { duration: Motion.duration.normal });
    }
  }, [visible]);

  const drawerStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: drawerX.value }],
  }));

  const backdropStyle = useAnimatedStyle(() => ({
    opacity: backdropOpacity.value,
  }));

  const isActive = (navPath: string) => {
    const clean = navPath.replace("/(tabs)", "");
    if (navPath === "/(tabs)") return pathname === "/" || pathname === "/(tabs)";
    return pathname === clean || pathname === navPath;
  };

  const handleNav = (path: string) => {
    router.push(path as never);
    onClose();
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
    onClose();
  };

  if (!visible) return null;

  return (
    <View
      style={[StyleSheet.absoluteFill, Platform.OS === "web" ? ({ pointerEvents: "none" } as ViewStyle) : null]}
      pointerEvents={Platform.OS === "web" ? undefined : "box-none"}
    >
      {/* Backdrop */}
      <Animated.View style={[s.backdrop, backdropStyle]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" accessibilityLabel="Close menu" />
      </Animated.View>

      {/* Drawer */}
      <Animated.View
        style={[
          s.drawer,
          {
            backgroundColor: colors.bgSecondary,
            borderRightColor: colors.borderColor,
            paddingTop: Platform.OS === "web" ? 0 : insets.top,
          },
          drawerStyle,
        ]}
      >
        {/* Header */}
        <View style={s.drawerHeader}>
          <View style={s.headerBrand}>
            <FontAwesome name="pie-chart" size={24} color={colors.accentPrimary} />
            <Text style={[s.headerTitle, { color: colors.textPrimary }]}>{t('nav.portfolio')}</Text>
          </View>
          <Pressable
            onPress={onClose}
            style={s.closeBtn}
            accessibilityLabel="Close menu"
          >
            <FontAwesome name="times" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Nav Links — staggered entrance */}
        <ScrollView style={s.navScroll} showsVerticalScrollIndicator={false}>
          {navItems.map((item, idx) => (
            <DrawerNavItem
              key={item.path}
              item={item}
              index={idx}
              active={isActive(item.path)}
              colors={colors}
              onPress={() => handleNav(item.path)}
              t={t}
              visible={visible}
            />
          ))}
        </ScrollView>

        {/* Bottom actions */}
        <View style={[s.bottomSection, { borderTopColor: colors.borderColor, paddingBottom: Math.max(16, insets.bottom) }]}>
          <Pressable
            onPress={() => { toggle(); }}
            accessibilityRole="switch"
            accessibilityLabel={mode === "dark" ? "Switch to light mode" : "Switch to dark mode"}
            accessibilityState={{ checked: mode === "dark" }}
            style={({ pressed }) => [
              s.actionBtn,
              { backgroundColor: pressed ? colors.bgCardHover : "transparent" },
            ]}
          >
            <FontAwesome
              name={mode === "dark" ? "lightbulb-o" : "moon-o"}
              size={20}
              color={colors.textSecondary}
              style={s.navIcon}
            />
            <Text style={[s.navLabel, { color: colors.textSecondary }]}>
              {mode === "dark" ? t('nav.lightMode') : t('nav.darkMode')}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleLogout}
            accessibilityRole="button"
            accessibilityLabel="Sign out"
            style={({ pressed }) => [
              s.actionBtn,
              { backgroundColor: pressed ? colors.bgCardHover : "transparent" },
            ]}
          >
            <FontAwesome name="sign-out" size={20} color={colors.danger} style={s.navIcon} />
            <Text style={[s.navLabel, { color: colors.danger }]}>{t('nav.signOut')}</Text>
          </Pressable>
        </View>
      </Animated.View>
    </View>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(0,0,0,0.5)",
  },
  drawer: {
    position: "absolute",
    top: 0,
    left: 0,
    bottom: 0,
    width: DRAWER_WIDTH,
    borderRightWidth: 1,
    zIndex: 100,
  },
  drawerHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 20,
    paddingVertical: 16,
  },
  headerBrand: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "800",
  },
  closeBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 22,
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
    paddingTop: 18,
    paddingBottom: 6,
  },
  navItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 13,
    paddingHorizontal: 20,
    minHeight: 48,
  },
  navIcon: {
    width: 28,
    textAlign: "center",
    marginRight: 14,
  },
  navLabel: {
    fontSize: 16,
  },
  bottomSection: {
    borderTopWidth: 1,
    paddingTop: 12,
    paddingBottom: 16,
    gap: 4,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 20,
    borderRadius: 8,
    marginHorizontal: 8,
    minHeight: 48,
  },
});
