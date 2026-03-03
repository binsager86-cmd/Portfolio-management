/**
 * Dividends Tracker — list all dividends, by-stock summary,
 * bonus shares, and yield calculator.
 *
 * Mirrors Streamlit's "Dividends Tracker" section with 4 tabs.
 */

import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  FlatList,
  Alert,
  Platform,
  TextInput,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import {
  getDividends,
  getDividendsByStock,
  getBonusShares,
  deleteDividend,
  DividendRecord,
  DividendByStock,
  BonusShareRecord,
  BonusByStock,
} from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { formatCurrency } from "@/lib/currency";
import { exportYieldCalcPdf } from "@/lib/exportYieldPdf";
import type { ThemePalette } from "@/constants/theme";

type TabKey = "all" | "by-stock" | "bonus" | "calculator";

export default function DividendsScreen() {
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<TabKey>("all");
  const [page, setPage] = useState(1);

  // ── Yield Calculator state ──
  const [calcCompanyName, setCalcCompanyName] = useState("");
  const [calcPurchasePrice, setCalcPurchasePrice] = useState("");
  const [calcShares, setCalcShares] = useState("");
  const [calcParValue, setCalcParValue] = useState("0.100");
  const [calcDivPercent, setCalcDivPercent] = useState("");
  const [calcBonusPercent, setCalcBonusPercent] = useState("");
  const [calcPreExPrice, setCalcPreExPrice] = useState("");
  const [calcIncludeCashInEx, setCalcIncludeCashInEx] = useState(false);

  const {
    data: divData,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["dividends", page],
    queryFn: () => getDividends({ page, page_size: 50 }),
  });

  const { data: byStockData } = useQuery({
    queryKey: ["dividends-by-stock"],
    queryFn: () => getDividendsByStock(),
  });

  const { data: bonusData } = useQuery({
    queryKey: ["bonus-shares"],
    queryFn: () => getBonusShares(),
    enabled: tab === "bonus",
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteDividend(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dividends"] });
      queryClient.invalidateQueries({ queryKey: ["dividends-by-stock"] });
      queryClient.invalidateQueries({ queryKey: ["bonus-shares"] });
      const msg = "Dividend record deleted";
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Success", msg);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.message ?? "Delete failed";
      Platform.OS === "web" ? window.alert(msg) : Alert.alert("Error", msg);
    },
  });

  const handleDelete = (id: number) => {
    const doDelete = () => deleteMut.mutate(id);
    if (Platform.OS === "web") {
      if (window.confirm("Delete this dividend record?")) doDelete();
    } else {
      Alert.alert("Confirm", "Delete this dividend record?", [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  };

  // Yield Calculator computed values (CFA-level)
  const calcResults = useMemo(() => {
    const purchasePrice = parseFloat(calcPurchasePrice) || 0;
    const shares = parseFloat(calcShares) || 0;
    const parValue = parseFloat(calcParValue) || 0.100;
    const divPct = parseFloat(calcDivPercent) || 0;
    const bonusPct = parseFloat(calcBonusPercent) || 0;
    const preExPrice = parseFloat(calcPreExPrice) || purchasePrice;

    if (purchasePrice <= 0 || shares <= 0) return null;

    // ── Core calculations ──
    const totalCost = purchasePrice * shares;

    // Cash dividend: % of par/nominal value (CFA standard)
    // e.g. 10% cash div on 100 fils par = 10 fils = 0.010 KWD per share
    const cashDivPerShare = parValue * (divPct / 100);
    const totalCashDiv = cashDivPerShare * shares;
    const cashYieldOnCost = (totalCashDiv / totalCost) * 100;

    // Bonus shares (integer, fractional shares not issued)
    const bonusShares = bonusPct > 0 ? Math.floor(shares * (bonusPct / 100)) : 0;

    // ── Before Ex-Date Analysis ──
    // Bonus shares valued at the market price before ex-date
    const bonusValueBeforeEx = bonusShares * preExPrice;
    const totalReturnBeforeEx = totalCashDiv + bonusValueBeforeEx;
    const yieldBeforeEx = (totalReturnBeforeEx / totalCost) * 100;

    // ── After Ex-Date Analysis ──
    // Standard stock exchange ex-date price adjustment:
    //   Cash div only:  P − CashDiv/share  (cash leaves the company)
    //   Bonus only:     P / (1 + bonusRate) (shares split, value preserved)
    //   Both:           (P − CashDiv/share) / (1 + bonusRate)
    const hasExDateAdj = bonusPct > 0 || calcIncludeCashInEx;
    let theoreticalExPrice = preExPrice;
    if (hasExDateAdj) {
      let adjPrice = preExPrice;
      // Step 1: subtract cash dividend per share (checkbox)
      if (calcIncludeCashInEx && cashDivPerShare > 0) {
        adjPrice = adjPrice - cashDivPerShare;
      }
      // Step 2: divide by bonus factor
      if (bonusPct > 0) {
        adjPrice = adjPrice / (1 + bonusPct / 100);
      }
      theoreticalExPrice = Math.max(0, adjPrice);
    }
    const bonusValueAfterEx = bonusShares * theoreticalExPrice;
    const totalReturnAfterEx = totalCashDiv + bonusValueAfterEx;
    const yieldAfterEx = (totalReturnAfterEx / totalCost) * 100;

    // New total shares and adjusted avg cost after ex-date
    const totalSharesAfterEx = shares + bonusShares;
    const adjustedAvgCost = totalSharesAfterEx > 0
      ? (totalCost - (calcIncludeCashInEx ? totalCashDiv : 0)) / totalSharesAfterEx
      : 0;

    return {
      totalCost,
      parValue,
      cashDivPerShare,
      totalCashDiv,
      cashYieldOnCost,
      bonusShares,
      // Before Ex-Date
      preExPrice,
      bonusValueBeforeEx,
      totalReturnBeforeEx,
      yieldBeforeEx,
      // After Ex-Date
      theoreticalExPrice,
      bonusValueAfterEx,
      totalReturnAfterEx,
      yieldAfterEx,
      totalSharesAfterEx,
      adjustedAvgCost,
      // Flags
      hasBonus: bonusPct > 0,
      hasExDateAdj,
    };
  }, [calcPurchasePrice, calcShares, calcParValue, calcDivPercent, calcBonusPercent, calcPreExPrice, calcIncludeCashInEx]);

  if (isLoading) return <LoadingScreen />;
  if (isError)
    return <ErrorScreen message={error?.message ?? "Failed to load dividends"} onRetry={refetch} />;

  const dividends = divData?.dividends ?? [];
  const totals = divData?.totals;
  const byStockList = byStockData?.stocks ?? [];
  const bonusRecords = bonusData?.records ?? [];
  const bonusByStock = bonusData?.by_stock ?? [];

  const TABS: { key: TabKey; label: string }[] = [
    { key: "all", label: "All Dividends" },
    { key: "by-stock", label: "By Stock" },
    { key: "bonus", label: "Bonus Shares" },
    { key: "calculator", label: "Yield Calc" },
  ];

  return (
    <View style={[s.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.borderColor }]}>
        <Text style={[s.title, { color: colors.textPrimary }]}>Dividends Tracker</Text>
      </View>

      {/* Totals Row */}
      {totals && (
        <View style={[s.totalsRow, { borderBottomColor: colors.borderColor }]}>
          <View style={[s.totalCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[s.totalLabel, { color: colors.textSecondary }]}>Cash Dividends</Text>
            <Text style={[s.totalValue, { color: colors.success }]}>{formatCurrency(totals.total_cash_dividend_kwd, "KWD")}</Text>
          </View>
          <View style={[s.totalCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[s.totalLabel, { color: colors.textSecondary }]}>Bonus Shares</Text>
            <Text style={[s.totalValue, { color: colors.accentPrimary }]}>{totals.total_bonus_shares.toLocaleString()}</Text>
          </View>
          <View style={[s.totalCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[s.totalLabel, { color: colors.textSecondary }]}>Reinvested</Text>
            <Text style={[s.totalValue, { color: colors.accentPrimary }]}>{formatCurrency(totals.total_reinvested_kwd, "KWD")}</Text>
          </View>
          <View style={[s.totalCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[s.totalLabel, { color: colors.textSecondary }]}>Stocks</Text>
            <Text style={[s.totalValue, { color: colors.textPrimary }]}>{totals.unique_stocks}</Text>
          </View>
        </View>
      )}

      {/* Tabs */}
      <View style={[s.tabContainer, { borderBottomColor: colors.borderColor }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabContentContainer}
        >
          {TABS.map((t) => (
            <Pressable
              key={t.key}
              onPress={() => setTab(t.key)}
              style={[
                s.tabBtn,
                tab === t.key && { borderBottomColor: colors.accentPrimary, borderBottomWidth: 2 },
              ]}
            >
              <Text style={{ color: tab === t.key ? colors.accentPrimary : colors.textSecondary, fontWeight: "600", fontSize: 14 }}>
                {t.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* ── Tab: All Dividends ── */}
      {tab === "all" && (
        <FlatList
          data={dividends}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[s.listContent, isDesktop && { maxWidth: 900, alignSelf: "center", width: "100%" }]}
          refreshControl={
            <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />
          }
          renderItem={({ item }) => (
            <View style={[s.divRow, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.divSymbol, { color: colors.textPrimary }]}>{item.stock_symbol}</Text>
                <Text style={[s.divMeta, { color: colors.textSecondary }]}>
                  {item.portfolio} · {item.txn_date}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end", gap: 2 }}>
                {item.cash_dividend > 0 && (
                  <Text style={[s.divAmt, { color: colors.success }]}>
                    Cash: {formatCurrency(item.cash_dividend_kwd, "KWD")}
                  </Text>
                )}
                {item.bonus_shares > 0 && (
                  <Text style={[s.divAmt, { color: colors.accentPrimary }]}>
                    Bonus: {item.bonus_shares} shares
                  </Text>
                )}
                {item.reinvested_dividend > 0 && (
                  <Text style={[s.divAmt, { color: colors.textSecondary }]}>
                    Reinvested: {formatCurrency(item.reinvested_kwd, "KWD")}
                  </Text>
                )}
                <Pressable onPress={() => handleDelete(item.id)} hitSlop={8}>
                  <FontAwesome name="trash-o" size={14} color={colors.danger} />
                </Pressable>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <FontAwesome name="money" size={48} color={colors.textMuted} />
              <Text style={[s.emptyText, { color: colors.textSecondary }]}>No dividend records found</Text>
            </View>
          }
          ListFooterComponent={
            (divData?.pagination?.total_pages ?? 1) > 1 ? (
              <View style={s.pagination}>
                <Pressable
                  onPress={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  style={[s.pageBtn, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, opacity: page <= 1 ? 0.4 : 1 }]}
                >
                  <FontAwesome name="chevron-left" size={14} color={colors.textPrimary} />
                </Pressable>
                <Text style={[s.pageInfo, { color: colors.textSecondary }]}>
                  {page} / {divData?.pagination?.total_pages ?? 1}
                </Text>
                <Pressable
                  onPress={() => setPage((p) => Math.min(divData?.pagination?.total_pages ?? 1, p + 1))}
                  disabled={page >= (divData?.pagination?.total_pages ?? 1)}
                  style={[s.pageBtn, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, opacity: page >= (divData?.pagination?.total_pages ?? 1) ? 0.4 : 1 }]}
                >
                  <FontAwesome name="chevron-right" size={14} color={colors.textPrimary} />
                </Pressable>
              </View>
            ) : null
          }
        />
      )}

      {/* ── Tab: By Stock ── */}
      {tab === "by-stock" && (
        <FlatList
          data={byStockList}
          keyExtractor={(item) => item.stock_symbol}
          contentContainerStyle={[s.listContent, isDesktop && { maxWidth: 900, alignSelf: "center", width: "100%" }]}
          renderItem={({ item }) => (
            <View style={[s.divRow, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
              <View style={{ flex: 1 }}>
                <Text style={[s.divSymbol, { color: colors.textPrimary }]}>{item.stock_symbol}</Text>
                <Text style={[s.divMeta, { color: colors.textSecondary }]}>
                  {item.dividend_count} dividends · Cost: {formatCurrency(item.total_cost, "KWD")}
                </Text>
              </View>
              <View style={{ alignItems: "flex-end" }}>
                <Text style={[s.divAmt, { color: colors.success }]}>
                  Cash: {formatCurrency(item.total_cash_dividend_kwd, "KWD")}
                </Text>
                {item.total_bonus_shares > 0 && (
                  <Text style={[s.divAmt, { color: colors.accentPrimary }]}>
                    Bonus: {item.total_bonus_shares}
                  </Text>
                )}
                <Text style={[s.divAmt, { color: item.yield_on_cost_pct > 0 ? colors.success : colors.textMuted }]}>
                  Yield: {item.yield_on_cost_pct.toFixed(2)}%
                </Text>
              </View>
            </View>
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <FontAwesome name="money" size={48} color={colors.textMuted} />
              <Text style={[s.emptyText, { color: colors.textSecondary }]}>No dividend data by stock</Text>
            </View>
          }
        />
      )}

      {/* ── Tab: Bonus Shares ── */}
      {tab === "bonus" && (
        <ScrollView contentContainerStyle={[s.listContent, isDesktop && { maxWidth: 900, alignSelf: "center", width: "100%" }]}>
          {/* Summary cards */}
          <View style={[s.totalsRow, { borderBottomWidth: 0, paddingHorizontal: 0, marginBottom: 8 }]}>
            <View style={[s.totalCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
              <Text style={[s.totalLabel, { color: colors.textSecondary }]}>Total Bonus</Text>
              <Text style={[s.totalValue, { color: colors.accentPrimary }]}>{(bonusData?.total_bonus_shares ?? 0).toLocaleString()}</Text>
            </View>
            <View style={[s.totalCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
              <Text style={[s.totalLabel, { color: colors.textSecondary }]}>Stocks</Text>
              <Text style={[s.totalValue, { color: colors.textPrimary }]}>{bonusByStock.length}</Text>
            </View>
          </View>

          {/* By-stock summary */}
          {bonusByStock.length > 0 && (
            <>
              <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>By Stock</Text>
              {bonusByStock.map((bs) => (
                <View key={bs.stock_symbol} style={[s.divRow, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.divSymbol, { color: colors.textPrimary }]}>{bs.stock_symbol}</Text>
                    <Text style={[s.divMeta, { color: colors.textSecondary }]}>{bs.bonus_count} events</Text>
                  </View>
                  <Text style={[s.divAmt, { color: colors.accentPrimary, fontWeight: "700" }]}>
                    {bs.total_bonus_shares.toLocaleString()} shares
                  </Text>
                </View>
              ))}
            </>
          )}

          {/* History list */}
          <Text style={[s.sectionLabel, { color: colors.textSecondary, marginTop: 16 }]}>History</Text>
          {bonusRecords.length === 0 ? (
            <View style={s.empty}>
              <FontAwesome name="gift" size={48} color={colors.textMuted} />
              <Text style={[s.emptyText, { color: colors.textSecondary }]}>No bonus share records</Text>
            </View>
          ) : (
            bonusRecords.map((rec) => (
              <View key={rec.id} style={[s.divRow, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                <View style={{ flex: 1 }}>
                  <Text style={[s.divSymbol, { color: colors.textPrimary }]}>{rec.stock_symbol}</Text>
                  <Text style={[s.divMeta, { color: colors.textSecondary }]}>
                    {rec.portfolio} · {rec.txn_date}
                  </Text>
                </View>
                <Text style={[s.divAmt, { color: colors.accentPrimary }]}>
                  +{rec.bonus_shares} shares
                </Text>
              </View>
            ))
          )}
        </ScrollView>
      )}

      {/* ── Tab: Yield Calculator ── */}
      {tab === "calculator" && (
        <ScrollView contentContainerStyle={[s.listContent, isDesktop && { maxWidth: 600, alignSelf: "center", width: "100%" }]}>
          <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>Dividend Yield Calculator</Text>

          <View style={[s.calcCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[s.calcFieldLabel, { color: colors.textSecondary }]}>Company Name</Text>
            <TextInput
              style={[s.calcInput, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
              placeholderTextColor={colors.textMuted}
              placeholder="e.g. National Bank of Kuwait"
              keyboardType="default"
              value={calcCompanyName}
              onChangeText={setCalcCompanyName}
            />

            <Text style={[s.calcFieldLabel, { color: colors.textSecondary }]}>Purchase Price per Share</Text>
            <TextInput
              style={[s.calcInput, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
              placeholderTextColor={colors.textMuted}
              placeholder="0.000"
              keyboardType="decimal-pad"
              value={calcPurchasePrice}
              onChangeText={setCalcPurchasePrice}
            />

            <Text style={[s.calcFieldLabel, { color: colors.textSecondary }]}>Number of Shares</Text>
            <TextInput
              style={[s.calcInput, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
              placeholderTextColor={colors.textMuted}
              placeholder="0"
              keyboardType="numeric"
              value={calcShares}
              onChangeText={setCalcShares}
            />

            <Text style={[s.calcFieldLabel, { color: colors.textSecondary }]}>Par / Nominal Value</Text>
            <TextInput
              style={[s.calcInput, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
              placeholderTextColor={colors.textMuted}
              placeholder="0.100"
              keyboardType="decimal-pad"
              value={calcParValue}
              onChangeText={setCalcParValue}
            />

            <Text style={[s.calcFieldLabel, { color: colors.textSecondary }]}>Cash Dividend % (of par value)</Text>
            <TextInput
              style={[s.calcInput, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
              placeholderTextColor={colors.textMuted}
              placeholder="e.g. 10"
              keyboardType="decimal-pad"
              value={calcDivPercent}
              onChangeText={setCalcDivPercent}
            />

            <Text style={[s.calcFieldLabel, { color: colors.textSecondary }]}>Bonus Share % (optional)</Text>
            <TextInput
              style={[s.calcInput, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
              placeholderTextColor={colors.textMuted}
              placeholder="e.g. 10"
              keyboardType="decimal-pad"
              value={calcBonusPercent}
              onChangeText={setCalcBonusPercent}
            />

            <Text style={[s.calcFieldLabel, { color: colors.textSecondary }]}>Price Before Ex-Date (market price)</Text>
            <TextInput
              style={[s.calcInput, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
              placeholderTextColor={colors.textMuted}
              placeholder="Same as purchase price if empty"
              keyboardType="decimal-pad"
              value={calcPreExPrice}
              onChangeText={setCalcPreExPrice}
            />

            {/* Checkbox: include cash dividend in ex-date price adjustment */}
            <Pressable
              onPress={() => setCalcIncludeCashInEx((v) => !v)}
              style={s.checkboxRow}
            >
              <View style={[s.checkbox, { borderColor: colors.borderColor, backgroundColor: calcIncludeCashInEx ? colors.accentPrimary : "transparent" }]}>
                {calcIncludeCashInEx && <FontAwesome name="check" size={12} color="#fff" />}
              </View>
              <Text style={{ color: colors.textPrimary, fontSize: 13, flex: 1 }}>
                Include cash dividend in ex-date price adjustment
              </Text>
            </Pressable>
          </View>

          {/* ── Results ── */}
          {calcResults && (
            <>
              {/* Cash Dividend Section */}
              <View style={[s.calcCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, marginTop: 12 }]}>
                <Text style={[s.sectionLabel, { color: colors.success, marginBottom: 10 }]}>💰 Cash Dividend</Text>

                <View style={s.calcRow}>
                  <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>Total Cost</Text>
                  <Text style={[s.calcRowValue, { color: colors.textPrimary }]}>{formatCurrency(calcResults.totalCost, "KWD")}</Text>
                </View>
                <View style={s.calcRow}>
                  <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>Par Value</Text>
                  <Text style={[s.calcRowValue, { color: colors.textPrimary }]}>{calcResults.parValue.toFixed(3)}</Text>
                </View>
                <View style={s.calcRow}>
                  <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>Cash Div / Share</Text>
                  <Text style={[s.calcRowValue, { color: colors.success }]}>{calcResults.cashDivPerShare.toFixed(3)}</Text>
                </View>
                <View style={s.calcRow}>
                  <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>Total Cash Dividend</Text>
                  <Text style={[s.calcRowValue, { color: colors.success }]}>{formatCurrency(calcResults.totalCashDiv, "KWD")}</Text>
                </View>
                <View style={[s.calcRow, { borderTopWidth: 1, borderTopColor: colors.borderColor, paddingTop: 8, marginTop: 4 }]}>
                  <Text style={[s.calcRowLabel, { color: colors.textPrimary, fontWeight: "700" }]}>Cash Yield on Cost</Text>
                  <Text style={[s.calcRowValue, { color: colors.success, fontWeight: "700" }]}>{calcResults.cashYieldOnCost.toFixed(2)}%</Text>
                </View>
              </View>

              {/* Before Ex-Date */}
              <View style={[s.calcCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, marginTop: 12 }]}>
                <Text style={[s.sectionLabel, { color: colors.accentPrimary, marginBottom: 10 }]}>📈 Before Ex-Date Yield</Text>

                <View style={s.calcRow}>
                  <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>Pre-Ex Price</Text>
                  <Text style={[s.calcRowValue, { color: colors.textPrimary }]}>{calcResults.preExPrice.toFixed(3)}</Text>
                </View>
                {calcResults.hasBonus && (
                  <>
                    <View style={s.calcRow}>
                      <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>Bonus Shares</Text>
                      <Text style={[s.calcRowValue, { color: colors.accentPrimary }]}>{calcResults.bonusShares.toLocaleString()}</Text>
                    </View>
                    <View style={s.calcRow}>
                      <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>Bonus Value (× pre-ex price)</Text>
                      <Text style={[s.calcRowValue, { color: colors.accentPrimary }]}>{formatCurrency(calcResults.bonusValueBeforeEx, "KWD")}</Text>
                    </View>
                  </>
                )}
                <View style={s.calcRow}>
                  <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>Cash Dividend</Text>
                  <Text style={[s.calcRowValue, { color: colors.success }]}>{formatCurrency(calcResults.totalCashDiv, "KWD")}</Text>
                </View>
                <View style={[s.calcRow, { borderTopWidth: 1, borderTopColor: colors.borderColor, paddingTop: 8, marginTop: 4 }]}>
                  <Text style={[s.calcRowLabel, { color: colors.textPrimary, fontWeight: "700" }]}>Total Return</Text>
                  <Text style={[s.calcRowValue, { color: colors.success, fontWeight: "700" }]}>{formatCurrency(calcResults.totalReturnBeforeEx, "KWD")}</Text>
                </View>
                <View style={s.calcRow}>
                  <Text style={[s.calcRowLabel, { color: colors.textPrimary, fontWeight: "700" }]}>Yield on Cost</Text>
                  <Text style={[s.calcRowValue, { color: colors.success, fontWeight: "700" }]}>{calcResults.yieldBeforeEx.toFixed(2)}%</Text>
                </View>
              </View>

              {/* After Ex-Date */}
              {calcResults.hasExDateAdj && (
                <View style={[s.calcCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, marginTop: 12 }]}>
                  <Text style={[s.sectionLabel, { color: colors.warning ?? "#f59e0b", marginBottom: 10 }]}>📉 After Ex-Date Yield</Text>

                  <View style={s.calcRow}>
                    <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>Theoretical Ex-Price</Text>
                    <Text style={[s.calcRowValue, { color: colors.textPrimary }]}>{calcResults.theoreticalExPrice.toFixed(3)}</Text>
                  </View>
                  <View style={s.calcRow}>
                    <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>Adjustment Formula</Text>
                    <Text style={[s.calcRowValue, { color: colors.textMuted, fontSize: 11 }]}>
                      {calcResults.hasBonus && calcIncludeCashInEx
                        ? "(P−Div) / (1+Bonus%)"
                        : calcResults.hasBonus
                        ? "P / (1+Bonus%)"
                        : "P − CashDiv/share"}
                    </Text>
                  </View>
                  <View style={s.calcRow}>
                    <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>Price Drop</Text>
                    <Text style={[s.calcRowValue, { color: colors.danger }]}>
                      −{(calcResults.preExPrice - calcResults.theoreticalExPrice).toFixed(3)}
                      {" "}({(((calcResults.preExPrice - calcResults.theoreticalExPrice) / calcResults.preExPrice) * 100).toFixed(2)}%)
                    </Text>
                  </View>
                  {calcResults.hasBonus && (
                    <>
                      <View style={s.calcRow}>
                        <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>Bonus Shares</Text>
                        <Text style={[s.calcRowValue, { color: colors.accentPrimary }]}>{calcResults.bonusShares.toLocaleString()}</Text>
                      </View>
                      <View style={s.calcRow}>
                        <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>Bonus Value (× ex price)</Text>
                        <Text style={[s.calcRowValue, { color: colors.accentPrimary }]}>{formatCurrency(calcResults.bonusValueAfterEx, "KWD")}</Text>
                      </View>
                    </>
                  )}
                  <View style={s.calcRow}>
                    <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>Cash Dividend</Text>
                    <Text style={[s.calcRowValue, { color: colors.success }]}>{formatCurrency(calcResults.totalCashDiv, "KWD")}</Text>
                  </View>
                  <View style={s.calcRow}>
                    <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>Total Shares After Ex</Text>
                    <Text style={[s.calcRowValue, { color: colors.textPrimary }]}>{calcResults.totalSharesAfterEx.toLocaleString()}</Text>
                  </View>
                  <View style={s.calcRow}>
                    <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>Adjusted Avg Cost</Text>
                    <Text style={[s.calcRowValue, { color: colors.textPrimary }]}>{calcResults.adjustedAvgCost.toFixed(3)}</Text>
                  </View>
                  <View style={[s.calcRow, { borderTopWidth: 1, borderTopColor: colors.borderColor, paddingTop: 8, marginTop: 4 }]}>
                    <Text style={[s.calcRowLabel, { color: colors.textPrimary, fontWeight: "700" }]}>Total Return</Text>
                    <Text style={[s.calcRowValue, { color: colors.success, fontWeight: "700" }]}>{formatCurrency(calcResults.totalReturnAfterEx, "KWD")}</Text>
                  </View>
                  <View style={s.calcRow}>
                    <Text style={[s.calcRowLabel, { color: colors.textPrimary, fontWeight: "700" }]}>Yield on Cost</Text>
                    <Text style={[s.calcRowValue, { color: colors.success, fontWeight: "700" }]}>{calcResults.yieldAfterEx.toFixed(2)}%</Text>
                  </View>
                </View>
              )}

              {/* Yield Comparison Summary */}
              <View style={[s.calcCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, marginTop: 12 }]}>
                <Text style={[s.sectionLabel, { color: colors.textSecondary, marginBottom: 10 }]}>📊 Yield Summary</Text>

                <View style={s.calcRow}>
                  <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>Cash Yield on Cost</Text>
                  <Text style={[s.calcRowValue, { color: colors.success, fontWeight: "700" }]}>{calcResults.cashYieldOnCost.toFixed(2)}%</Text>
                </View>
                <View style={s.calcRow}>
                  <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>Before Ex-Date Total Yield</Text>
                  <Text style={[s.calcRowValue, { color: colors.success, fontWeight: "700" }]}>{calcResults.yieldBeforeEx.toFixed(2)}%</Text>
                </View>
                {calcResults.hasExDateAdj && (
                  <>
                    <View style={s.calcRow}>
                      <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>After Ex-Date Total Yield</Text>
                      <Text style={[s.calcRowValue, { color: colors.success, fontWeight: "700" }]}>{calcResults.yieldAfterEx.toFixed(2)}%</Text>
                    </View>
                    <View style={[s.calcRow, { borderTopWidth: 1, borderTopColor: colors.borderColor, paddingTop: 8, marginTop: 4 }]}>
                      <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>Yield Difference</Text>
                      <Text style={[s.calcRowValue, { color: colors.danger, fontWeight: "700" }]}>
                        {(calcResults.yieldBeforeEx - calcResults.yieldAfterEx).toFixed(2)}%
                      </Text>
                    </View>
                  </>
                )}
              </View>

              {/* ── Export PDF Button ── */}
              <Pressable
                onPress={async () => {
                  await exportYieldCalcPdf(
                    {
                      companyName: calcCompanyName.trim() || undefined,
                      purchasePrice: parseFloat(calcPurchasePrice) || 0,
                      shares: parseFloat(calcShares) || 0,
                      parValue: parseFloat(calcParValue) || 0.1,
                      divPercent: parseFloat(calcDivPercent) || 0,
                      bonusPercent: parseFloat(calcBonusPercent) || 0,
                      preExPrice: parseFloat(calcPreExPrice) || parseFloat(calcPurchasePrice) || 0,
                      includeCashInEx: calcIncludeCashInEx,
                    },
                    calcResults,
                  );
                }}
                style={({ pressed }) => [
                  s.exportBtn,
                  {
                    backgroundColor: pressed ? "#4F46E5" : "#6366F1",
                    shadowColor: "#6366F1",
                    shadowOpacity: 0.3,
                    shadowRadius: 8,
                    shadowOffset: { width: 0, height: 4 },
                    elevation: 4,
                  },
                ]}
              >
                <FontAwesome name="file-pdf-o" size={16} color="#fff" />
                <Text style={s.exportBtnText}>Download PDF Report</Text>
              </Pressable>
            </>
          )}
        </ScrollView>
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
  totalsRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    padding: 12,
    borderBottomWidth: 1,
  },
  totalCard: {
    minWidth: 120,
    flex: 1,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },
  totalLabel: { fontSize: 11, marginBottom: 2 },
  totalValue: { fontSize: 16, fontWeight: "700" },
  tabContainer: {
    borderBottomWidth: 1,
    minHeight: 44,
  },
  tabContentContainer: {
    flexDirection: "row",
    alignItems: "stretch",
    paddingHorizontal: 4,
  },
  tabBtn: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
  },
  listContent: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 80 },
  divRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
  },
  divSymbol: { fontSize: 15, fontWeight: "600" },
  divMeta: { fontSize: 12, marginTop: 2 },
  divAmt: { fontSize: 13, fontWeight: "600" },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14 },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 16,
  },
  pageBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pageInfo: { fontSize: 14 },
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
    marginTop: 4,
  },
  calcCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  calcFieldLabel: { fontSize: 13, fontWeight: "600", marginBottom: 4, marginTop: 10 },
  calcInput: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  calcRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  calcRowLabel: { fontSize: 14 },
  calcRowValue: { fontSize: 14, fontWeight: "600" },
  checkboxRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginTop: 14,
    paddingVertical: 6,
  },
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 4,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    marginTop: 16,
    marginBottom: 32,
    paddingVertical: 14,
    borderRadius: 12,
  },
  exportBtnText: {
    color: "#fff",
    fontSize: 15,
    fontWeight: "700",
    letterSpacing: 0.3,
  },
});
