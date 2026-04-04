/**
 * PageSkeletons — content-aware shimmer skeletons for every tab/page.
 *
 * Each skeleton mirrors the actual rendered layout of its page so
 * the loading → content transition feels seamless.
 */

import { useResponsive } from "@/hooks/useResponsive";
import { useThemeStore } from "@/services/themeStore";
import React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import {
    CardSkeleton,
    FilterRowSkeleton,
    Grid,
    ListItemSkeleton,
    PageShell,
    SearchBarSkeleton,
    SectionHeader,
    Shimmer,
    TableRowSkeleton,
} from "./Shimmer";

/* ═══════════════════════════════════════════════════════════════════════
   1. Portfolio Tracker
   Layout: Header + 4 KPI cards → 2 tall charts → snapshot table
   ═══════════════════════════════════════════════════════════════════════ */

export function PortfolioTrackerSkeleton() {
  const { colors } = useThemeStore();
  const { isPhone, spacing } = useResponsive();

  return (
    <PageShell>
      {/* Header row */}
      <View style={[s.headerRow, { marginBottom: spacing.sectionGap }]}>
        <Shimmer width={180} height={22} />
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Shimmer width={130} height={36} borderRadius={10} />
          <Shimmer width={130} height={36} borderRadius={10} />
        </View>
      </View>

      {/* 4 KPI cards */}
      <Grid style={{ marginBottom: spacing.sectionGap }}>
        {Array.from({ length: 4 }, (_, i) => (
          <CardSkeleton key={i} width={isPhone ? "48%" : "24%"} />
        ))}
      </Grid>

      {/* 2 chart placeholders */}
      <Shimmer width="100%" height={isPhone ? 200 : 300} borderRadius={12} style={{ marginBottom: 16 }} />
      <Shimmer width="100%" height={isPhone ? 200 : 300} borderRadius={12} style={{ marginBottom: spacing.sectionGap }} />

      {/* Table header + rows */}
      <SectionHeader width={180} />
      <View style={[s.tableContainer, { borderColor: colors.borderColor }]}>
        <View style={[s.tableHeaderRow, { backgroundColor: colors.bgSecondary }]}>
          {Array.from({ length: 8 }, (_, i) => (
            <Shimmer key={i} width={i === 0 ? 80 : 65} height={11} style={{ marginRight: 14 }} />
          ))}
        </View>
        {Array.from({ length: 5 }, (_, i) => (
          <TableRowSkeleton key={i} cols={8} />
        ))}
      </View>
    </PageShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   2. Portfolio Analysis
   Layout: Filter tabs → 5 KPI cards → cash section → holdings table → donut
   ═══════════════════════════════════════════════════════════════════════ */

export function PortfolioAnalysisSkeleton() {
  const { colors } = useThemeStore();
  const { isPhone, isDesktop, spacing } = useResponsive();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      {/* Portfolio filter tabs */}
      <FilterRowSkeleton count={4} />

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[
          { paddingHorizontal: spacing.pagePx, paddingTop: 10, paddingBottom: 40 },
          isDesktop && { maxWidth: 1200, alignSelf: "center" as const, width: "100%" },
        ]}
        scrollEnabled={false}
      >
        {/* Performance KPIs */}
        <SectionHeader width={120} />
        <Grid style={{ marginBottom: spacing.sectionGap }}>
          {Array.from({ length: 5 }, (_, i) => (
            <CardSkeleton key={i} width={isPhone ? "48%" : "18.5%"} />
          ))}
        </Grid>

        {/* Cash Management section */}
        <SectionHeader width={150} />
        <View style={[s.section, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, marginBottom: spacing.sectionGap }]}>
          <Grid>
            {Array.from({ length: 3 }, (_, i) => (
              <CardSkeleton key={i} width={isPhone ? "100%" : "32%"} />
            ))}
          </Grid>
        </View>

        {/* Holdings table */}
        <SectionHeader width={100} />
        <View style={[s.tableContainer, { borderColor: colors.borderColor, marginBottom: spacing.sectionGap }]}>
          {Array.from({ length: 6 }, (_, i) => (
            <TableRowSkeleton key={i} cols={isPhone ? 4 : 8} />
          ))}
        </View>

        {/* Allocation donut placeholder */}
        <SectionHeader width={140} />
        <Shimmer width="100%" height={isPhone ? 200 : 260} borderRadius={12} />
      </ScrollView>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   3. Trading
   Layout: Header card → info card → 12 summary cards → filters → search → table
   ═══════════════════════════════════════════════════════════════════════ */

export function TradingSkeleton() {
  const { colors } = useThemeStore();
  const { isPhone, isDesktop, spacing } = useResponsive();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <ScrollView
        contentContainerStyle={[
          { paddingHorizontal: spacing.pagePx, paddingTop: 10, paddingBottom: 40 },
          isDesktop && { maxWidth: 1200, alignSelf: "center" as const, width: "100%" },
        ]}
        scrollEnabled={false}
      >
        {/* Header card */}
        <View style={[s.section, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, marginBottom: 12, padding: 16 }]}>
          <Shimmer width={200} height={20} />
          <Shimmer width="60%" height={14} style={{ marginTop: 8 }} />
        </View>

        {/* Summary metric cards (4x3 grid) */}
        <SectionHeader width={160} />
        <Grid style={{ marginBottom: spacing.sectionGap }}>
          {Array.from({ length: 12 }, (_, i) => (
            <CardSkeleton key={i} width={isPhone ? "48%" : "24%"} />
          ))}
        </Grid>

        {/* Filters */}
        <FilterRowSkeleton count={5} />

        {/* Search bar */}
        <SearchBarSkeleton />

        {/* Results count */}
        <Shimmer width={200} height={12} style={{ marginHorizontal: 16, marginVertical: 8 }} />

        {/* Table rows */}
        <View style={[s.tableContainer, { borderColor: colors.borderColor }]}>
          {Array.from({ length: 8 }, (_, i) => (
            <TableRowSkeleton key={i} cols={isPhone ? 5 : 10} />
          ))}
        </View>
      </ScrollView>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   4. Holdings (two.tsx) — card/table view
   Layout: Filter tabs + toggle → totals bar → list of holdings cards
   ═══════════════════════════════════════════════════════════════════════ */

export function HoldingsSkeleton() {
  const { colors } = useThemeStore();
  const { isPhone, spacing } = useResponsive();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      {/* Filter row + view toggle */}
      <View style={[s.headerRow, { paddingHorizontal: spacing.pagePx, paddingVertical: 10 }]}>
        <View style={{ flexDirection: "row", gap: 8, flex: 1 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <Shimmer key={i} width={55} height={32} borderRadius={16} />
          ))}
        </View>
        <View style={{ flexDirection: "row", gap: 6 }}>
          <Shimmer width={36} height={36} borderRadius={8} />
          <Shimmer width={36} height={36} borderRadius={8} />
          <Shimmer width={36} height={36} borderRadius={8} />
        </View>
      </View>

      {/* Totals bar */}
      <View style={[s.totalsBar, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Shimmer width={100} height={12} />
        <Shimmer width={80} height={16} />
        <Shimmer width={60} height={12} />
      </View>

      {/* Holdings list items */}
      {Array.from({ length: isPhone ? 5 : 8 }, (_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   5. Transactions
   Layout: Header → filters → paginated list
   ═══════════════════════════════════════════════════════════════════════ */

export function TransactionsSkeleton() {
  const { colors } = useThemeStore();
  const { isPhone } = useResponsive();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      {/* Header */}
      <View style={[s.pageHeader, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderColor }]}>
        <View>
          <Shimmer width={140} height={20} />
          <Shimmer width={70} height={12} style={{ marginTop: 6 }} />
        </View>
        <Shimmer width={100} height={36} borderRadius={8} />
      </View>

      {/* Filter chips */}
      <FilterRowSkeleton count={6} />

      {/* List items */}
      {Array.from({ length: isPhone ? 8 : 12 }, (_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   6. Dividends
   Layout: Header → 4 totals cards → yearly chart → tabs → list
   ═══════════════════════════════════════════════════════════════════════ */

export function DividendsSkeleton() {
  const { colors } = useThemeStore();
  const { isPhone, spacing } = useResponsive();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      {/* Header */}
      <View style={[s.pageHeader, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderColor }]}>
        <Shimmer width={170} height={20} />
      </View>

      {/* 4 totals cards */}
      <View style={[s.totalsRow, { borderBottomColor: colors.borderColor }]}>
        {Array.from({ length: 4 }, (_, i) => (
          <View
            key={i}
            style={[
              s.totalCard,
              { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
            ]}
          >
            <Shimmer width="60%" height={11} />
            <Shimmer width="80%" height={18} style={{ marginTop: 8 }} />
          </View>
        ))}
      </View>

      {/* Yearly chart placeholder */}
      <Shimmer
        width="100%"
        height={isPhone ? 180 : 240}
        borderRadius={0}
        style={{ marginBottom: 8 }}
      />

      {/* Tab row */}
      <View style={[s.tabRow, { borderBottomColor: colors.borderColor }]}>
        {Array.from({ length: 4 }, (_, i) => (
          <Shimmer key={i} width={80} height={14} style={{ marginHorizontal: 10, marginVertical: 12 }} />
        ))}
      </View>

      {/* List items */}
      {Array.from({ length: isPhone ? 6 : 10 }, (_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   7. Deposits
   Layout: Header + summary cards → filters → paginated list
   ═══════════════════════════════════════════════════════════════════════ */

export function DepositsSkeleton() {
  const { colors } = useThemeStore();
  const { isPhone, isDesktop, spacing } = useResponsive();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      <View style={isDesktop ? { maxWidth: 800, alignSelf: "center" as const, width: "100%" } : undefined}>
        {/* Header + summary */}
        <View style={{ padding: spacing.pagePx, gap: 10 }}>
          <Shimmer width={130} height={20} />
          <Grid>
            {Array.from({ length: 3 }, (_, i) => (
              <CardSkeleton key={i} width={isPhone ? "100%" : "32%"} />
            ))}
          </Grid>
        </View>

        {/* Filters */}
        <FilterRowSkeleton count={6} />

        {/* List items */}
        {Array.from({ length: isPhone ? 6 : 10 }, (_, i) => (
          <ListItemSkeleton key={i} />
        ))}
      </View>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   8. Personal Finance (PFM)
   Layout: Header → 4 tabs → content list
   ═══════════════════════════════════════════════════════════════════════ */

export function PfmSkeleton() {
  const { colors } = useThemeStore();
  const { isPhone } = useResponsive();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      {/* Header */}
      <View style={[s.pageHeader, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderColor }]}>
        <Shimmer width={150} height={20} />
      </View>

      {/* 4 tabs */}
      <View style={[s.tabRow, { borderBottomColor: colors.borderColor }]}>
        {Array.from({ length: 4 }, (_, i) => (
          <View key={i} style={{ alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, gap: 4 }}>
            <Shimmer width={16} height={16} borderRadius={4} />
            <Shimmer width={60} height={10} />
          </View>
        ))}
      </View>

      {/* Content: section title + list */}
      <View style={{ padding: 16 }}>
        <SectionHeader width={160} />
        {Array.from({ length: isPhone ? 4 : 6 }, (_, i) => (
          <ListItemSkeleton key={i} />
        ))}
      </View>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   9. Securities
   Layout: Tabs → search + filter → stock/security list
   ═══════════════════════════════════════════════════════════════════════ */

export function SecuritiesSkeleton() {
  const { colors } = useThemeStore();
  const { isPhone } = useResponsive();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      {/* Tab row */}
      <View style={[s.tabRow, { borderBottomColor: colors.borderColor }]}>
        <Shimmer width={70} height={14} style={{ marginHorizontal: 16, marginVertical: 12 }} />
        <Shimmer width={80} height={14} style={{ marginHorizontal: 16, marginVertical: 12 }} />
      </View>

      {/* Search + portfolio filter */}
      <SearchBarSkeleton />
      <View style={{ flexDirection: "row", gap: 8, paddingHorizontal: 16, paddingVertical: 6 }}>
        {Array.from({ length: 4 }, (_, i) => (
          <Shimmer key={i} width={50} height={30} borderRadius={16} />
        ))}
      </View>

      {/* List items */}
      {Array.from({ length: isPhone ? 6 : 10 }, (_, i) => (
        <ListItemSkeleton key={i} />
      ))}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   10. Holdings Table (holdings.tsx via DataScreen)
   Layout: Filter tabs + export → horizontal scrollable table + donut
   ═══════════════════════════════════════════════════════════════════════ */

export function HoldingsTableSkeleton() {
  const { colors } = useThemeStore();
  const { isPhone, spacing } = useResponsive();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary }}>
      {/* Filter row + export button */}
      <View style={[s.headerRow, { paddingHorizontal: spacing.pagePx, paddingVertical: 10 }]}>
        <View style={{ flexDirection: "row", gap: 8, flex: 1 }}>
          {Array.from({ length: 4 }, (_, i) => (
            <Shimmer key={i} width={55} height={32} borderRadius={16} />
          ))}
        </View>
        <Shimmer width={90} height={36} borderRadius={8} />
      </View>

      {/* Table */}
      <View style={[s.tableContainer, { borderColor: colors.borderColor, marginHorizontal: spacing.pagePx }]}>
        <View style={[s.tableHeaderRow, { backgroundColor: colors.bgSecondary }]}>
          {Array.from({ length: isPhone ? 5 : 10 }, (_, i) => (
            <Shimmer key={i} width={i === 0 ? 80 : 60} height={11} style={{ marginRight: 12 }} />
          ))}
        </View>
        {Array.from({ length: isPhone ? 5 : 8 }, (_, i) => (
          <TableRowSkeleton key={i} cols={isPhone ? 5 : 10} />
        ))}
      </View>

      {/* Donut placeholder */}
      <View style={{ alignItems: "center", marginTop: 20 }}>
        <Shimmer width={200} height={200} borderRadius={100} />
      </View>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════════
   11. FA Panel Skeleton (generic for fundamental analysis sub-panels)
   Layout: info text → section title → card grid or table
   ═══════════════════════════════════════════════════════════════════════ */

export function FAPanelSkeleton() {
  const { colors } = useThemeStore();
  const { isPhone, spacing } = useResponsive();

  return (
    <View style={{ flex: 1, backgroundColor: colors.bgPrimary, padding: spacing.pagePx }}>
      {/* Section title */}
      <SectionHeader width={180} />

      {/* Cards / key metrics */}
      <Grid style={{ marginBottom: spacing.sectionGap }}>
        {Array.from({ length: isPhone ? 2 : 4 }, (_, i) => (
          <CardSkeleton key={i} width={isPhone ? "48%" : "24%"} />
        ))}
      </Grid>

      {/* Table / chart area */}
      <SectionHeader width={140} />
      <View style={[s.tableContainer, { borderColor: colors.borderColor }]}>
        {Array.from({ length: 6 }, (_, i) => (
          <TableRowSkeleton key={i} cols={isPhone ? 3 : 6} />
        ))}
      </View>
    </View>
  );
}

/* ── Shared styles ─────────────────────────────────────────────────── */

const s = StyleSheet.create({
  headerRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
  },
  pageHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
  },
  section: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 12,
  },
  tableContainer: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
  },
  tableHeaderRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  totalsBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderWidth: 1,
    borderRadius: 8,
    marginHorizontal: 16,
    marginBottom: 10,
  },
  totalsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  totalCard: {
    flex: 1,
    minWidth: 130,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
  },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
});
