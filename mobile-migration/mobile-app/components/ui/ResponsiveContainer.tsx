/**
 * ResponsiveContainer — page-level wrapper that applies:
 *   • maxWidth centred on desktop
 *   • breakpoint-aware horizontal padding
 *   • optional ScrollView with pull-to-refresh
 *
 * Usage:
 *   <ResponsiveContainer scrollable refreshing={r} onRefresh={fn}>
 *     <ChildContent />
 *   </ResponsiveContainer>
 */

import React from "react";
import {
  View,
  ScrollView,
  RefreshControl,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { useResponsive } from "@/hooks/useResponsive";
import { useThemeStore } from "@/services/themeStore";

interface Props {
  children: React.ReactNode;
  /** Wrap content in a vertical ScrollView (default true) */
  scrollable?: boolean;
  /** Pull-to-refresh state */
  refreshing?: boolean;
  /** Refresh callback */
  onRefresh?: () => void;
  /** Extra style on the outer container */
  style?: ViewStyle;
  /** Extra style on the content wrapper */
  contentStyle?: ViewStyle;
  /** Disable the maxWidth constraint (e.g. for full-bleed tables) */
  fullWidth?: boolean;
}

export function ResponsiveContainer({
  children,
  scrollable = true,
  refreshing = false,
  onRefresh,
  style,
  contentStyle,
  fullWidth = false,
}: Props) {
  const { spacing, maxContentWidth, isDesktop } = useResponsive();
  const { colors } = useThemeStore();

  const inner: ViewStyle = {
    paddingHorizontal: spacing.pagePx,
    paddingBottom: 40,
    ...(fullWidth
      ? {}
      : {
          maxWidth: maxContentWidth,
          width: "100%" as any,
          alignSelf: "center" as const,
        }),
    ...contentStyle,
  };

  if (scrollable) {
    return (
      <ScrollView
        style={[sty.container, { backgroundColor: colors.bgPrimary }, style]}
        contentContainerStyle={inner}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accentPrimary}
            />
          ) : undefined
        }
      >
        {children}
      </ScrollView>
    );
  }

  return (
    <View style={[sty.container, { backgroundColor: colors.bgPrimary }, style]}>
      <View style={inner}>{children}</View>
    </View>
  );
}

const sty = StyleSheet.create({
  container: { flex: 1 },
});
