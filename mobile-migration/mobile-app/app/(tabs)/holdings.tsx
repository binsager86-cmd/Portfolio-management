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

import React, { useState, useMemo, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TouchableOpacity,
  RefreshControl,
  Platform,
  TextInput as RNTextInput,
  Alert,
} from "react-native";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  getHoldings,
  Holding,
  HoldingsResponse,
  getCashBalances,
  setCashOverride,
  clearCashOverride,
  PortfolioCashBalance,
  getDeposits,
  exportHoldingsExcel,
} from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { AllocationDonut, AllocationSlice } from "@/components/charts/AllocationDonut";
import type { ThemePalette } from "@/constants/theme";

// ── Formatting helpers ──────────────────────────────────────────────

function fmtNum(n: number, decimals = 2): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

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
  { key: "company",                         label: "Company",              fmt: "text_bold",       width: 150, align: "left" },
  { key: "shares_qty",                      label: "Quantity",             fmt: "quantity",        width: 80,  align: "right", summable: true },
  { key: "avg_cost",                        label: "Avg Cost/Share",       fmt: "price",           width: 95,  align: "right" },
  { key: "total_cost",                      label: "Total Cost",           fmt: "money",           width: 105, align: "right", summable: true },
  { key: "market_price",                    label: "Mkt Price",            fmt: "price",           width: 85,  align: "right" },
  { key: "market_value",                    label: "Mkt Value",            fmt: "money",           width: 105, align: "right", summable: true },
  { key: "unrealized_pnl",                  label: "Appreciation",         fmt: "money_colored",   width: 105, align: "right", summable: true },
  { key: "cash_dividends",                  label: "Cash Div",             fmt: "money",           width: 90,  align: "right", summable: true },
  { key: "reinvested_dividends",            label: "Reinvested",           fmt: "money",           width: 90,  align: "right", summable: true },
  { key: "bonus_dividend_shares",           label: "Bonus Shares",         fmt: "quantity",        width: 90,  align: "right", summable: true },
  { key: "bonus_share_value",               label: "Bonus Value",          fmt: "money",           width: 95,  align: "right", summable: true },
  { key: "weight_by_cost",                  label: "Weight %",             fmt: "percent",         width: 80,  align: "right" },
  { key: "dividend_yield_on_cost_pct",      label: "Yield %",              fmt: "percent",         width: 75,  align: "right" },
  { key: "yield_amount",                    label: "Yield Amt",            fmt: "money",           width: 90,  align: "right", summable: true },
  { key: "weighted_dividend_yield_on_cost", label: "Wt. Yield %",          fmt: "percent",         width: 85,  align: "right" },
  { key: "current_pnl",                     label: "Current P/L",          fmt: "money_colored",   width: 105, align: "right", summable: true },
  { key: "current_pnl_pct",                 label: "P/L %",                fmt: "percent_colored", width: 78,  align: "right" },
  { key: "pe_ratio",                        label: "P/E Ratio",            fmt: "money",           width: 80,  align: "right" },
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
      // pnl_pct comes as decimal (0.05 = 5%), convert to display %
      const pct = Math.abs(n) < 1 ? n * 100 : n;
      if (pct > 0) return { text: `+${pct.toFixed(2)}%`, color: pos, bold: true };
      return { text: `${pct.toFixed(2)}%`, color: neg, bold: true };
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
  // Weight sums to 100%
  totals.weight_by_cost = 100;
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
  const isActive = sortCol === col.key;
  const arrow = isActive ? (sortDir === "asc" ? " ↑" : " ↓") : " ⇅";
  return (
    <Pressable
      onPress={() => onSort(col.key)}
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
        {col.label}
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
  // First column shows "TOTAL" label
  if (col.key === "company") {
    return (
      <View style={[ts.dataCell, { width: col.width }]}>
        <Text
          style={[ts.cellText, { color: colors.accentPrimary, fontWeight: "800" }]}
        >
          TOTAL
        </Text>
      </View>
    );
  }

  // Non-summable columns are blank
  if (!col.summable && col.key !== "pnl_pct" && col.key !== "weight_by_cost") {
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
}: {
  holding: Holding;
  colors: ThemePalette;
  isEven: boolean;
}) {
  const rowBg = isEven ? "transparent" : colors.bgCardHover + "30";
  return (
    <View
      style={[
        ts.dataRow,
        { backgroundColor: rowBg, borderBottomColor: colors.borderColor },
      ]}
    >
      {TABLE_COLUMNS.map((col) => (
        <DataCell key={col.key} col={col} holding={holding} colors={colors} />
      ))}
    </View>
  );
}

// ── Main screen ─────────────────────────────────────────────────────

export default function HoldingsScreen() {
  const { colors } = useThemeStore();
  const { spacing } = useResponsive();
  const queryClient = useQueryClient();

  const [filter, setFilter] = useState<string | undefined>(undefined);
  const [sortCol, setSortCol] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  const {
    data: resp,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useQuery<HoldingsResponse>({
    queryKey: ["holdings", filter],
    queryFn: () => getHoldings(filter),
  });

  // Cash balances query
  const {
    data: cashData,
    refetch: refetchCash,
  } = useQuery<Record<string, PortfolioCashBalance>>({
    queryKey: ["cash-balances"],
    queryFn: () => getCashBalances(),
  });

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
      .filter((h) => (h.weight_by_cost ?? 0) > 0)
      .map((h) => ({
        company: h.company,
        weight: h.weight_by_cost ?? 0,
        pnl_pct: h.pnl_pct ?? 0,
      }));
  }, [resp?.holdings]);

  // Deposit totals per portfolio for Cash Management
  const { data: kfhDeposits } = useQuery({
    queryKey: ["deposits-total", "KFH"],
    queryFn: () => getDeposits({ portfolio: "KFH", page_size: 9999 }),
  });
  const { data: bbynDeposits } = useQuery({
    queryKey: ["deposits-total", "BBYN"],
    queryFn: () => getDeposits({ portfolio: "BBYN", page_size: 9999 }),
  });
  const { data: usaDeposits } = useQuery({
    queryKey: ["deposits-total", "USA"],
    queryFn: () => getDeposits({ portfolio: "USA", page_size: 9999 }),
  });

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

  if (isLoading) return <LoadingScreen message="Loading holdings…" />;
  if (isError)
    return (
      <ErrorScreen
        message={(error as any)?.message ?? "Failed to load holdings"}
        onRetry={() => refetch()}
      />
    );

  return (
    <View style={[s.container, { backgroundColor: colors.bgPrimary }]}>
      {/* ── Portfolio filter tabs + Export ─────────────────────────── */}
      <View style={s.filterRow}>
        {portfolios.map((p, i) => {
          const active = filter === p;
          return (
            <Pressable
              key={filterLabels[i]}
              onPress={() => setFilter(p)}
              style={[
                s.filterBtn,
                {
                  backgroundColor: active
                    ? colors.accentPrimary
                    : colors.bgCard,
                  borderColor: active
                    ? colors.accentPrimary
                    : colors.borderColor,
                },
              ]}
            >
              <Text
                style={[
                  s.filterText,
                  {
                    color: active ? "#fff" : colors.textSecondary,
                    fontWeight: active ? "700" : "500",
                  },
                ]}
              >
                {filterLabels[i]}
              </Text>
            </Pressable>
          );
        })}

      </View>

      {/* ── Summary KPI Cards ────────────────────────────────────── */}
      {resp && (
        <View style={[s.kpiCardRow, { borderBottomColor: colors.borderColor }]}>
          <View style={[s.kpiCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[s.kpiCardLabel, { color: colors.textMuted }]}>Holdings</Text>
            <Text style={[s.kpiCardValue, { color: colors.accentPrimary }]}>{String(resp.count)}</Text>
          </View>
          <View style={[s.kpiCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[s.kpiCardLabel, { color: colors.textMuted }]}>Market Value</Text>
            <Text style={[s.kpiCardValue, { color: colors.textPrimary }]}>{fmtNum(resp.totals.total_market_value_kwd)} KWD</Text>
          </View>
          <View style={[s.kpiCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[s.kpiCardLabel, { color: colors.textMuted }]}>Total Cost</Text>
            <Text style={[s.kpiCardValue, { color: colors.textPrimary }]}>{fmtNum(resp.totals.total_cost_kwd)} KWD</Text>
          </View>
          <View style={[s.kpiCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[s.kpiCardLabel, { color: colors.textMuted }]}>Unrealized P/L</Text>
            <Text style={[s.kpiCardValue, {
              color: resp.totals.total_unrealized_pnl_kwd > 0
                ? colors.success
                : resp.totals.total_unrealized_pnl_kwd < 0
                  ? colors.danger
                  : colors.textMuted,
            }]}>
              {resp.totals.total_unrealized_pnl_kwd >= 0 ? "+" : ""}{fmtNum(resp.totals.total_unrealized_pnl_kwd)} KWD
            </Text>
          </View>
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
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            marginHorizontal: spacing.pagePx,
            marginTop: 16,
            marginBottom: 6,
          }}
        >
          <Text
            style={{
              fontSize: 18,
              fontWeight: "700",
              color: colors.textPrimary,
            }}
          >
            <FontAwesome name="briefcase" size={16} color={colors.accentPrimary} />
            {"  "}Holdings
          </Text>
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={async () => {
              if (Platform.OS !== "web") {
                Alert.alert("Export", "Excel export is available on the web version.");
                return;
              }
              try {
                const blob = await exportHoldingsExcel(filter ?? undefined);
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
            style={{
              flexDirection: "row",
              alignItems: "center",
              backgroundColor: "#1a3a2a",
              borderColor: "#10b981",
              borderWidth: 1.5,
              paddingHorizontal: 16,
              paddingVertical: 8,
              borderRadius: 8,
              minHeight: 36,
            }}
          >
            <FontAwesome name="download" size={14} color="#10b981" style={{ marginRight: 8 }} />
            <Text style={{ color: "#10b981", fontSize: 13, fontWeight: "700" }}>
              Export Excel
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
                  <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                    No active holdings found.
                  </Text>
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
              Weight by Cost
            </Text>
            <AllocationDonut
              data={allocationData}
              title="Portfolio Allocation by Weight"
              colors={colors}
              size={280}
              showLegend={true}
            />
          </View>
        )}

      </ScrollView>
    </View>
  );
}

// ── Cash Management Section (matches Streamlit Cash Management) ─────

const PORTFOLIO_CCY: Record<string, string> = {
  KFH: "KWD",
  BBYN: "KWD",
  USA: "USD",
};

const DEFAULT_USD_KWD_RATE = 0.307;

function CashBalancesSection({
  cashData,
  depositTotals,
  colors,
  spacing,
  queryClient,
}: {
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
    onSuccess: async () => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["cash-balances"] }),
        queryClient.refetchQueries({ queryKey: ["portfolio-overview"] }),
      ]);
      setEditingPf(null);
      setEditValue("");
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.message ?? "Failed to save";
      if (Platform.OS === "web") window.alert(`Error: ${msg}`);
      else Alert.alert("Error", msg);
    },
  });

  const clearMutation = useMutation({
    mutationFn: (portfolio: string) => clearCashOverride(portfolio),
    onSuccess: async () => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["cash-balances"] }),
        queryClient.refetchQueries({ queryKey: ["portfolio-overview"] }),
      ]);
    },
  });

  const handleSaveOverride = (portfolio: string) => {
    const num = parseFloat(editValue);
    if (isNaN(num) || num < 0) {
      if (Platform.OS === "web") window.alert("Enter a valid positive number");
      else Alert.alert("Invalid", "Enter a valid positive number");
      return;
    }
    const ccy = PORTFOLIO_CCY[portfolio] ?? "KWD";
    overrideMutation.mutate({ portfolio, balance: num, currency: ccy });
  };

  const cashPortfolios = ["KFH", "BBYN", "USA"];

  // Calculate Total Free Cash in KWD
  const totalFreeCashKwd = useMemo(() => {
    let total = 0;
    for (const pf of cashPortfolios) {
      const item = cashData[pf];
      if (!item) continue;
      if (item.currency === "USD") {
        total += item.balance * DEFAULT_USD_KWD_RATE;
      } else {
        total += item.balance;
      }
    }
    return total;
  }, [cashData]);

  return (
    <View
      style={[
        cs.section,
        {
          marginHorizontal: spacing.pagePx,
          backgroundColor: colors.bgCard,
          borderColor: colors.borderColor,
        },
      ]}
    >
      {/* Section Header */}
      <View style={cs.cashHeader}>
        <Text style={[cs.sectionTitle, { color: colors.textPrimary }]}>
          <FontAwesome name="money" size={16} color={colors.accentPrimary} />{" "}
          💵 Cash Management
        </Text>
        <Text style={[cs.cashCaption, { color: colors.textMuted }]}>
          Edit cash balances manually. Tap the pencil to override.
        </Text>
      </View>

      {/* Cash table wrapped in horizontal scroll for narrow screens */}
      <ScrollView horizontal showsHorizontalScrollIndicator={true} contentContainerStyle={{ minWidth: 485 }}>
        <View style={{ minWidth: 485 }}>
          {/* Table Header Row */}
          <View style={[cs.tableHeaderRow, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderColor }]}>
            <Text style={[cs.tableHeaderCell, cs.cellPortfolio, { color: colors.textSecondary }]}>
              Portfolio
            </Text>
            <Text style={[cs.tableHeaderCell, cs.cellCcy, { color: colors.textSecondary }]}>
              CCY
            </Text>
            <Text style={[cs.tableHeaderCell, cs.cellCapital, { color: colors.textSecondary, textAlign: "right" }]}>
              Total Capital
            </Text>
            <Text style={[cs.tableHeaderCell, cs.cellCash, { color: colors.textSecondary, textAlign: "right" }]}>
              Available Cash
            </Text>
            <Text style={[cs.tableHeaderCell, cs.cellActions, { color: colors.textSecondary, textAlign: "center" }]}>
              {" "}
            </Text>
          </View>

      {/* Portfolio cash rows */}
      {cashPortfolios.map((pf) => {
        const item = cashData[pf];
        const balance = item?.balance ?? 0;
        const ccy = PORTFOLIO_CCY[pf] ?? "KWD";
        const ccyDisplay = ccy === "USD" ? `USD (${DEFAULT_USD_KWD_RATE.toFixed(3)})` : ccy;
        const totalDeposited = depositTotals[pf] ?? 0;
        const isEditing = editingPf === pf;
        const isManual = item?.manual_override ?? false;

        return (
          <View
            key={pf}
            style={[cs.tableDataRow, { borderBottomColor: colors.borderColor }]}
          >
            {/* Portfolio name + manual badge */}
            <View style={[cs.cellPortfolio, cs.cellInner]}>
              <Text style={[cs.cellText, { color: colors.textPrimary, fontWeight: "600" }]}>
                {pf}
              </Text>
              {isManual && (
                <View style={[cs.overrideBadge, { backgroundColor: colors.warning + "22" }]}>
                  <Text style={{ color: colors.warning, fontSize: 9, fontWeight: "700" }}>MANUAL</Text>
                </View>
              )}
            </View>

            {/* Currency */}
            <View style={[cs.cellCcy, cs.cellInner]}>
              <Text style={[cs.cellText, { color: colors.textSecondary, fontSize: 11 }]}>
                {ccyDisplay}
              </Text>
            </View>

            {/* Total Capital (Deposited) — read only */}
            <View style={[cs.cellCapital, cs.cellInner]}>
              <Text style={[cs.cellText, { color: colors.textMuted, textAlign: "right" }]}>
                {fmtNum(totalDeposited, ccy === "KWD" ? 0 : 2)}
              </Text>
            </View>

            {/* Available Cash — editable */}
            {isEditing ? (
              <View style={[cs.cellCash, cs.editRow]}>
                <RNTextInput
                  style={[
                    cs.editInput,
                    {
                      color: colors.textPrimary,
                      backgroundColor: colors.bgInput,
                      borderColor: colors.borderColor,
                    },
                  ]}
                  value={editValue}
                  onChangeText={setEditValue}
                  keyboardType="decimal-pad"
                  placeholder="Amount"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                />
                <Pressable
                  onPress={() => handleSaveOverride(pf)}
                  style={[cs.editBtn, { backgroundColor: colors.success + "22" }]}
                >
                  <FontAwesome name="check" size={12} color={colors.success} />
                </Pressable>
                <Pressable
                  onPress={() => { setEditingPf(null); setEditValue(""); }}
                  style={[cs.editBtn, { backgroundColor: colors.danger + "22" }]}
                >
                  <FontAwesome name="times" size={12} color={colors.danger} />
                </Pressable>
              </View>
            ) : (
              <View style={[cs.cellCash, cs.cellInner]}>
                <Text style={[cs.cellText, { color: colors.textPrimary, fontWeight: "600", textAlign: "right" }]}>
                  {fmtNum(balance, ccy === "KWD" ? 3 : 2)}
                </Text>
              </View>
            )}

            {/* Actions */}
            {!isEditing && (
              <View style={[cs.cellActions, cs.cellInner, { flexDirection: "row", gap: 8, justifyContent: "center", alignItems: "center" }]}>
                <Pressable
                  onPress={() => { setEditingPf(pf); setEditValue(balance.toString()); }}
                  style={({ pressed }) => [{
                    width: 32,
                    height: 32,
                    borderRadius: 6,
                    backgroundColor: colors.accentPrimary + "20",
                    borderWidth: 1,
                    borderColor: colors.accentPrimary + "44",
                    justifyContent: "center" as const,
                    alignItems: "center" as const,
                    opacity: pressed ? 0.6 : 1,
                  }]}
                >
                  <FontAwesome name="pencil" size={15} color={colors.accentPrimary} />
                </Pressable>

                {isManual && (
                  <Pressable
                    onPress={() => {
                      const msg = `Clear manual override for ${pf}? Balance will be recalculated automatically.`;
                      if (Platform.OS === "web") {
                        if (window.confirm(msg)) clearMutation.mutate(pf);
                      } else {
                        Alert.alert("Clear Override", msg, [
                          { text: "Cancel", style: "cancel" },
                          { text: "Clear", onPress: () => clearMutation.mutate(pf) },
                        ]);
                      }
                    }}
                    style={({ pressed }) => [{
                      width: 32,
                      height: 32,
                      borderRadius: 6,
                      backgroundColor: colors.warning + "20",
                      borderWidth: 1,
                      borderColor: colors.warning + "44",
                      justifyContent: "center" as const,
                      alignItems: "center" as const,
                      opacity: pressed ? 0.6 : 1,
                    }]}
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
        </View>
      </ScrollView>

      {/* Total Free Cash KPI */}
      <View style={[cs.totalCashRow, { borderTopColor: colors.accentPrimary }]}>
        <Text style={[cs.totalCashLabel, { color: colors.textSecondary }]}>
          Total Free Cash
        </Text>
        <Text style={[cs.totalCashValue, { color: colors.accentPrimary }]}>
          {fmtNum(totalFreeCashKwd, 3)} KWD
        </Text>
      </View>
    </View>
  );
}

// ── KPI chip helper ─────────────────────────────────────────────────

function KpiChip({
  label,
  value,
  valueColor,
  colors,
}: {
  label: string;
  value: string;
  valueColor?: string;
  colors: ThemePalette;
}) {
  return (
    <View style={s.kpiChip}>
      <Text style={[s.kpiLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text
        style={[s.kpiValue, { color: valueColor ?? colors.textPrimary }]}
        numberOfLines={1}
      >
        {value}
      </Text>
    </View>
  );
}

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
  filterBtn: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },
  filterText: { fontSize: 14 },
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
  kpiCard: {
    flex: 1,
    minWidth: 130,
    borderRadius: 10,
    borderWidth: 1,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  kpiCardLabel: {
    fontSize: 11,
    fontWeight: "500",
    textTransform: "uppercase" as const,
    letterSpacing: 0.4,
    marginBottom: 4,
  },
  kpiCardValue: {
    fontSize: 15,
    fontWeight: "700",
  },
});

// ── Cash section styles (Streamlit-matching table layout) ───────────

const cs = StyleSheet.create({
  section: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 0,
    marginBottom: 24,
    overflow: "hidden",
  },
  cashHeader: {
    padding: 16,
    paddingBottom: 8,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 4,
  },
  cashCaption: {
    fontSize: 11,
    lineHeight: 16,
  },
  // Table header row
  tableHeaderRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 2,
  },
  tableHeaderCell: {
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  cellPortfolio: { width: 90 },
  cellCcy: { width: 85 },
  cellCapital: { width: 110 },
  cellCash: { width: 120 },
  cellActions: { width: 80 },
  // Data rows
  tableDataRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    alignItems: "center",
  },
  cellInner: {
    justifyContent: "center" as const,
  },
  cellText: {
    fontSize: 12,
  },
  overrideBadge: {
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 3,
    marginTop: 2,
  },
  iconBtn: {
    padding: 6,
  },
  editRow: {
    flexDirection: "row" as const,
    alignItems: "center" as const,
    gap: 4,
    justifyContent: "flex-end" as const,
  },
  editInput: {
    width: 80,
    height: 30,
    borderWidth: 1,
    borderRadius: 4,
    paddingHorizontal: 6,
    fontSize: 12,
  },
  editBtn: {
    width: 26,
    height: 26,
    borderRadius: 4,
    justifyContent: "center" as const,
    alignItems: "center" as const,
  },
  // Total Free Cash row
  totalCashRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 2,
  },
  totalCashLabel: {
    fontSize: 13,
    fontWeight: "600",
  },
  totalCashValue: {
    fontSize: 16,
    fontWeight: "800",
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
