/**
 * Trading transaction table — desktop-class spreadsheet view.
 *
 * Exports column definitions, cell formatters, sort helpers,
 * and reusable sub-components (HeaderCell, TableRow) consumed
 * by the TradingScreen.
 */

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Platform,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { TradingTransaction } from "@/services/api";
import type { ThemePalette } from "@/constants/theme";
import { fmtNum } from "@/lib/currency";

// ── Column types ────────────────────────────────────────────────────

type ColAlign = "left" | "right";
type FmtType =
  | "id" | "date" | "text_bold" | "text" | "type_badge" | "status"
  | "source" | "quantity" | "price" | "money" | "money_colored"
  | "percent_colored" | "money_small";

/** Column descriptor driving render width, alignment, and format type. */
export interface ColDef {
  key: keyof TradingTransaction;
  label: string;
  fmt: FmtType;
  width: number;
  align: ColAlign;
}

export type SortDir = "asc" | "desc" | null;

// ── Column definitions ──────────────────────────────────────────────

/** Ordered column layout for the trading transactions table. */
export const TABLE_COLUMNS: ColDef[] = [
  { key: "id",            label: "ID",            fmt: "id",              width: 52,  align: "left" },
  { key: "date",          label: "Date",          fmt: "date",            width: 90,  align: "left" },
  { key: "company_name",  label: "Company",       fmt: "text_bold",       width: 140, align: "left" },
  { key: "symbol",        label: "Symbol",        fmt: "text",            width: 100, align: "left" },
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

export const TOTAL_TABLE_WIDTH = TABLE_COLUMNS.reduce((sum, c) => sum + c.width, 0);

// ── Cell formatter ──────────────────────────────────────────────────

/**
 * Format a raw cell value into display text, colour, and weight.
 *
 * Returns an object with `text`, `color`, `bold`, and optional
 * `badgeBg` for type badges (Buy/Sell/Dividend etc.).
 */
export function fmtCell(
  val: unknown,
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
      return { text: fmtNum(n, 0), color: primary, bold: false };
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

/** Sort transactions by the given column key and direction. Null-safe. */
export function sortTransactions(
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

// ── Header Cell ─────────────────────────────────────────────────────

/** Pressable column header with sort-direction indicator arrow. */
export const HeaderCell = React.memo(function HeaderCell({
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
        { width: col.width, backgroundColor: isActive ? colors.bgCardHover : "transparent" },
      ]}
    >
      <Text
        style={[
          ts.headerText,
          { color: isActive ? colors.accentPrimary : colors.textPrimary, textAlign: col.align },
        ]}
        numberOfLines={1}
      >
        {col.label}
        <Text style={{ opacity: isActive ? 1 : 0.35, fontSize: 10 }}>{arrow}</Text>
      </Text>
    </Pressable>
  );
});

// ── Data Cell ───────────────────────────────────────────────────────

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
    return (
      <View style={[ts.dataCell, { width: col.width }]}>
        <View style={[ts.badge, { backgroundColor: badgeBg }]}>
          <Text style={[ts.badgeText, { color }]} numberOfLines={1}>{text}</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[ts.dataCell, { width: col.width }]}>
      <Text
        style={[ts.cellText, { color, fontWeight: bold ? "700" : "400", textAlign: col.align }]}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

// ── Editable Company Cell ───────────────────────────────────────────

function EditableCompanyCell({
  txn,
  colors,
  width,
  onRename,
}: {
  txn: TradingTransaction;
  colors: ThemePalette;
  width: number;
  onRename: (symbol: string, newName: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState(txn.company_name ?? txn.symbol ?? "");
  const companyName = txn.company_name ?? txn.symbol ?? "-";

  const handleDoubleClick = useCallback(() => {
    setEditValue(companyName);
    setEditing(true);
  }, [companyName]);

  const handleSave = useCallback(() => {
    const trimmed = editValue.trim();
    if (trimmed && trimmed !== companyName && txn.symbol) {
      onRename(txn.symbol, trimmed);
    }
    setEditing(false);
  }, [editValue, companyName, txn.symbol, onRename]);

  const handleCancel = useCallback(() => {
    setEditing(false);
    setEditValue(companyName);
  }, [companyName]);

  if (editing) {
    return (
      <View style={[ts.dataCell, { width, flexDirection: "row", alignItems: "center", gap: 2 }]}>
        <TextInput
          value={editValue}
          onChangeText={setEditValue}
          onSubmitEditing={handleSave}
          onBlur={handleSave}
          autoFocus
          style={[
            ts.cellText,
            {
              flex: 1, color: colors.textPrimary, fontWeight: "700",
              borderBottomWidth: 1, borderBottomColor: colors.accentPrimary,
              paddingVertical: 2, fontSize: 12,
              ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}),
            },
          ]}
          returnKeyType="done"
        />
        <Pressable onPress={handleCancel} hitSlop={6}>
          <FontAwesome name="times" size={10} color={colors.danger} />
        </Pressable>
      </View>
    );
  }

  const webProps = Platform.OS === "web"
    ? { onDoubleClick: handleDoubleClick } as any
    : {};

  return (
    <Pressable
      onLongPress={Platform.OS !== "web" ? handleDoubleClick : undefined}
      style={[ts.dataCell, { width }]}
      {...webProps}
    >
      <Text
        style={[ts.cellText, { color: colors.textPrimary, fontWeight: "700", textAlign: "left" }]}
        numberOfLines={1}
      >
        {companyName}
      </Text>
      <Text style={{ fontSize: 8, color: colors.textMuted, marginTop: 1 }}>
        double-click to edit
      </Text>
    </Pressable>
  );
}

// ── Table Row ───────────────────────────────────────────────────────

/** Single data row rendering all columns with zebra-striped background.
 *  Company column supports inline double-click rename.
 */
export const TableRow = React.memo(function TableRow({
  txn,
  colors,
  isEven,
  onRename,
}: {
  txn: TradingTransaction;
  colors: ThemePalette;
  isEven: boolean;
  onRename: (symbol: string, newName: string) => void;
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
      {TABLE_COLUMNS.map((col) =>
        col.key === "company_name" ? (
          <EditableCompanyCell key={col.key} txn={txn} colors={colors} width={col.width} onRename={onRename} />
        ) : (
          <DataCell key={col.key} col={col} txn={txn} colors={colors} />
        )
      )}
    </View>
  );
});

// ── Table styles ────────────────────────────────────────────────────

export const ts = StyleSheet.create({
  tableOuter: {
    borderRadius: 10, borderWidth: 1, overflow: "hidden", marginBottom: 12,
  },
  headerRow: { flexDirection: "row", borderBottomWidth: 2 },
  headerCell: { paddingHorizontal: 6, paddingVertical: 10, justifyContent: "center" },
  headerText: { fontSize: 11, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  dataRow: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  dataCell: { paddingHorizontal: 6, paddingVertical: 8, justifyContent: "center" },
  cellText: { fontSize: 12 },
  badge: { paddingHorizontal: 8, paddingVertical: 2, borderRadius: 6, alignSelf: "flex-start" },
  badgeText: { fontSize: 11, fontWeight: "700" },
});
