/**
 * Securities Master — list, search, and manage securities.
 *
 * Mirrors Streamlit's Securities Master section.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  TextInput,
  RefreshControl,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { getSecurities, getStocks, SecurityRecord, StockRecord } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import type { ThemePalette } from "@/constants/theme";

type Tab = "stocks" | "securities";

export default function SecuritiesMasterScreen() {
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();
  const [tab, setTab] = useState<Tab>("stocks");
  const [search, setSearch] = useState("");
  const [portfolioFilter, setPortfolioFilter] = useState<string | undefined>(undefined);

  const {
    data: stocksData,
    isLoading: stocksLoading,
    refetch: refetchStocks,
    isFetching: stocksFetching,
  } = useQuery({
    queryKey: ["stocks", portfolioFilter, search],
    queryFn: () => getStocks({ portfolio: portfolioFilter, search: search || undefined }),
  });

  const {
    data: securitiesData,
    isLoading: securitiesLoading,
    refetch: refetchSecurities,
    isFetching: securitiesFetching,
  } = useQuery({
    queryKey: ["securities", search],
    queryFn: () => getSecurities({ search: search || undefined }),
    enabled: tab === "securities",
  });

  const stocks = stocksData?.stocks ?? [];
  const securities = securitiesData?.securities ?? [];

  return (
    <View style={[s.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.borderColor }]}>
        <Text style={[s.title, { color: colors.textPrimary }]}>Securities Master</Text>
      </View>

      {/* Tabs */}
      <View style={[s.tabRow, { borderBottomColor: colors.borderColor }]}>
        <Pressable
          onPress={() => setTab("stocks")}
          style={[s.tabBtn, tab === "stocks" && { borderBottomColor: colors.accentPrimary, borderBottomWidth: 2 }]}
        >
          <Text style={{ color: tab === "stocks" ? colors.accentPrimary : colors.textSecondary, fontWeight: "600", fontSize: 14 }}>
            Stocks ({stocksData?.count ?? 0})
          </Text>
        </Pressable>
        <Pressable
          onPress={() => setTab("securities")}
          style={[s.tabBtn, tab === "securities" && { borderBottomColor: colors.accentPrimary, borderBottomWidth: 2 }]}
        >
          <Text style={{ color: tab === "securities" ? colors.accentPrimary : colors.textSecondary, fontWeight: "600", fontSize: 14 }}>
            Securities ({securitiesData?.count ?? 0})
          </Text>
        </Pressable>
      </View>

      {/* Search + Filter */}
      <View style={[s.searchRow, { borderBottomColor: colors.borderColor }]}>
        <View style={[s.searchBox, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <FontAwesome name="search" size={14} color={colors.textMuted} />
          <TextInput
            placeholder="Search..."
            placeholderTextColor={colors.textMuted}
            value={search}
            onChangeText={setSearch}
            style={[s.searchInput, { color: colors.textPrimary }]}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")}>
              <FontAwesome name="times" size={14} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        {tab === "stocks" && (
          <View style={s.pfFilter}>
            {[undefined, "KFH", "BBYN", "USA"].map((pf) => (
              <Pressable
                key={pf ?? "all"}
                onPress={() => setPortfolioFilter(pf)}
                style={[s.filterChip, { backgroundColor: portfolioFilter === pf ? colors.accentPrimary : colors.bgCard, borderColor: colors.borderColor }]}
              >
                <Text style={{ color: portfolioFilter === pf ? "#fff" : colors.textSecondary, fontSize: 11, fontWeight: "600" }}>
                  {pf ?? "All"}
                </Text>
              </Pressable>
            ))}
          </View>
        )}
      </View>

      {/* Stocks List */}
      {tab === "stocks" ? (
        stocksLoading ? (
          <LoadingScreen />
        ) : (
          <FlatList
            data={stocks}
            keyExtractor={(item) => String(item.id)}
            contentContainerStyle={[s.listContent, isDesktop && { maxWidth: 900, alignSelf: "center", width: "100%" }]}
            refreshControl={
              <RefreshControl refreshing={stocksFetching && !stocksLoading} onRefresh={refetchStocks} tintColor={colors.accentPrimary} />
            }
            renderItem={({ item }) => (
              <View style={[s.stockRow, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.stockSymbol, { color: colors.textPrimary }]}>{item.symbol}</Text>
                  <Text style={[s.stockName, { color: colors.textSecondary }]}>{item.name ?? "—"}</Text>
                  <Text style={[s.stockMeta, { color: colors.textMuted }]}>
                    {item.portfolio} · {item.currency} · {item.price_source ?? "N/A"}
                  </Text>
                </View>
                <View style={{ alignItems: "flex-end" }}>
                  <Text style={[s.stockPrice, { color: colors.textPrimary }]}>
                    {item.current_price != null ? item.current_price.toFixed(3) : "—"}
                  </Text>
                  {item.last_updated && (
                    <Text style={[s.stockUpdated, { color: colors.textMuted }]}>
                      {item.last_updated.slice(0, 10)}
                    </Text>
                  )}
                </View>
              </View>
            )}
            ListEmptyComponent={
              <View style={s.empty}>
                <FontAwesome name="cubes" size={48} color={colors.textMuted} />
                <Text style={[s.emptyText, { color: colors.textSecondary }]}>No stocks found</Text>
              </View>
            }
          />
        )
      ) : securitiesLoading ? (
        <LoadingScreen />
      ) : (
        <FlatList
          data={securities}
          keyExtractor={(item) => item.security_id}
          contentContainerStyle={[s.listContent, isDesktop && { maxWidth: 900, alignSelf: "center", width: "100%" }]}
          refreshControl={
            <RefreshControl refreshing={securitiesFetching && !securitiesLoading} onRefresh={refetchSecurities} tintColor={colors.accentPrimary} />
          }
          renderItem={({ item }) => (
            <View style={[s.stockRow, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.stockSymbol, { color: colors.textPrimary }]}>{item.canonical_ticker}</Text>
                <Text style={[s.stockName, { color: colors.textSecondary }]}>{item.display_name ?? "—"}</Text>
                <Text style={[s.stockMeta, { color: colors.textMuted }]}>
                  {item.exchange} · {item.currency ?? "—"} · {item.sector ?? "—"}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[{ fontSize: 12, color: item.status === "active" ? colors.success : colors.textMuted, fontWeight: "600" }]}>
                  {item.status ?? "—"}
                </Text>
                {item.isin && (
                  <Text style={[s.stockUpdated, { color: colors.textMuted }]}>{item.isin}</Text>
                )}
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <FontAwesome name="database" size={48} color={colors.textMuted} />
              <Text style={[s.emptyText, { color: colors.textSecondary }]}>No securities found</Text>
            </View>
          }
        />
      )}
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: { fontSize: 24, fontWeight: "700" },
  tabRow: { flexDirection: "row", borderBottomWidth: 1 },
  tabBtn: { paddingHorizontal: 20, paddingVertical: 12 },
  searchRow: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
  },
  searchBox: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },
  pfFilter: {
    flexDirection: "row",
    gap: 6,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
  },
  listContent: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 80 },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  stockSymbol: { fontSize: 15, fontWeight: "700" },
  stockName: { fontSize: 13, marginTop: 1 },
  stockMeta: { fontSize: 11, marginTop: 2 },
  stockPrice: { fontSize: 15, fontWeight: "600" },
  stockUpdated: { fontSize: 10, marginTop: 2 },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14 },
});
