/**
 * Trading Section — CFA/IFRS-compliant trading overview.
 *
 * Mirrors the Streamlit ``ui_trading_section()`` screen:
 *   - 12 summary metric cards (buys, sells, deposits, withdrawals,
 *     unrealized/realized/total P&L, dividends, fees, net cash flow, return %)
 *   - Portfolio / type / search filters
 *   - Full 19-column data table matching Streamlit render_trading_table()
 *   - Pull-to-refresh, pagination, click-to-sort columns
 *
 * All heavy WAC computation happens server-side via
 * GET /api/v1/portfolio/trading-summary
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useQuery, useQueryClient, useMutation } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  getTradingSummary,
  recalculateWAC,
  exportTradingExcel,
  TradingSummaryResponse,
  TradingTransaction,
  TradingSummary,
} from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { MetricCard, TrendDirection } from "@/components/ui/MetricCard";
import { ResponsiveGrid } from "@/components/ui/ResponsiveGrid";
import { formatCurrency, formatSignedCurrency, formatPercent } from "@/lib/currency";
import type { ThemePalette } from "@/constants/theme";

// ── Helpers ─────────────────────────────────────────────────────────

function pnlTrend(v: number): TrendDirection {
  if (v > 0) return "up";
  if (v < 0) return "down";
  return "neutral";
}

function fmtNum(v: number, decimals = 0): string {
  return v.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

// ── Column definitions (matches Streamlit render_trading_table exactly) ──

type ColAlign = "left" | "right";
type FmtType =
  | "id" | "date" | "text_bold" | "text" | "type_badge" | "status"
  | "source" | "quantity" | "price" | "money" | "money_colored"
  | "percent_colored" | "money_small";

interface ColDef {
  key: keyof TradingTransaction;
  label: string;
  fmt: FmtType;
  width: number;
  align: ColAlign;
}

const TABLE_COLUMNS: ColDef[] = [
  { key: "id",            label: "ID",            fmt: "id",              width: 52,  align: "left" },
  { key: "date",          label: "Date",          fmt: "date",            width: 90,  align: "left" },
  { key: "symbol",        label: "Symbol",        fmt: "text_bold",       width: 100, align: "left" },
  { key: "portfolio",     label: "Portfolio",     fmt: "text",            width: 72,  align: "left" },
  { key: "type",          label: "Type",          fmt: "type_badge",      width: 80,  align: "left" },
  { key: "status",        label: "Status",        fmt: "status",          width: 82,  align: "left" },
  { key: "source",        label: "Source",         fmt: "source",          width: 80,  align: "left" },
  { key: "quantity",      label: "Qty",           fmt: "quantity",        width: 68,  align: "right" },
  { key: "avg_cost",      label: "Avg Cost",      fmt: "price",           width: 82,  align: "right" },
  { key: "price",         label: "Price",         fmt: "price",           width: 76,  align: "right" },
  { key: "current_price", label: "Curr. Price",   fmt: "price",           width: 82,  align: "right" },
  { key: "sell_price",    label: "Sell Price",    fmt: "price",           width: 82,  align: "right" },
  { key: "value",         label: "Value",         fmt: "money",           width: 88,  align: "right" },
  { key: "pnl",           label: "P&L",           fmt: "money_colored",   width: 92,  align: "right" },
  { key: "pnl_pct",       label: "P&L %",         fmt: "percent_colored", width: 76,  align: "right" },
  { key: "fees",          label: "Fees",          fmt: "money_small",     width: 68,  align: "right" },
  { key: "dividend",      label: "Dividend",      fmt: "money_small",     width: 76,  align: "right" },
  { key: "bonus_shares",  label: "Bonus",         fmt: "quantity",        width: 60,  align: "right" },
  { key: "notes",         label: "Notes",         fmt: "text",            width: 120, align: "left" },
];

const TOTAL_TABLE_WIDTH = TABLE_COLUMNS.reduce((sum, c) => sum + c.width, 0);

// ── Cell formatter (matches Streamlit _fmt) ─────────────────────────

function fmtCell(
  val: any,
  fmt: FmtType,
  colors: ThemePalette
): { text: string; color: string; bold: boolean; badgeBg?: string } {
  const muted = colors.textMuted;
  const primary = colors.textPrimary;
  const pos = colors.success;
  const neg = colors.danger;

  if (val == null || val === "" || val === "None") {
    return { text: "-", color: muted, bold: false };
  }

  switch (fmt) {
    case "id":
      return { text: String(Math.round(Number(val))), color: muted, bold: false };

    case "date": {
      const s = String(val).substring(0, 10);
      return { text: s === "NaT" ? "-" : s, color: primary, bold: false };
    }

    case "text_bold":
      return { text: String(val), color: primary, bold: true };

    case "text":
      return { text: String(val), color: primary, bold: false };

    case "type_badge": {
      const t = String(val).toLowerCase();
      if (t.includes("buy")) return { text: "Buy", color: pos, bold: true, badgeBg: pos + "22" };
      if (t.includes("sell")) return { text: "Sell", color: neg, bold: true, badgeBg: neg + "22" };
      if (t.includes("div")) return { text: "Dividend", color: "#3b82f6", bold: true, badgeBg: "#3b82f622" };
      if (t.includes("deposit") || t.includes("withdraw"))
        return { text: String(val), color: "#f59e0b", bold: true, badgeBg: "#f59e0b22" };
      if (t.includes("bonus"))
        return { text: "Bonus", color: colors.accentSecondary, bold: true, badgeBg: colors.accentSecondary + "22" };
      return { text: String(val), color: muted, bold: true, badgeBg: muted + "22" };
    }

    case "status": {
      const s = String(val).toLowerCase();
      if (s === "realized") return { text: "Realized", color: muted, bold: false };
      if (s === "unrealized") return { text: "Unrealized", color: pos, bold: true };
      if (s === "closed") return { text: "Closed", color: muted, bold: false };
      if (s === "income") return { text: "Income", color: colors.accentTertiary, bold: false };
      if (s === "bonus") return { text: "Bonus", color: colors.accentSecondary, bold: false };
      return { text: String(val) || "-", color: muted, bold: false };
    }

    case "source": {
      const map: Record<string, string> = {
        MANUAL: "✍️ Manual", UPLOAD: "📤 Upload", RESTORE: "🔄 Restore",
        API: "🔌 API", LEGACY: "📜 Legacy",
      };
      const sv = String(val).trim();
      return { text: map[sv] ?? `📋 ${sv}`, color: primary, bold: false };
    }

    case "quantity": {
      const n = Number(val);
      if (!n || n === 0) return { text: "-", color: muted, bold: false };
      return { text: fmtNum(n), color: primary, bold: false };
    }

    case "price": {
      const n = Number(val);
      if (!n || n <= 0) return { text: "-", color: muted, bold: false };
      return { text: fmtNum(n, 3), color: primary, bold: false };
    }

    case "money": {
      const n = Number(val);
      if (!n || n === 0) return { text: "-", color: muted, bold: false };
      return { text: fmtNum(n, 2), color: primary, bold: false };
    }

    case "money_colored": {
      const n = Number(val);
      if (!n || n === 0) return { text: "-", color: muted, bold: false };
      if (n > 0) return { text: `+${fmtNum(n, 2)}`, color: pos, bold: true };
      return { text: fmtNum(n, 2), color: neg, bold: true };
    }

    case "percent_colored": {
      const n = Number(val);
      if (!n || n === 0) return { text: "-", color: muted, bold: false };
      if (n > 0) return { text: `+${n.toFixed(2)}%`, color: pos, bold: true };
      return { text: `${n.toFixed(2)}%`, color: neg, bold: true };
    }

    case "money_small": {
      const n = Number(val);
      if (!n || n <= 0) return { text: "-", color: muted, bold: false };
      return { text: fmtNum(n, 2), color: primary, bold: false };
    }

    default:
      return { text: String(val), color: primary, bold: false };
  }
}

// ── Sort helper ─────────────────────────────────────────────────────

type SortDir = "asc" | "desc" | null;

function sortTransactions(
  txns: TradingTransaction[],
  sortCol: keyof TradingTransaction | null,
  sortDir: SortDir
): TradingTransaction[] {
  if (!sortCol || !sortDir) return txns;
  return [...txns].sort((a, b) => {
    const aVal = a[sortCol];
    const bVal = b[sortCol];
    const dir = sortDir === "asc" ? 1 : -1;
    if (aVal == null && bVal == null) return 0;
    if (aVal == null) return 1;
    if (bVal == null) return -1;
    if (typeof aVal === "number" && typeof bVal === "number") return (aVal - bVal) * dir;
    return String(aVal).localeCompare(String(bVal)) * dir;
  });
}

// ── Table Header Cell ───────────────────────────────────────────────

function HeaderCell({
  col,
  colors,
  sortCol,
  sortDir,
  onSort,
}: {
  col: ColDef;
  colors: ThemePalette;
  sortCol: keyof TradingTransaction | null;
  sortDir: SortDir;
  onSort: (key: keyof TradingTransaction) => void;
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
        <Text style={{ opacity: isActive ? 1 : 0.35, fontSize: 10 }}>{arrow}</Text>
      </Text>
    </Pressable>
  );
}

// ── Table Data Cell ─────────────────────────────────────────────────

function DataCell({
  col,
  txn,
  colors,
}: {
  col: ColDef;
  txn: TradingTransaction;
  colors: ThemePalette;
}) {
  const val = txn[col.key];
  const { text, color, bold, badgeBg } = fmtCell(val, col.fmt, colors);

  if (badgeBg) {
    // Render as badge (type column)
    return (
      <View style={[ts.dataCell, { width: col.width }]}>
        <View style={[ts.badge, { backgroundColor: badgeBg }]}>
          <Text style={[ts.badgeText, { color }]} numberOfLines={1}>
            {text}
          </Text>
        </View>
      </View>
    );
  }

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
    </View>
  );
}

// ── Table Row ───────────────────────────────────────────────────────

function TableRow({
  txn,
  colors,
  isEven,
}: {
  txn: TradingTransaction;
  colors: ThemePalette;
  isEven: boolean;
}) {
  const typ = (txn.type ?? "").toLowerCase();
  const rowBg = typ.includes("buy")
    ? colors.success + "08"
    : typ.includes("sell")
    ? colors.danger + "08"
    : isEven
    ? "transparent"
    : colors.bgCardHover + "30";

  return (
    <View style={[ts.dataRow, { backgroundColor: rowBg, borderBottomColor: colors.borderColor }]}>
      {TABLE_COLUMNS.map((col) => (
        <DataCell key={col.key} col={col} txn={txn} colors={colors} />
      ))}
    </View>
  );
}

// ── Summary Section (Professional Dashboard Cards) ──────────────────

function SummaryMetrics({ summary, dateFrom, dateTo }: { summary: TradingSummary; dateFrom?: string; dateTo?: string }) {
  const { colors } = useThemeStore();
  const { isPhone } = useResponsive();

  const hasDateFilter = !!(dateFrom || dateTo);
  const periodLabel = hasDateFilter
    ? `${dateFrom || "Inception"} → ${dateTo || "Today"}`
    : "Since Inception";

  // Professional card renderer
  const Card = ({
    icon,
    iconColor,
    label,
    value,
    sub,
    valueColor,
    borderAccent,
  }: {
    icon: React.ComponentProps<typeof FontAwesome>["name"];
    iconColor: string;
    label: string;
    value: string;
    sub?: string;
    valueColor?: string;
    borderAccent?: string;
  }) => (
    <View
      style={[
        cardStyles.card,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.borderColor,
          borderLeftColor: borderAccent || colors.borderColor,
          borderLeftWidth: borderAccent ? 3 : 1,
        },
      ]}
    >
      <View style={cardStyles.cardHeader}>
        <View style={[cardStyles.iconCircle, { backgroundColor: iconColor + "18" }]}>
          <FontAwesome name={icon} size={isPhone ? 14 : 16} color={iconColor} />
        </View>
        <Text style={[cardStyles.cardLabel, { color: colors.textSecondary }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text
        style={[
          cardStyles.cardValue,
          {
            color: valueColor || colors.textPrimary,
            fontSize: isPhone ? 17 : 19,
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {sub ? (
        <Text style={[cardStyles.cardSub, { color: colors.textMuted }]}>{sub}</Text>
      ) : null}
    </View>
  );

  const pnlColor = (v: number) => (v > 0 ? colors.success : v < 0 ? colors.danger : colors.textMuted);

  return (
    <View style={cardStyles.wrapper}>
      {/* Period indicator */}
      <View style={[cardStyles.periodBadge, { backgroundColor: colors.accentPrimary + "12", borderColor: colors.accentPrimary + "30" }]}>
        <FontAwesome name="calendar" size={11} color={colors.accentPrimary} />
        <Text style={[cardStyles.periodText, { color: colors.accentPrimary }]}>{periodLabel}</Text>
        <Text style={[cardStyles.periodCcy, { color: colors.textMuted }]}>All values in KWD</Text>
      </View>

      {/* Row 1: Capital Flow */}
      <Text style={[cardStyles.sectionLabel, { color: colors.textSecondary }]}>CAPITAL FLOW</Text>
      <ResponsiveGrid columns={{ phone: 2, tablet: 4, desktop: 4 }}>
        <Card
          icon="arrow-circle-down"
          iconColor="#10b981"
          label="Total Buys"
          value={formatCurrency(summary.total_buys, "KWD")}
          sub={`${summary.buy_count} transactions`}
          borderAccent="#10b981"
        />
        <Card
          icon="arrow-circle-up"
          iconColor="#f59e0b"
          label="Total Sells"
          value={formatCurrency(summary.total_sells, "KWD")}
          sub={`${summary.sell_count} transactions`}
          borderAccent="#f59e0b"
        />
        <Card
          icon="bank"
          iconColor="#3b82f6"
          label="Deposits"
          value={formatCurrency(summary.total_deposits, "KWD")}
          sub={`${summary.deposit_count} deposits`}
          borderAccent="#3b82f6"
        />
        <Card
          icon="sign-out"
          iconColor="#ef4444"
          label="Withdrawals"
          value={formatCurrency(summary.total_withdrawals, "KWD")}
          sub={`${summary.withdrawal_count} transactions`}
          borderAccent="#ef4444"
        />
      </ResponsiveGrid>

      {/* Row 2: Profit & Loss */}
      <Text style={[cardStyles.sectionLabel, { color: colors.textSecondary }]}>PROFIT & LOSS</Text>
      <ResponsiveGrid columns={{ phone: 2, tablet: 4, desktop: 4 }}>
        <Card
          icon="line-chart"
          iconColor={pnlColor(summary.unrealized_pnl)}
          label="Unrealized P&L"
          value={formatSignedCurrency(summary.unrealized_pnl, "KWD")}
          sub="Open positions"
          valueColor={pnlColor(summary.unrealized_pnl)}
          borderAccent={pnlColor(summary.unrealized_pnl)}
        />
        <Card
          icon="check-circle"
          iconColor={pnlColor(summary.realized_pnl)}
          label="Realized P&L"
          value={formatSignedCurrency(summary.realized_pnl, "KWD")}
          sub="Closed positions"
          valueColor={pnlColor(summary.realized_pnl)}
          borderAccent={pnlColor(summary.realized_pnl)}
        />
        <Card
          icon="trophy"
          iconColor={pnlColor(summary.total_pnl)}
          label="Total P&L"
          value={formatSignedCurrency(summary.total_pnl, "KWD")}
          sub={`Unrealized (${formatSignedCurrency(summary.unrealized_pnl, "KWD")}) + Realized (${formatSignedCurrency(summary.realized_pnl, "KWD")})`}
          valueColor={pnlColor(summary.total_pnl)}
          borderAccent={pnlColor(summary.total_pnl)}
        />
        <Card
          icon="list-ol"
          iconColor={colors.accentPrimary}
          label="Total Txns"
          value={fmtNum(summary.total_transactions)}
          sub="All transaction types"
          borderAccent={colors.accentPrimary}
        />
      </ResponsiveGrid>

      {/* Row 3: Returns & Income */}
      <Text style={[cardStyles.sectionLabel, { color: colors.textSecondary }]}>RETURNS & INCOME</Text>
      <ResponsiveGrid columns={{ phone: 2, tablet: 4, desktop: 4 }}>
        <Card
          icon="money"
          iconColor="#8b5cf6"
          label="Cash Dividends"
          value={formatCurrency(summary.total_dividends, "KWD")}
          sub={`${summary.dividend_count} records`}
          borderAccent="#8b5cf6"
        />
        <Card
          icon="percent"
          iconColor="#6366f1"
          label="Total Fees"
          value={formatCurrency(summary.total_fees, "KWD")}
          sub="Brokerage & commissions"
          borderAccent="#6366f1"
        />
        <Card
          icon="exchange"
          iconColor={pnlColor(summary.net_cash_flow)}
          label="Net Cash Flow"
          value={formatSignedCurrency(summary.net_cash_flow, "KWD")}
          sub="Sells + Dep − Buys − Fees"
          valueColor={pnlColor(summary.net_cash_flow)}
          borderAccent={pnlColor(summary.net_cash_flow)}
        />
        <Card
          icon="area-chart"
          iconColor={pnlColor(summary.total_return_pct)}
          label="Total Return"
          value={summary.total_buys > 0 ? formatPercent(summary.total_return_pct) : "N/A"}
          sub="Including dividends"
          valueColor={pnlColor(summary.total_return_pct)}
          borderAccent={pnlColor(summary.total_return_pct)}
        />
      </ResponsiveGrid>
    </View>
  );
}

const cardStyles = StyleSheet.create({
  wrapper: {
    marginBottom: 8,
  },
  periodBadge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    marginBottom: 12,
  },
  periodText: {
    fontSize: 12,
    fontWeight: "600",
  },
  periodCcy: {
    fontSize: 10,
    fontWeight: "500",
    marginLeft: 4,
  },
  sectionLabel: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 6,
    marginTop: 4,
  },
  card: {
    borderRadius: 10,
    borderWidth: 1,
    padding: 14,
    minHeight: 96,
    width: "100%",
  },
  cardHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  iconCircle: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  cardLabel: {
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.3,
    textTransform: "uppercase",
    flex: 1,
  },
  cardValue: {
    fontSize: 19,
    fontWeight: "800",
    letterSpacing: -0.3,
    marginBottom: 2,
  },
  cardSub: {
    fontSize: 11,
    fontWeight: "500",
    marginTop: 2,
  },
});

// ── Filter chips ────────────────────────────────────────────────────

const PORTFOLIOS = ["KFH", "BBYN", "USA"] as const;
const TXN_TYPES = ["Buy", "Sell", "Deposit", "Withdrawal", "Dividend", "Bonus Shares", "Dividend_Only"] as const;

function FilterChip({
  label,
  active,
  onPress,
  activeColor,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  activeColor?: string;
  colors: ThemePalette;
}) {
  const bg = active ? (activeColor ?? colors.accentPrimary) : colors.bgCard;
  return (
    <Pressable
      onPress={onPress}
      style={[s.chip, { backgroundColor: bg, borderColor: colors.borderColor }]}
    >
      <Text style={[s.chipText, { color: active ? "#fff" : colors.textSecondary }]}>
        {label}
      </Text>
    </Pressable>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────

export default function TradingScreen() {
  const { colors } = useThemeStore();
  const { isDesktop, isPhone, spacing, fonts } = useResponsive();
  const queryClient = useQueryClient();

  const [portfolios, setPortfolios] = useState<string[]>([]);
  const [txnTypes, setTxnTypes] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const hasActiveFilters = !!(portfolios.length || txnTypes.length || dateFrom || dateTo || search);

  const clearAllFilters = useCallback(() => {
    setPortfolios([]);
    setTxnTypes([]);
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setPage(1);
  }, []);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["trading-summary", portfolios, txnTypes, dateFrom, dateTo, search, page],
    queryFn: () =>
      getTradingSummary({
        portfolio: portfolios.length === 1 ? portfolios[0] : undefined,
        txn_type: txnTypes.length === 1 ? txnTypes[0] : undefined,
        date_from: dateFrom || undefined,
        date_to: dateTo || undefined,
        search: search.trim() || undefined,
        page,
        page_size: 100,
      }),
    placeholderData: (prev) => prev,
  });

  // Recalculate WAC mutation
  const recalcMutation = useMutation({
    mutationFn: recalculateWAC,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["trading-summary"] });
      Alert.alert(
        "Recalculation Complete",
        `Updated ${result.updated} transactions across ${result.positions_processed} positions.`
        + (result.errors.length > 0 ? `\n\nErrors: ${result.errors.join(", ")}` : "")
      );
    },
    onError: (err: any) => {
      Alert.alert("Error", err?.message ?? "Failed to recalculate");
    },
  });

  // Export handler
  const handleExport = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        const blob = await exportTradingExcel();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `transactions_${new Date().toISOString().slice(0, 10)}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        Alert.alert("Export", "Excel export is available on the web version.");
      }
    } catch (err: any) {
      Alert.alert("Export Error", err?.message ?? "Failed to export");
    }
  }, []);

  const onRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["trading-summary"] });
    refetch();
  }, [refetch, queryClient]);

  const totalPages = data?.pagination?.total_pages ?? 1;

  // ── Sort state (must be before early returns) ──────────────────
  const [sortCol, setSortCol] = useState<keyof TradingTransaction | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const onSort = useCallback(
    (key: keyof TradingTransaction) => {
      if (sortCol !== key) {
        setSortCol(key);
        setSortDir("asc");
      } else if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        setSortCol(null);
        setSortDir(null);
      }
    },
    [sortCol, sortDir]
  );

  const transactions = data?.transactions ?? [];

  // Client-side multi-select filtering (backend only supports single values)
  const filteredTransactions = useMemo(() => {
    let txns = transactions;
    if (portfolios.length > 1) {
      txns = txns.filter((t) => portfolios.includes(t.portfolio ?? ""));
    }
    if (txnTypes.length > 1) {
      txns = txns.filter((t) => {
        const ttype = (t.type ?? "").toLowerCase();
        return txnTypes.some((ft) => {
          const ftl = ft.toLowerCase();
          if (ftl === "dividend_only") return ttype === "dividend" || ttype.includes("div");
          return ttype === ftl || ttype.includes(ftl);
        });
      });
    }
    return txns;
  }, [transactions, portfolios, txnTypes]);

  const sortedTransactions = useMemo(
    () => sortTransactions(filteredTransactions, sortCol, sortDir),
    [filteredTransactions, sortCol, sortDir]
  );

  if (isLoading && !data) return <LoadingScreen />;
  if (isError && !data)
    return <ErrorScreen message={error?.message ?? "Failed to load"} onRetry={refetch} />;

  const summary = data?.summary;

  // ── Render helpers ──────────────────────────────────────────────

  const renderHeader = () => (
    <View style={{ paddingBottom: 8 }}>
      {/* Title */}
      <View style={[s.headerCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Text style={[s.title, { color: colors.textPrimary, fontSize: fonts.title }]}>
          📈 Trading Section
        </Text>
        <Text style={[s.subtitle, { color: colors.textSecondary }]}>
          All transactions · Real-time P&L · CFA-compliant cost basis
        </Text>
      </View>

      {/* Info card */}
      <View style={[s.infoCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Text style={[s.infoTitle, { color: colors.textPrimary }]}>📋 All your saved transactions</Text>
        <Text style={[s.infoBody, { color: colors.textSecondary }]}>
          Buy/Sell trades, Cash Deposits/Withdrawals, Dividends, Bonus Shares — all in one view.
          {"\n"}P&L calculated using CFA-compliant Weighted Average Cost method per portfolio.
        </Text>
      </View>

      {/* Summary metrics */}
      {summary && <SummaryMetrics summary={summary} dateFrom={dateFrom} dateTo={dateTo} />}

      {/* Section header: Filters */}
      <View style={[s.sectionHeader, { borderBottomColor: colors.borderColor }]}>
        <FontAwesome name="filter" size={14} color={colors.accentSecondary} />
        <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Filters</Text>
      </View>

      {/* Portfolio filter */}
      <View style={s.filterRow}>
        {PORTFOLIOS.map((pf) => (
          <FilterChip
            key={pf}
            label={pf}
            active={portfolios.includes(pf)}
            onPress={() => {
              setPortfolios((prev) =>
                prev.includes(pf) ? prev.filter((p) => p !== pf) : [...prev, pf]
              );
              setPage(1);
            }}
            colors={colors}
          />
        ))}
      </View>

      {/* Type filter */}
      <View style={s.filterRow}>
        {TXN_TYPES.map((tp) => (
          <FilterChip
            key={tp}
            label={tp === "Dividend_Only" ? "Div Only" : tp}
            active={txnTypes.includes(tp)}
            onPress={() => {
              setTxnTypes((prev) =>
                prev.includes(tp) ? prev.filter((t) => t !== tp) : [...prev, tp]
              );
              setPage(1);
            }}
            activeColor={
              tp === "Buy" ? colors.success
              : tp === "Sell" ? colors.danger
              : tp === "Dividend" || tp === "Dividend_Only" ? colors.accentTertiary
              : undefined
            }
            colors={colors}
          />
        ))}
      </View>

      {/* Date range filter */}
      <View style={s.dateRow}>
        <View style={[s.dateInputWrap, { backgroundColor: colors.bgInput, borderColor: colors.borderColor }]}>
          <FontAwesome name="calendar" size={12} color={colors.textMuted} />
          {Platform.OS === "web" ? (
            <input
              type="date"
              value={dateFrom}
              onChange={(e: any) => { setDateFrom(e.target.value); setPage(1); }}
              style={{
                flex: 1,
                fontSize: 13,
                color: colors.textPrimary,
                background: "transparent",
                border: "none",
                outline: "none",
                fontFamily: "inherit",
              } as any}
            />
          ) : (
            <TextInput
              value={dateFrom}
              onChangeText={(t) => { setDateFrom(t); setPage(1); }}
              placeholder="From (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              style={[s.dateInput, { color: colors.textPrimary }]}
              maxLength={10}
              returnKeyType="done"
            />
          )}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>→</Text>
        <View style={[s.dateInputWrap, { backgroundColor: colors.bgInput, borderColor: colors.borderColor }]}>
          <FontAwesome name="calendar" size={12} color={colors.textMuted} />
          {Platform.OS === "web" ? (
            <input
              type="date"
              value={dateTo}
              onChange={(e: any) => { setDateTo(e.target.value); setPage(1); }}
              style={{
                flex: 1,
                fontSize: 13,
                color: colors.textPrimary,
                background: "transparent",
                border: "none",
                outline: "none",
                fontFamily: "inherit",
              } as any}
            />
          ) : (
            <TextInput
              value={dateTo}
              onChangeText={(t) => { setDateTo(t); setPage(1); }}
              placeholder="To (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              style={[s.dateInput, { color: colors.textPrimary }]}
              maxLength={10}
              returnKeyType="done"
            />
          )}
        </View>
      </View>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Pressable
          onPress={clearAllFilters}
          style={[s.clearBtn, { borderColor: colors.danger }]}
        >
          <FontAwesome name="times" size={12} color={colors.danger} />
          <Text style={[s.clearBtnText, { color: colors.danger }]}>Clear All Filters</Text>
        </Pressable>
      )}

      {/* Search */}
      <View style={[s.searchRow, { backgroundColor: colors.bgInput, borderColor: colors.borderColor }]}>
        <FontAwesome name="search" size={14} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={(t) => { setSearch(t); setPage(1); }}
          placeholder="Search symbol, portfolio, notes..."
          placeholderTextColor={colors.textMuted}
          style={[s.searchInput, { color: colors.textPrimary }]}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <FontAwesome name="times-circle" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Results count */}
      <View style={s.resultsRow}>
        <Text style={[s.resultsText, { color: colors.textSecondary }]}>
          {data?.pagination?.total_items ?? 0} transactions
          {portfolios.length ? ` · ${portfolios.join(", ")}` : ""}
          {txnTypes.length ? ` · ${txnTypes.join(", ")}` : ""}
          {dateFrom ? ` · from ${dateFrom}` : ""}
          {dateTo ? ` · to ${dateTo}` : ""}
          {search ? ` · "${search}"` : ""}
        </Text>
      </View>

      {/* Action buttons */}
      <View style={s.actionRow}>
        <Pressable
          onPress={() => recalcMutation.mutate()}
          disabled={recalcMutation.isPending}
          style={[
            s.actionBtn,
            {
              backgroundColor: colors.accentPrimary + "18",
              borderColor: colors.accentPrimary,
              opacity: recalcMutation.isPending ? 0.6 : 1,
            },
          ]}
        >
          {recalcMutation.isPending ? (
            <ActivityIndicator size="small" color={colors.accentPrimary} />
          ) : (
            <FontAwesome name="refresh" size={13} color={colors.accentPrimary} />
          )}
          <Text style={[s.actionBtnText, { color: colors.accentPrimary }]}>
            {recalcMutation.isPending ? "Recalculating..." : "Recalculate WAC"}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleExport}
          style={[
            s.actionBtn,
            {
              backgroundColor: colors.success + "18",
              borderColor: colors.success,
            },
          ]}
        >
          <FontAwesome name="download" size={13} color={colors.success} />
          <Text style={[s.actionBtnText, { color: colors.success }]}>Export Excel</Text>
        </Pressable>
      </View>

      {/* Section header: Transaction Log */}
      <View style={[s.sectionHeader, { borderBottomColor: colors.borderColor }]}>
        <FontAwesome name="list" size={14} color={colors.success} />
        <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Transaction Log</Text>
      </View>
    </View>
  );

  return (
    <View style={[s.container, { backgroundColor: colors.bgPrimary }]}>
      <ScrollView
        contentContainerStyle={[
          s.list,
          isDesktop && { maxWidth: 1200, alignSelf: "center" as const, width: "100%" },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={onRefresh}
            tintColor={colors.accentPrimary}
          />
        }
      >
        {renderHeader()}

        {/* ── Data Table (horizontal scroll) ─────────────────────── */}
        {sortedTransactions.length === 0 ? (
          <View style={s.empty}>
            <FontAwesome name="bar-chart" size={48} color={colors.textMuted} />
            <Text style={[s.emptyText, { color: colors.textSecondary }]}>
              No transactions found
            </Text>
            <Text style={[s.emptyHint, { color: colors.textMuted }]}>
              Use "Add Transactions" to record trades
            </Text>
          </View>
        ) : (
          <View style={[ts.tableOuter, { borderColor: colors.borderColor, backgroundColor: colors.bgCard }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={{ minWidth: TOTAL_TABLE_WIDTH }}>
                {/* Header row */}
                <View
                  style={[
                    ts.headerRow,
                    { borderBottomColor: colors.borderColor, backgroundColor: colors.bgSecondary },
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
                {sortedTransactions.map((txn, idx) => (
                  <TableRow key={txn.id} txn={txn} colors={colors} isEven={idx % 2 === 0} />
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <View style={s.pagination}>
            <Pressable
              onPress={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              style={[
                s.pageBtn,
                {
                  backgroundColor: colors.bgCard,
                  borderColor: colors.borderColor,
                  opacity: page <= 1 ? 0.4 : 1,
                },
              ]}
            >
              <FontAwesome name="chevron-left" size={14} color={colors.textPrimary} />
            </Pressable>
            <Text style={[s.pageInfo, { color: colors.textSecondary }]}>
              {page} / {totalPages}
            </Text>
            <Pressable
              onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={[
                s.pageBtn,
                {
                  backgroundColor: colors.bgCard,
                  borderColor: colors.borderColor,
                  opacity: page >= totalPages ? 0.4 : 1,
                },
              ]}
            >
              <FontAwesome name="chevron-right" size={14} color={colors.textPrimary} />
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Footer stats bar */}
      {summary && (
        <View style={[s.footer, { backgroundColor: colors.bgSecondary, borderTopColor: colors.borderColor }]}>
          <View style={s.footerStat}>
            <Text style={[s.footerValue, { color: colors.accentPrimary }]}>
              {fmtNum(summary.total_transactions)}
            </Text>
            <Text style={[s.footerLabel, { color: colors.textSecondary }]}>Total Txns</Text>
          </View>
          <View style={[s.footerDivider, { backgroundColor: colors.borderColor }]} />
          <View style={s.footerStat}>
            <Text style={[s.footerValue, { color: colors.accentSecondary }]}>
              {fmtNum(summary.total_trades)}
            </Text>
            <Text style={[s.footerLabel, { color: colors.textSecondary }]}>Buy/Sell</Text>
          </View>
          <View style={[s.footerDivider, { backgroundColor: colors.borderColor }]} />
          <View style={s.footerStat}>
            <Text style={[s.footerValue, { color: summary.total_pnl >= 0 ? colors.success : colors.danger }]}>
              {summary.total_pnl >= 0 ? "+" : ""}{fmtNum(summary.total_pnl, 2)}
            </Text>
            <Text style={[s.footerLabel, { color: colors.textSecondary }]}>Total P&L</Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ── Table styles (ts) ───────────────────────────────────────────────

const ts = StyleSheet.create({
  tableOuter: {
    borderRadius: 10,
    borderWidth: 1,
    overflow: "hidden",
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
  dataCell: {
    paddingHorizontal: 6,
    paddingVertical: 8,
    justifyContent: "center",
  },
  cellText: {
    fontSize: 12,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
    alignSelf: "flex-start",
  },
  badgeText: {
    fontSize: 11,
    fontWeight: "700",
  },
});

// ── General styles (s) ──────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 80 },

  // Header card
  headerCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
    alignItems: "center",
  },
  title: { fontWeight: "800", letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontSize: 13, fontWeight: "500", textAlign: "center" },

  // Info card
  infoCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  infoTitle: { fontSize: 14, fontWeight: "700", marginBottom: 6 },
  infoBody: { fontSize: 13, lineHeight: 20 },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    marginTop: 8,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700" },

  // Filters
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: "600" },

  // Search
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 4,
    marginBottom: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}),
  },

  // Results count
  resultsRow: { marginBottom: 4 },
  resultsText: { fontSize: 12 },

  // Date filter
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  dateInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 8 : 4,
    gap: 6,
  },
  dateInput: {
    flex: 1,
    fontSize: 13,
    ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}),
  },

  // Clear filters
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  clearBtnText: { fontSize: 12, fontWeight: "600" },

  // Action buttons
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 13, fontWeight: "600" },

  // Empty state
  empty: { alignItems: "center", marginTop: 60 },
  emptyText: { fontSize: 16, marginTop: 12, fontWeight: "600" },
  emptyHint: { fontSize: 13, marginTop: 4 },

  // Pagination
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

  // Footer bar
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    gap: 16,
  },
  footerStat: { alignItems: "center" },
  footerValue: { fontSize: 16, fontWeight: "700" },
  footerLabel: { fontSize: 10, marginTop: 1 },
  footerDivider: { width: 1, height: 24 },
});
