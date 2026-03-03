/**
 * Holdings Screen — responsive, themed, matching the Streamlit table.
 *
 * Portfolio filter tabs · totals bar · card list OR data table.
 * Toggle between Card view (mobile-friendly) and Table view (data-dense).
 * Supports Light/Dark and Phone/Tablet/Desktop layouts.
 */

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  RefreshControl,
  ActivityIndicator,
  TouchableOpacity,
  Pressable,
  Platform,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { getHoldings, getAccounts, Holding, HoldingsResponse } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import HoldingsTable from "@/components/HoldingsTable";
import type { ThemePalette } from "@/constants/theme";

// ── Helpers ─────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pnlColor(n: number, c: ThemePalette): string {
  if (n > 0) return c.success;
  if (n < 0) return c.danger;
  return c.textSecondary;
}

// ── Sub-components ──────────────────────────────────────────────────

function MiniMetric({
  label,
  value,
  color,
  colors,
}: {
  label: string;
  value: string;
  color?: string;
  colors: ThemePalette;
}) {
  return (
    <View style={st.miniMetric}>
      <Text style={[st.miniLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text
        style={[st.miniValue, { color: color ?? colors.textPrimary }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

function HoldingCard({
  item,
  colors,
}: {
  item: Holding;
  colors: ThemePalette;
}) {
  return (
    <View
      style={[
        st.card,
        { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
      ]}
    >
      <View style={st.cardHeader}>
        <View style={{ flex: 1 }}>
          <Text style={[st.symbol, { color: colors.accentSecondary }]}>
            {item.symbol}
          </Text>
          <Text
            style={[st.company, { color: colors.textMuted }]}
            numberOfLines={1}
          >
            {item.company}
          </Text>
        </View>
        <View style={st.priceBox}>
          <Text style={[st.price, { color: colors.textPrimary }]}>
            {fmt(item.market_price, 3)}
          </Text>
          <Text style={[st.currency, { color: colors.textMuted }]}>
            {item.currency}
          </Text>
        </View>
      </View>

      <View style={st.metricsRow}>
        <MiniMetric label="Shares" value={fmt(item.shares_qty, 0)} colors={colors} />
        <MiniMetric label="Avg Cost" value={fmt(item.avg_cost, 3)} colors={colors} />
        <MiniMetric label="Mkt Value" value={fmt(item.market_value, 2)} colors={colors} />
      </View>
      <View style={st.metricsRow}>
        <MiniMetric
          label="Unreal P/L"
          value={fmt(item.unrealized_pnl, 2)}
          color={pnlColor(item.unrealized_pnl, colors)}
          colors={colors}
        />
        <MiniMetric
          label="Real P/L"
          value={fmt(item.realized_pnl, 2)}
          color={pnlColor(item.realized_pnl, colors)}
          colors={colors}
        />
        <MiniMetric
          label="Total P/L"
          value={fmt(item.total_pnl, 2)}
          color={pnlColor(item.total_pnl, colors)}
          colors={colors}
        />
      </View>
      <View style={st.metricsRow}>
        <MiniMetric label="Dividends" value={fmt(item.cash_dividends, 2)} colors={colors} />
        <MiniMetric
          label="PNL %"
          value={`${(item.pnl_pct * 100).toFixed(1)}%`}
          color={pnlColor(item.pnl_pct, colors)}
          colors={colors}
        />
        <MiniMetric
          label="Mkt Val (KWD)"
          value={fmt(item.market_value_kwd, 2)}
          colors={colors}
        />
      </View>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────

type ViewMode = "cards" | "table";
type SortKey = "symbol" | "market_value_kwd" | "total_pnl" | "pnl_pct" | "unrealized_pnl";

export default function HoldingsScreen() {
  const { colors } = useThemeStore();
  const { isDesktop, isPhone, spacing, fonts, maxContentWidth } = useResponsive();

  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [viewMode, setViewMode] = useState<ViewMode>(
    Platform.OS === "web" ? "table" : "cards"
  );
  const [sortKey, setSortKey] = useState<SortKey>("market_value_kwd");
  const [sortAsc, setSortAsc] = useState(false);

  const { data: resp, isLoading: loading, isError, error, refetch, isFetching: refreshing } = useQuery<HoldingsResponse>({
    queryKey: ["holdings", filter],
    queryFn: () => getHoldings(filter),
  });

  const { data: accountsData } = useQuery({
    queryKey: ["accounts"],
    queryFn: () => getAccounts(),
  });

  const onRefresh = useCallback(() => { refetch(); }, [refetch]);

  const handleSort = (key: SortKey) => {
    if (sortKey === key) { setSortAsc(!sortAsc); }
    else { setSortKey(key); setSortAsc(false); }
  };

  const sortedHoldings = React.useMemo(() => {
    const list = [...(resp?.holdings ?? [])];
    list.sort((a, b) => {
      let va: any = a[sortKey], vb: any = b[sortKey];
      if (typeof va === "string") { va = va.toLowerCase(); vb = (vb as string).toLowerCase(); }
      if (va < vb) return sortAsc ? -1 : 1;
      if (va > vb) return sortAsc ? 1 : -1;
      return 0;
    });
    return list;
  }, [resp?.holdings, sortKey, sortAsc]);

  const portfolios = [undefined, "KFH", "BBYN", "USA"];
  const filterLabels = ["All", "KFH", "BBYN", "USA"];

  // ── Loading ──
  if (loading && !refreshing) {
    return (
      <View style={[st.center, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.accentPrimary} />
        <Text style={[st.loadingText, { color: colors.textSecondary }]}>
          Loading holdings…
        </Text>
      </View>
    );
  }

  // ── Error ──
  if (isError) {
    return (
      <View style={[st.center, { backgroundColor: colors.bgPrimary }]}>
        <Text style={st.errorEmoji}>⚠️</Text>
        <Text style={[st.errorText, { color: colors.danger }]}>{(error as any)?.message ?? "Failed to load"}</Text>
      </View>
    );
  }

  const filterLabel = filter ?? "All";

  return (
    <View style={[st.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Filter tabs + view toggle row */}
      <View style={[st.filterRow, { paddingHorizontal: spacing.pagePx }]}>
        <View style={{ flexDirection: "row", gap: 8, flex: 1, flexWrap: "wrap" }}>
          {portfolios.map((p, i) => {
            const active = filter === p;
            return (
              <TouchableOpacity
                key={filterLabels[i]}
                style={[
                  st.filterBtn,
                  { backgroundColor: active ? colors.accentPrimary : colors.bgCard },
                  { borderColor: colors.borderColor },
                ]}
                onPress={() => setFilter(p)}
              >
                <Text
                  style={[
                    st.filterText,
                    { color: active ? "#fff" : colors.textSecondary },
                  ]}
                >
                  {filterLabels[i]}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>

        {/* View mode toggle */}
        <View style={st.viewToggle}>
          <Pressable
            onPress={() => setViewMode("cards")}
            style={[
              st.toggleBtn,
              {
                backgroundColor:
                  viewMode === "cards" ? colors.accentPrimary + "22" : "transparent",
                borderColor:
                  viewMode === "cards" ? colors.accentPrimary : colors.borderColor,
              },
            ]}
          >
            <FontAwesome
              name="th-large"
              size={14}
              color={viewMode === "cards" ? colors.accentPrimary : colors.textMuted}
            />
          </Pressable>
          <Pressable
            onPress={() => setViewMode("table")}
            style={[
              st.toggleBtn,
              {
                backgroundColor:
                  viewMode === "table" ? colors.accentPrimary + "22" : "transparent",
                borderColor:
                  viewMode === "table" ? colors.accentPrimary : colors.borderColor,
              },
            ]}
          >
            <FontAwesome
              name="table"
              size={14}
              color={viewMode === "table" ? colors.accentPrimary : colors.textMuted}
            />
          </Pressable>
          {/* Refresh button */}
          <Pressable
            onPress={onRefresh}
            style={({ pressed }) => [
              st.toggleBtn,
              {
                borderColor: colors.borderColor,
                backgroundColor: pressed ? colors.bgCardHover : "transparent",
              },
            ]}
          >
            <FontAwesome
              name="refresh"
              size={14}
              color={refreshing ? colors.accentPrimary : colors.textMuted}
            />
          </Pressable>
        </View>
      </View>

      {/* Sort bar */}
      <View style={[st.sortBar, { borderBottomColor: colors.borderColor }]}>
        <Text style={[st.sortLabel, { color: colors.textMuted }]}>Sort:</Text>
        {([["symbol", "Name"], ["market_value_kwd", "Value"], ["total_pnl", "P/L"], ["pnl_pct", "%"], ["unrealized_pnl", "Unrl"]] as [SortKey, string][]).map(([key, label]) => (
          <Pressable key={key} onPress={() => handleSort(key)} style={[st.sortChip, { backgroundColor: sortKey === key ? colors.accentPrimary + "22" : "transparent", borderColor: sortKey === key ? colors.accentPrimary : colors.borderColor }]}>
            <Text style={[st.sortChipText, { color: sortKey === key ? colors.accentPrimary : colors.textSecondary }]}>
              {label} {sortKey === key ? (sortAsc ? "↑" : "↓") : ""}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Totals bar */}
      {resp && (
        <View style={[st.totalsBar, { borderBottomColor: colors.borderColor }]}>
          <Text style={[st.totalsLabel, { color: colors.textSecondary }]}>
            {resp.count} holding{resp.count !== 1 ? "s" : ""}
          </Text>
          <Text style={[st.totalsValue, { color: colors.textPrimary }]}>
            Mkt: {fmt(resp.totals.total_market_value_kwd)} KWD
          </Text>
          <Text
            style={[
              st.totalsPnl,
              { color: pnlColor(resp.totals.total_pnl_kwd, colors) },
            ]}
          >
            P/L: {resp.totals.total_pnl_kwd >= 0 ? "+" : ""}
            {fmt(resp.totals.total_pnl_kwd)} KWD
          </Text>
        </View>
      )}

      {/* Cash Balances */}
      {accountsData && (accountsData.accounts?.length > 0 || accountsData.total_cash_kwd > 0) && (
        <View style={[st.cashSection, { borderBottomColor: colors.borderColor }]}>
          <View style={st.cashRow}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <FontAwesome name="bank" size={14} color={colors.accentPrimary} />
              <Text style={[st.cashTitle, { color: colors.textPrimary }]}>Cash Balances</Text>
            </View>
            <Text style={[st.cashTotal, { color: colors.success }]}>
              {fmt(accountsData.total_cash_kwd)} KWD
            </Text>
          </View>
          {accountsData.accounts?.map((acc: any, idx: number) => (
            <View key={idx} style={st.cashRow}>
              <Text style={[st.cashAccLabel, { color: colors.textSecondary }]}>
                {acc.portfolio ?? acc.name ?? `Account ${idx + 1}`}
              </Text>
              <Text style={[st.cashAccValue, { color: colors.textPrimary }]}>
                {fmt(acc.balance_kwd ?? acc.balance ?? acc.amount ?? 0)} KWD
              </Text>
            </View>
          ))}
          {resp && (
            <View style={[st.cashRow, { borderTopWidth: 1, borderTopColor: colors.borderColor, paddingTop: 6, marginTop: 4 }]}>
              <Text style={[st.cashTitle, { color: colors.textPrimary }]}>Total (Holdings + Cash)</Text>
              <Text style={[st.cashTotal, { color: colors.textPrimary, fontWeight: "700" }]}>
                {fmt((resp.totals.total_market_value_kwd ?? 0) + (accountsData.total_cash_kwd ?? 0))} KWD
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Table view */}
      {viewMode === "table" ? (
        <HoldingsTable
          holdings={sortedHoldings}
          colors={colors}
          filterLabel={filterLabel}
        />
      ) : (
        /* Card view */
        <FlatList
          data={sortedHoldings}
          keyExtractor={(item) => item.symbol}
          renderItem={({ item }) => (
            <HoldingCard item={item} colors={colors} />
          )}
          contentContainerStyle={[
            st.listContent,
            {
              maxWidth: maxContentWidth,
              alignSelf: isDesktop ? "center" as const : undefined,
              width: isDesktop ? "100%" as const : undefined,
              paddingHorizontal: spacing.pagePx,
            },
          ]}
          numColumns={isDesktop ? 2 : 1}
          key={isDesktop ? "2col" : "1col"}
          columnWrapperStyle={isDesktop ? st.columnWrapper : undefined}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={colors.accentPrimary}
            />
          }
          ListEmptyComponent={
            <Text style={[st.emptyText, { color: colors.textMuted }]}>
              No holdings found.
            </Text>
          }
        />
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const st = StyleSheet.create({
  container: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center" },
  loadingText: { marginTop: 12, fontSize: 15 },
  errorEmoji: { fontSize: 48, marginBottom: 12 },
  errorText: { fontSize: 16, textAlign: "center", paddingHorizontal: 24 },
  emptyText: { textAlign: "center", marginTop: 40, fontSize: 15 },

  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
  },
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 44,
    justifyContent: "center",
  },
  filterText: { fontSize: 14, fontWeight: "600" },

  sortBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 6,
    gap: 6,
    borderBottomWidth: 1,
  },
  sortLabel: { fontSize: 12, marginRight: 2 },
  sortChip: { paddingHorizontal: 10, paddingVertical: 6, borderRadius: 12, borderWidth: 1, minHeight: 36 },
  sortChipText: { fontSize: 12, fontWeight: "600" },

  viewToggle: {
    flexDirection: "row",
    gap: 4,
    marginLeft: 8,
  },
  toggleBtn: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },

  totalsBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  totalsLabel: { fontSize: 13 },
  totalsValue: { fontSize: 13, fontWeight: "600" },
  totalsPnl: { fontSize: 13, fontWeight: "600" },

  listContent: { paddingVertical: 16, paddingBottom: 32 },
  columnWrapper: { justifyContent: "space-between", gap: 12 },

  card: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    borderWidth: 1,
    ...(Platform.OS === "web" ? { flex: 1 } : {}),
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  symbol: { fontSize: 18, fontWeight: "700" },
  company: { fontSize: 12, marginTop: 2, maxWidth: 220 },
  priceBox: { alignItems: "flex-end" },
  price: { fontSize: 18, fontWeight: "600" },
  currency: { fontSize: 11 },

  metricsRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  miniMetric: { flex: 1 },
  miniLabel: { fontSize: 11, marginBottom: 2 },
  miniValue: { fontSize: 14, fontWeight: "500" },

  // Cash balances
  cashSection: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  cashRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 3,
  },
  cashTitle: { fontSize: 14, fontWeight: "600" },
  cashTotal: { fontSize: 14, fontWeight: "700" },
  cashAccLabel: { fontSize: 13 },
  cashAccValue: { fontSize: 13, fontWeight: "500" },
});
