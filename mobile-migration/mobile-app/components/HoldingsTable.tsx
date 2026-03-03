/**
 * HoldingsTable — responsive data table for holdings.
 *
 * Web/Desktop: full-width HTML-style table with sticky header.
 * Mobile:      horizontally scrollable table.
 *
 * Includes a CSV download button (web) / share button (native).
 */

import React, { useMemo } from "react";
import {
  View,
  Text,
  ScrollView,
  StyleSheet,
  Pressable,
  Platform,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { Holding } from "@/services/api";
import type { ThemePalette } from "@/constants/theme";

// ── Column definitions ──────────────────────────────────────────────

interface Column {
  key: keyof Holding | "pnl_pct_display";
  label: string;
  width: number;
  align?: "left" | "right";
  format?: (v: any, item: Holding) => string;
  colorFn?: (item: Holding) => string | undefined;
}

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return "—";
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function pnlColor(n: number, c: ThemePalette): string | undefined {
  if (n > 0) return c.success;
  if (n < 0) return c.danger;
  return undefined;
}

const COLUMNS: (colors: ThemePalette) => Column[] = (colors) => [
  { key: "symbol", label: "Symbol", width: 100, align: "left" },
  { key: "company", label: "Company", width: 160, align: "left" },
  {
    key: "shares_qty",
    label: "Shares",
    width: 80,
    align: "right",
    format: (v) => fmt(v, 0),
  },
  {
    key: "avg_cost",
    label: "Avg Cost",
    width: 90,
    align: "right",
    format: (v) => fmt(v, 3),
  },
  {
    key: "market_price",
    label: "Price",
    width: 90,
    align: "right",
    format: (v) => fmt(v, 3),
  },
  {
    key: "total_cost",
    label: "Cost",
    width: 100,
    align: "right",
    format: (v) => fmt(v, 2),
  },
  {
    key: "market_value",
    label: "Mkt Value",
    width: 110,
    align: "right",
    format: (v) => fmt(v, 2),
  },
  {
    key: "unrealized_pnl",
    label: "Unreal P/L",
    width: 110,
    align: "right",
    format: (v) => fmt(v, 2),
    colorFn: (item) => pnlColor(item.unrealized_pnl, colors),
  },
  {
    key: "realized_pnl",
    label: "Real P/L",
    width: 100,
    align: "right",
    format: (v) => fmt(v, 2),
    colorFn: (item) => pnlColor(item.realized_pnl, colors),
  },
  {
    key: "total_pnl",
    label: "Total P/L",
    width: 110,
    align: "right",
    format: (v) => fmt(v, 2),
    colorFn: (item) => pnlColor(item.total_pnl, colors),
  },
  {
    key: "pnl_pct_display",
    label: "P/L %",
    width: 80,
    align: "right",
    format: (_v, item) => `${(item.pnl_pct * 100).toFixed(1)}%`,
    colorFn: (item) => pnlColor(item.pnl_pct, colors),
  },
  {
    key: "cash_dividends",
    label: "Dividends",
    width: 100,
    align: "right",
    format: (v) => fmt(v, 2),
  },
  {
    key: "market_value_kwd",
    label: "Mkt Val (KWD)",
    width: 120,
    align: "right",
    format: (v) => fmt(v, 2),
  },
  {
    key: "currency",
    label: "CCY",
    width: 55,
    align: "left",
  },
];

// ── CSV Download ────────────────────────────────────────────────────

function generateCSV(holdings: Holding[], columns: Column[]): string {
  const header = columns.map((c) => c.label).join(",");
  const rows = holdings.map((item) =>
    columns
      .map((col) => {
        const raw =
          col.key === "pnl_pct_display"
            ? `${(item.pnl_pct * 100).toFixed(1)}%`
            : (item as any)[col.key];
        // Wrap strings with commas in quotes
        const str = String(raw ?? "");
        return str.includes(",") ? `"${str}"` : str;
      })
      .join(",")
  );
  return [header, ...rows].join("\n");
}

function downloadCSV(csv: string, filename: string) {
  if (Platform.OS !== "web") return;
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Component ───────────────────────────────────────────────────────

interface HoldingsTableProps {
  holdings: Holding[];
  colors: ThemePalette;
  filterLabel?: string;
}

export default function HoldingsTable({
  holdings,
  colors,
  filterLabel = "All",
}: HoldingsTableProps) {
  const columns = useMemo(() => COLUMNS(colors), [colors]);

  const totalWidth = columns.reduce((a, c) => a + c.width, 0);

  const handleDownload = () => {
    const csv = generateCSV(holdings, columns);
    downloadCSV(csv, `holdings_${filterLabel}_${new Date().toISOString().slice(0, 10)}.csv`);
  };

  return (
    <View style={ts.wrapper}>
      {/* Toolbar */}
      <View style={[ts.toolbar, { borderBottomColor: colors.borderColor }]}>
        <Text style={[ts.tableTitle, { color: colors.textPrimary }]}>
          Holdings Data ({holdings.length})
        </Text>

        {Platform.OS === "web" && (
          <Pressable
            onPress={handleDownload}
            style={({ pressed }) => [
              ts.csvBtn,
              {
                backgroundColor: pressed
                  ? colors.accentPrimary
                  : colors.bgCard,
                borderColor: colors.borderColor,
              },
            ]}
          >
            <FontAwesome
              name="download"
              size={14}
              color={colors.accentPrimary}
              style={{ marginRight: 6 }}
            />
            <Text style={[ts.csvText, { color: colors.accentPrimary }]}>
              Download CSV
            </Text>
          </Pressable>
        )}
      </View>

      {/* Scrollable table */}
      <ScrollView horizontal showsHorizontalScrollIndicator>
        <View style={{ minWidth: totalWidth }}>
          {/* Header row */}
          <View
            style={[
              ts.headerRow,
              {
                backgroundColor: colors.bgSecondary,
                borderBottomColor: colors.borderColor,
              },
            ]}
          >
            {columns.map((col) => (
              <Text
                key={col.key}
                style={[
                  ts.headerCell,
                  {
                    width: col.width,
                    textAlign: col.align ?? "left",
                    color: colors.textMuted,
                  },
                ]}
                numberOfLines={1}
              >
                {col.label}
              </Text>
            ))}
          </View>

          {/* Data rows */}
          {holdings.map((item, idx) => (
            <View
              key={item.symbol}
              style={[
                ts.dataRow,
                {
                  backgroundColor:
                    idx % 2 === 0 ? colors.bgCard : colors.bgPrimary,
                  borderBottomColor: colors.borderColor,
                },
              ]}
            >
              {columns.map((col) => {
                const raw =
                  col.key === "pnl_pct_display" ? null : (item as any)[col.key];
                const display = col.format
                  ? col.format(raw, item)
                  : String(raw ?? "—");
                const cellColor = col.colorFn
                  ? col.colorFn(item) ?? colors.textPrimary
                  : col.key === "symbol"
                  ? colors.accentSecondary
                  : colors.textPrimary;

                return (
                  <Text
                    key={col.key}
                    style={[
                      ts.dataCell,
                      {
                        width: col.width,
                        textAlign: col.align ?? "left",
                        color: cellColor,
                        fontWeight: col.key === "symbol" ? "700" : "400",
                      },
                    ]}
                    numberOfLines={1}
                  >
                    {display}
                  </Text>
                );
              })}
            </View>
          ))}

          {holdings.length === 0 && (
            <View style={ts.emptyRow}>
              <Text style={{ color: colors.textMuted, fontSize: 14 }}>
                No holdings to display.
              </Text>
            </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const ts = StyleSheet.create({
  wrapper: {
    flex: 1,
  },
  toolbar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  tableTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  csvBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  csvText: {
    fontSize: 13,
    fontWeight: "600",
  },
  headerRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  headerCell: {
    fontSize: 12,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    paddingHorizontal: 4,
  },
  dataRow: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dataCell: {
    fontSize: 13,
    paddingHorizontal: 4,
  },
  emptyRow: {
    padding: 24,
    alignItems: "center",
  },
});
