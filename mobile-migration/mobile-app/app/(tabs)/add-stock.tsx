/**
 * Add Stock — browse Kuwait / US reference lists, search, then create.
 *
 * Flow (mirrors Streamlit "➕ Add New Stock"):
 *   1. Pick Market  →  Kuwait Market / US Market
 *   2. Search / browse stock from hardcoded reference list (yfinance tickers)
 *   3. Select stock  →  auto-fills symbol, name, portfolio, currency
 *   4. Tap "Add Stock" →  auto-fetches price via yfinance, inserts row
 *
 * Users can override portfolio / currency before adding.
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  TextInput as RNTextInput,
  FlatList,
} from "react-native";
import { useRouter } from "expo-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  getStockList,
  createStock,
  fetchStockPrice,
  StockListEntry,
  getStocks,
} from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";

// ── Constants ───────────────────────────────────────────────────────

const MARKETS = ["Kuwait Market", "US Market"] as const;
type MarketLabel = (typeof MARKETS)[number];

const PORTFOLIOS = ["KFH", "BBYN", "USA"] as const;
const CURRENCIES = ["KWD", "USD"] as const;

/** Defaults driven by market */
function marketDefaults(market: MarketLabel) {
  if (market === "Kuwait Market") return { portfolio: "KFH" as const, currency: "KWD" as const };
  return { portfolio: "USA" as const, currency: "USD" as const };
}

// ── Component ───────────────────────────────────────────────────────

export default function AddStockScreen() {
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();
  const router = useRouter();
  const queryClient = useQueryClient();

  // ── Form state ──────────────────────────────────────────────────
  const [market, setMarket] = useState<MarketLabel>("Kuwait Market");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedStock, setSelectedStock] = useState<StockListEntry | null>(null);
  const [portfolio, setPortfolio] = useState<string>("KFH");
  const [currency, setCurrency] = useState<string>("KWD");
  const [showDropdown, setShowDropdown] = useState(false);

  // ── Fetch reference stock list ──────────────────────────────────
  const marketKey = market === "Kuwait Market" ? "kuwait" : "us";
  const { data: stockListData, isLoading: listLoading } = useQuery({
    queryKey: ["stock-list", marketKey],
    queryFn: () => getStockList({ market: marketKey }),
    staleTime: Infinity, // static data
    gcTime: 24 * 60 * 60_000, // keep in memory 24h
  });
  const allStocks = stockListData?.stocks ?? [];

  // ── Load user's existing stocks (for duplicate check) ───────────
  const { data: existingData } = useQuery({
    queryKey: ["stocks"],
    queryFn: () => getStocks(),
    staleTime: 60_000,
  });
  const existingSymbols = useMemo(() => {
    const set = new Set<string>();
    (existingData?.stocks ?? []).forEach((s) => set.add(s.symbol.trim().toUpperCase()));
    return set;
  }, [existingData]);

  // ── Filter stock list by search query ───────────────────────────
  const filteredStocks = useMemo(() => {
    if (!searchQuery.trim()) return allStocks;
    const q = searchQuery.toUpperCase();
    return allStocks.filter(
      (s) => s.symbol.toUpperCase().includes(q) || s.name.toUpperCase().includes(q)
    );
  }, [allStocks, searchQuery]);

  // ── Market change handler ───────────────────────────────────────
  const handleMarketChange = useCallback((m: MarketLabel) => {
    setMarket(m);
    const defaults = marketDefaults(m);
    setPortfolio(defaults.portfolio);
    setCurrency(defaults.currency);
    setSelectedStock(null);
    setSearchQuery("");
    setShowDropdown(false);
  }, []);

  // ── Stock selection handler ─────────────────────────────────────
  const handleSelectStock = useCallback(
    (stock: StockListEntry) => {
      setSelectedStock(stock);
      setSearchQuery(`${stock.symbol} - ${stock.name}`);
      setShowDropdown(false);
    },
    []
  );

  // ── Create stock mutation ───────────────────────────────────────
  const [fetchingPrice, setFetchingPrice] = useState(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      if (!selectedStock) throw new Error("Select a stock first");

      // Check duplicate
      if (existingSymbols.has(selectedStock.symbol.toUpperCase())) {
        throw new Error(`Stock '${selectedStock.symbol}' already exists in your portfolio`);
      }

      // Fetch price
      setFetchingPrice(true);
      let price = 0;
      try {
        const res = await fetchStockPrice(selectedStock.yf_ticker, currency);
        if (res.price != null && res.price > 0) price = res.price;
      } catch {
        // price stays 0 — non-fatal
      } finally {
        setFetchingPrice(false);
      }

      // Create stock
      return createStock({
        symbol: selectedStock.symbol,
        name: selectedStock.name,
        portfolio,
        currency,
        current_price: price,
        yf_ticker: selectedStock.yf_ticker,
      });
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ["stocks"] });
      queryClient.invalidateQueries({ queryKey: ["trading-summary"] });

      const msg = `Stock ${data.symbol} added successfully!\nWould you like to add a transaction for this stock?`;
      if (Platform.OS === "web") {
        if (window.confirm(msg)) {
          router.replace({
            pathname: "/(tabs)/add-transaction",
            params: { symbol: data.symbol, portfolio },
          } as any);
        } else {
          router.back();
        }
      } else {
        Alert.alert("Success", `Stock ${data.symbol} added successfully!`, [
          { text: "Done", style: "cancel", onPress: () => router.back() },
          {
            text: "Add Transaction",
            onPress: () =>
              router.replace({
                pathname: "/(tabs)/add-transaction",
                params: { symbol: data.symbol, portfolio },
              } as any),
          },
        ]);
      }
    },
    onError: (err: Error) => {
      const msg = err.message || "Failed to add stock";
      if (Platform.OS === "web") {
        alert(msg);
      } else {
        Alert.alert("Error", msg);
      }
    },
  });

  const isSubmitting = createMutation.isPending || fetchingPrice;

  // ── Duplicate badge helper ──────────────────────────────────────
  const isDuplicate = selectedStock
    ? existingSymbols.has(selectedStock.symbol.toUpperCase())
    : false;

  // ── Render ──────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={[styles.screen, { backgroundColor: colors.bgPrimary }]}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && { maxWidth: 600, alignSelf: "center", width: "100%" },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ────────────────────────────── */}
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <FontAwesome name="arrow-left" size={18} color={colors.textPrimary} />
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>Add Stock</Text>
        </View>

        {/* ── Market Selection ──────────────────── */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Market</Text>
        <View style={styles.segmentRow}>
          {MARKETS.map((m) => {
            const active = m === market;
            return (
              <Pressable
                key={m}
                onPress={() => handleMarketChange(m)}
                style={[
                  styles.segmentBtn,
                  { borderColor: colors.accentPrimary },
                  active && { backgroundColor: colors.accentPrimary },
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: active ? "#fff" : colors.accentPrimary },
                  ]}
                >
                  {m === "Kuwait Market" ? "🇰🇼 Kuwait" : "🇺🇸 US"}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Stock Search ──────────────────────── */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>
          Search Stock ({allStocks.length} available)
        </Text>
        <View style={{ zIndex: 100 }}>
          <View
            style={[
              styles.searchContainer,
              {
                borderColor: colors.borderColor,
                backgroundColor: colors.bgSecondary,
              },
            ]}
          >
            <FontAwesome
              name="search"
              size={14}
              color={colors.textMuted}
              style={{ marginRight: 8 }}
            />
            <RNTextInput
              style={[styles.searchInput, { color: colors.textPrimary }]}
              placeholder={
                market === "Kuwait Market"
                  ? "Search Kuwait stocks (e.g. KFH, Zain)..."
                  : "Search US stocks (e.g. AAPL, Tesla)..."
              }
              placeholderTextColor={colors.textMuted}
              value={searchQuery}
              onChangeText={(t) => {
                setSearchQuery(t);
                setShowDropdown(true);
                if (!t.trim()) setSelectedStock(null);
              }}
              onFocus={() => setShowDropdown(true)}
              autoCapitalize="characters"
              autoCorrect={false}
            />
            {searchQuery ? (
              <Pressable
                onPress={() => {
                  setSearchQuery("");
                  setSelectedStock(null);
                  setShowDropdown(false);
                }}
              >
                <FontAwesome name="times-circle" size={16} color={colors.textMuted} />
              </Pressable>
            ) : null}
          </View>

          {/* ── Dropdown ────────────────────────── */}
          {showDropdown && !selectedStock && (
            <View
              style={[
                styles.dropdown,
                {
                  backgroundColor: colors.bgSecondary,
                  borderColor: colors.borderColor,
                },
              ]}
            >
              {listLoading ? (
                <View style={styles.dropdownLoading}>
                  <ActivityIndicator size="small" color={colors.accentPrimary} />
                  <Text style={[styles.dropdownHint, { color: colors.textMuted }]}>
                    Loading stock list...
                  </Text>
                </View>
              ) : filteredStocks.length === 0 ? (
                <View style={styles.dropdownEmpty}>
                  <Text style={[styles.dropdownHint, { color: colors.textMuted }]}>
                    No stocks found for "{searchQuery}"
                  </Text>
                </View>
              ) : (
                <FlatList
                  data={filteredStocks.slice(0, 50)}
                  keyExtractor={(item) => item.symbol}
                  style={{ maxHeight: 260 }}
                  keyboardShouldPersistTaps="handled"
                  renderItem={({ item }) => {
                    const dup = existingSymbols.has(item.symbol.toUpperCase());
                    return (
                      <Pressable
                        onPress={() => handleSelectStock(item)}
                        style={({ pressed }) => [
                          styles.dropdownItem,
                          {
                            backgroundColor: pressed
                              ? colors.accentPrimary + "18"
                              : "transparent",
                          },
                        ]}
                      >
                        <View style={styles.dropdownItemContent}>
                          <Text
                            style={[
                              styles.dropdownSymbol,
                              { color: colors.textPrimary },
                            ]}
                          >
                            {item.symbol}
                          </Text>
                          <Text
                            style={[
                              styles.dropdownName,
                              { color: colors.textSecondary },
                            ]}
                            numberOfLines={1}
                          >
                            {item.name}
                          </Text>
                        </View>
                        {dup && (
                          <View style={[styles.dupBadge, { backgroundColor: "#FF9800" }]}>
                            <Text style={styles.dupBadgeText}>EXISTS</Text>
                          </View>
                        )}
                      </Pressable>
                    );
                  }}
                  ListFooterComponent={
                    filteredStocks.length > 50 ? (
                      <Text
                        style={[
                          styles.dropdownHint,
                          { color: colors.textMuted, padding: 8 },
                        ]}
                      >
                        Showing 50 of {filteredStocks.length} — type more to narrow
                      </Text>
                    ) : null
                  }
                />
              )}
            </View>
          )}
        </View>

        {/* ── Selected Stock Info ───────────────── */}
        {selectedStock && (
          <View
            style={[
              styles.selectedCard,
              {
                backgroundColor: colors.bgSecondary,
                borderColor: isDuplicate ? "#FF9800" : colors.accentPrimary,
              },
            ]}
          >
            <View style={styles.selectedHeader}>
              <FontAwesome
                name="check-circle"
                size={18}
                color={isDuplicate ? "#FF9800" : colors.accentPrimary}
              />
              <Text style={[styles.selectedSymbol, { color: colors.textPrimary }]}>
                {selectedStock.symbol}
              </Text>
              {isDuplicate && (
                <View style={[styles.dupBadge, { backgroundColor: "#FF9800" }]}>
                  <Text style={styles.dupBadgeText}>ALREADY EXISTS</Text>
                </View>
              )}
            </View>
            <Text style={[styles.selectedName, { color: colors.textSecondary }]}>
              {selectedStock.name}
            </Text>
            <Text style={[styles.selectedTicker, { color: colors.textMuted }]}>
              Yahoo Finance: {selectedStock.yf_ticker}
            </Text>
          </View>
        )}

        {/* ── Portfolio ─────────────────────────── */}
        <Text style={[styles.label, { color: colors.textSecondary, marginTop: 16 }]}>
          Portfolio
        </Text>
        <View style={styles.segmentRow}>
          {PORTFOLIOS.map((p) => {
            const active = p === portfolio;
            return (
              <Pressable
                key={p}
                onPress={() => setPortfolio(p)}
                style={[
                  styles.segmentBtn,
                  { borderColor: colors.accentPrimary },
                  active && { backgroundColor: colors.accentPrimary },
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: active ? "#fff" : colors.accentPrimary },
                  ]}
                >
                  {p}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Currency ──────────────────────────── */}
        <Text style={[styles.label, { color: colors.textSecondary }]}>Currency</Text>
        <View style={styles.segmentRow}>
          {CURRENCIES.map((c) => {
            const active = c === currency;
            return (
              <Pressable
                key={c}
                onPress={() => setCurrency(c)}
                style={[
                  styles.segmentBtn,
                  { borderColor: colors.accentPrimary },
                  active && { backgroundColor: colors.accentPrimary },
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: active ? "#fff" : colors.accentPrimary },
                  ]}
                >
                  {c}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {/* ── Submit Button ─────────────────────── */}
        <Pressable
          onPress={() => createMutation.mutate()}
          disabled={!selectedStock || isDuplicate || isSubmitting}
          style={({ pressed }) => [
            styles.submitBtn,
            {
              backgroundColor:
                !selectedStock || isDuplicate || isSubmitting
                  ? colors.textMuted + "40"
                  : pressed
                  ? colors.accentPrimary + "CC"
                  : colors.accentPrimary,
            },
          ]}
        >
          {isSubmitting ? (
            <View style={styles.submitInner}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={styles.submitText}>
                {fetchingPrice ? "Fetching Price..." : "Adding Stock..."}
              </Text>
            </View>
          ) : (
            <View style={styles.submitInner}>
              <FontAwesome name="plus-circle" size={18} color="#fff" />
              <Text style={styles.submitText}>Add Stock</Text>
            </View>
          )}
        </Pressable>

        {/* ── Hint ──────────────────────────────── */}
        <Text style={[styles.hint, { color: colors.textMuted }]}>
          The stock will be added to your portfolio. Current price will be
          auto-fetched from Yahoo Finance. You can then add transactions for
          this stock.
        </Text>

        {/* Spacer */}
        <View style={{ height: 40 }} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scrollContent: {
    padding: 20,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 12,
  },
  backBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  label: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 16,
  },
  segmentBtn: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1.5,
    alignItems: "center",
  },
  segmentText: {
    fontSize: 14,
    fontWeight: "600",
  },
  searchContainer: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 44,
    marginBottom: 4,
  },
  searchInput: {
    flex: 1,
    fontSize: 15,
    height: 44,
    ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}),
  },
  dropdown: {
    position: "absolute",
    top: 48,
    left: 0,
    right: 0,
    borderWidth: 1,
    borderRadius: 8,
    ...Platform.select({
      web: {
        boxShadow: "0 4px 16px rgba(0,0,0,0.15)",
      },
      default: {
        elevation: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 8,
      },
    }),
  },
  dropdownItem: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: "rgba(128,128,128,0.15)",
  },
  dropdownItemContent: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  dropdownSymbol: {
    fontSize: 14,
    fontWeight: "700",
    width: 90,
  },
  dropdownName: {
    fontSize: 13,
    flex: 1,
  },
  dropdownLoading: {
    padding: 20,
    alignItems: "center",
    gap: 8,
  },
  dropdownEmpty: {
    padding: 20,
    alignItems: "center",
  },
  dropdownHint: {
    fontSize: 13,
    textAlign: "center",
  },
  dupBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
    marginLeft: 8,
  },
  dupBadgeText: {
    color: "#fff",
    fontSize: 10,
    fontWeight: "700",
  },
  selectedCard: {
    borderWidth: 1.5,
    borderRadius: 10,
    padding: 14,
    marginTop: 8,
    marginBottom: 8,
  },
  selectedHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 4,
  },
  selectedSymbol: {
    fontSize: 17,
    fontWeight: "700",
  },
  selectedName: {
    fontSize: 14,
    marginLeft: 26,
  },
  selectedTicker: {
    fontSize: 12,
    marginLeft: 26,
    marginTop: 2,
  },
  submitBtn: {
    marginTop: 20,
    borderRadius: 10,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  submitInner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  hint: {
    fontSize: 12,
    textAlign: "center",
    marginTop: 12,
    lineHeight: 18,
  },
});
