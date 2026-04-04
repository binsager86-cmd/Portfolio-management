/**
 * Shimmer — shared animated skeleton primitives used by all page skeletons.
 *
 * Exports:
 *   Shimmer        – pulsing rectangle placeholder
 *   CardSkeleton   – mimics MetricCard layout (icon → label → value → subline)
 *   ListItemSkeleton – mimics a list row with left/right content
 *   TableRowSkeleton – mimics a horizontal table row with N columns
 *   SectionHeader  – section title placeholder bar
 *   PageShell      – full-page wrapper with theme bg + responsive centering
 */

import { useResponsive } from "@/hooks/useResponsive";
import { useThemeStore } from "@/services/themeStore";
import React, { useEffect, useRef } from "react";
import {
    Animated,
    Easing,
    ScrollView,
    StyleSheet,
    View,
} from "react-native";

/* ── Core shimmer bar ──────────────────────────────────────────────── */

export function Shimmer({
  width,
  height,
  borderRadius = 8,
  style,
}: {
  width: number | string;
  height: number;
  borderRadius?: number;
  style?: object;
}) {
  const { colors } = useThemeStore();
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(anim, {
          toValue: 1,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
        Animated.timing(anim, {
          toValue: 0,
          duration: 1000,
          easing: Easing.inOut(Easing.ease),
          useNativeDriver: false,
        }),
      ]),
    );
    loop.start();
    return () => loop.stop();
  }, [anim]);

  const bg = anim.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.bgCard, colors.borderColor],
  });

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius, backgroundColor: bg },
        style,
      ]}
    />
  );
}

/* ── Card skeleton (mimics MetricCard) ─────────────────────────────── */

export function CardSkeleton({ width: cardWidth }: { width: string }) {
  const { colors } = useThemeStore();
  const { spacing } = useResponsive();

  return (
    <View
      style={[
        s.card,
        {
          width: cardWidth as any,
          backgroundColor: colors.bgCard,
          borderColor: colors.borderColor,
          padding: spacing.cardPadding,
        },
      ]}
    >
      <Shimmer width={20} height={20} borderRadius={4} />
      <Shimmer width="55%" height={12} style={{ marginTop: 10 }} />
      <Shimmer width="75%" height={18} style={{ marginTop: 8 }} />
      <Shimmer width="45%" height={10} style={{ marginTop: 8 }} />
    </View>
  );
}

/* ── List item skeleton ────────────────────────────────────────────── */

export function ListItemSkeleton() {
  const { colors } = useThemeStore();

  return (
    <View
      style={[
        s.listItem,
        { backgroundColor: colors.bgCard, borderBottomColor: colors.borderColor },
      ]}
    >
      <View style={{ flex: 1, gap: 6 }}>
        <Shimmer width="50%" height={14} />
        <Shimmer width="70%" height={11} />
        <Shimmer width="35%" height={10} />
      </View>
      <View style={{ alignItems: "flex-end", gap: 6 }}>
        <Shimmer width={70} height={14} />
        <Shimmer width={50} height={10} />
      </View>
    </View>
  );
}

/* ── Table row skeleton ────────────────────────────────────────────── */

export function TableRowSkeleton({ cols = 6 }: { cols?: number }) {
  return (
    <View style={s.tableRow}>
      {Array.from({ length: cols }, (_, i) => (
        <Shimmer
          key={i}
          width={i === 0 ? 90 : 70}
          height={12}
          style={{ marginRight: 12 }}
        />
      ))}
    </View>
  );
}

/* ── Section header shimmer ────────────────────────────────────────── */

export function SectionHeader({ width = 130 }: { width?: number }) {
  return <Shimmer width={width} height={13} style={{ marginBottom: 10 }} />;
}

/* ── Filter row skeleton ───────────────────────────────────────────── */

export function FilterRowSkeleton({ count = 4 }: { count?: number }) {
  const { colors } = useThemeStore();

  return (
    <View style={[s.filterRow, { borderBottomColor: colors.borderColor }]}>
      {Array.from({ length: count }, (_, i) => (
        <Shimmer
          key={i}
          width={i === 0 ? 50 : 55}
          height={32}
          borderRadius={16}
          style={{ marginRight: 8 }}
        />
      ))}
    </View>
  );
}

/* ── Search bar skeleton ───────────────────────────────────────────── */

export function SearchBarSkeleton() {
  const { colors } = useThemeStore();

  return (
    <View
      style={[
        s.searchBar,
        { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
      ]}
    >
      <Shimmer width={16} height={16} borderRadius={4} />
      <Shimmer width="70%" height={14} style={{ marginLeft: 10 }} />
    </View>
  );
}

/* ── Page shell wrapper ────────────────────────────────────────────── */

export function PageShell({ children }: { children: React.ReactNode }) {
  const { colors } = useThemeStore();
  const { isDesktop, spacing, maxContentWidth } = useResponsive();

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bgPrimary }}
      contentContainerStyle={[
        s.pageContent,
        {
          paddingHorizontal: spacing.pagePx,
          maxWidth: maxContentWidth,
          alignSelf: isDesktop ? ("center" as const) : undefined,
          width: isDesktop ? ("100%" as const) : undefined,
        },
      ]}
      scrollEnabled={false}
    >
      {children}
    </ScrollView>
  );
}

/* ── Grid helper ───────────────────────────────────────────────────── */

export function Grid({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: object;
}) {
  const { spacing } = useResponsive();
  return (
    <View style={[s.grid, { gap: spacing.gridGap }, style]}>{children}</View>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    minHeight: 90,
  },
  listItem: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderBottomWidth: 1,
  },
  tableRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    marginHorizontal: 16,
    marginVertical: 8,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
  },
  pageContent: {
    paddingTop: 10,
    paddingBottom: 40,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
  },
});
