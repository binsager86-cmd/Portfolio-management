/**
 * TradeSimulatorModal — "What If" trade scenario calculator.
 *
 * User inputs: symbol, direction, shares, price
 * Output: real-time projected impact on portfolio metrics.
 */

import type { ThemePalette } from "@/constants/theme";
import { useHoldings, usePortfolioOverview, useStockList } from "@/hooks/queries";
import { useAuth } from "@/hooks/useAuth";
import { analytics } from "@/lib/analytics";
import {
    simulateTrade,
    type SimulationResult,
    type TradeDirection,
    type TradeInput,
} from "@/lib/tradeSimulator";
import { useThemeStore } from "@/services/themeStore";
import { useUserPrefsStore } from "@/src/store/userPrefsStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    I18nManager,
    KeyboardAvoidingView,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

// ── Helpers ─────────────────────────────────────────────────────────

function fmt(n: number, decimals = 0): string {
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function deltaColor(delta: number, colors: ThemePalette): string {
  if (delta > 0) return colors.success;
  if (delta < 0) return colors.danger;
  return colors.textMuted;
}

// ── Component ───────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Pre-fill symbol if opened from a specific holding */
  initialSymbol?: string;
}

export function TradeSimulatorModal({ visible, onClose, initialSymbol }: Props) {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const { user } = useAuth();
  const isRTL = I18nManager.isRTL;
  const expertiseLevel = useUserPrefsStore((s) => s.preferences.expertiseLevel);

  const { data: holdingsResp } = useHoldings();
  const { data: overviewData } = usePortfolioOverview(user?.id);
  const { data: stockListData } = useStockList("kuwait");
  const holdings = holdingsResp?.holdings ?? [];
  const allStocks = stockListData?.stocks ?? [];

  const [symbol, setSymbol] = useState(initialSymbol ?? "");
  const [direction, setDirection] = useState<TradeDirection>("buy");
  const [sharesStr, setSharesStr] = useState("");
  const [priceStr, setPriceStr] = useState("");
  const [showStockPicker, setShowStockPicker] = useState(false);
  const [stockSearchText, setStockSearchText] = useState("");

  // Auto-fill price when symbol matches existing holding
  const matchedHolding = useMemo(
    () => holdings.find((h) => h.symbol.toLowerCase() === symbol.toLowerCase()),
    [holdings, symbol],
  );

  // Filter & sort all stocks by search text
  const filteredStocks = useMemo(() => {
    const sorted = [...allStocks].sort((a, b) => a.symbol.localeCompare(b.symbol));
    if (!stockSearchText.trim()) return sorted;
    const q = stockSearchText.toLowerCase();
    return sorted.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q),
    );
  }, [allStocks, stockSearchText]);

  const handleSelectStock = useCallback(
    (stock: typeof allStocks[number]) => {
      setSymbol(stock.symbol);
      // Auto-fill price if user already holds this stock
      const held = holdings.find((h) => h.symbol.toLowerCase() === stock.symbol.toLowerCase());
      if (held) setPriceStr(String(held.market_price));
      setShowStockPicker(false);
      setStockSearchText("");
    },
    [holdings],
  );

  const result: SimulationResult | null = useMemo(() => {
    const shares = parseFloat(sharesStr);
    const price = parseFloat(priceStr);
    if (!symbol || isNaN(shares) || isNaN(price) || shares <= 0 || price <= 0) {
      return null;
    }

    const trade: TradeInput = {
      symbol,
      company: matchedHolding?.company ?? symbol,
      direction,
      shares,
      pricePerShare: price,
      currency: matchedHolding?.currency ?? "KWD",
      dividendYieldPct: matchedHolding?.dividend_yield_on_cost_pct ?? undefined,
    };

    return simulateTrade(
      trade,
      holdings,
      overviewData?.cash_balance ?? 0,
      overviewData?.total_value ?? 0,
    );
  }, [symbol, direction, sharesStr, priceStr, holdings, overviewData, matchedHolding]);

  const handleReset = () => {
    setSymbol(initialSymbol ?? "");
    setDirection("buy");
    setSharesStr("");
    setPriceStr("");
  };

  const handleClose = () => {
    if (result?.valid) {
      analytics.logEvent("trade_simulated", {
        symbol,
        direction,
        shares: parseFloat(sharesStr),
      });
    }
    handleReset();
    onClose();
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <KeyboardAvoidingView
        style={[s.root, { backgroundColor: colors.bgPrimary }]}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        {/* Header */}
        <View style={[s.header, { borderBottomColor: colors.borderColor }]}>
          <Text style={[s.headerTitle, { color: colors.textPrimary }]}>
            🧪 {t("simulator.title")}
          </Text>
          <Pressable
            onPress={handleClose}
            accessibilityRole="button"
            accessibilityLabel={t("app.cancel")}
            hitSlop={12}
          >
            <FontAwesome name="times" size={20} color={colors.textMuted} />
          </Pressable>
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Input section */}
          <View style={[s.inputCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            {/* Symbol — stock picker */}
            <Text style={[s.label, { color: colors.textSecondary }]}>
              {t("simulator.symbol")}
            </Text>
            <Pressable
              onPress={() => setShowStockPicker(!showStockPicker)}
              style={[
                s.input,
                s.pickerTrigger,
                {
                  backgroundColor: colors.bgInput,
                  borderColor: symbol ? colors.accentPrimary : colors.borderColor,
                  flexDirection: isRTL ? "row-reverse" : "row",
                },
              ]}
              accessibilityRole="button"
              accessibilityLabel={t("simulator.symbol")}
            >
              <Text
                style={{
                  flex: 1,
                  fontSize: 15,
                  color: symbol ? colors.textPrimary : colors.textMuted,
                }}
                numberOfLines={1}
              >
                {symbol
                  ? `${symbol}${matchedHolding ? ` — ${matchedHolding.company}` : ""}`
                  : "Select stock…"}
              </Text>
              <FontAwesome
                name={showStockPicker ? "chevron-up" : "chevron-down"}
                size={12}
                color={colors.textMuted}
              />
            </Pressable>

            {/* Stock list dropdown */}
            {showStockPicker && (
              <View style={[s.stockList, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                {/* Search input inside dropdown */}
                <TextInput
                  style={[
                    s.input,
                    s.searchInput,
                    {
                      color: colors.textPrimary,
                      backgroundColor: colors.bgInput,
                      borderColor: colors.borderColor,
                      textAlign: isRTL ? "right" : "left",
                    },
                  ]}
                  value={stockSearchText}
                  onChangeText={setStockSearchText}
                  placeholder="Search stocks…"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="characters"
                  autoFocus
                />
                <ScrollView
                  style={{ maxHeight: 200 }}
                  nestedScrollEnabled
                  keyboardShouldPersistTaps="handled"
                >
                  {filteredStocks.length === 0 ? (
                    <Text style={[s.stockListEmpty, { color: colors.textMuted }]}>
                      No stocks found
                    </Text>
                  ) : (
                    filteredStocks.map((stock) => {
                      const held = holdings.find((h) => h.symbol.toLowerCase() === stock.symbol.toLowerCase());
                      return (
                        <Pressable
                          key={stock.symbol}
                          onPress={() => handleSelectStock(stock)}
                          style={[
                            s.stockListItem,
                            {
                              backgroundColor:
                                stock.symbol === symbol ? colors.accentPrimary + "15" : "transparent",
                              borderBottomColor: colors.borderColor,
                              flexDirection: isRTL ? "row-reverse" : "row",
                            },
                          ]}
                          accessibilityRole="button"
                        >
                          <View style={{ flex: 1 }}>
                            <Text
                              style={[s.stockListSymbol, { color: colors.textPrimary }]}
                              numberOfLines={1}
                            >
                              {stock.symbol}
                            </Text>
                            <Text
                              style={[s.stockListCompany, { color: colors.textMuted }]}
                              numberOfLines={1}
                            >
                              {stock.yf_ticker} - {stock.name}
                            </Text>
                          </View>
                          {held && (
                            <View style={{ alignItems: isRTL ? "flex-start" : "flex-end" }}>
                              <Text style={[s.stockListPrice, { color: colors.textPrimary }]}>
                                {fmt(held.market_price, 3)}
                              </Text>
                              <Text
                                style={[
                                  s.stockListYield,
                                  { color: held.dividend_yield_on_cost_pct > 0 ? colors.success : colors.textMuted },
                                ]}
                              >
                                Yield: {(held.dividend_yield_on_cost_pct ?? 0).toFixed(2)}%
                              </Text>
                            </View>
                          )}
                        </Pressable>
                      );
                    })
                  )}
                </ScrollView>
              </View>
            )}

            {/* Direction toggle */}
            <Text style={[s.label, { color: colors.textSecondary }]}>
              {t("simulator.direction")}
            </Text>
            <View style={[s.toggleRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
              {(["buy", "sell"] as TradeDirection[]).map((dir) => (
                <Pressable
                  key={dir}
                  onPress={() => setDirection(dir)}
                  style={[
                    s.toggleBtn,
                    {
                      backgroundColor:
                        direction === dir
                          ? (dir === "buy" ? colors.success : colors.danger) + "20"
                          : colors.bgInput,
                      borderColor:
                        direction === dir
                          ? dir === "buy"
                            ? colors.success
                            : colors.danger
                          : colors.borderColor,
                    },
                  ]}
                  accessibilityRole="button"
                  accessibilityState={{ selected: direction === dir }}
                >
                  <FontAwesome
                    name={dir === "buy" ? "plus-circle" : "minus-circle"}
                    size={14}
                    color={
                      direction === dir
                        ? dir === "buy"
                          ? colors.success
                          : colors.danger
                        : colors.textMuted
                    }
                  />
                  <Text
                    style={[
                      s.toggleLabel,
                      {
                        color:
                          direction === dir
                            ? dir === "buy"
                              ? colors.success
                              : colors.danger
                            : colors.textMuted,
                      },
                    ]}
                  >
                    {t(`simulator.${dir}`)}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Shares */}
            <Text style={[s.label, { color: colors.textSecondary }]}>
              {t("simulator.shares")}
            </Text>
            <TextInput
              style={[
                s.input,
                {
                  color: colors.textPrimary,
                  backgroundColor: colors.bgInput,
                  borderColor: colors.borderColor,
                  textAlign: isRTL ? "right" : "left",
                },
              ]}
              value={sharesStr}
              onChangeText={setSharesStr}
              placeholder="100"
              placeholderTextColor={colors.textMuted}
              keyboardType="numeric"
              accessibilityLabel={t("simulator.shares")}
            />

            {/* Price */}
            <Text style={[s.label, { color: colors.textSecondary }]}>
              {t("simulator.pricePerShare")}
            </Text>
            <TextInput
              style={[
                s.input,
                {
                  color: colors.textPrimary,
                  backgroundColor: colors.bgInput,
                  borderColor: colors.borderColor,
                  textAlign: isRTL ? "right" : "left",
                },
              ]}
              value={priceStr}
              onChangeText={setPriceStr}
              placeholder="0.500"
              placeholderTextColor={colors.textMuted}
              keyboardType="decimal-pad"
              accessibilityLabel={t("simulator.pricePerShare")}
            />

            {/* Trade total */}
            {result && (
              <View style={[s.totalRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                <Text style={[s.totalLabel, { color: colors.textSecondary }]}>
                  {t("simulator.tradeTotal")}
                </Text>
                <Text style={[s.totalValue, { color: colors.textPrimary }]}>
                  {fmt(result.tradeValue, 3)} KWD
                </Text>
              </View>
            )}
          </View>

          {/* Results */}
          {result && !result.valid && result.error && (
            <View style={[s.errorCard, { backgroundColor: colors.danger + "15", borderColor: colors.danger + "30" }]}>
              <FontAwesome name="exclamation-triangle" size={14} color={colors.danger} />
              <Text style={[s.errorText, { color: colors.danger }]}>{t(result.error)}</Text>
            </View>
          )}

          {result?.valid && (
            <View style={s.resultsSection}>
              <Text style={[s.resultsTitle, { color: colors.textSecondary }]}>
                {t("simulator.projectedImpact")}
              </Text>

              {/* Impact cards */}
              <View style={s.impactGrid}>
                <ImpactCard
                  colors={colors}
                  label={t("simulator.portfolioValue")}
                  before={`${fmt(result.portfolioValueBefore, 0)} KWD`}
                  after={`${fmt(result.portfolioValueAfter, 0)} KWD`}
                  delta={result.portfolioValueDelta}
                  emoji="💼"
                />
                <ImpactCard
                  colors={colors}
                  label={t("simulator.cashBalance")}
                  before={`${fmt(result.cashBefore, 0)} KWD`}
                  after={`${fmt(result.cashAfter, 0)} KWD`}
                  delta={result.cashAfter - result.cashBefore}
                  emoji="💵"
                />
                <ImpactCard
                  colors={colors}
                  label={t("simulator.dividendYield")}
                  before={`${result.dividendYieldBefore.toFixed(2)}%`}
                  after={`${result.dividendYieldAfter.toFixed(2)}%`}
                  delta={result.dividendYieldAfter - result.dividendYieldBefore}
                  emoji="📊"
                  isPercent
                />
                <ImpactCard
                  colors={colors}
                  label={t("simulator.positions")}
                  before={String(result.holdingsCountBefore)}
                  after={String(result.holdingsCountAfter)}
                  delta={result.holdingsCountAfter - result.holdingsCountBefore}
                  emoji="📋"
                />
              </View>

              {/* Concentration warning */}
              {result.maxConcentrationAfter > 25 && (
                <View style={[s.warningCard, { backgroundColor: colors.warning + "15", borderColor: colors.warning + "30" }]}>
                  <Text style={[s.warningText, { color: colors.warning }]}>
                    ⚠️ {t("simulator.concentrationWarning", {
                      symbol: result.maxConcentrationSymbol,
                      pct: result.maxConcentrationAfter.toFixed(1),
                    })}
                  </Text>
                </View>
              )}

              {/* Allocation changes */}
              {result.allocationChanges.length > 0 && expertiseLevel !== "normal" && (
                <View style={[s.allocCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                  <Text style={[s.allocTitle, { color: colors.textSecondary }]}>
                    {t("simulator.allocationShift")}
                  </Text>
                  {result.allocationChanges.map((ac) => (
                    <View
                      key={ac.symbol}
                      style={[s.allocRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}
                    >
                      <Text style={[s.allocSymbol, { color: colors.textPrimary }]} numberOfLines={1}>
                        {ac.symbol}
                      </Text>
                      <Text style={[s.allocPct, { color: colors.textMuted }]}>
                        {ac.beforePct.toFixed(1)}%
                      </Text>
                      <FontAwesome name="arrow-right" size={10} color={colors.textMuted} />
                      <Text style={[s.allocPct, { color: colors.textPrimary }]}>
                        {ac.afterPct.toFixed(1)}%
                      </Text>
                      <Text style={[s.allocDelta, { color: deltaColor(ac.delta, colors) }]}>
                        {ac.delta > 0 ? "+" : ""}
                        {ac.delta.toFixed(1)}%
                      </Text>
                    </View>
                  ))}
                </View>
              )}

              {/* New position badge */}
              {result.isNewPosition && (
                <View style={[s.newBadge, { backgroundColor: colors.accentSecondary + "15" }]}>
                  <Text style={[s.newBadgeText, { color: colors.accentSecondary }]}>
                    🆕 {t("simulator.newPosition")}
                  </Text>
                </View>
              )}
            </View>
          )}

          {/* Disclaimer */}
          <Text style={[s.disclaimer, { color: colors.textMuted }]}>
            {t("simulator.disclaimer")}
          </Text>
        </ScrollView>

        {/* Footer actions */}
        <View style={[s.footer, { borderTopColor: colors.borderColor }]}>
          <Pressable
            onPress={handleReset}
            style={[s.footerBtn, { backgroundColor: colors.bgInput }]}
            accessibilityRole="button"
          >
            <Text style={[s.footerBtnText, { color: colors.textSecondary }]}>
              {t("simulator.reset")}
            </Text>
          </Pressable>
          <Pressable
            onPress={handleClose}
            style={[s.footerBtn, { backgroundColor: colors.accentPrimary + "15" }]}
            accessibilityRole="button"
          >
            <Text style={[s.footerBtnText, { color: colors.accentPrimary }]}>
              {t("app.cancel")}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── ImpactCard sub-component ────────────────────────────────────────

function ImpactCard({
  colors,
  label,
  before,
  after,
  delta,
  emoji,
  isPercent,
}: {
  colors: ThemePalette;
  label: string;
  before: string;
  after: string;
  delta: number;
  emoji: string;
  isPercent?: boolean;
}) {
  const sign = delta > 0 ? "+" : "";
  const deltaStr = isPercent
    ? `${sign}${delta.toFixed(2)}%`
    : `${sign}${fmt(delta, 0)}`;

  return (
    <View style={[s.impactCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={s.impactHeader}>
        <Text style={s.impactEmoji}>{emoji}</Text>
        <Text style={[s.impactLabel, { color: colors.textSecondary }]}>{label}</Text>
      </View>
      <Text style={[s.impactAfter, { color: colors.textPrimary }]}>{after}</Text>
      <Text style={[s.impactDelta, { color: deltaColor(delta, colors) }]}>
        {deltaStr}
      </Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const s = StyleSheet.create({
  root: { flex: 1 },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 16,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  scroll: { flex: 1 },
  scrollContent: { padding: 20, gap: 16, paddingBottom: 40 },
  inputCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    gap: 12,
  },
  label: {
    fontSize: 12,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
  },
  pickerTrigger: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  },
  searchInput: {
    margin: 8,
    marginBottom: 4,
  },
  stockList: {
    borderWidth: 1,
    borderRadius: 8,
    maxHeight: 200,
    overflow: "hidden",
  },
  stockListEmpty: {
    padding: 16,
    textAlign: "center",
    fontSize: 13,
  },
  stockListItem: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
    gap: 8,
  },
  stockListSymbol: { fontSize: 14, fontWeight: "700" },
  stockListCompany: { fontSize: 11, marginTop: 1 },
  stockListPrice: { fontSize: 13, fontWeight: "600" },
  stockListYield: { fontSize: 11, marginTop: 1 },
  toggleRow: { gap: 10 },
  toggleBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  toggleLabel: { fontSize: 14, fontWeight: "600" },
  totalRow: {
    justifyContent: "space-between",
    alignItems: "center",
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: "rgba(128,128,128,0.1)",
  },
  totalLabel: { fontSize: 13 },
  totalValue: { fontSize: 15, fontWeight: "700" },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  errorText: { flex: 1, fontSize: 13 },
  resultsSection: { gap: 12 },
  resultsTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
  },
  impactGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
  },
  impactCard: {
    flex: 1,
    minWidth: 140,
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    gap: 4,
  },
  impactHeader: { flexDirection: "row", alignItems: "center", gap: 6 },
  impactEmoji: { fontSize: 16 },
  impactLabel: { fontSize: 11, fontWeight: "500" },
  impactAfter: { fontSize: 16, fontWeight: "700", marginTop: 4 },
  impactDelta: { fontSize: 12, fontWeight: "600" },
  warningCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  warningText: { fontSize: 13 },
  allocCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  },
  allocTitle: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  allocRow: {
    alignItems: "center",
    gap: 8,
  },
  allocSymbol: { fontSize: 13, fontWeight: "600", width: 60 },
  allocPct: { fontSize: 12 },
  allocDelta: { fontSize: 12, fontWeight: "600", width: 50, textAlign: "right" },
  newBadge: {
    alignSelf: "flex-start",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
  },
  newBadgeText: { fontSize: 12, fontWeight: "600" },
  disclaimer: { fontSize: 11, lineHeight: 15, textAlign: "center" },
  footer: {
    flexDirection: "row",
    gap: 12,
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderTopWidth: 1,
  },
  footerBtn: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 8,
  },
  footerBtnText: { fontSize: 14, fontWeight: "600" },
});
