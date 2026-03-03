/**
 * Portfolio Analysis — merged Holdings + Analysis screen.
 *
 * Sections (top to bottom):
 *   1. Portfolio & period filters
 *   2. Performance KPIs (TWR, MWRR, ROI, …)
 *   3. Cash Management (manual override, edit pencil)
 *   4. Holdings table (18 cols, sortable, TOTAL row)
 *   5. Allocation donut chart (Market Value Weight)
 *   6. Risk Metrics (Sharpe, Sortino)
 *   7. Realized Profit details
 */

import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  Platform,
  TextInput as RNTextInput,
  Alert,
} from "react-native";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { usePriceRefresh } from "@/hooks/usePriceRefresh";
import {
  getHoldings,
  Holding,
  HoldingsResponse,
  getCashBalances,
  setCashOverride,
  clearCashOverride,
  PortfolioCashBalance,
  getDeposits,
  getPerformance,
  getRiskMetrics,
  getRealizedProfit,
  PerformanceData,
  RiskMetrics,
  RealizedProfitData,
  exportHoldingsExcel,
} from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { AllocationDonut, AllocationSlice } from "@/components/charts/AllocationDonut";
import { formatCurrency } from "@/lib/currency";
import type { ThemePalette } from "@/constants/theme";

// =====================================================================
//  FORMATTING HELPERS
// =====================================================================

function fmtNum(n: number, decimals = 2): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// =====================================================================
//  HOLDINGS TABLE — column definitions
// =====================================================================

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
  key: string;
  label: string;
  fmt: HoldingFmt;
  width: number;
  align: ColAlign;
  summable?: boolean;
}

const TABLE_COLUMNS: ColDef[] = [
  { key: "company",                         label: "Company",              fmt: "text_bold",       width: 150, align: "left" },
  { key: "shares_qty",                      label: "Quantity",             fmt: "quantity",        width: 80,  align: "right", summable: true },
  { key: "avg_cost",                        label: "Avg Cost/Share",       fmt: "price",           width: 95,  align: "right" },
  { key: "total_cost",                      label: "Total Cost",           fmt: "money",           width: 105, align: "right", summable: true },
  { key: "market_price",                    label: "Mkt Price",            fmt: "price",           width: 85,  align: "right" },
  { key: "market_value",                    label: "Mkt Value",            fmt: "money",           width: 105, align: "right", summable: true },
  { key: "unrealized_pnl",                  label: "Unrealized P/L",       fmt: "money_colored",   width: 105, align: "right", summable: true },
  { key: "realized_pnl",                    label: "Realized P/L",         fmt: "money_colored",   width: 105, align: "right", summable: true },
  { key: "cash_dividends",                  label: "Cash Div",             fmt: "money",           width: 90,  align: "right", summable: true },
  { key: "reinvested_dividends",            label: "Reinvested",           fmt: "money",           width: 90,  align: "right", summable: true },
  { key: "bonus_dividend_shares",           label: "Bonus Shares",         fmt: "quantity",        width: 90,  align: "right", summable: true },
  { key: "bonus_share_value",               label: "Bonus Value",          fmt: "money",           width: 95,  align: "right", summable: true },
  { key: "allocation_pct",                  label: "Allocation %",         fmt: "percent",         width: 90,  align: "right" },
  { key: "dividend_yield_on_cost_pct",      label: "Yield %",              fmt: "percent",         width: 75,  align: "right" },
  { key: "yield_amount",                    label: "Yield Amt",            fmt: "money",           width: 90,  align: "right", summable: true },
  { key: "weighted_dividend_yield",         label: "Wt. Yield %",          fmt: "percent",         width: 85,  align: "right" },
  { key: "current_pnl",                     label: "Total P/L",            fmt: "money_colored",   width: 105, align: "right", summable: true },
  { key: "current_pnl_pct",                 label: "P/L %",                fmt: "percent_colored", width: 78,  align: "right" },
  { key: "pe_ratio",                        label: "P/E Ratio",            fmt: "money",           width: 80,  align: "right" },
];

const TOTAL_TABLE_WIDTH = TABLE_COLUMNS.reduce((sum, c) => sum + c.width, 0);

// =====================================================================
//  CELL FORMATTER
// =====================================================================

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
    return { text: "\u2014", color: muted, bold: false };
  }

  switch (fmt) {
    case "text_bold":
      return { text: String(val), color: primary, bold: true };
    case "quantity": {
      const n = Number(val);
      if (!n) return { text: "\u2014", color: muted, bold: false };
      return { text: fmtNum(n, 0), color: primary, bold: false };
    }
    case "price": {
      const n = Number(val);
      if (!n || n <= 0) return { text: "\u2014", color: muted, bold: false };
      return { text: fmtNum(n, 3), color: primary, bold: false };
    }
    case "money": {
      const n = Number(val);
      if (!n && n !== 0) return { text: "\u2014", color: muted, bold: false };
      if (n === 0) return { text: "\u2014", color: muted, bold: false };
      return { text: fmtNum(n, 2), color: primary, bold: false };
    }
    case "money_colored": {
      const n = Number(val);
      if (!n && n !== 0) return { text: "\u2014", color: muted, bold: false };
      if (n === 0) return { text: "\u2014", color: muted, bold: false };
      if (n > 0) return { text: `+${fmtNum(n, 2)}`, color: pos, bold: true };
      return { text: fmtNum(n, 2), color: neg, bold: true };
    }
    case "percent": {
      const n = Number(val);
      if (!n && n !== 0) return { text: "\u2014", color: muted, bold: false };
      if (n === 0) return { text: "0.00%", color: muted, bold: false };
      return { text: `${n.toFixed(2)}%`, color: primary, bold: false };
    }
    case "percent_colored": {
      const n = Number(val);
      if (!n && n !== 0) return { text: "\u2014", color: muted, bold: false };
      if (n === 0) return { text: "0.00%", color: muted, bold: false };
      const pct = Math.abs(n) < 1 ? n * 100 : n;
      if (pct > 0) return { text: `+${pct.toFixed(2)}%`, color: pos, bold: true };
      return { text: `${pct.toFixed(2)}%`, color: neg, bold: true };
    }
    default:
      return { text: String(val), color: primary, bold: false };
  }
}

// =====================================================================
//  HELPERS — cell value, sorting, totals
// =====================================================================

/**
 * _allHoldings is set before rendering so getCellValue can compute
 * CFA-compliant allocation:  w_i = MV_i(KWD) / Σ MV(KWD)
 */
let _allHoldings: Holding[] = [];
let _totalPortfolioValueKwd = 0;

/** Columns whose USD values must be shown in KWD for correct totals */
const KWD_MONEY_KEYS = new Set([
  "avg_cost", "total_cost", "market_price", "market_value",
  "unrealized_pnl", "realized_pnl", "current_pnl",
]);

function getCellValue(holding: Holding, key: string): any {
  const isUSD = (holding.currency ?? "KWD").toUpperCase() === "USD";

  if (key === "yield_amount") return holding.cash_dividends ?? 0;

  // Streamlit formula: Total P/L = unrealized + realized + cash_dividends
  if (key === "current_pnl") {
    if (isUSD) return holding.total_pnl_kwd ?? 0;
    return holding.total_pnl ?? 0;
  }
  // Streamlit display: P/L % = Total P/L / total_cost
  if (key === "current_pnl_pct") {
    const cost = isUSD ? (holding.total_cost_kwd ?? 0) : (holding.total_cost ?? 0);
    const pnl = isUSD ? (holding.total_pnl_kwd ?? 0) : (holding.total_pnl ?? 0);
    return cost > 0 ? (pnl / cost) * 100 : 0;
  }

  // Allocation % = Market Value(KWD) / Total Portfolio Value (stocks + cash)
  if (key === "allocation_pct") {
    if (_totalPortfolioValueKwd <= 0) return 0;
    return ((holding.market_value_kwd ?? 0) / _totalPortfolioValueKwd) * 100;
  }
  // Weighted Yield = allocation_pct * dividend_yield_on_cost_pct
  if (key === "weighted_dividend_yield") {
    if (_totalPortfolioValueKwd <= 0) return 0;
    const w = (holding.market_value_kwd ?? 0) / _totalPortfolioValueKwd;
    return w * (holding.dividend_yield_on_cost_pct ?? 0);
  }

  // For USD holdings, return KWD-converted values for money columns
  if (isUSD && KWD_MONEY_KEYS.has(key)) {
    if (key === "avg_cost") {
      const qty = holding.shares_qty ?? 0;
      return qty > 0 ? (holding.total_cost_kwd ?? 0) / qty : 0;
    }
    if (key === "total_cost") return holding.total_cost_kwd ?? 0;
    if (key === "market_price") {
      const qty = holding.shares_qty ?? 0;
      return qty > 0 ? (holding.market_value_kwd ?? 0) / qty : 0;
    }
    if (key === "market_value") return holding.market_value_kwd ?? 0;
    if (key === "unrealized_pnl") return holding.unrealized_pnl_kwd ?? 0;
    if (key === "realized_pnl") {
      // No realized_pnl_kwd from backend, derive from total_pnl_kwd
      return (holding.total_pnl_kwd ?? 0) - (holding.unrealized_pnl_kwd ?? 0)
        - (holding.cash_dividends ?? 0) * DEFAULT_USD_KWD_RATE;
    }
  }

  return (holding as any)[key];
}

/**
 * For USD holdings, returns the original USD value string for money columns.
 * Returns null if not applicable (KWD holding or non-money column).
 */
function getUsdBracketText(holding: Holding, key: string): string | null {
  if ((holding.currency ?? "KWD").toUpperCase() !== "USD") return null;
  if (!KWD_MONEY_KEYS.has(key)) return null;

  let usdVal: number | null = null;
  if (key === "avg_cost") usdVal = holding.avg_cost;
  else if (key === "total_cost") usdVal = holding.total_cost;
  else if (key === "market_price") usdVal = holding.market_price;
  else if (key === "market_value") usdVal = holding.market_value;
  else if (key === "unrealized_pnl") usdVal = holding.unrealized_pnl;
  else if (key === "realized_pnl") usdVal = holding.realized_pnl;
  else if (key === "current_pnl") usdVal = holding.total_pnl ?? 0;

  if (usdVal == null || usdVal === 0) return null;
  return `($${fmtNum(usdVal, 2)})`;
}

type SortDir = "asc" | "desc";

function sortHoldings(holdings: Holding[], sortCol: string | null, sortDir: SortDir): Holding[] {
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

function computeTotals(holdings: Holding[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const col of TABLE_COLUMNS) {
    if (!col.summable) continue;
    totals[col.key] = holdings.reduce((sum, h) => sum + (Number(getCellValue(h, col.key)) || 0), 0);
  }
  if (totals.total_cost && totals.total_cost > 0) {
    totals.current_pnl_pct = (totals.current_pnl / totals.total_cost) * 100;
  }
  // Allocation: stocks sum < 100% because cash takes a share
  // totals.allocation_pct already summed via getCellValue above
  // Weighted yield = Σ(w_i × yield_i) — using total portfolio value
  totals.weighted_dividend_yield = holdings.reduce((sum, h) => {
    if (_totalPortfolioValueKwd <= 0) return sum;
    const w = (h.market_value_kwd ?? 0) / _totalPortfolioValueKwd;
    return sum + w * (h.dividend_yield_on_cost_pct ?? 0);
  }, 0);
  return totals;
}

// =====================================================================
//  TABLE SUB-COMPONENTS
// =====================================================================

function HeaderCell({ col, colors, sortCol, sortDir, onSort }: {
  col: ColDef; colors: ThemePalette; sortCol: string | null; sortDir: SortDir; onSort: (k: string) => void;
}) {
  const isActive = sortCol === col.key;
  const arrow = isActive ? (sortDir === "asc" ? " \u2191" : " \u2193") : " \u21C5";
  return (
    <Pressable
      onPress={() => onSort(col.key)}
      style={[htStyles.headerCell, { width: col.width, backgroundColor: isActive ? colors.bgCardHover : "transparent" }]}
    >
      <Text
        style={[htStyles.headerText, { color: isActive ? colors.accentPrimary : colors.textPrimary, textAlign: col.align }]}
        numberOfLines={1}
      >
        {col.label}
        <Text style={{ opacity: isActive ? 1 : 0.35, fontSize: 10 }}>{arrow}</Text>
      </Text>
    </Pressable>
  );
}

function DataCell({ col, holding, colors }: { col: ColDef; holding: Holding; colors: ThemePalette }) {
  const val = getCellValue(holding, col.key);
  const { text, color, bold } = fmtCell(val, col.fmt, colors);
  const usdText = getUsdBracketText(holding, col.key);
  return (
    <View style={[htStyles.dataCell, { width: col.width }]}>
      <Text style={[htStyles.cellText, { color, fontWeight: bold ? "700" : "400", textAlign: col.align }]} numberOfLines={1}>
        {text}
      </Text>
      {usdText ? (
        <Text style={{ fontSize: 9, color: colors.textMuted, textAlign: col.align, marginTop: 1 }} numberOfLines={1}>
          {usdText}
        </Text>
      ) : null}
    </View>
  );
}

function TotalCell({ col, totals, colors }: { col: ColDef; totals: Record<string, number>; colors: ThemePalette }) {
  if (col.key === "company") {
    return (
      <View style={[htStyles.dataCell, { width: col.width }]}>
        <Text style={[htStyles.cellText, { color: colors.accentPrimary, fontWeight: "800" }]}>TOTAL</Text>
      </View>
    );
  }
  if (!col.summable && col.key !== "current_pnl_pct" && col.key !== "allocation_pct" && col.key !== "weighted_dividend_yield") {
    return <View style={[htStyles.dataCell, { width: col.width }]} />;
  }
  const val = totals[col.key];
  const { text, color, bold } = fmtCell(val, col.fmt, colors);
  return (
    <View style={[htStyles.dataCell, { width: col.width }]}>
      <Text style={[htStyles.cellText, { color, fontWeight: bold ? "800" : "700", textAlign: col.align }]} numberOfLines={1}>
        {text}
      </Text>
    </View>
  );
}

function HoldingRow({ holding, colors, isEven }: { holding: Holding; colors: ThemePalette; isEven: boolean }) {
  const rowBg = isEven ? "transparent" : colors.bgCardHover + "30";
  return (
    <View style={[htStyles.dataRow, { backgroundColor: rowBg, borderBottomColor: colors.borderColor }]}>
      {TABLE_COLUMNS.map((col) => (
        <DataCell key={col.key} col={col} holding={holding} colors={colors} />
      ))}
    </View>
  );
}

// =====================================================================
//  CASH MANAGEMENT SECTION
// =====================================================================

const PORTFOLIO_CCY: Record<string, string> = { KFH: "KWD", BBYN: "KWD", USA: "USD" };
const DEFAULT_USD_KWD_RATE = 0.307;

function CashBalancesSection({ cashData, depositTotals, colors, spacing, queryClient }: {
  cashData: Record<string, PortfolioCashBalance>;
  depositTotals: Record<string, number>;
  colors: ThemePalette;
  spacing: { pagePx: number };
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [editingPf, setEditingPf] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const overrideMutation = useMutation({
    mutationFn: ({ portfolio, balance, currency }: { portfolio: string; balance: number; currency: string }) =>
      setCashOverride(portfolio, balance, currency),
    onSuccess: async () => { await Promise.all([queryClient.refetchQueries({ queryKey: ["cash-balances"] }), queryClient.refetchQueries({ queryKey: ["portfolio-overview"] })]); setEditingPf(null); setEditValue(""); },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.message ?? "Failed to save";
      if (Platform.OS === "web") window.alert(`Error: ${msg}`);
      else Alert.alert("Error", msg);
    },
  });

  const clearMutation = useMutation({
    mutationFn: (portfolio: string) => clearCashOverride(portfolio),
    onSuccess: async () => { await Promise.all([queryClient.refetchQueries({ queryKey: ["cash-balances"] }), queryClient.refetchQueries({ queryKey: ["portfolio-overview"] })]); },
  });

  const handleSaveOverride = (portfolio: string) => {
    const num = parseFloat(editValue);
    if (isNaN(num) || num < 0) {
      if (Platform.OS === "web") window.alert("Enter a valid positive number");
      else Alert.alert("Invalid", "Enter a valid positive number");
      return;
    }
    overrideMutation.mutate({ portfolio, balance: num, currency: PORTFOLIO_CCY[portfolio] ?? "KWD" });
  };

  const cashPortfolios = ["KFH", "BBYN", "USA"];

  const totalFreeCashKwd = useMemo(() => {
    let total = 0;
    for (const pf of cashPortfolios) {
      const item = cashData[pf];
      if (!item) continue;
      total += item.currency === "USD" ? item.balance * DEFAULT_USD_KWD_RATE : item.balance;
    }
    return total;
  }, [cashData]);

  return (
    <View style={[cs.section, { marginHorizontal: spacing.pagePx, backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={cs.cashHeader}>
        <Text style={[cs.sectionTitle, { color: colors.textPrimary }]}>
          <FontAwesome name="money" size={16} color={colors.accentPrimary} />{" "}
          Cash Management
        </Text>
        <Text style={[cs.cashCaption, { color: colors.textMuted }]}>Edit cash balances manually. Tap the pencil to override.</Text>
      </View>

      {/* Table Header */}
      <View style={[cs.tableHeaderRow, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderColor }]}>
        <Text style={[cs.tableHeaderCell, cs.cellPortfolio, { color: colors.textSecondary }]}>Portfolio</Text>
        <Text style={[cs.tableHeaderCell, cs.cellCcy, { color: colors.textSecondary }]}>CCY</Text>
        <Text style={[cs.tableHeaderCell, cs.cellCapital, { color: colors.textSecondary }]}>Total Capital</Text>
        <Text style={[cs.tableHeaderCell, cs.cellCash, { color: colors.textSecondary }]}>Available Cash</Text>
        <Text style={[cs.tableHeaderCell, cs.cellActions, { color: colors.textSecondary }]}> </Text>
      </View>

      {cashPortfolios.map((pf) => {
        const item = cashData[pf];
        const balance = item?.balance ?? 0;
        const ccy = PORTFOLIO_CCY[pf] ?? "KWD";
        const ccyDisplay = ccy === "USD" ? `USD (${DEFAULT_USD_KWD_RATE.toFixed(3)})` : ccy;
        const balanceKwd = ccy === "USD" ? balance * DEFAULT_USD_KWD_RATE : balance;
        const totalDeposited = depositTotals[pf] ?? 0;
        const isEditing = editingPf === pf;
        const isManual = item?.manual_override ?? false;

        return (
          <View key={pf} style={[cs.tableDataRow, { borderBottomColor: colors.borderColor }]}>
            <View style={[cs.cellPortfolio, cs.cellInner]}>
              <Text style={[cs.cellText, { color: colors.textPrimary, fontWeight: "600" }]}>{pf}</Text>
              {isManual && (
                <View style={[cs.overrideBadge, { backgroundColor: colors.warning + "22" }]}>
                  <Text style={{ color: colors.warning, fontSize: 9, fontWeight: "700" }}>MANUAL</Text>
                </View>
              )}
            </View>

            <View style={[cs.cellCcy, cs.cellInner]}>
              <Text style={[cs.cellText, { color: colors.textSecondary, fontSize: 11 }]}>{ccyDisplay}</Text>
            </View>

            <View style={[cs.cellCapital, cs.cellInner]}>
              <Text style={[cs.cellText, { color: colors.textMuted }]}>{fmtNum(totalDeposited, ccy === "KWD" ? 0 : 2)}</Text>
            </View>

            {isEditing ? (
              <View style={[cs.cellCash, cs.editRow]}>
                <RNTextInput
                  style={[cs.editInput, { color: colors.textPrimary, backgroundColor: colors.bgInput, borderColor: colors.borderColor }]}
                  value={editValue}
                  onChangeText={setEditValue}
                  keyboardType="decimal-pad"
                  placeholder={ccy === "USD" ? "Amount (USD)" : "Amount"}
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                />
                <Pressable onPress={() => handleSaveOverride(pf)} style={[cs.editBtn, { backgroundColor: colors.success + "22" }]}>
                  <FontAwesome name="check" size={12} color={colors.success} />
                </Pressable>
                <Pressable onPress={() => { setEditingPf(null); setEditValue(""); }} style={[cs.editBtn, { backgroundColor: colors.danger + "22" }]}>
                  <FontAwesome name="times" size={12} color={colors.danger} />
                </Pressable>
              </View>
            ) : (
              <View style={[cs.cellCash, cs.cellInner]}>
                {ccy === "USD" ? (
                  <>
                    <Text style={[cs.cellText, { color: colors.textPrimary, fontWeight: "600" }]}>{fmtNum(balanceKwd, 3)} KWD</Text>
                    <Text style={{ fontSize: 9, color: colors.textMuted, marginTop: 1 }}>({fmtNum(balance, 2)} USD)</Text>
                  </>
                ) : (
                  <Text style={[cs.cellText, { color: colors.textPrimary, fontWeight: "600" }]}>{fmtNum(balance, 3)}</Text>
                )}
              </View>
            )}

            {!isEditing && (
              <View style={[cs.cellActions, cs.cellInner, { flexDirection: "row", gap: 8, justifyContent: "center", alignItems: "center" }]}>
                <Pressable
                  onPress={() => { setEditingPf(pf); setEditValue(balance.toString()); }}
                  style={({ pressed }) => [{ width: 32, height: 32, borderRadius: 6, backgroundColor: colors.accentPrimary + "20", borderWidth: 1, borderColor: colors.accentPrimary + "44", justifyContent: "center" as const, alignItems: "center" as const, opacity: pressed ? 0.6 : 1 }]}
                >
                  <FontAwesome name="pencil" size={15} color={colors.accentPrimary} />
                </Pressable>
                {isManual && (
                  <Pressable
                    onPress={() => {
                      const msg = `Clear manual override for ${pf}? Balance will be recalculated automatically.`;
                      if (Platform.OS === "web") { if (window.confirm(msg)) clearMutation.mutate(pf); }
                      else { Alert.alert("Clear Override", msg, [{ text: "Cancel", style: "cancel" }, { text: "Clear", onPress: () => clearMutation.mutate(pf) }]); }
                    }}
                    style={({ pressed }) => [{ width: 32, height: 32, borderRadius: 6, backgroundColor: colors.warning + "20", borderWidth: 1, borderColor: colors.warning + "44", justifyContent: "center" as const, alignItems: "center" as const, opacity: pressed ? 0.6 : 1 }]}
                  >
                    <FontAwesome name="undo" size={14} color={colors.warning} />
                  </Pressable>
                )}
              </View>
            )}
            {isEditing && <View style={cs.cellActions} />}
          </View>
        );
      })}

      <View style={[cs.totalCashRow, { borderTopColor: colors.accentPrimary }]}>
        <Text style={[cs.totalCashLabel, { color: colors.textSecondary }]}>Total Free Cash</Text>
        <Text style={[cs.totalCashValue, { color: colors.accentPrimary }]}>{fmtNum(totalFreeCashKwd, 3)} KWD</Text>
      </View>
    </View>
  );
}

// =====================================================================
//  KPI HELPERS
// =====================================================================

function KpiCard({ label, value, suffix, color, colors }: {
  label: string; value: string | number; suffix?: string; color?: string; colors: ThemePalette;
}) {
  return (
    <View style={[s.kpiCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <Text style={[s.kpiLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[s.kpiValue, { color: color ?? colors.textPrimary }]}>
        {value}
        {suffix ? <Text style={s.kpiSuffix}>{suffix}</Text> : null}
      </Text>
    </View>
  );
}

function KpiChip({ label, value, valueColor, colors }: {
  label: string; value: string; valueColor?: string; colors: ThemePalette;
}) {
  return (
    <View style={s.kpiChip}>
      <Text style={[s.kpiChipLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[s.kpiChipValue, { color: valueColor ?? colors.textPrimary }]} numberOfLines={1}>{value}</Text>
    </View>
  );
}

// =====================================================================
//  CONSTANTS
// =====================================================================

const PORTFOLIOS = ["All", "KFH", "BBYN", "USA"] as const;
const PERIODS = ["1M", "3M", "6M", "YTD", "1Y", "ALL"] as const;

// =====================================================================
//  MAIN SCREEN
// =====================================================================

export default function PortfolioAnalysisScreen() {
  const { colors } = useThemeStore();
  const { isDesktop, spacing } = useResponsive();
  const queryClient = useQueryClient();

  // Filters
  const [selectedPortfolio, setSelectedPortfolio] = useState<string>("All");
  const [period, setPeriod] = useState<string>("ALL");

  // Holdings sort
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const portfolioParam = selectedPortfolio === "All" ? undefined : selectedPortfolio;

  // ── Queries ─────────────────────────────────────────────────────

  const { refresh: refreshPrices, isRefreshing: priceRefreshing } = usePriceRefresh();

  const {
    data: holdingsResp,
    isLoading: holdingsLoading,
    isError: holdingsError,
    error: holdingsErr,
    refetch: refetchHoldings,
    isRefetching,
  } = useQuery<HoldingsResponse>({
    queryKey: ["holdings", portfolioParam],
    queryFn: () => getHoldings(portfolioParam),
  });

  const { data: perfData } = useQuery<PerformanceData>({
    queryKey: ["performance", portfolioParam, period],
    queryFn: () => getPerformance({ portfolio: portfolioParam, period }),
  });

  const { data: riskData } = useQuery<RiskMetrics>({
    queryKey: ["risk-metrics"],
    queryFn: () => getRiskMetrics(),
  });

  const { data: realizedData } = useQuery<RealizedProfitData>({
    queryKey: ["realized-profit"],
    queryFn: () => getRealizedProfit(),
  });

  const { data: cashData } = useQuery<Record<string, PortfolioCashBalance>>({
    queryKey: ["cash-balances"],
    queryFn: () => getCashBalances(),
  });

  // Deposit totals per portfolio
  const { data: kfhDeposits } = useQuery({ queryKey: ["deposits-total", "KFH"], queryFn: () => getDeposits({ portfolio: "KFH", page_size: 9999 }) });
  const { data: bbynDeposits } = useQuery({ queryKey: ["deposits-total", "BBYN"], queryFn: () => getDeposits({ portfolio: "BBYN", page_size: 9999 }) });
  const { data: usaDeposits } = useQuery({ queryKey: ["deposits-total", "USA"], queryFn: () => getDeposits({ portfolio: "USA", page_size: 9999 }) });

  // ── Pull-to-refresh (prices + all dependent caches) ──────────

  const onRefresh = useCallback(async () => {
    await refreshPrices();
  }, [refreshPrices]);

  // ── Derived data ────────────────────────────────────────────────

  const onSort = useCallback(
    (key: string) => {
      if (sortCol === key) {
        if (sortDir === "asc") setSortDir("desc");
        else { setSortCol(null); setSortDir("asc"); }
      } else { setSortCol(key); setSortDir("asc"); }
    },
    [sortCol, sortDir],
  );

  const sortedHoldings = useMemo(
    () => sortHoldings(holdingsResp?.holdings ?? [], sortCol, sortDir),
    [holdingsResp?.holdings, sortCol, sortDir],
  );

  // Keep module-level refs in sync so getCellValue can compute allocation
  _allHoldings = holdingsResp?.holdings ?? [];
  // Use total portfolio value (stocks + cash) from backend
  _totalPortfolioValueKwd = holdingsResp?.total_portfolio_value_kwd ?? 0;
  const cashBalanceKwd = holdingsResp?.cash_balance_kwd ?? 0;

  const totals = useMemo(() => computeTotals(holdingsResp?.holdings ?? []), [holdingsResp?.holdings, _totalPortfolioValueKwd]);

  // Allocation by market value including cash — use backend total_portfolio_value
  // Merge same-company holdings across portfolios into a single slice
  const allocationData: AllocationSlice[] = useMemo(() => {
    const holdings = holdingsResp?.holdings ?? [];
    const totalPortfolio = _totalPortfolioValueKwd;
    if (totalPortfolio <= 0) return [];

    // Group by company name — same stock in different portfolios becomes one slice
    const grouped = new Map<string, { mvKwd: number; pnlPctWeightedSum: number }>();
    for (const h of holdings) {
      const mv = h.market_value_kwd ?? 0;
      if (mv <= 0) continue;
      const key = h.company;
      const existing = grouped.get(key);
      if (existing) {
        existing.pnlPctWeightedSum += (h.pnl_pct ?? 0) * mv;
        existing.mvKwd += mv;
      } else {
        grouped.set(key, { mvKwd: mv, pnlPctWeightedSum: (h.pnl_pct ?? 0) * mv });
      }
    }

    const slices: AllocationSlice[] = Array.from(grouped.entries()).map(([company, { mvKwd, pnlPctWeightedSum }]) => ({
      company,
      weight: mvKwd / totalPortfolio,       // 0–1 fractional
      pnl_pct: mvKwd > 0 ? pnlPctWeightedSum / mvKwd : 0,
    }));

    // Add cash as a slice
    if (cashBalanceKwd > 0) {
      slices.push({ company: "Cash", weight: cashBalanceKwd / totalPortfolio, pnl_pct: 0 });
    }
    return slices;
  }, [holdingsResp?.holdings, _totalPortfolioValueKwd, cashBalanceKwd]);

  const depositTotals = useMemo(() => {
    const t: Record<string, number> = {};
    const calc = (deps: typeof kfhDeposits, pf: string) => {
      if (!deps?.deposits) return;
      t[pf] = deps.deposits.filter((d) => d.amount > 0 && !d.is_deleted).reduce((sum, d) => sum + d.amount, 0);
    };
    calc(kfhDeposits, "KFH");
    calc(bbynDeposits, "BBYN");
    calc(usaDeposits, "USA");
    return t;
  }, [kfhDeposits, bbynDeposits, usaDeposits]);

  // ── Loading / Error ─────────────────────────────────────────────

  if (holdingsLoading) return <LoadingScreen message="Loading portfolio\u2026" />;
  if (holdingsError) return <ErrorScreen message={(holdingsErr as any)?.message ?? "Failed to load holdings"} onRetry={() => refetchHoldings()} />;

  const resp = holdingsResp!;

  // ── Render ──────────────────────────────────────────────────────

  return (
    <View style={[s.container, { backgroundColor: colors.bgPrimary }]}>
      {/* ── Portfolio filter ─────────────────────────────────────── */}
      <View style={s.filterRow}>
        {PORTFOLIOS.map((pf) => (
          <Pressable
            key={pf}
            onPress={() => setSelectedPortfolio(pf)}
            style={[s.filterChip, { backgroundColor: selectedPortfolio === pf ? colors.accentPrimary : colors.bgCard, borderColor: colors.borderColor }]}
          >
            <Text style={{ color: selectedPortfolio === pf ? "#fff" : colors.textSecondary, fontSize: 13, fontWeight: "600" }}>{pf}</Text>
          </Pressable>
        ))}
      </View>

      {/* ── Scrollable content ───────────────────────────────────── */}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={isDesktop ? { maxWidth: 1200, alignSelf: "center" as const, width: "100%" } : undefined}
        refreshControl={
          <RefreshControl refreshing={isRefetching || priceRefreshing} onRefresh={onRefresh} tintColor={colors.accentPrimary} />
        }
      >

        {/* ── 1. Performance KPIs ───────────────────────────────── */}
        <View style={{ paddingHorizontal: spacing.pagePx, marginTop: 8 }}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
            <FontAwesome name="bar-chart" size={16} color={colors.accentPrimary} /> Performance
          </Text>
          <View style={s.kpiGrid}>
            <KpiCard label="Total Portfolio Value" value={formatCurrency(_totalPortfolioValueKwd, "KWD")} colors={colors} />
            <KpiCard label="Total Market Value" value={formatCurrency(resp.totals.total_market_value_kwd, "KWD")} colors={colors} />
            <KpiCard label="Total Cost" value={formatCurrency(resp.totals.total_cost_kwd, "KWD")} colors={colors} />
            <KpiCard label="Unrealized Gain/Loss" value={formatCurrency(resp.totals.total_unrealized_pnl_kwd, "KWD")} color={resp.totals.total_unrealized_pnl_kwd >= 0 ? colors.success : colors.danger} colors={colors} />
            <KpiCard label="Stocks Held" value={sortedHoldings.length} colors={colors} />
          </View>
        </View>

        {/* ── 2. Cash Management ────────────────────────────────── */}
        <View style={{ marginTop: 16 }}>
          <CashBalancesSection
            cashData={cashData ?? {}}
            depositTotals={depositTotals}
            colors={colors}
            spacing={spacing}
            queryClient={queryClient}
          />
        </View>

        {/* ── 3. Holdings Table ──────────────────────────────────── */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: spacing.pagePx, marginBottom: 8, marginTop: 16 }}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary, marginTop: 0 }]}>
            <FontAwesome name="briefcase" size={16} color={colors.accentPrimary} /> Holdings
          </Text>
          <Pressable
            onPress={async () => {
              if (Platform.OS !== "web") {
                Alert.alert("Export", "Excel export is available on web.");
                return;
              }
              try {
                const blob = await exportHoldingsExcel(selectedPortfolio === "All" ? undefined : selectedPortfolio);
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = url;
                a.download = `holdings_${new Date().toISOString().slice(0, 10)}.xlsx`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(url);
              } catch (e: any) {
                Alert.alert("Export Failed", e?.message ?? "Unknown error");
              }
            }}
            style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#065f46", borderColor: "#10b981", borderWidth: 1.5, paddingHorizontal: 14, paddingVertical: 7, borderRadius: 8 }}
          >
            <FontAwesome name="download" size={13} color="#34d399" style={{ marginRight: 6 }} />
            <Text style={{ color: "#34d399", fontSize: 13, fontWeight: "700" }}>Export Excel</Text>
          </Pressable>
        </View>
        <View
          style={[htStyles.tableOuter, { borderColor: colors.borderColor, backgroundColor: colors.bgCard, marginHorizontal: spacing.pagePx, marginBottom: 24 }]}
        >
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ minWidth: TOTAL_TABLE_WIDTH }}>
            <View style={{ width: TOTAL_TABLE_WIDTH }}>
              {/* Header */}
              <View style={[htStyles.headerRow, { borderBottomColor: colors.borderColor, backgroundColor: colors.bgSecondary }]}>
                {TABLE_COLUMNS.map((col) => (
                  <HeaderCell key={col.key} col={col} colors={colors} sortCol={sortCol} sortDir={sortDir} onSort={onSort} />
                ))}
              </View>

              {/* Data rows */}
              {sortedHoldings.map((h, idx) => (
                <HoldingRow key={h.symbol} holding={h} colors={colors} isEven={idx % 2 === 0} />
              ))}

              {/* TOTAL row */}
              {sortedHoldings.length > 0 && (
                <View style={[htStyles.dataRow, htStyles.totalRow, { borderBottomColor: colors.borderColor, backgroundColor: colors.accentPrimary + "18", borderTopColor: colors.accentPrimary }]}>
                  {TABLE_COLUMNS.map((col) => (
                    <TotalCell key={col.key} col={col} totals={totals} colors={colors} />
                  ))}
                </View>
              )}

              {/* Empty state */}
              {sortedHoldings.length === 0 && (
                <View style={htStyles.emptyRow}>
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>No active holdings found.</Text>
                </View>
              )}
            </View>
          </ScrollView>
        </View>

        {/* ── 4. Allocation Donut ──────────────────────────────── */}
        {allocationData.length > 0 && (
          <View style={{ paddingHorizontal: spacing.pagePx, marginBottom: 16 }}>
            <AllocationDonut data={allocationData} title="Portfolio Allocation" colors={colors} size={280} showLegend />
          </View>
        )}

        {/* ── 5. Risk Metrics ──────────────────────────────────── */}
        {riskData && (
          <View style={{ paddingHorizontal: spacing.pagePx }}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
              <FontAwesome name="shield" size={16} color={colors.accentPrimary} /> Risk Metrics
            </Text>
            <View style={s.kpiGrid}>
              <KpiCard label="Sharpe Ratio" value={riskData.sharpe_ratio.toFixed(3)} colors={colors} />
              <KpiCard label="Sortino Ratio" value={riskData.sortino_ratio.toFixed(3)} colors={colors} />
            </View>
          </View>
        )}

        {/* ── 6. Realized Profit ───────────────────────────────── */}
        {realizedData && (
          <View style={{ paddingHorizontal: spacing.pagePx }}>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
              <FontAwesome name="check-circle" size={16} color={colors.accentPrimary} /> Realized Profit
            </Text>
            <View style={s.kpiGrid}>
              <KpiCard label="Total Realized" value={formatCurrency(realizedData.total_realized_kwd, "KWD")} color={realizedData.total_realized_kwd >= 0 ? colors.success : colors.danger} colors={colors} />
              <KpiCard label="Profit" value={formatCurrency(realizedData.total_profit_kwd, "KWD")} color={colors.success} colors={colors} />
              <KpiCard label="Loss" value={formatCurrency(realizedData.total_loss_kwd, "KWD")} color={colors.danger} colors={colors} />
            </View>

            {realizedData.details.length > 0 && (
              <View style={[s.detailTable, { borderColor: colors.borderColor, marginTop: 8 }]}>
                <View style={[s.detailRow, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderColor }]}>
                  <Text style={[s.detailCell, { color: colors.textSecondary, fontWeight: "700", flex: 2 }]}>Symbol</Text>
                  <Text style={[s.detailCell, { color: colors.textSecondary, fontWeight: "700" }]}>Date</Text>
                  <Text style={[s.detailCell, { color: colors.textSecondary, fontWeight: "700" }]}>P&L (KWD)</Text>
                </View>
                {realizedData.details.slice(0, 30).map((d) => (
                  <View key={d.id} style={[s.detailRow, { borderBottomColor: colors.borderColor }]}>
                    <Text style={[s.detailCell, { color: colors.textPrimary, flex: 2 }]}>{d.symbol}</Text>
                    <Text style={[s.detailCell, { color: colors.textSecondary }]}>{d.txn_date}</Text>
                    <Text style={[s.detailCell, { color: d.realized_pnl_kwd >= 0 ? colors.success : colors.danger }]}>{formatCurrency(d.realized_pnl_kwd, "KWD")}</Text>
                  </View>
                ))}
              </View>
            )}
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

// =====================================================================
//  STYLES
// =====================================================================

const s = StyleSheet.create({
  container: { flex: 1 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginTop: 16, marginBottom: 10 },
  filterRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 },
  filterChip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: 20, borderWidth: 1 },
  periodChip: { paddingHorizontal: 12, paddingVertical: 5, borderRadius: 14, borderWidth: 1 },
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpiCard: { minWidth: 140, flex: 1, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  kpiLabel: { fontSize: 12, marginBottom: 4 },
  kpiValue: { fontSize: 18, fontWeight: "700" },
  kpiSuffix: { fontSize: 12, fontWeight: "400" },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, paddingVertical: 10, gap: 12, borderBottomWidth: 1 },
  kpiChip: { minWidth: 100 },
  kpiChipLabel: { fontSize: 11, marginBottom: 2 },
  kpiChipValue: { fontSize: 13, fontWeight: "700" },
  detailTable: { borderWidth: 1, borderRadius: 8, overflow: "hidden" as const },
  detailRow: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  detailCell: { flex: 1, fontSize: 13 },
});

// ── Holdings table styles ───────────────────────────────────────────

const htStyles = StyleSheet.create({
  tableOuter: { borderRadius: 10, borderWidth: 1, marginBottom: 12 },
  headerRow: { flexDirection: "row", borderBottomWidth: 2 },
  headerCell: { paddingHorizontal: 6, paddingVertical: 10, justifyContent: "center" },
  headerText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  dataRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  totalRow: { borderTopWidth: 2 },
  dataCell: { paddingHorizontal: 6, paddingVertical: 8, justifyContent: "center" },
  cellText: { fontSize: 12 },
  emptyRow: { padding: 32, alignItems: "center" as const },
});

// ── Cash management styles ──────────────────────────────────────────

const cs = StyleSheet.create({
  section: { borderRadius: 10, borderWidth: 1, padding: 0, marginBottom: 24, overflow: "hidden" as const },
  cashHeader: { padding: 16, paddingBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  cashCaption: { fontSize: 11, lineHeight: 16 },
  tableHeaderRow: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 2 },
  tableHeaderCell: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  cellPortfolio: { flex: 1.2, minWidth: 65 },
  cellCcy: { flex: 1.2, minWidth: 65 },
  cellCapital: { flex: 1.5, minWidth: 85, textAlign: "right" as const },
  cellCash: { flex: 1.5, minWidth: 85, textAlign: "right" as const },
  cellActions: { width: 80, textAlign: "center" as const },
  tableDataRow: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: "center" },
  cellInner: { justifyContent: "center" as const },
  cellText: { fontSize: 12 },
  overrideBadge: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, marginTop: 2 },
  editRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, justifyContent: "flex-end" as const },
  editInput: { width: 80, height: 30, borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, fontSize: 12 },
  editBtn: { width: 26, height: 26, borderRadius: 4, justifyContent: "center" as const, alignItems: "center" as const },
  totalCashRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 2 },
  totalCashLabel: { fontSize: 13, fontWeight: "600" },
  totalCashValue: { fontSize: 16, fontWeight: "800" },
});

// ── Donut section styles ────────────────────────────────────────────

const donutStyles = StyleSheet.create({
  section: { borderRadius: 10, borderWidth: 1, padding: 16, marginBottom: 16 },
  sectionLabel: { fontSize: 14, fontWeight: "700", marginBottom: 12 },
});
