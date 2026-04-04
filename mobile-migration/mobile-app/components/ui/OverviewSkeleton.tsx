/**
 * OverviewSkeleton — a content-aware shimmer skeleton that mirrors
 * the actual Overview dashboard layout (hero banner → metric cards →
 * chart → dividend cards).  Used while portfolio data is loading.
 */

import { useResponsive } from "@/hooks/useResponsive";
import { useThemeStore } from "@/services/themeStore";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { CardSkeleton, Grid, SectionHeader, Shimmer } from "./Shimmer";

/* ── Main skeleton component ───────────────────────────────────────── */

export function OverviewSkeleton() {
  const { colors } = useThemeStore();
  const { isPhone, isDesktop, spacing, maxContentWidth } = useResponsive();

  const metricCardWidth = isPhone ? "48%" : "18.5%";
  const profitCardWidth = isPhone ? "48%" : "32%";

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bgPrimary }}
      contentContainerStyle={[
        s.content,
        {
          paddingHorizontal: spacing.pagePx,
          maxWidth: maxContentWidth,
          alignSelf: isDesktop ? ("center" as const) : undefined,
          width: isDesktop ? ("100%" as const) : undefined,
        },
      ]}
      scrollEnabled={false}
    >
      {/* ── Hero Banner ── */}
      <View
        style={[
          s.banner,
          {
            backgroundColor: colors.bgCard,
            borderColor: colors.borderColor,
            padding: spacing.cardPadding + 6,
            marginBottom: spacing.sectionGap,
          },
        ]}
      >
        <View style={{ alignItems: "center", gap: 10 }}>
          <Shimmer width={130} height={12} />
          <Shimmer width={200} height={30} borderRadius={6} />
          <Shimmer width={160} height={14} />
          <Shimmer width={220} height={12} style={{ marginTop: 2 }} />
        </View>
        {/* Button placeholders */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 16, justifyContent: "center" }}>
          <Shimmer width={140} height={38} borderRadius={10} />
          <Shimmer width={140} height={38} borderRadius={10} />
        </View>
      </View>

      {/* ── Section: Portfolio Snapshot (5 cards desktop, 2 mobile) ── */}
      <SectionHeader width={130} />
      <Grid style={{ marginBottom: spacing.sectionGap }}>
        {Array.from({ length: 5 }, (_, i) => (
          <CardSkeleton key={`snap-${i}`} width={metricCardWidth} />
        ))}
      </Grid>

      {/* ── Section: Profit Breakdown (3 cards) ── */}
      <SectionHeader width={120} />
      <Grid style={{ marginBottom: spacing.sectionGap }}>
        {Array.from({ length: 3 }, (_, i) => (
          <CardSkeleton key={`profit-${i}`} width={profitCardWidth} />
        ))}
      </Grid>

      {/* ── Section: Performance Metrics (3 cards) ── */}
      <SectionHeader width={150} />
      <Grid style={{ marginBottom: spacing.sectionGap }}>
        {Array.from({ length: 3 }, (_, i) => (
          <CardSkeleton key={`perf-${i}`} width={isPhone ? "48%" : "24%"} />
        ))}
      </Grid>

      {/* ── Chart placeholder ── */}
      <Shimmer
        width="100%"
        height={isPhone ? 220 : 300}
        borderRadius={12}
        style={{ marginBottom: spacing.sectionGap }}
      />

      {/* ── Section: Dividend Income (2 cards) ── */}
      <SectionHeader width={120} />
      <Grid style={{ marginBottom: spacing.sectionGap }}>
        <CardSkeleton width="48%" />
        <CardSkeleton width="48%" />
      </Grid>
    </ScrollView>
  );
}

/* ── Styles ─────────────────────────────────────────────────────────── */

const s = StyleSheet.create({
  content: {
    paddingTop: 10,
    paddingBottom: 40,
  },
  banner: {
    borderRadius: 14,
    borderWidth: 1,
    alignItems: "center",
  },
});
