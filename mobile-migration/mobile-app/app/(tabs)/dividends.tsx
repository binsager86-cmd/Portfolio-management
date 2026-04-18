/**
 * Dividends Tracker — list all dividends, by-stock summary,
 * bonus shares, and yield calculator.
 *
 * Mirrors Streamlit's "Dividends Tracker" section with 4 tabs.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useRef, useState } from "react";
import {
    Alert,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import DividendYearlyChart, { type YearlyDividendData } from "@/components/charts/DividendYearlyChart";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { DividendsSkeleton } from "@/components/ui/PageSkeletons";
import { useAllDividends, useBonusShares, useDividends, useDividendsByStock, useHoldings } from "@/hooks/queries";
import { useResponsive } from "@/hooks/useResponsive";
import { useScreenStyles } from "@/hooks/useScreenStyles";
import { formatCurrency } from "@/lib/currency";
import { projectPortfolioDividends, type PortfolioProjectionSummary } from "@/lib/dividendProjector";
import { showErrorAlert } from "@/lib/errorHandling";
import { deleteDividend } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { useUserPrefsStore } from "@/src/store/userPrefsStore";
import { useTranslation } from "react-i18next";

type TabKey = "all" | "by-stock" | "bonus" | "calculator" | "projections";

export default function DividendsScreen() {
  const { colors, toggle, mode } = useThemeStore();
  const ss = useScreenStyles();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const expertiseLevel = useUserPrefsStore((s) => s.preferences.expertiseLevel);
  const [tab, setTab] = useState<TabKey>("all");
  const [page, setPage] = useState(1);
  const [showProjectionOnChart, setShowProjectionOnChart] = useState(false);

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
  } = useDividends(page);

  const { data: byStockData } = useDividendsByStock();

  const { data: bonusData } = useBonusShares(tab === "bonus");

  // All dividends for the yearly chart
  const { data: allDivData } = useAllDividends();

  // Holdings for projections
  const { data: holdingsResp } = useHoldings();

  const yearlyChartData = useMemo<YearlyDividendData[]>(() => {
    const divs = allDivData?.dividends ?? [];
    if (!divs.length) return [];
    const byYear: Record<string, number> = {};
    for (const d of divs) {
      const year = d.txn_date?.slice(0, 4);
      if (!year) continue;
      byYear[year] = (byYear[year] ?? 0) + (d.cash_dividend_kwd ?? 0);
    }
    return Object.keys(byYear)
      .sort()
      .map((year) => ({ year, amount: byYear[year] }));
  }, [allDivData]);

  // Dividend projection (CFA-level: uses per-year transaction history + growth modeling)
  const projection = useMemo<PortfolioProjectionSummary | null>(() => {
    const holdings = holdingsResp?.holdings;
    if (!holdings || holdings.length === 0) return null;
    const allRecords = allDivData?.dividends;
    const byStockDivs = byStockData?.stocks;
    return projectPortfolioDividends(holdings, allRecords, byStockDivs);
  }, [holdingsResp, allDivData, byStockData]);

  // Projected chart data — next year as a dashed bar
  const projectedChartData = useMemo<YearlyDividendData[]>(() => {
    if (!projection || projection.totalProjected <= 0) return [];
    const projYear = String(projection.projectionYear);
    return [{ year: projYear, amount: projection.totalProjected }];
  }, [projection]);

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteDividend(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["dividends"] });
      queryClient.invalidateQueries({ queryKey: ["dividends-by-stock"] });
      queryClient.invalidateQueries({ queryKey: ["bonus-shares"] });
      const msg = t("dividends.recordDeleted");
      Platform.OS === "web" ? window.alert(msg) : Alert.alert(t("dividends.success"), msg);
    },
    onError: (err) => showErrorAlert(t("dividends.error"), err, t("dividends.deleteFailed")),
  });

  const handleDelete = (id: number) => {
    const doDelete = () => deleteMut.mutate(id);
    if (Platform.OS === "web") {
      if (window.confirm(t("dividends.deleteRecord"))) doDelete();
    } else {
      Alert.alert(t("dividends.confirm"), t("dividends.deleteRecord"), [
        { text: t("dividends.cancel"), style: "cancel" },
        { text: t("dividends.deleteAction"), style: "destructive", onPress: doDelete },
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

  if (isLoading) return <DividendsSkeleton />;
  if (isError)
    return <ErrorScreen message={error?.message ?? t("dividends.failedToLoad")} onRetry={refetch} />;

  const dividends = divData?.dividends ?? [];
  const totals = divData?.totals;
  const byStockList = byStockData?.stocks ?? [];
  const bonusRecords = bonusData?.records ?? [];
  const bonusByStock = bonusData?.by_stock ?? [];

  const TABS: { key: TabKey; label: string; minLevel?: 'normal' | 'intermediate' | 'advanced' }[] = [
    { key: "all", label: t("dividends.allDividends") },
    { key: "by-stock", label: t("dividends.byStock") },
    { key: "bonus", label: t("dividends.bonusShares"), minLevel: "intermediate" },
    { key: "projections", label: t("dividends.projections") },
    { key: "calculator", label: t("dividends.yieldCalc") },
  ];

  const levelOrder = ["normal", "intermediate", "advanced"] as const;
  const visibleTabs = TABS.filter((t) => {
    if (!t.minLevel) return true;
    return levelOrder.indexOf(expertiseLevel) >= levelOrder.indexOf(t.minLevel);
  });

  return (
    <ScrollView
      style={ss.container}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingHorizontal: 12,
        paddingBottom: 80,
        ...(isDesktop ? { maxWidth: 960, alignSelf: "center" as const, width: "100%" as const } : {}),
      }}
      refreshControl={
        <RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />
      }
      keyboardShouldPersistTaps="handled"
      stickyHeaderIndices={[3]}
    >
      {/* ── Inline scrollable header ── */}
      <View style={s.inlineHeader}>
        <Text style={[s.inlineHeaderTitle, { color: colors.textPrimary }]}>
          {t("dividends.title")}
        </Text>
        <Pressable onPress={toggle} style={s.inlineHeaderBtn}>
          {({ pressed }) => (
            <FontAwesome
              name={mode === "dark" ? "lightbulb-o" : "moon-o"}
              size={20}
              color={colors.textSecondary}
              style={{ opacity: pressed ? 0.5 : 1 }}
            />
          )}
        </Pressable>
      </View>

      {/* ── Totals Row ── */}
      {totals ? (
        <View style={[s.totalsRow, { borderBottomColor: colors.borderColor }]}>
          <View style={[s.totalCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[s.totalLabel, { color: colors.textSecondary }]}>{t("dividends.cashDividends")}</Text>
            <Text style={[s.totalValue, { color: colors.success }]}>{formatCurrency(totals.total_cash_dividend_kwd, "KWD")}</Text>
          </View>
          <View style={[s.totalCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[s.totalLabel, { color: colors.textSecondary }]}>{t("dividends.bonusShares")}</Text>
            <Text style={[s.totalValue, { color: colors.accentPrimary }]}>{totals.total_bonus_shares.toLocaleString()}</Text>
          </View>
          <View style={[s.totalCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[s.totalLabel, { color: colors.textSecondary }]}>{t("dividends.reinvested")}</Text>
            <Text style={[s.totalValue, { color: colors.accentPrimary }]}>{formatCurrency(totals.total_reinvested_kwd, "KWD")}</Text>
          </View>
          <View style={[s.totalCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[s.totalLabel, { color: colors.textSecondary }]}>{t("dividends.stocks")}</Text>
            <Text style={[s.totalValue, { color: colors.textPrimary }]}>{totals.unique_stocks}</Text>
          </View>
        </View>
      ) : <View />}

      {/* ── Yearly Dividend Chart ── */}
      {yearlyChartData.length > 0 ? (
        <View style={[s.chartContainer, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          {projection && projection.totalProjected > 0 && (
            <Pressable
              onPress={() => setShowProjectionOnChart((v) => !v)}
              style={[
                s.projectionToggle,
                {
                  backgroundColor: showProjectionOnChart ? colors.warning + "20" : colors.bgPrimary,
                  borderColor: showProjectionOnChart ? colors.warning : colors.borderColor,
                },
              ]}
            >
              <FontAwesome
                name={showProjectionOnChart ? "eye" : "eye-slash"}
                size={13}
                color={showProjectionOnChart ? colors.warning : colors.textMuted}
              />
              <Text style={{ color: showProjectionOnChart ? colors.warning : colors.textMuted, fontSize: 12, fontWeight: "600" }}>
                {t("dividends.projectionMode")}
              </Text>
            </Pressable>
          )}
          <DividendYearlyChart
            data={yearlyChartData}
            projectedData={showProjectionOnChart ? projectedChartData : undefined}
            currency="KWD"
          />
        </View>
      ) : <View />}

      {/* ── Sticky tab bar (index 3) ── */}
      <View style={[s.tabContainer, { borderBottomColor: colors.borderColor, backgroundColor: colors.bgPrimary }]}>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={s.tabContentContainer}
        >
          {visibleTabs.map((tb) => (
            <Pressable
              key={tb.key}
              onPress={() => setTab(tb.key)}
              style={[
                s.tabBtn,
                tab === tb.key && { borderBottomColor: colors.accentPrimary, borderBottomWidth: 2 },
              ]}
            >
              <Text style={{ color: tab === tb.key ? colors.accentPrimary : colors.textSecondary, fontWeight: "600", fontSize: 14 }}>
                {tb.label}
              </Text>
            </Pressable>
          ))}
        </ScrollView>
      </View>

      {/* ── Tab content (inline, no nested ScrollView) ── */}
      <View style={[s.tabContent, isDesktop && { maxWidth: 900, alignSelf: "center", width: "100%" }]}>

        {/* ── Tab: All Dividends ── */}
        {tab === "all" && (
          <>
            {dividends.length === 0 ? (
              <View style={s.empty}>
                <FontAwesome name="money" size={48} color={colors.textMuted} />
                <Text style={[s.emptyText, { color: colors.textSecondary }]}>{t("dividends.noDividendRecords")}</Text>
              </View>
            ) : (
              dividends.map((item) => (
                <View key={item.id} style={[s.divRow, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.divSymbol, { color: colors.textPrimary }]}>{item.stock_symbol}</Text>
                    <Text style={[s.divMeta, { color: colors.textSecondary }]}>
                      {item.portfolio} · {item.txn_date}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                    {item.cash_dividend > 0 && (
                      <Text style={[s.divAmt, { color: colors.success }]}>
                        {t("dividends.cashLabel")} {formatCurrency(item.cash_dividend_kwd, "KWD")}
                      </Text>
                    )}
                    {item.bonus_shares > 0 && (
                      <Text style={[s.divAmt, { color: colors.accentPrimary }]}>
                        {t("dividends.bonusLabel")} {item.bonus_shares} {t("dividends.shares")}
                      </Text>
                    )}
                    {item.reinvested_dividend > 0 && (
                      <Text style={[s.divAmt, { color: colors.textSecondary }]}>
                        {t("dividends.reinvestedLabel")} {formatCurrency(item.reinvested_kwd, "KWD")}
                      </Text>
                    )}
                    <Pressable onPress={() => handleDelete(item.id)} hitSlop={8}>
                      <FontAwesome name="trash-o" size={14} color={colors.danger} />
                    </Pressable>
                  </View>
                </View>
              ))
            )}
            {(divData?.pagination?.total_pages ?? 1) > 1 && (
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
            )}
          </>
        )}

        {/* ── Tab: By Stock ── */}
        {tab === "by-stock" && (
          <>
            {byStockList.length === 0 ? (
              <View style={s.empty}>
                <FontAwesome name="money" size={48} color={colors.textMuted} />
                <Text style={[s.emptyText, { color: colors.textSecondary }]}>{t("dividends.noDividendByStock")}</Text>
              </View>
            ) : (
              byStockList.map((item) => (
                <View key={item.stock_symbol} style={[s.divRow, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[s.divSymbol, { color: colors.textPrimary }]}>{item.stock_symbol}</Text>
                    <Text style={[s.divMeta, { color: colors.textSecondary }]}>
                      {t("dividends.dividendsCostMeta", { count: item.dividend_count, cost: formatCurrency(item.total_cost, "KWD") })}
                    </Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[s.divAmt, { color: colors.success }]}>
                      {t("dividends.cashLabel")} {formatCurrency(item.total_cash_dividend_kwd, "KWD")}
                    </Text>
                    {item.total_bonus_shares > 0 && (
                      <Text style={[s.divAmt, { color: colors.accentPrimary }]}>
                        {t("dividends.bonusLabel")} {item.total_bonus_shares}
                      </Text>
                    )}
                    <Text style={[s.divAmt, { color: item.yield_on_cost_pct > 0 ? colors.success : colors.textMuted }]}>
                      {t("dividends.yieldColon")} {item.yield_on_cost_pct.toFixed(2)}%
                    </Text>
                  </View>
                </View>
              ))
            )}
          </>
        )}

        {/* ── Tab: Bonus Shares ── */}
        {tab === "bonus" && (
          <>
            {/* Summary cards */}
            <View style={[s.totalsRow, { borderBottomWidth: 0, paddingHorizontal: 0, marginBottom: 8 }]}>
              <View style={[s.totalCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                <Text style={[s.totalLabel, { color: colors.textSecondary }]}>{t("dividends.totalBonus")}</Text>
                <Text style={[s.totalValue, { color: colors.accentPrimary }]}>{(bonusData?.total_bonus_shares ?? 0).toLocaleString()}</Text>
              </View>
              <View style={[s.totalCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                <Text style={[s.totalLabel, { color: colors.textSecondary }]}>{t("dividends.stocks")}</Text>
                <Text style={[s.totalValue, { color: colors.textPrimary }]}>{bonusByStock.length}</Text>
              </View>
            </View>

            {/* By-stock summary */}
            {bonusByStock.length > 0 && (
              <>
                <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>{t("dividends.byStockSection")}</Text>
                {bonusByStock.map((bs) => (
                  <View key={bs.stock_symbol} style={[s.divRow, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                    <View style={{ flex: 1 }}>
                      <Text style={[s.divSymbol, { color: colors.textPrimary }]}>{bs.stock_symbol}</Text>
                      <Text style={[s.divMeta, { color: colors.textSecondary }]}>{t("dividends.eventsCount", { count: bs.bonus_count })}</Text>
                    </View>
                    <Text style={[s.divAmt, { color: colors.accentPrimary, fontWeight: "700" }]}>
                      {t("dividends.sharesCount", { count: bs.total_bonus_shares.toLocaleString() })}
                    </Text>
                  </View>
                ))}
              </>
            )}

            {/* History list */}
            <Text style={[s.sectionLabel, { color: colors.textSecondary, marginTop: 16 }]}>{t("dividends.history")}</Text>
            {bonusRecords.length === 0 ? (
              <View style={s.empty}>
                <FontAwesome name="gift" size={48} color={colors.textMuted} />
                <Text style={[s.emptyText, { color: colors.textSecondary }]}>{t("dividends.noBonusRecords")}</Text>
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
                    {t("dividends.bonusSharesAmount", { count: rec.bonus_shares })}
                  </Text>
                </View>
              ))
            )}
          </>
        )}

        {/* ── Tab: Yield Calculator ── */}
        {tab === "calculator" && (
          <>
            <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>{t("dividends.yieldCalcTitle")}</Text>

            <View style={[s.calcCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
              <Text style={[s.calcFieldLabel, { color: colors.textSecondary }]}>{t("dividends.companyName")}</Text>
              <TextInput
                style={[s.calcInput, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
                placeholderTextColor={colors.textMuted}
                placeholder={t("dividends.placeholderCompanyName")}
                keyboardType="default"
                value={calcCompanyName}
                onChangeText={setCalcCompanyName}
              />

              <Text style={[s.calcFieldLabel, { color: colors.textSecondary }]}>{t("dividends.purchasePricePerShare")}</Text>
              <TextInput
                style={[s.calcInput, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
                placeholderTextColor={colors.textMuted}
                placeholder="0.000"
                keyboardType="decimal-pad"
                value={calcPurchasePrice}
                onChangeText={setCalcPurchasePrice}
              />

              <Text style={[s.calcFieldLabel, { color: colors.textSecondary }]}>{t("dividends.numberOfShares")}</Text>
              <TextInput
                style={[s.calcInput, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
                placeholderTextColor={colors.textMuted}
                placeholder="0"
                keyboardType="numeric"
                value={calcShares}
                onChangeText={setCalcShares}
              />

              <Text style={[s.calcFieldLabel, { color: colors.textSecondary }]}>{t("dividends.parNominalValue")}</Text>
              <TextInput
                style={[s.calcInput, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
                placeholderTextColor={colors.textMuted}
                placeholder="0.100"
                keyboardType="decimal-pad"
                value={calcParValue}
                onChangeText={setCalcParValue}
              />

              <Text style={[s.calcFieldLabel, { color: colors.textSecondary }]}>{t("dividends.cashDivPercent")}</Text>
              <TextInput
                style={[s.calcInput, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
                placeholderTextColor={colors.textMuted}
                placeholder="e.g. 10"
                keyboardType="decimal-pad"
                value={calcDivPercent}
                onChangeText={setCalcDivPercent}
              />

              <Text style={[s.calcFieldLabel, { color: colors.textSecondary }]}>{t("dividends.bonusSharePercent")}</Text>
              <TextInput
                style={[s.calcInput, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
                placeholderTextColor={colors.textMuted}
                placeholder="e.g. 10"
                keyboardType="decimal-pad"
                value={calcBonusPercent}
                onChangeText={setCalcBonusPercent}
              />

              <Text style={[s.calcFieldLabel, { color: colors.textSecondary }]}>{t("dividends.priceBeforeExDate")}</Text>
              <TextInput
                style={[s.calcInput, { backgroundColor: colors.bgPrimary, color: colors.textPrimary, borderColor: colors.borderColor }]}
                placeholderTextColor={colors.textMuted}
                placeholder={t("dividends.placeholderPreExPrice")}
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
                  {t("dividends.includeCashInExDate")}
                </Text>
              </Pressable>
            </View>

            {/* ── Results ── */}
            {calcResults && (
              <>
                {/* Cash Dividend Section */}
                <View style={[s.calcCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, marginTop: 12 }]}>
                  <Text style={[s.sectionLabel, { color: colors.success, marginBottom: 10 }]}>💰 {t("dividends.cashDividendSection")}</Text>

                  <View style={s.calcRow}>
                    <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.totalCost")}</Text>
                    <Text style={[s.calcRowValue, { color: colors.textPrimary }]}>{formatCurrency(calcResults.totalCost, "KWD")}</Text>
                  </View>
                  <View style={s.calcRow}>
                    <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.parValueLabel")}</Text>
                    <Text style={[s.calcRowValue, { color: colors.textPrimary }]}>{calcResults.parValue.toFixed(3)}</Text>
                  </View>
                  <View style={s.calcRow}>
                    <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.cashDivPerShare")}</Text>
                    <Text style={[s.calcRowValue, { color: colors.success }]}>{calcResults.cashDivPerShare.toFixed(3)}</Text>
                  </View>
                  <View style={s.calcRow}>
                    <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.totalCashDividend")}</Text>
                    <Text style={[s.calcRowValue, { color: colors.success }]}>{formatCurrency(calcResults.totalCashDiv, "KWD")}</Text>
                  </View>
                  <View style={[s.calcRow, { borderTopWidth: 1, borderTopColor: colors.borderColor, paddingTop: 8, marginTop: 4 }]}>
                    <Text style={[s.calcRowLabel, { color: colors.textPrimary, fontWeight: "700" }]}>{t("dividends.cashYieldOnCost")}</Text>
                    <Text style={[s.calcRowValue, { color: colors.success, fontWeight: "700" }]}>{calcResults.cashYieldOnCost.toFixed(2)}%</Text>
                  </View>
                </View>

                {/* Before Ex-Date */}
                <View style={[s.calcCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, marginTop: 12 }]}>
                  <Text style={[s.sectionLabel, { color: colors.accentPrimary, marginBottom: 10 }]}>📈 {t("dividends.beforeExDateYield")}</Text>

                  <View style={s.calcRow}>
                    <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.preExPrice")}</Text>
                    <Text style={[s.calcRowValue, { color: colors.textPrimary }]}>{calcResults.preExPrice.toFixed(3)}</Text>
                  </View>
                  {calcResults.hasBonus && (
                    <>
                      <View style={s.calcRow}>
                        <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.bonusSharesCalc")}</Text>
                        <Text style={[s.calcRowValue, { color: colors.accentPrimary }]}>{calcResults.bonusShares.toLocaleString()}</Text>
                      </View>
                      <View style={s.calcRow}>
                        <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.bonusValuePreEx")}</Text>
                        <Text style={[s.calcRowValue, { color: colors.accentPrimary }]}>{formatCurrency(calcResults.bonusValueBeforeEx, "KWD")}</Text>
                      </View>
                    </>
                  )}
                  <View style={s.calcRow}>
                    <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.cashDividendRow")}</Text>
                    <Text style={[s.calcRowValue, { color: colors.success }]}>{formatCurrency(calcResults.totalCashDiv, "KWD")}</Text>
                  </View>
                  <View style={[s.calcRow, { borderTopWidth: 1, borderTopColor: colors.borderColor, paddingTop: 8, marginTop: 4 }]}>
                    <Text style={[s.calcRowLabel, { color: colors.textPrimary, fontWeight: "700" }]}>{t("dividends.totalReturn")}</Text>
                    <Text style={[s.calcRowValue, { color: colors.success, fontWeight: "700" }]}>{formatCurrency(calcResults.totalReturnBeforeEx, "KWD")}</Text>
                  </View>
                  <View style={s.calcRow}>
                    <Text style={[s.calcRowLabel, { color: colors.textPrimary, fontWeight: "700" }]}>{t("dividends.yieldOnCost")}</Text>
                    <Text style={[s.calcRowValue, { color: colors.success, fontWeight: "700" }]}>{calcResults.yieldBeforeEx.toFixed(2)}%</Text>
                  </View>
                </View>

                {/* After Ex-Date */}
                {calcResults.hasExDateAdj && (
                  <View style={[s.calcCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, marginTop: 12 }]}>
                    <Text style={[s.sectionLabel, { color: colors.warning ?? "#f59e0b", marginBottom: 10 }]}>📉 {t("dividends.afterExDateYield")}</Text>

                    <View style={s.calcRow}>
                      <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.theoreticalExPrice")}</Text>
                      <Text style={[s.calcRowValue, { color: colors.textPrimary }]}>{calcResults.theoreticalExPrice.toFixed(3)}</Text>
                    </View>
                    <View style={s.calcRow}>
                      <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.adjustmentFormula")}</Text>
                      <Text style={[s.calcRowValue, { color: colors.textMuted, fontSize: 11 }]}>
                        {calcResults.hasBonus && calcIncludeCashInEx
                          ? "(P−Div) / (1+Bonus%)"
                          : calcResults.hasBonus
                          ? "P / (1+Bonus%)"
                          : "P − CashDiv/share"}
                      </Text>
                    </View>
                    <View style={s.calcRow}>
                      <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.priceDrop")}</Text>
                      <Text style={[s.calcRowValue, { color: colors.danger }]}>
                        −{(calcResults.preExPrice - calcResults.theoreticalExPrice).toFixed(3)}
                        {" "}({(((calcResults.preExPrice - calcResults.theoreticalExPrice) / calcResults.preExPrice) * 100).toFixed(2)}%)
                      </Text>
                    </View>
                    {calcResults.hasBonus && (
                      <>
                        <View style={s.calcRow}>
                          <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.bonusSharesCalc")}</Text>
                          <Text style={[s.calcRowValue, { color: colors.accentPrimary }]}>{calcResults.bonusShares.toLocaleString()}</Text>
                        </View>
                        <View style={s.calcRow}>
                          <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.bonusValueExPrice")}</Text>
                          <Text style={[s.calcRowValue, { color: colors.accentPrimary }]}>{formatCurrency(calcResults.bonusValueAfterEx, "KWD")}</Text>
                        </View>
                      </>
                    )}
                    <View style={s.calcRow}>
                      <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.cashDividendRow")}</Text>
                      <Text style={[s.calcRowValue, { color: colors.success }]}>{formatCurrency(calcResults.totalCashDiv, "KWD")}</Text>
                    </View>
                    <View style={s.calcRow}>
                      <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.totalSharesAfterEx")}</Text>
                      <Text style={[s.calcRowValue, { color: colors.textPrimary }]}>{calcResults.totalSharesAfterEx.toLocaleString()}</Text>
                    </View>
                    <View style={s.calcRow}>
                      <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.adjustedAvgCost")}</Text>
                      <Text style={[s.calcRowValue, { color: colors.textPrimary }]}>{calcResults.adjustedAvgCost.toFixed(3)}</Text>
                    </View>
                    <View style={[s.calcRow, { borderTopWidth: 1, borderTopColor: colors.borderColor, paddingTop: 8, marginTop: 4 }]}>
                      <Text style={[s.calcRowLabel, { color: colors.textPrimary, fontWeight: "700" }]}>{t("dividends.totalReturn")}</Text>
                      <Text style={[s.calcRowValue, { color: colors.success, fontWeight: "700" }]}>{formatCurrency(calcResults.totalReturnAfterEx, "KWD")}</Text>
                    </View>
                    <View style={s.calcRow}>
                      <Text style={[s.calcRowLabel, { color: colors.textPrimary, fontWeight: "700" }]}>{t("dividends.yieldOnCost")}</Text>
                      <Text style={[s.calcRowValue, { color: colors.success, fontWeight: "700" }]}>{calcResults.yieldAfterEx.toFixed(2)}%</Text>
                    </View>
                  </View>
                )}

                {/* Yield Comparison Summary */}
                <View style={[s.calcCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, marginTop: 12 }]}>
                  <Text style={[s.sectionLabel, { color: colors.textSecondary, marginBottom: 10 }]}>📊 {t("dividends.yieldSummary")}</Text>

                  <View style={s.calcRow}>
                    <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.cashYieldOnCost")}</Text>
                    <Text style={[s.calcRowValue, { color: colors.success, fontWeight: "700" }]}>{calcResults.cashYieldOnCost.toFixed(2)}%</Text>
                  </View>
                  <View style={s.calcRow}>
                    <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.beforeExTotalYield")}</Text>
                    <Text style={[s.calcRowValue, { color: colors.success, fontWeight: "700" }]}>{calcResults.yieldBeforeEx.toFixed(2)}%</Text>
                  </View>
                  {calcResults.hasExDateAdj && (
                    <>
                      <View style={s.calcRow}>
                        <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.afterExTotalYield")}</Text>
                        <Text style={[s.calcRowValue, { color: colors.success, fontWeight: "700" }]}>{calcResults.yieldAfterEx.toFixed(2)}%</Text>
                      </View>
                      <View style={[s.calcRow, { borderTopWidth: 1, borderTopColor: colors.borderColor, paddingTop: 8, marginTop: 4 }]}>
                        <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.yieldDifference")}</Text>
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
                    const { exportYieldCalcPdf } = await import("@/lib/exportYieldPdf");
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
                  <Text style={s.exportBtnText}>{t("dividends.downloadPdfReport")}</Text>
                </Pressable>
              </>
            )}
          </>
        )}

        {/* ── Tab: Projections ── */}
        {tab === "projections" && (
          <>
            {/* Income Forecast Card */}
            {projection && projection.projections.length > 0 ? (
              <>
                {/* Beginner-friendly summary card */}
                {expertiseLevel === "normal" ? (
                  <View style={[s.calcCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, marginBottom: 12 }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
                      <Text style={{ fontSize: 24 }}>💰</Text>
                      <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700", flex: 1 }}>
                        {t("dividends.incomeForecast")}
                      </Text>
                    </View>
                    <Text style={{ color: colors.textPrimary, fontSize: 15, lineHeight: 22 }}>
                      {t("dividends.beginnerForecast", {
                        amount: formatCurrency(projection.totalProjected, "KWD"),
                      })}
                    </Text>
                    <View style={[s.confidenceBadge, { backgroundColor: confidenceColor(projection.avgConfidence, colors) + "20", marginTop: 10 }]}>
                      <Text style={{ color: confidenceColor(projection.avgConfidence, colors), fontSize: 12, fontWeight: "600" }}>
                        {t("dividends.confidence")}: {t(`dividends.confidence_${projection.avgConfidence}`)}
                      </Text>
                    </View>
                  </View>
                ) : (
                  /* Advanced: total forecast card */
                  <View style={[s.calcCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, marginBottom: 12 }]}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
                      <FontAwesome name="line-chart" size={18} color={colors.accentPrimary} />
                      <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700", flex: 1 }}>
                        {t("dividends.incomeForecast")}
                      </Text>
                      <View style={[s.confidenceBadge, { backgroundColor: confidenceColor(projection.avgConfidence, colors) + "20" }]}>
                        <Text style={{ color: confidenceColor(projection.avgConfidence, colors), fontSize: 11, fontWeight: "600" }}>
                          {t(`dividends.confidence_${projection.avgConfidence}`)}
                        </Text>
                      </View>
                    </View>
                    <View style={s.calcRow}>
                      <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.totalProjected")}</Text>
                      <Text style={[s.calcRowValue, { color: colors.success, fontSize: 18 }]}>
                        {formatCurrency(projection.totalProjected, "KWD")}
                      </Text>
                    </View>
                    <View style={s.calcRow}>
                      <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.paymentWindow")}</Text>
                      <Text style={[s.calcRowValue, { color: colors.textPrimary }]}>Mar – Jun</Text>
                    </View>
                    <View style={s.calcRow}>
                      <Text style={[s.calcRowLabel, { color: colors.textSecondary }]}>{t("dividends.stocksWithDiv")}</Text>
                      <Text style={[s.calcRowValue, { color: colors.textPrimary }]}>{projection.projections.length}</Text>
                    </View>
                  </View>
                )}

                {/* Per-stock projections (advanced/intermediate only) */}
                {expertiseLevel !== "normal" && projection.projections.map((p) => (
                  <View
                    key={p.symbol}
                    style={[s.divRow, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[s.divSymbol, { color: colors.textPrimary }]}>{p.company || p.symbol}</Text>
                      <Text style={[s.divMeta, { color: colors.textSecondary }]}>
                        {p.shares.toLocaleString()} {t("dividends.shares")} · {t("dividends.yieldLabel")}: {p.yieldOnCost.toFixed(2)}%
                        {p.hasBonus ? " · 🎁" : ""}
                      </Text>
                      <Text style={[s.divMeta, { color: colors.textSecondary, fontSize: 11, marginTop: 2 }]}>
                        {p.growthRate !== 0
                          ? `g: ${p.growthRate > 0 ? "+" : ""}${(p.growthRate * 100).toFixed(1)}%`
                          : "g: flat"
                        }
                        {" · "}
                        {p.method === "cagr" ? `CAGR (${p.yearsOfData}y)` : p.method === "yoy" ? "YoY" : p.method === "flat" ? "1y data" : "est."}
                      </Text>
                    </View>
                    <View style={{ alignItems: "flex-end" }}>
                      <Text style={[s.divAmt, { color: colors.success }]}>
                        {formatCurrency(p.projectedAmount, "KWD")}
                      </Text>
                      <View style={[s.confidenceBadge, { backgroundColor: confidenceColor(p.confidence, colors) + "20", marginTop: 2 }]}>
                        <Text style={{ color: confidenceColor(p.confidence, colors), fontSize: 10, fontWeight: "600" }}>
                          {t(`dividends.confidence_${p.confidence}`)}
                        </Text>
                      </View>
                    </View>
                  </View>
                ))}

                {/* Disclaimer */}
                <View style={{ paddingHorizontal: 8, paddingVertical: 12 }}>
                  <Text style={{ color: colors.textMuted, fontSize: 11, fontStyle: "italic", textAlign: "center" }}>
                    {t("dividends.projectionDisclaimer")}
                  </Text>
                </View>
              </>
            ) : (
              <View style={s.empty}>
                <FontAwesome name="line-chart" size={48} color={colors.textMuted} />
                <Text style={[s.emptyText, { color: colors.textSecondary }]}>
                  {t("dividends.noProjections")}
                </Text>
              </View>
            )}
          </>
        )}

      </View>
    </ScrollView>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function confidenceColor(confidence: "high" | "medium" | "low", colors: { success: string; warning: string; danger: string }) {
  return confidence === "high" ? colors.success : confidence === "medium" ? colors.warning : colors.danger;
}

const s = StyleSheet.create({
  // Inline scrollable header
  inlineHeader: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  inlineHeaderTitle: {
    fontSize: 22,
    fontWeight: "700",
  },
  inlineHeaderBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: "center",
    alignItems: "center",
  },
  // Tab content area
  tabContent: {
    paddingTop: 8,
    minHeight: 200,
  },
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
    width: 44,
    height: 44,
    borderRadius: 22,
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
    width: 28,
    height: 28,
    borderRadius: 6,
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
  chartContainer: {
    marginHorizontal: 12,
    marginVertical: 8,
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  projectionToggle: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-end",
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  confidenceBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
});
