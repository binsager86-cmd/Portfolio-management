/**
 * DataScreen — standardized layout for data-display screens.
 *
 * Manages four states in priority order:
 *   1. Loading  → skeleton or <LoadingScreen>
 *   2. Error    → <ErrorScreen> with retry
 *   3. Empty    → optional empty state (icon + message + CTA)
 *   4. Data     → renders children with optional pull-to-refresh
 *
 * Provides standard layout slots:
 *   • header  — sticky above content (filters, KPIs)
 *   • children — main scrollable content
 *
 * Used by: holdings, portfolio overview, analytics, etc.
 */

import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { ScreenHeader } from "@/components/ui/ScreenHeader";
import { useResponsive } from "@/hooks/useResponsive";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { ReactNode } from "react";
import {
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
    ViewStyle,
} from "react-native";

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
  /** Custom loading skeleton to render instead of the default LoadingScreen */
  loadingSkeleton?: ReactNode;

  // ── Empty state ───────────────────────────────────────────────
  /** When true (and not loading/error), renders the empty state instead of children */
  empty?: boolean;
  /** Custom empty state node. Falls back to built-in default if not provided */
  emptyContent?: ReactNode;
  /** Title for the built-in empty state (default: "Nothing here yet") */
  emptyTitle?: string;
  /** Description for the built-in empty state */
  emptyDescription?: string;
  /** Icon for the built-in empty state */
  emptyIcon?: React.ComponentProps<typeof FontAwesome>["name"];
  /** CTA button label for the built-in empty state */
  emptyAction?: string;
  /** CTA callback */
  onEmptyAction?: () => void;

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
  /** Standardized page title (rendered as first row if provided) */
  title?: string;
  /** Right-side primary action for title row */
  primaryAction?: ReactNode;
  /** KPI row section shown below title/header */
  kpiRow?: ReactNode;
  /** Filter/search/sort controls row */
  filterRow?: ReactNode;
  /** Secondary actions rendered after main content */
  secondaryActions?: ReactNode;
}

// ── Component ───────────────────────────────────────────────────────

export function DataScreen({
  loading,
  error,
  onRetry,
  loadingMessage,
  loadingSkeleton,
  empty = false,
  emptyContent,
  emptyTitle = "Nothing here yet",
  emptyDescription,
  emptyIcon = "inbox",
  emptyAction,
  onEmptyAction,
  refreshable = false,
  isRefreshing = false,
  children,
  bare = false,
  contentStyle,
  header,
  title,
  primaryAction,
  kpiRow,
  filterRow,
  secondaryActions,
}: DataScreenProps) {
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();

  const renderStructureHeader = () => (
    <>
      {title ? <ScreenHeader title={title} trailing={primaryAction} /> : null}
      {header}
      {kpiRow}
      {filterRow}
    </>
  );

  // ── Loading state ─────────────────────────────────────────────
  if (loading && !isRefreshing) {
    return <>{loadingSkeleton ?? <LoadingScreen message={loadingMessage} />}</>;
  }

  // ── Error state ───────────────────────────────────────────────
  if (error) {
    return <ErrorScreen message={error} onRetry={onRetry} />;
  }

  // ── Empty state ───────────────────────────────────────────────
  if (empty) {
    if (emptyContent) {
      return (
        <View style={[styles.flex, { backgroundColor: colors.bgPrimary }]}>
          {renderStructureHeader()}
          {emptyContent}
        </View>
      );
    }
    return (
      <View style={[styles.flex, styles.emptyContainer, { backgroundColor: colors.bgPrimary }]}>
        {renderStructureHeader()}
        <View style={styles.emptyBody}>
          <View style={[styles.emptyIconBox, { backgroundColor: colors.accentPrimary + "12" }]}>
            <FontAwesome name={emptyIcon} size={36} color={colors.accentPrimary} />
          </View>
          <Text style={[styles.emptyTitle, { color: colors.textPrimary }]}>{emptyTitle}</Text>
          {emptyDescription && (
            <Text style={[styles.emptyDesc, { color: colors.textSecondary }]}>{emptyDescription}</Text>
          )}
          {emptyAction && onEmptyAction && (
            <Pressable
              onPress={onEmptyAction}
              style={[styles.emptyBtn, { backgroundColor: colors.accentPrimary }]}
            >
              <Text style={styles.emptyBtnText}>{emptyAction}</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  }

  // ── Bare mode (caller provides own scroll / list) ─────────────
  if (bare) {
    return (
      <View style={[styles.flex, { backgroundColor: colors.bgPrimary }]}>
        {renderStructureHeader()}
        {children}
        {secondaryActions}
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
      {renderStructureHeader()}
      {children}
      {secondaryActions}
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
  emptyContainer: {
    flex: 1,
  },
  emptyBody: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: 32,
  },
  emptyIconBox: {
    width: 80,
    height: 80,
    borderRadius: 40,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: "700",
    textAlign: "center",
    marginBottom: 8,
  },
  emptyDesc: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
    marginBottom: 20,
  },
  emptyBtn: {
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  emptyBtnText: {
    color: "#fff",
    fontWeight: "600",
    fontSize: 15,
  },
});
