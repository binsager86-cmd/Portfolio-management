/**
 * useHoldingsView — Types, constants, helpers, and state logic
 * for the Holdings screen.
 */

import { useCallback, useMemo, useState } from "react";

import {
    useDepositTotals,
    useHoldings,
} from "@/hooks/queries";
import { fmtNum } from "@/lib/currency";
import type { ThemePalette } from "@/constants/theme";
import type { Holding } from "@/services/api";
import type { AllocationSlice } from "@/components/charts/AllocationDonut";

// ── Column types & definitions ──────────────────────────────────────

export type ColAlign = "left" | "right";
export type HoldingFmt =
  | "text_bold"
  | "quantity"
  | "price"
  | "money"
  | "money_colored"
  | "percent"
  | "percent_colored";

export interface ColDef {
  key: string;
  label: string;
  fmt: HoldingFmt;
  width: number;
  align: ColAlign;
  summable?: boolean;
}

export const TABLE_COLUMNS: ColDef[] = [
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

export const TOTAL_TABLE_WIDTH = TABLE_COLUMNS.reduce((s, c) => s + c.width, 0);

// ── Cell formatter ──────────────────────────────────────────────────

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

// ── Get cell value from holding ─────────────────────────────────────

const MONEY_TOTAL_KEYS = new Set([
  "total_cost", "market_value", "unrealized_pnl",
  "cash_dividends", "reinvested_dividends", "bonus_share_value",
  "yield_amount", "current_pnl",
]);

export function getCellValue(holding: Holding, key: string): any {
  const isUsd = (holding.currency ?? "KWD").toUpperCase() === "USD";

  if (key === "yield_amount") {
    const raw = holding.cash_dividends ?? 0;
    if (isUsd && holding.total_cost_kwd && holding.total_cost) {
      const rate = holding.total_cost_kwd / holding.total_cost;
      return raw * rate;
    }
    return raw;
  }
  if (key === "current_pnl") {
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
    const currentPnl = (holding.market_value ?? 0) - (holding.total_cost ?? 0) + (holding.bonus_share_value ?? 0);
    const cost = holding.total_cost ?? 0;
    return cost > 0 ? (currentPnl / cost) * 100 : 0;
  }

  if (isUsd && MONEY_TOTAL_KEYS.has(key)) {
    if (key === "total_cost") return holding.total_cost_kwd ?? 0;
    if (key === "market_value") return holding.market_value_kwd ?? 0;
    if (key === "unrealized_pnl") return holding.unrealized_pnl_kwd ?? 0;
    if (holding.total_cost && holding.total_cost_kwd) {
      const rate = holding.total_cost_kwd / holding.total_cost;
      return ((holding as any)[key] ?? 0) * rate;
    }
  }

  return (holding as any)[key];
}

export function getUsdOriginal(holding: Holding, key: string): number | null {
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

export type SortDir = "asc" | "desc";

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

export function computeTotals(holdings: Holding[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const col of TABLE_COLUMNS) {
    if (!col.summable) continue;
    totals[col.key] = holdings.reduce((sum, h) => sum + (Number(getCellValue(h, col.key)) || 0), 0);
  }
  if (totals.total_cost && totals.total_cost > 0) {
    totals.current_pnl_pct = (totals.current_pnl / totals.total_cost) * 100;
  }
  totals.allocation_pct = 100;
  return totals;
}

// ── Hook ────────────────────────────────────────────────────────────

export function useHoldingsView() {
  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const { data: resp, isLoading, isError, error, refetch, isRefetching } = useHoldings(filter);

  const onSort = useCallback((key: string) => {
    if (sortCol === key) {
      if (sortDir === "asc") setSortDir("desc");
      else { setSortCol(null); setSortDir("asc"); }
    } else {
      setSortCol(key); setSortDir("asc");
    }
  }, [sortCol, sortDir]);

  const sortedHoldings = useMemo(
    () => sortHoldings(resp?.holdings ?? [], sortCol, sortDir),
    [resp?.holdings, sortCol, sortDir],
  );

  const totals = useMemo(() => computeTotals(resp?.holdings ?? []), [resp?.holdings]);

  const allocationData: AllocationSlice[] = useMemo(() => {
    return (resp?.holdings ?? [])
      .filter((h) => (h.allocation_pct ?? 0) > 0)
      .map((h) => ({ company: h.company, weight: h.allocation_pct ?? 0, pnl_pct: h.pnl_pct ?? 0 }));
  }, [resp?.holdings]);

  const { kfh: { data: kfhDeposits }, bbyn: { data: bbynDeposits }, usa: { data: usaDeposits } } = useDepositTotals();

  const depositTotals = useMemo(() => {
    const t: Record<string, number> = {};
    const calc = (deposits: typeof kfhDeposits, pf: string) => {
      if (!deposits?.deposits) return;
      t[pf] = deposits.deposits.filter((d) => d.amount > 0 && !d.is_deleted).reduce((sum, d) => sum + d.amount, 0);
    };
    calc(kfhDeposits, "KFH");
    calc(bbynDeposits, "BBYN");
    calc(usaDeposits, "USA");
    return t;
  }, [kfhDeposits, bbynDeposits, usaDeposits]);

  return {
    filter, setFilter,
    sortCol, sortDir, onSort,
    resp, isLoading, isError, error, refetch, isRefetching,
    sortedHoldings, totals, allocationData, depositTotals,
  };
}
