/**
 * DataScreen — standardized layout for data-display screens.
 *
 * Manages three states:
 *   1. Loading  → <LoadingScreen>
 *   2. Error    → <ErrorScreen> with retry
 *   3. Data     → renders children with optional pull-to-refresh
 *
 * Used by: holdings, portfolio overview, analytics, etc.
 */

import React, { ReactNode } from "react";
import {
  View,
  ScrollView,
  RefreshControl,
  StyleSheet,
  ViewStyle,
} from "react-native";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { ErrorScreen } from "@/components/ui/ErrorScreen";

// ── Types ───────────────────────────────────────────────────────────

export interface DataScreenProps {
  /** Show the loading spinner */
  loading: boolean;
  /** Error message string (renders ErrorScreen when truthy) */
  error?: string | null;
  /** Called when user presses "Retry" on the error screen or pulls to refresh */
  onRetry?: () => void;
  /** Loading message (passed to LoadingScreen) */
  loadingMessage?: string;

  // ── Pull-to-refresh ───────────────────────────────────────────
  /** Enable pull-to-refresh (requires onRetry) */
  refreshable?: boolean;
  /** Is a background refresh in progress? */
  isRefreshing?: boolean;

  // ── Content ───────────────────────────────────────────────────
  /** Screen content rendered once data is available */
  children: ReactNode;
  /** Use FlatList/SectionList instead of ScrollView? Pass true to skip the built-in ScrollView wrapper */
  bare?: boolean;
  /** Additional style applied to the ScrollView content container */
  contentStyle?: ViewStyle;
  /** Header rendered above children but below loading/error states */
  header?: ReactNode;
}

// ── Component ───────────────────────────────────────────────────────

export function DataScreen({
  loading,
  error,
  onRetry,
  loadingMessage,
  refreshable = false,
  isRefreshing = false,
  children,
  bare = false,
  contentStyle,
  header,
}: DataScreenProps) {
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();

  // ── Loading state ─────────────────────────────────────────────
  if (loading && !isRefreshing) {
    return <LoadingScreen message={loadingMessage} />;
  }

  // ── Error state ───────────────────────────────────────────────
  if (error) {
    return <ErrorScreen message={error} onRetry={onRetry} />;
  }

  // ── Bare mode (caller provides own scroll / list) ─────────────
  if (bare) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.bgPrimary }]}>
        {header}
        {children}
      </View>
    );
  }

  // ── Standard scrollable content ───────────────────────────────
  return (
    <ScrollView
      style={[styles.flex, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={[
        styles.scroll,
        isDesktop && { maxWidth: 960, alignSelf: "center" as const, width: "100%" },
        contentStyle,
      ]}
      refreshControl={
        refreshable && onRetry ? (
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={onRetry}
            tintColor={colors.accentPrimary}
            colors={[colors.accentPrimary]}
          />
        ) : undefined
      }
    >
      {header}
      {children}
    </ScrollView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scroll: {
    padding: 20,
    paddingBottom: 60,
  },
});
