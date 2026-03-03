/**
 * MobileDrawer — full-screen slide-in navigation overlay for phones.
 *
 * Triggered by the hamburger button in the mobile header.
 * Shows the same nav items as WebSidebar, with large 44px touch targets,
 * smooth slide animation, and a dimmed backdrop for dismissal.
 */

import React, { useEffect, useRef } from "react";
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ScrollView,
  Animated,
  Dimensions,
  Platform,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter, usePathname } from "expo-router";
import { useAuthStore } from "@/services/authStore";
import { useThemeStore } from "@/services/themeStore";
import { NAV_ITEMS } from "@/components/WebSidebar";

const DRAWER_WIDTH = 280;

interface MobileDrawerProps {
  visible: boolean;
  onClose: () => void;
}

export function MobileDrawer({ visible, onClose }: MobileDrawerProps) {
  const router = useRouter();
  const pathname = usePathname();
  const logout = useAuthStore((s) => s.logout);
  const { colors, toggle, mode } = useThemeStore();

  const slideAnim = useRef(new Animated.Value(-DRAWER_WIDTH)).current;
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(fadeAnim, {
          toValue: 1,
          duration: 250,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start();
    } else {
      Animated.parallel([
        Animated.timing(slideAnim, {
          toValue: -DRAWER_WIDTH,
          duration: 200,
          useNativeDriver: Platform.OS !== "web",
        }),
        Animated.timing(fadeAnim, {
          toValue: 0,
          duration: 200,
          useNativeDriver: Platform.OS !== "web",
        }),
      ]).start();
    }
  }, [visible]);

  const isActive = (navPath: string) => {
    const clean = navPath.replace("/(tabs)", "");
    if (navPath === "/(tabs)") return pathname === "/" || pathname === "/(tabs)";
    return pathname === clean || pathname === navPath;
  };

  const handleNav = (path: string) => {
    router.push(path as any);
    onClose();
  };

  const handleLogout = async () => {
    await logout();
    router.replace("/(auth)/login");
    onClose();
  };

  if (!visible) return null;

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="box-none">
      {/* Backdrop */}
      <Animated.View style={[s.backdrop, { opacity: fadeAnim }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      {/* Drawer */}
      <Animated.View
        style={[
          s.drawer,
          {
            backgroundColor: colors.bgSecondary,
            borderRightColor: colors.borderColor,
            transform: [{ translateX: slideAnim }],
          },
        ]}
      >
        {/* Header */}
        <View style={s.drawerHeader}>
          <View style={s.headerBrand}>
            <FontAwesome name="pie-chart" size={24} color={colors.accentPrimary} />
            <Text style={[s.headerTitle, { color: colors.textPrimary }]}>Portfolio</Text>
          </View>
          <Pressable
            onPress={onClose}
            style={s.closeBtn}
            accessibilityLabel="Close menu"
          >
            <FontAwesome name="times" size={22} color={colors.textSecondary} />
          </Pressable>
        </View>

        {/* Nav Links */}
        <ScrollView style={s.navScroll} showsVerticalScrollIndicator={false}>
          {NAV_ITEMS.map((item) => {
            const active = isActive(item.path);
            return (
              <React.Fragment key={item.path}>
                {item.section && (
                  <Text style={[s.sectionLabel, { color: colors.textMuted }]}>
                    {item.section}
                  </Text>
                )}
                <Pressable
                  onPress={() => handleNav(item.path)}
                  style={({ pressed }) => [
                    s.navItem,
                    {
                      backgroundColor: active
                        ? colors.accentPrimary + "18"
                        : pressed
                        ? colors.bgCardHover
                        : "transparent",
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
                    {item.label}
                  </Text>
                </Pressable>
              </React.Fragment>
            );
          })}
        </ScrollView>

        {/* Bottom actions */}
        <View style={[s.bottomSection, { borderTopColor: colors.borderColor }]}>
          <Pressable
            onPress={() => { toggle(); }}
            style={({ pressed }) => [
              s.actionBtn,
              { backgroundColor: pressed ? colors.bgCardHover : "transparent" },
            ]}
          >
            <FontAwesome
              name={mode === "dark" ? "sun-o" : "moon-o"}
              size={20}
              color={colors.textSecondary}
              style={s.navIcon}
            />
            <Text style={[s.navLabel, { color: colors.textSecondary }]}>
              {mode === "dark" ? "Light Mode" : "Dark Mode"}
            </Text>
          </Pressable>

          <Pressable
            onPress={handleLogout}
            style={({ pressed }) => [
              s.actionBtn,
              { backgroundColor: pressed ? colors.bgCardHover : "transparent" },
            ]}
          >
            <FontAwesome name="sign-out" size={20} color={colors.danger} style={s.navIcon} />
            <Text style={[s.navLabel, { color: colors.danger }]}>Sign Out</Text>
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
    paddingTop: Platform.OS === "web" ? 0 : 48,
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
