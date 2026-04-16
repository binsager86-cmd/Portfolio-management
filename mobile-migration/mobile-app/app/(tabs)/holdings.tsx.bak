/**
 * Holdings Screen — Streamlit-matching portfolio analysis table.
 *
 * Pulls GET /api/portfolio/holdings and renders a horizontally
 * scrollable table with 18 columns matching the portfolio
 * Portfolio Analysis view.  Only active positions (qty > 0)
 * are shown — sold stocks are excluded by the backend.
 *
 * Includes a TOTAL summary row at the bottom and a Cash Balance
 * section with manual override capability.
 */

import { AllocationDonut, AllocationSlice } from "@/components/charts/AllocationDonut";
import { CashBalancesSection } from "@/components/portfolio/CashBalancesSection";
import { KpiCard } from "@/components/portfolio/KpiWidgets";
import { DataScreen } from "@/components/screens";
import { FilterChip } from "@/components/ui/FilterChip";
import { HoldingsTableSkeleton } from "@/components/ui/PageSkeletons";
import type { ThemePalette } from "@/constants/theme";
import {
    useAllStocksForMerge,
    useCashBalances,
    useDepositTotals,
    useHoldings,
} from "@/hooks/queries";
import { useResponsive } from "@/hooks/useResponsive";
import { fmtNum } from "@/lib/currency";
import { todayISO } from "@/lib/dateUtils";
import { showErrorAlert } from "@/lib/errorHandling";
import {
    exportHoldingsExcel,
    Holding,
    mergeStocks
} from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { getApiErrorMessage } from "@/src/features/fundamental-analysis/types";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Alert,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    TextInput as RNTextInput,
    ScrollView,
    StyleSheet,
    Text,
    TouchableOpacity,
    View,
} from "react-native";

// ── Column types & definitions ──────────────────────────────────────

type ColAlign = "left" | "right";
type HoldingFmt =
  | "text_bold"
  | "quantity"
  | "price"
  | "money"
  | "money_colored"
  | "percent"
  | "percent_colored";

interface ColDef {
  key: string; // Holding field or computed key
  label: string;
  fmt: HoldingFmt;
  width: number;
  align: ColAlign;
  /** If true, include in TOTAL row sum */
  summable?: boolean;
}

/**
 * 18 columns matching user specification
 */
const TABLE_COLUMNS: ColDef[] = [
  { key: "company",                         label: "holdings.company",              fmt: "text_bold",       width: 150, align: "left" },
  { key: "shares_qty",                      label: "holdings.quantity",             fmt: "quantity",        width: 80,  align: "right", summable: true },
  { key: "avg_cost",                        label: "holdings.avgCostShare",         fmt: "price",           width: 95,  align: "right" },
  { key: "total_cost",                      label: "holdings.totalCost",            fmt: "money",           width: 105, align: "right", summable: true },
  { key: "market_price",                    label: "holdings.mktPrice",             fmt: "price",           width: 85,  align: "right" },
  { key: "market_value",                    label: "holdings.mktValue",             fmt: "money",           width: 105, align: "right", summable: true },
  { key: "unrealized_pnl",                  label: "holdings.appreciation",         fmt: "money_colored",   width: 105, align: "right", summable: true },
  { key: "cash_dividends",                  label: "holdings.cashDiv",              fmt: "money",           width: 90,  align: "right", summable: true },
  { key: "reinvested_dividends",            label: "holdings.reinvested",           fmt: "money",           width: 90,  align: "right", summable: true },
  { key: "bonus_dividend_shares",           label: "holdings.bonusShares",          fmt: "quantity",        width: 90,  align: "right", summable: true },
  { key: "bonus_share_value",               label: "holdings.bonusValue",           fmt: "money",           width: 95,  align: "right", summable: true },
  { key: "allocation_pct",                  label: "holdings.weightPct",            fmt: "percent",         width: 80,  align: "right" },
  { key: "dividend_yield_on_cost_pct",      label: "holdings.yieldPct",             fmt: "percent",         width: 75,  align: "right" },
  { key: "yield_amount",                    label: "holdings.yieldAmt",             fmt: "money",           width: 90,  align: "right", summable: true },
  { key: "weighted_dividend_yield_on_cost", label: "holdings.wtYieldPct",            fmt: "percent",         width: 85,  align: "right" },
  { key: "current_pnl",                     label: "holdingsScreen.currentPL",      fmt: "money_colored",   width: 105, align: "right", summable: true },
  { key: "current_pnl_pct",                 label: "holdings.pctChange",            fmt: "percent_colored", width: 78,  align: "right" },
  { key: "pe_ratio",                        label: "holdings.peRatio",              fmt: "money",           width: 80,  align: "right" },
];

const TOTAL_TABLE_WIDTH = TABLE_COLUMNS.reduce((s, c) => s + c.width, 0);

// ── Cell formatter ──────────────────────────────────────────────────

function fmtCell(
  val: any,
  fmt: HoldingFmt,
  colors: ThemePalette,
): { text: string; color: string; bold: boolean } {
  const muted = colors.textMuted;
  const primary = colors.textPrimary;
  const pos = colors.success;
  const neg = colors.danger;

  if (val == null || val === "" || Number.isNaN(val)) {
    return { text: "—", color: muted, bold: false };
  }

  switch (fmt) {
    case "text_bold":
      return { text: String(val), color: primary, bold: true };

    case "quantity": {
      const n = Number(val);
      if (!n) return { text: "—", color: muted, bold: false };
      return { text: fmtNum(n, 0), color: primary, bold: false };
    }

    case "price": {
      const n = Number(val);
      if (!n || n <= 0) return { text: "—", color: muted, bold: false };
      return { text: fmtNum(n, 3), color: primary, bold: false };
    }

    case "money": {
      const n = Number(val);
      if (!n && n !== 0) return { text: "—", color: muted, bold: false };
      if (n === 0) return { text: "—", color: muted, bold: false };
      return { text: fmtNum(n, 2), color: primary, bold: false };
    }

    case "money_colored": {
      const n = Number(val);
      if (!n && n !== 0) return { text: "—", color: muted, bold: false };
      if (n === 0) return { text: "—", color: muted, bold: false };
      if (n > 0) return { text: `+${fmtNum(n, 2)}`, color: pos, bold: true };
      return { text: fmtNum(n, 2), color: neg, bold: true };
    }

    case "percent": {
      const n = Number(val);
      if (!n && n !== 0) return { text: "—", color: muted, bold: false };
      if (n === 0) return { text: "0.00%", color: muted, bold: false };
      return { text: `${n.toFixed(2)}%`, color: primary, bold: false };
    }

    case "percent_colored": {
      const n = Number(val);
      if (!n && n !== 0) return { text: "—", color: muted, bold: false };
      if (n === 0) return { text: "0.00%", color: muted, bold: false };
      if (n > 0) return { text: `+${n.toFixed(2)}%`, color: pos, bold: true };
      return { text: `${n.toFixed(2)}%`, color: neg, bold: true };
    }

    default:
      return { text: String(val), color: primary, bold: false };
  }
}

// ── Get cell value from holding (handles computed fields) ───────────
// For USD holdings, money columns return KWD-converted values.

/** Keys that represent monetary totals (not per-share prices) */
const MONEY_TOTAL_KEYS = new Set([
  "total_cost",
  "market_value",
  "unrealized_pnl",
  "cash_dividends",
  "reinvested_dividends",
  "bonus_share_value",
  "yield_amount",
  "current_pnl",
]);

function getCellValue(holding: Holding, key: string): any {
  const isUsd = (holding.currency ?? "KWD").toUpperCase() === "USD";

  if (key === "yield_amount") {
    // Yield Amount = cash dividends
    const raw = holding.cash_dividends ?? 0;
    if (isUsd && holding.total_cost_kwd && holding.total_cost) {
      const rate = holding.total_cost_kwd / holding.total_cost;
      return raw * rate;
    }
    return raw;
  }
  if (key === "current_pnl") {
    // Current P/L = Market Value − Total Cost + Bonus Share Value
    if (isUsd) {
      const mvKwd = holding.market_value_kwd ?? 0;
      const tcKwd = holding.total_cost_kwd ?? 0;
      const bsvRate = holding.total_cost ? (holding.total_cost_kwd ?? 0) / holding.total_cost : 0;
      const bsvKwd = (holding.bonus_share_value ?? 0) * bsvRate;
      return mvKwd - tcKwd + bsvKwd;
    }
    return (holding.market_value ?? 0) - (holding.total_cost ?? 0) + (holding.bonus_share_value ?? 0);
  }
  if (key === "current_pnl_pct") {
    // P/L % = (Current P/L ÷ Total Cost) × 100 — same ratio regardless of currency
    const currentPnl = (holding.market_value ?? 0) - (holding.total_cost ?? 0) + (holding.bonus_share_value ?? 0);
    const cost = holding.total_cost ?? 0;
    return cost > 0 ? (currentPnl / cost) * 100 : 0;
  }

  // For USD holdings, swap money total columns to KWD equivalents
  if (isUsd && MONEY_TOTAL_KEYS.has(key)) {
    if (key === "total_cost") return holding.total_cost_kwd ?? 0;
    if (key === "market_value") return holding.market_value_kwd ?? 0;
    if (key === "unrealized_pnl") return holding.unrealized_pnl_kwd ?? 0;
    // For dividends/bonus that lack explicit KWD fields, convert via rate
    if (holding.total_cost && holding.total_cost_kwd) {
      const rate = holding.total_cost_kwd / holding.total_cost;
      return ((holding as any)[key] ?? 0) * rate;
    }
  }

  return (holding as any)[key];
}

/** Get the original USD value for a money column (for subtitle display) */
function getUsdOriginal(holding: Holding, key: string): number | null {
  if ((holding.currency ?? "KWD").toUpperCase() !== "USD") return null;
  if (!MONEY_TOTAL_KEYS.has(key)) return null;

  if (key === "total_cost") return holding.total_cost;
  if (key === "market_value") return holding.market_value;
  if (key === "unrealized_pnl") return holding.unrealized_pnl;
  if (key === "current_pnl") {
    return (holding.market_value ?? 0) - (holding.total_cost ?? 0) + (holding.bonus_share_value ?? 0);
  }
  if (key === "yield_amount") return holding.cash_dividends ?? 0;
  return (holding as any)[key] ?? null;
}

// ── Sorting ─────────────────────────────────────────────────────────

type SortDir = "asc" | "desc";

function sortHoldings(
  holdings: Holding[],
  sortCol: string | null,
  sortDir: SortDir,
): Holding[] {
  if (!sortCol) return holdings;
  const sorted = [...holdings].sort((a, b) => {
    const va = getCellValue(a, sortCol);
    const vb = getCellValue(b, sortCol);
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    if (typeof va === "string") return va.localeCompare(String(vb));
    return Number(va) - Number(vb);
  });
  return sortDir === "desc" ? sorted.reverse() : sorted;
}

// ── TOTAL row computation ───────────────────────────────────────────

function computeTotals(holdings: Holding[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const col of TABLE_COLUMNS) {
    if (!col.summable) continue;
    totals[col.key] = holdings.reduce(
      (sum, h) => sum + (Number(getCellValue(h, col.key)) || 0),
      0,
    );
  }
  // Compute overall P/L % = current_pnl / total_cost × 100
  if (totals.total_cost && totals.total_cost > 0) {
    totals.current_pnl_pct = (totals.current_pnl / totals.total_cost) * 100;
  }
  // Allocation sums to 100%
  totals.allocation_pct = 100;
  return totals;
}

// ── Sub-components ──────────────────────────────────────────────────

function HeaderCell({
  col,
  colors,
  sortCol,
  sortDir,
  onSort,
}: {
  col: ColDef;
  colors: ThemePalette;
  sortCol: string | null;
  sortDir: SortDir;
  onSort: (key: string) => void;
}) {
  const { t } = useTranslation();
  const isActive = sortCol === col.key;
  const arrow = isActive ? (sortDir === "asc" ? " ↑" : " ↓") : " ⇅";
  const translatedLabel = t(col.label);
  return (
    <Pressable
      onPress={() => onSort(col.key)}
      accessibilityRole="button"
      accessibilityLabel={t('holdingsScreen.sortBy', { label: translatedLabel })}
      style={[
        ts.headerCell,
        {
          width: col.width,
          backgroundColor: isActive ? colors.bgCardHover : "transparent",
        },
      ]}
    >
      <Text
        style={[
          ts.headerText,
          {
            color: isActive ? colors.accentPrimary : colors.textPrimary,
            textAlign: col.align,
          },
        ]}
        numberOfLines={1}
      >
        {translatedLabel}
        <Text style={{ opacity: isActive ? 1 : 0.35, fontSize: 10 }}>
          {arrow}
        </Text>
      </Text>
    </Pressable>
  );
}

function DataCell({
  col,
  holding,
  colors,
}: {
  col: ColDef;
  holding: Holding;
  colors: ThemePalette;
}) {
  const val = getCellValue(holding, col.key);
  const { text, color, bold } = fmtCell(val, col.fmt, colors);
  const usdVal = getUsdOriginal(holding, col.key);

  return (
    <View style={[ts.dataCell, { width: col.width }]}>
      <Text
        style={[
          ts.cellText,
          {
            color,
            fontWeight: bold ? "700" : "400",
            textAlign: col.align,
          },
        ]}
        numberOfLines={1}
      >
        {text}
      </Text>
      {usdVal != null && usdVal !== 0 && (
        <Text
          style={[
            ts.cellSubText,
            { color: colors.textMuted, textAlign: col.align },
          ]}
          numberOfLines={1}
        >
          ({fmtNum(usdVal, 2)} USD)
        </Text>
      )}
    </View>
  );
}

function TotalCell({
  col,
  totals,
  colors,
}: {
  col: ColDef;
  totals: Record<string, number>;
  colors: ThemePalette;
}) {
  const { t } = useTranslation();
  // First column shows "TOTAL" label
  if (col.key === "company") {
    return (
      <View style={[ts.dataCell, { width: col.width }]}>
        <Text
          style={[ts.cellText, { color: colors.accentPrimary, fontWeight: "800" }]}
        >
          {t('holdingsScreen.total')}
        </Text>
      </View>
    );
  }

  // Non-summable columns are blank
  if (!col.summable && col.key !== "pnl_pct" && col.key !== "allocation_pct") {
    return <View style={[ts.dataCell, { width: col.width }]} />;
  }

  const val = totals[col.key];
  const { text, color, bold } = fmtCell(val, col.fmt, colors);

  return (
    <View style={[ts.dataCell, { width: col.width }]}>
      <Text
        style={[
          ts.cellText,
          {
            color,
            fontWeight: bold ? "800" : "700",
            textAlign: col.align,
          },
        ]}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

function HoldingRow({
  holding,
  colors,
  isEven,
  onCompanyPress,
}: {
  holding: Holding;
  colors: ThemePalette;
  isEven: boolean;
  onCompanyPress?: (holding: Holding) => void;
}) {
  const { t } = useTranslation();
  const rowBg = isEven ? "transparent" : colors.bgCardHover + "30";
  return (
    <View
      style={[
        ts.dataRow,
        { backgroundColor: rowBg, borderBottomColor: colors.borderColor },
      ]}
    >
      {TABLE_COLUMNS.map((col) =>
        col.key === "company" && onCompanyPress ? (
          <Pressable
            key={col.key}
            onPress={() => onCompanyPress(holding)}
            accessibilityRole="link"
            accessibilityLabel={t('holdingsScreen.viewDetails', { company: holding.company })}
            style={({ pressed }) => [
              ts.dataCell,
              { width: col.width, opacity: pressed ? 0.6 : 1 },
            ]}
          >
            <Text
              style={[
                ts.cellText,
                {
                  color: colors.accentPrimary,
                  fontWeight: "700",
                  textAlign: col.align,
                  textDecorationLine: "underline",
                },
              ]}
              numberOfLines={1}
            >
              {holding.company}
            </Text>
          </Pressable>
        ) : (
          <DataCell key={col.key} col={col} holding={holding} colors={colors} />
        )
      )}
    </View>
  );
}

// ── Stock Merge / Edit Modal ────────────────────────────────────────

function StockMergeModal({
  holding,
  colors,
  onClose,
  onMerged,
}: {
  holding: Holding;
  colors: ThemePalette;
  onClose: () => void;
  onMerged: () => void;
}) {
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");

  // Fetch all stocks to find the current stock's ID and list merge targets
  const stocksQ = useAllStocksForMerge();
  const { t } = useTranslation();

  const allStocks = stocksQ.data?.stocks ?? [];

  // Find the current holding's stock record
  const currentStock = allStocks.find(
    (s) => s.symbol.trim().toUpperCase() === holding.symbol.trim().toUpperCase()
  );

  // Filter: all OTHER stocks (possible merge sources to absorb into this one)
  const mergeCandidates = useMemo(() => {
    const list = allStocks.filter(
      (s) => s.symbol.trim().toUpperCase() !== holding.symbol.trim().toUpperCase()
    );
    if (!searchText.trim()) return list;
    const q = searchText.toLowerCase();
    return list.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        (s.name ?? "").toLowerCase().includes(q)
    );
  }, [allStocks, holding.symbol, searchText]);

  const mergeMutation = useMutation({
    mutationFn: () => {
      if (!mergeTargetId || !currentStock) throw new Error("Missing stock IDs");
      // mergeTargetId is the SOURCE (stock being absorbed)
      // currentStock.id is the TARGET (stock being kept)
      return mergeStocks(mergeTargetId, currentStock.id);
    },
    onSuccess: (result) => {
      Alert.alert(
        t('holdingsScreen.stocksMerged'),
        t('holdingsScreen.mergedMessage', { source: result.source_symbol, target: result.target_symbol, count: result.transactions_moved })
      );
      onMerged();
      onClose();
    },
    onError: (err: any) => {
      showErrorAlert(t('holdingsScreen.mergeFailed'), err);
    },
  });

  const handleMerge = () => {
    if (!mergeTargetId || !currentStock) return;
    const sourceStock = allStocks.find((s) => s.id === mergeTargetId);
    const sourceName = sourceStock ? `${sourceStock.symbol} (${sourceStock.name})` : "the selected stock";

    if (Platform.OS === "web") {
      if (window.confirm(t('holdingsScreen.mergeConfirmMessage', { source: sourceName, target: holding.company, symbol: holding.symbol }))) {
        mergeMutation.mutate();
      }
    } else {
      Alert.alert(
        t('holdingsScreen.confirmMerge'),
        t('holdingsScreen.mergeConfirmMessage', { source: sourceName, target: holding.company, symbol: holding.symbol }),
        [
          { text: t('holdingsScreen.cancel'), style: "cancel" },
          { text: t('holdingsScreen.merge'), style: "destructive", onPress: () => mergeMutation.mutate() },
        ]
      );
    }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={mergeStyles.overlay} onPress={onClose} accessibilityRole="button" accessibilityLabel={t('holdingsScreen.closeDialog')}>
        <Pressable
          style={[
            mergeStyles.box,
            { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
          ]}
          onPress={() => {}}
        >
          {/* Title */}
          <View style={mergeStyles.titleRow}>
            <Text style={[mergeStyles.title, { color: colors.textPrimary }]}>
              {holding.company}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} style={{ padding: 6 }} accessibilityRole="button" accessibilityLabel={t('holdingsScreen.close')}>
              <FontAwesome name="times" size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Stock info */}
          <View style={[mergeStyles.infoCard, { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor }]}>
            <View style={mergeStyles.infoRow}>
              <Text style={[mergeStyles.infoLabel, { color: colors.textMuted }]}>{t('holdingsScreen.symbol')}</Text>
              <Text style={[mergeStyles.infoValue, { color: colors.textPrimary }]}>{holding.symbol}</Text>
            </View>
            <View style={mergeStyles.infoRow}>
              <Text style={[mergeStyles.infoLabel, { color: colors.textMuted }]}>{t('holdingsScreen.quantity')}</Text>
              <Text style={[mergeStyles.infoValue, { color: colors.textPrimary }]}>{fmtNum(holding.shares_qty, 0)}</Text>
            </View>
            <View style={mergeStyles.infoRow}>
              <Text style={[mergeStyles.infoLabel, { color: colors.textMuted }]}>{t('holdingsScreen.marketPrice')}</Text>
              <Text style={[mergeStyles.infoValue, { color: colors.textPrimary }]}>{fmtNum(holding.market_price, 3)}</Text>
            </View>
            <View style={mergeStyles.infoRow}>
              <Text style={[mergeStyles.infoLabel, { color: colors.textMuted }]}>{t('holdings.currency')}</Text>
              <Text style={[mergeStyles.infoValue, { color: colors.textPrimary }]}>{holding.currency}</Text>
            </View>
          </View>

          {/* Merge section */}
          <Text style={[mergeStyles.sectionLabel, { color: colors.textPrimary }]}>
            {t('holdingsScreen.mergeAnother')}
          </Text>
          <Text style={[mergeStyles.sectionHint, { color: colors.textMuted }]}>
            {t('holdingsScreen.selectStockToAbsorb', { symbol: holding.symbol })}
          </Text>

          <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
            {/* Search filter */}
            <RNTextInput
              style={[
                mergeStyles.searchInput,
                {
                  color: colors.textPrimary,
                  borderColor: colors.borderColor,
                  backgroundColor: colors.bgPrimary,
                },
              ]}
              placeholder={t('holdingsScreen.searchStocks')}
              placeholderTextColor={colors.textMuted}
              value={searchText}
              onChangeText={setSearchText}
            />

            {stocksQ.isLoading ? (
              <ActivityIndicator style={{ padding: 20 }} color={colors.accentPrimary} />
            ) : mergeCandidates.length === 0 ? (
              <Text style={[mergeStyles.emptyText, { color: colors.textMuted }]}>
                {t('holdingsScreen.noOtherStocks')}
              </Text>
            ) : (
              mergeCandidates.map((stock) => {
                const selected = mergeTargetId === stock.id;
                return (
                  <Pressable
                    key={stock.id}
                    onPress={() => setMergeTargetId(selected ? null : stock.id)}
                    style={[
                      mergeStyles.stockItem,
                      {
                        backgroundColor: selected
                          ? colors.accentPrimary + "20"
                          : "transparent",
                        borderColor: selected
                          ? colors.accentPrimary
                          : colors.borderColor,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[mergeStyles.stockSymbol, { color: selected ? colors.accentPrimary : colors.textPrimary }]}>
                        {stock.symbol}
                      </Text>
                      <Text style={[mergeStyles.stockName, { color: colors.textMuted }]}>
                        {stock.name} • {stock.portfolio} • {stock.currency}
                      </Text>
                    </View>
                    {selected && (
                      <FontAwesome name="check-circle" size={18} color={colors.accentPrimary} />
                    )}
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          {/* Action buttons */}
          <View style={mergeStyles.btnRow}>
            <Pressable
              onPress={onClose}
              style={[mergeStyles.btn, { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor, borderWidth: 1 }]}
            >
              <Text style={[mergeStyles.btnText, { color: colors.textSecondary }]}>{t('holdingsScreen.cancel')}</Text>
            </Pressable>
            <Pressable
              onPress={handleMerge}
              disabled={!mergeTargetId || mergeMutation.isPending}
              style={[
                mergeStyles.btn,
                {
                  backgroundColor: mergeTargetId
                    ? colors.danger
                    : colors.bgInput,
                  opacity: mergeTargetId ? 1 : 0.5,
                },
              ]}
            >
              {mergeMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[mergeStyles.btnText, { color: "#fff", fontWeight: "700" }]}>
                  {t('holdingsScreen.mergeSelected')}
                </Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Main screen ─────────────────────────────────────────────────────

export default function HoldingsScreen() {
  const { colors } = useThemeStore();
  const { spacing } = useResponsive();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const router = useRouter();

  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");
  const [selectedHolding, setSelectedHolding] = useState<Holding | null>(null);

  const {
    data: resp,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useHoldings(filter);

  // Cash balances query
  const {
    data: cashData,
    refetch: refetchCash,
  } = useCashBalances();

  const onSort = useCallback(
    (key: string) => {
      if (sortCol === key) {
        if (sortDir === "asc") setSortDir("desc");
        else {
          setSortCol(null);
          setSortDir("asc");
        }
      } else {
        setSortCol(key);
        setSortDir("asc");
      }
    },
    [sortCol, sortDir],
  );

  const sortedHoldings = useMemo(
    () => sortHoldings(resp?.holdings ?? [], sortCol, sortDir),
    [resp?.holdings, sortCol, sortDir],
  );

  const totals = useMemo(
    () => computeTotals(resp?.holdings ?? []),
    [resp?.holdings],
  );

  // Allocation data for donut chart (Weight by Cost, matching Streamlit)
  const allocationData: AllocationSlice[] = useMemo(() => {
    const holdings = resp?.holdings ?? [];
    return holdings
      .filter((h) => (h.allocation_pct ?? 0) > 0)
      .map((h) => ({
        company: h.company,
        weight: h.allocation_pct ?? 0,
        pnl_pct: h.pnl_pct ?? 0,
      }));
  }, [resp?.holdings]);

  // Deposit totals per portfolio for Cash Management
  const { kfh: { data: kfhDeposits }, bbyn: { data: bbynDeposits }, usa: { data: usaDeposits } } = useDepositTotals();

  // Compute total deposited per portfolio
  const depositTotals = useMemo(() => {
    const totals: Record<string, number> = {};
    const calcTotal = (deposits: typeof kfhDeposits, pf: string) => {
      if (!deposits?.deposits) return;
      totals[pf] = deposits.deposits
        .filter((d) => d.amount > 0 && !d.is_deleted)
        .reduce((sum, d) => sum + d.amount, 0);
    };
    calcTotal(kfhDeposits, "KFH");
    calcTotal(bbynDeposits, "BBYN");
    calcTotal(usaDeposits, "USA");
    return totals;
  }, [kfhDeposits, bbynDeposits, usaDeposits]);

  const portfolios = [undefined, "KFH", "BBYN", "USA"];
  const filterLabels = ["All", "KFH", "BBYN", "USA"];

  return (
    <DataScreen
      loading={isLoading}
      error={isError ? getApiErrorMessage(error, t('holdingsScreen.failedToLoad')) : null}
      onRetry={() => refetch()}
      loadingSkeleton={<HoldingsTableSkeleton />}
      bare
    >
    <View style={[s.container, { backgroundColor: colors.bgPrimary }]}>
      {/* ── Portfolio filter tabs + Export ─────────────────────────── */}
      <View style={s.filterRow}>
        {portfolios.map((p, i) => (
          <FilterChip
            key={filterLabels[i]}
            label={filterLabels[i]}
            active={filter === p}
            onPress={() => setFilter(p)}
            colors={colors}
          />
        ))}
      </View>

      {/* ── Summary KPI Cards ────────────────────────────────────── */}
      {resp && (
        <View style={[s.kpiCardRow, { borderBottomColor: colors.borderColor }]}>
          <KpiCard label={t('holdings.title')} value={String(resp.count)} color={colors.accentPrimary} colors={colors} />
          <KpiCard label={t('holdings.marketValue')} value={`${fmtNum(resp.totals.total_market_value_kwd)} KWD`} colors={colors} />
          <KpiCard label={t('holdings.avgCost')} value={`${fmtNum(resp.totals.total_cost_kwd)} KWD`} colors={colors} />
          <KpiCard
            label={t('dashboard.unrealizedPL')}
            value={`${resp.totals.total_unrealized_pnl_kwd >= 0 ? "+" : ""}${fmtNum(resp.totals.total_unrealized_pnl_kwd)} KWD`}
            color={resp.totals.total_unrealized_pnl_kwd > 0 ? colors.success : resp.totals.total_unrealized_pnl_kwd < 0 ? colors.danger : colors.textMuted}
            colors={colors}
          />
        </View>
      )}

      {/* ── Scrollable content ────────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={() => {
              refetch();
              refetchCash();
            }}
          />
        }
      >
        {/* ── Cash Management Section (top, always visible) ──── */}
        <CashBalancesSection
          cashData={cashData ?? {}}
          depositTotals={depositTotals}
          colors={colors}
          spacing={spacing}
          queryClient={queryClient}
        />

        {/* ── Holdings section header + Export ──────────────── */}
        <View
          style={[s.holdingsHeaderRow, { marginHorizontal: spacing.pagePx }]}
        >
          <Text
            style={[s.holdingsTitle, { color: colors.textPrimary }]}
          >
            <FontAwesome name="briefcase" size={16} color={colors.accentPrimary} />
            {"  "}{t('holdings.title')}
          </Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={async () => {
              if (Platform.OS !== "web") {
                Alert.alert(t('holdingsScreen.export'), t('holdingsScreen.exportWebOnly'));
                return;
              }
              try {
                const blob = await exportHoldingsExcel(filter ?? undefined);
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `holdings_${todayISO()}.xlsx`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch (e: any) {
                showErrorAlert(t('holdingsScreen.exportFailed'), e);
              }
            }}
            style={s.holdingsExportBtn}
          >
            <FontAwesome name="download" size={14} color="#10b981" style={{ marginRight: 8 }} />
            <Text style={s.holdingsExportText}>
              {t('holdingsScreen.exportExcel')}
            </Text>
          </TouchableOpacity>
        </View>

        <View
          style={[
            ts.tableOuter,
            {
              borderColor: colors.borderColor,
              backgroundColor: colors.bgCard,
              marginHorizontal: spacing.pagePx,
              marginTop: 4,
              marginBottom: 24,
            },
          ]}
        >
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={true}
            contentContainerStyle={{ minWidth: TOTAL_TABLE_WIDTH }}
          >
            <View style={{ width: TOTAL_TABLE_WIDTH }}>
              {/* Header */}
              <View
                style={[
                  ts.headerRow,
                  {
                    borderBottomColor: colors.borderColor,
                    backgroundColor: colors.bgSecondary,
                  },
                ]}
              >
                {TABLE_COLUMNS.map((col) => (
                  <HeaderCell
                    key={col.key}
                    col={col}
                    colors={colors}
                    sortCol={sortCol}
                    sortDir={sortDir}
                    onSort={onSort}
                  />
                ))}
              </View>

              {/* Data rows */}
              {sortedHoldings.map((h, idx) => (
                <HoldingRow
                  key={h.symbol}
                  holding={h}
                  colors={colors}
                  isEven={idx % 2 === 0}
                  onCompanyPress={(holding) => setSelectedHolding(holding)}
                />
              ))}

              {/* TOTAL row */}
              {sortedHoldings.length > 0 && (
                <View
                  style={[
                    ts.dataRow,
                    ts.totalRow,
                    {
                      borderBottomColor: colors.borderColor,
                      backgroundColor: colors.accentPrimary + "18",
                      borderTopColor: colors.accentPrimary,
                    },
                  ]}
                >
                  {TABLE_COLUMNS.map((col) => (
                    <TotalCell
                      key={col.key}
                      col={col}
                      totals={totals}
                      colors={colors}
                    />
                  ))}
                </View>
              )}

              {/* Empty state */}
              {sortedHoldings.length === 0 && (
                <View style={ts.emptyRow}>
                  <FontAwesome name="briefcase" size={36} color={colors.textMuted} style={{ marginBottom: 8 }} />
                  <Text style={{ color: colors.textMuted, fontSize: 14, marginBottom: 12 }}>
                    {t('holdingsScreen.noActiveHoldings')}
                  </Text>
                  <Pressable
                    onPress={() => router.push("/(tabs)/add-stock" as any)}
                    style={[{ backgroundColor: colors.accentPrimary, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8 }, Platform.OS === "web" ? ({ cursor: "pointer" } as any) : undefined]}
                  >
                    <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>{t('holdingsScreen.addFirstStock')}</Text>
                  </Pressable>
                </View>
              )}
            </View>
          </ScrollView>
        </View>

        {/* ── Allocation Donut Chart (Weight by Cost) ─────────── */}
        {allocationData.length > 0 && (
          <View
            style={[
              donutStyles.section,
              {
                marginHorizontal: spacing.pagePx,
                backgroundColor: colors.bgCard,
                borderColor: colors.borderColor,
              },
            ]}
          >
            <Text style={[donutStyles.sectionLabel, { color: colors.textPrimary }]}>
              <FontAwesome name="pie-chart" size={14} color={colors.accentPrimary} />{" "}
              {t('holdingsScreen.weightByCost')}
            </Text>
            <AllocationDonut
              data={allocationData}
              title={t('holdingsScreen.portfolioAllocation')}
              colors={colors}
              size={280}
              showLegend={true}
            />
          </View>
        )}

      </ScrollView>

      {/* Stock Merge / Edit Modal */}
      {selectedHolding && (
        <StockMergeModal
          holding={selectedHolding}
          colors={colors}
          onClose={() => setSelectedHolding(null)}
          onMerged={() => {
            queryClient.invalidateQueries({ queryKey: ["holdings"] });
            queryClient.invalidateQueries({ queryKey: ["overview"] });
            queryClient.invalidateQueries({ queryKey: ["all-stocks-for-merge"] });
          }}
        />
      )}
    </View>
    </DataScreen>
  );
}

// ── Merge modal styles ──────────────────────────────────────────────

const mergeStyles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  box: {
    width: "92%",
    maxWidth: 480,
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
    maxHeight: "88%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: {
    fontSize: 18,
    fontWeight: "800",
  },
  infoCard: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 12,
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  infoLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  infoValue: {
    fontSize: 12,
    fontWeight: "700",
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  sectionHint: {
    fontSize: 11,
    marginBottom: 10,
    lineHeight: 16,
  },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 8,
  },
  emptyText: {
    textAlign: "center",
    padding: 20,
    fontSize: 13,
  },
  stockItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 4,
  },
  stockSymbol: {
    fontSize: 13,
    fontWeight: "700",
  },
  stockName: {
    fontSize: 11,
    marginTop: 1,
  },
  btnRow: {
    flexDirection: "row",
    gap: 10,
    marginTop: 14,
  },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: {
    fontSize: 14,
    fontWeight: "600",
  },
});

// ── Table styles ────────────────────────────────────────────────────

const ts = StyleSheet.create({
  tableOuter: {
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  headerRow: {
    flexDirection: "row",
    borderBottomWidth: 2,
  },
  headerCell: {
    paddingHorizontal: 6,
    paddingVertical: 10,
    justifyContent: "center",
  },
  headerText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  dataRow: {
    flexDirection: "row",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  totalRow: {
    borderTopWidth: 2,
  },
  dataCell: {
    paddingHorizontal: 6,
    paddingVertical: 8,
    justifyContent: "center",
  },
  cellText: {
    fontSize: 12,
  },
  cellSubText: {
    fontSize: 9,
    marginTop: 1,
  },
  emptyRow: {
    padding: 32,
    alignItems: "center",
  },
});

// ── Screen styles ───────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },

  // Filter row
  filterRow: {
    flexDirection: "row",
    alignItems: "center",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    gap: 8,
  },
  exportBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    marginLeft: "auto" as const,
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  exportBtnText: { fontSize: 13, fontWeight: "600" as const },

  // KPI row
  kpiRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingVertical: 10,
    gap: 12,
    borderBottomWidth: 1,
  },
  kpiChip: {
    minWidth: 100,
  },
  kpiLabel: { fontSize: 11, marginBottom: 2 },
  kpiValue: { fontSize: 13, fontWeight: "700" },

  // KPI card row (Task 3)
  kpiCardRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 12,
    paddingVertical: 10,
    gap: 10,
    borderBottomWidth: 1,
  },

  /* Holdings section header */
  holdingsHeaderRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    justifyContent: "space-between" as const,
    marginTop: 16,
    marginBottom: 6,
  },
  holdingsTitle: {
    fontSize: 18,
    fontWeight: "700" as const,
  },
  holdingsExportBtn: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    backgroundColor: "#1a3a2a",
    borderColor: "#10b981",
    borderWidth: 1.5,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    minHeight: 36,
  },
  holdingsExportText: {
    color: "#10b981",
    fontSize: 13,
    fontWeight: "700" as const,
  },
});

// ── Donut section styles ────────────────────────────────────────────

const donutStyles = StyleSheet.create({
  section: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  sectionLabel: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 12,
  },
});
