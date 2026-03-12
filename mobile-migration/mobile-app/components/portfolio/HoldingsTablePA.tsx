/**
 * Holdings Table — column definitions, cell formatting, sorting,
 * and sub-components for the portfolio-analysis holdings table.
 */

import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import type { ThemePalette } from "@/constants/theme";
import type { Holding } from "@/services/api";
import { fmtNum } from "@/lib/currency";

// ── Column types ────────────────────────────────────────────────────

type ColAlign = "left" | "right";
type HoldingFmt =
  | "text_bold"
  | "quantity"
  | "price"
  | "money"
  | "money_colored"
  | "percent"
  | "percent_colored";

/** Column descriptor for the holdings table (key, format, width, alignment). */
export interface ColDef {
  key: string;
  label: string;
  fmt: HoldingFmt;
  width: number;
  align: ColAlign;
  summable?: boolean;
}

export type SortDir = "asc" | "desc";

// ── Column definitions ──────────────────────────────────────────────

/** Ordered column layout for the portfolio-analysis holdings table. */
export const TABLE_COLUMNS: ColDef[] = [
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

export const TOTAL_TABLE_WIDTH = TABLE_COLUMNS.reduce((sum, c) => sum + c.width, 0);

// ── Cell formatter ──────────────────────────────────────────────────

/** Format a raw holding field value into display text, colour, and weight. */
export function fmtCell(
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

// ── Cell value helpers ──────────────────────────────────────────────

const DEFAULT_USD_KWD_RATE = 0.307;

const KWD_MONEY_KEYS = new Set([
  "avg_cost", "total_cost", "market_price", "market_value",
  "unrealized_pnl", "realized_pnl", "current_pnl",
]);

/**
 * Module-level caches set before rendering so getCellValue can compute
 * CFA-compliant allocation: w_i = MV_i(KWD) / Σ MV(KWD)
 */
let _totalPortfolioValueKwd = 0;

/** Inject portfolio-wide context needed by getCellValue for allocation calcs. */
export function setHoldingsContext(_allHoldings: Holding[], totalValueKwd: number) {
  _totalPortfolioValueKwd = totalValueKwd;
}

/**
 * Derive the display value for a holding’s column key.
 *
 * Handles USD → KWD conversion, allocation %, weighted yield,
 * and combined P&L for cross-currency holdings.
 */
export function getCellValue(holding: Holding, key: string): any {
  const isUSD = (holding.currency ?? "KWD").toUpperCase() === "USD";

  if (key === "yield_amount") return holding.cash_dividends ?? 0;

  if (key === "current_pnl") {
    if (isUSD) return holding.total_pnl_kwd ?? 0;
    return holding.total_pnl ?? 0;
  }
  if (key === "current_pnl_pct") {
    const cost = isUSD ? (holding.total_cost_kwd ?? 0) : (holding.total_cost ?? 0);
    const pnl = isUSD ? (holding.total_pnl_kwd ?? 0) : (holding.total_pnl ?? 0);
    return cost > 0 ? (pnl / cost) * 100 : 0;
  }

  if (key === "allocation_pct") {
    if (_totalPortfolioValueKwd <= 0) return 0;
    return ((holding.market_value_kwd ?? 0) / _totalPortfolioValueKwd) * 100;
  }
  if (key === "weighted_dividend_yield") {
    if (_totalPortfolioValueKwd <= 0) return 0;
    const w = (holding.market_value_kwd ?? 0) / _totalPortfolioValueKwd;
    return w * (holding.dividend_yield_on_cost_pct ?? 0);
  }

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
      return (holding.total_pnl_kwd ?? 0) - (holding.unrealized_pnl_kwd ?? 0)
        - (holding.cash_dividends ?? 0) * DEFAULT_USD_KWD_RATE;
    }
  }

  return (holding as any)[key];
}

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

// ── Sort & totals ───────────────────────────────────────────────────

/** Sort holdings array by the given column key using getCellValue. */
export function sortHoldings(holdings: Holding[], sortCol: string | null, sortDir: SortDir): Holding[] {
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

/** Aggregate summable columns into a totals row, including weighted yield. */
export function computeTotals(holdings: Holding[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const col of TABLE_COLUMNS) {
    if (!col.summable) continue;
    totals[col.key] = holdings.reduce((sum, h) => sum + (Number(getCellValue(h, col.key)) || 0), 0);
  }
  if (totals.total_cost && totals.total_cost > 0) {
    totals.current_pnl_pct = (totals.current_pnl / totals.total_cost) * 100;
  }
  totals.weighted_dividend_yield = holdings.reduce((sum, h) => {
    if (_totalPortfolioValueKwd <= 0) return sum;
    const w = (h.market_value_kwd ?? 0) / _totalPortfolioValueKwd;
    return sum + w * (h.dividend_yield_on_cost_pct ?? 0);
  }, 0);
  return totals;
}

// ── Table sub-components ────────────────────────────────────────────

/** Pressable column header with sort-direction indicator arrow. */
export const HeaderCell = React.memo(function HeaderCell({ col, colors, sortCol, sortDir, onSort }: {
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
});

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

/** Footer total cell — renders aggregate value for summable columns. */
export const TotalCell = React.memo(function TotalCell({ col, totals, colors }: { col: ColDef; totals: Record<string, number>; colors: ThemePalette }) {
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
});

/** Single holding data row with zebra-striped background and USD bracket text. */
export const HoldingRow = React.memo(function HoldingRow({ holding, colors, isEven }: { holding: Holding; colors: ThemePalette; isEven: boolean }) {
  const rowBg = isEven ? "transparent" : colors.bgCardHover + "30";
  return (
    <View style={[htStyles.dataRow, { backgroundColor: rowBg, borderBottomColor: colors.borderColor }]}>
      {TABLE_COLUMNS.map((col) => (
        <DataCell key={col.key} col={col} holding={holding} colors={colors} />
      ))}
    </View>
  );
});

// ── Styles ──────────────────────────────────────────────────────────

export const htStyles = StyleSheet.create({
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
