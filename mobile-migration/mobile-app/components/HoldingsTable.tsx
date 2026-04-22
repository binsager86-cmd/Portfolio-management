/**
 * HoldingsTable — responsive data table for holdings.
 *
 * Web/Desktop: full-width HTML-style table with sticky header.
 * Mobile:      horizontally scrollable table.
 *
 * Includes a CSV download button (web) / share button (native).
 */

import ShariaBadge from "@/components/ui/ShariaBadge";
import type { ThemePalette } from "@/constants/theme";
import { fmt } from "@/lib/currency";
import { todayISO } from "@/lib/dateUtils";
import { getMusaffaStatus } from "@/lib/shariaCompliance";
import { createAlertRule, loadAlertRules, saveAlertRules } from "@/services/alerts/alertRules";
import type { Holding } from "@/services/api";
import { useUserPrefsStore } from "@/src/store/userPrefsStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Alert,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

// ── Column definitions ──────────────────────────────────────────────

interface Column {
  key: keyof Holding | "pnl_pct_display" | "sharia_status" | "actions";
  label: string;
  width: number;
  align?: "left" | "right" | "center";
  format?: (v: unknown, item: Holding) => string;
  colorFn?: (item: Holding) => string | undefined;
  /** If true, column renders a custom component instead of text. */
  custom?: boolean;
}

type HoldingWithSharia = Holding & { sharia_status?: string | null };

function isHoldingKey(key: Column["key"]): key is keyof Holding {
  return key !== "pnl_pct_display" && key !== "sharia_status" && key !== "actions";
}

function toNum(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  if (typeof v === "string" && v.trim() !== "") {
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function pnlColor(n: number, c: ThemePalette): string | undefined {
  if (n > 0) return c.success;
  if (n < 0) return c.danger;
  return undefined;
}

const COLUMNS: (colors: ThemePalette) => Column[] = (colors) => [
  { key: "symbol", label: "holdings.symbol", width: 100, align: "left" },
  { key: "company", label: "holdings.company", width: 160, align: "left" },
  {
    key: "shares_qty",
    label: "holdings.shares",
    width: 80,
    align: "right",
    format: (v) => fmt(toNum(v), 0),
  },
  {
    key: "avg_cost",
    label: "holdings.avgCost",
    width: 90,
    align: "right",
    format: (v) => fmt(toNum(v), 3),
  },
  {
    key: "market_price",
    label: "holdings.price",
    width: 90,
    align: "right",
    format: (v) => fmt(toNum(v), 3),
  },
  {
    key: "total_cost",
    label: "holdings.cost",
    width: 100,
    align: "right",
    format: (v) => fmt(toNum(v), 2),
  },
  {
    key: "market_value",
    label: "holdings.mktValue",
    width: 110,
    align: "right",
    format: (v) => fmt(toNum(v), 2),
  },
  {
    key: "unrealized_pnl",
    label: "holdings.unrealPL",
    width: 110,
    align: "right",
    format: (v) => fmt(toNum(v), 2),
    colorFn: (item) => pnlColor(item.unrealized_pnl, colors),
  },
  {
    key: "realized_pnl",
    label: "holdings.realPL",
    width: 100,
    align: "right",
    format: (v) => fmt(toNum(v), 2),
    colorFn: (item) => pnlColor(item.realized_pnl, colors),
  },
  {
    key: "total_pnl",
    label: "holdings.totalPL",
    width: 110,
    align: "right",
    format: (v) => fmt(toNum(v), 2),
    colorFn: (item) => pnlColor(item.total_pnl, colors),
  },
  {
    key: "pnl_pct_display",
    label: "holdings.pctChange",
    width: 80,
    align: "right",
    format: (_v, item) => `${(item.pnl_pct * 100).toFixed(1)}%`,
    colorFn: (item) => pnlColor(item.pnl_pct, colors),
  },
  {
    key: "cash_dividends",
    label: "holdings.dividends",
    width: 100,
    align: "right",
    format: (v) => fmt(toNum(v), 2),
  },
  {
    key: "market_value_kwd",
    label: "holdings.mktValueKWD",
    width: 120,
    align: "right",
    format: (v) => fmt(toNum(v), 2),
  },
  {
    key: "currency",
    label: "holdings.currency",
    width: 55,
    align: "left",
  },
];

// ── CSV Download ────────────────────────────────────────────────────

function generateCSV(holdings: Holding[], columns: Column[], t: (key: string) => string): string {
  const header = columns.map((c) => t(c.label)).join(",");
  const rows = holdings.map((item) =>
    columns
      .map((col) => {
        const raw =
          col.key === "pnl_pct_display"
            ? `${(item.pnl_pct * 100).toFixed(1)}%`
            : isHoldingKey(col.key)
              ? item[col.key]
              : "";
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
  /** Called when a price alert is created from row action */
  onAlertCreated?: (symbol: string) => void;
}

export default function HoldingsTable({
  holdings,
  colors,
  filterLabel = "All",
  onAlertCreated,
}: HoldingsTableProps) {
  const { t } = useTranslation();
  const enableShariaFilter = useUserPrefsStore((s) => s.preferences.enableShariaFilter);
  const dividendFocus = useUserPrefsStore((s) => s.preferences.dividendFocus);
  const [menuSymbol, setMenuSymbol] = useState<string | null>(null);
  const [alertModalSymbol, setAlertModalSymbol] = useState<string | null>(null);
  const [alertThreshold, setAlertThreshold] = useState("");
  const [alertCondition, setAlertCondition] = useState<"price-above" | "price-below">("price-below");

  const columns = useMemo(() => {
    const base = COLUMNS(colors);
    if (enableShariaFilter) {
      const symbolIdx = base.findIndex((c) => c.key === "symbol");
      base.splice(symbolIdx + 1, 0, {
        key: "sharia_status",
        label: "holdings.shariaStatus",
        width: 110,
        align: "left",
        custom: true,
      });
    }
    if (dividendFocus) {
      // Insert yield column after dividends column
      const divIdx = base.findIndex((c) => c.key === "cash_dividends");
      if (divIdx >= 0) {
        base.splice(divIdx + 1, 0, {
          key: "dividend_yield_on_cost_pct",
          label: "holdings.yieldPct",
          width: 80,
          align: "right",
          format: (v) => v != null ? `${Number(v).toFixed(2)}%` : "—",
        });
      }
    }
    // Always add actions column at the end
    base.push({
      key: "actions",
      label: "",
      width: 44,
      align: "center",
      custom: true,
    });
    return base;
  }, [colors, enableShariaFilter, dividendFocus]);

  const totalWidth = useMemo(() => columns.reduce((a, c) => a + c.width, 0), [columns]);

  // When Sharia filter is on, only show compliant + unrated holdings (hide non-compliant)
  const filteredHoldings = useMemo(() => {
    let result = enableShariaFilter
      ? holdings.filter((h) => {
          // Musaffa override takes priority over backend status
          const status = getMusaffaStatus(h.symbol) ?? (h as HoldingWithSharia).sharia_status;
          return status !== "non-compliant";
        })
      : holdings;
    // When dividend focus is on, sort by dividend yield descending
    if (dividendFocus) {
      result = [...result].sort(
        (a, b) => (b.dividend_yield_on_cost_pct || 0) - (a.dividend_yield_on_cost_pct || 0),
      );
    }
    return result;
  }, [holdings, enableShariaFilter, dividendFocus]);

  const handleDownload = () => {
    const csv = generateCSV(filteredHoldings, columns, t);
    downloadCSV(csv, `holdings_${filterLabel}_${todayISO()}.csv`);
  };

  return (
    <View style={ts.wrapper}>
      {/* Toolbar */}
      <View style={[ts.toolbar, { borderBottomColor: colors.borderColor }]}>
        <Text style={[ts.tableTitle, { color: colors.textPrimary }]}>
          Holdings Data ({filteredHoldings.length})
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
                {col.label ? t(col.label) : ''}
              </Text>
            ))}
          </View>

          {/* Data rows */}
          {filteredHoldings.map((item, idx) => (
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
                if (col.custom && col.key === "sharia_status") {
                  return (
                    <View key={col.key} style={{ width: col.width, justifyContent: "center", paddingHorizontal: 4 }}>
                      <ShariaBadge
                        status={(item as HoldingWithSharia).sharia_status}
                        symbol={item.symbol}
                        compact
                        colors={colors}
                      />
                    </View>
                  );
                }

                if (col.custom && col.key === "actions") {
                  return (
                    <View key={col.key} style={{ width: col.width, alignItems: "center", justifyContent: "center" }}>
                      <Pressable
                        onPress={() =>
                          setMenuSymbol(menuSymbol === item.symbol ? null : item.symbol)
                        }
                        style={ts.menuBtn}
                        accessibilityLabel={`Actions for ${item.symbol}`}
                      >
                        <FontAwesome
                          name="ellipsis-v"
                          size={16}
                          color={colors.textMuted}
                        />
                      </Pressable>
                      {menuSymbol === item.symbol && (
                        <View
                          style={[
                            ts.menuPopup,
                            {
                              backgroundColor: colors.bgCard,
                              borderColor: colors.borderColor,
                            },
                          ]}
                        >
                          <Pressable
                            onPress={() => {
                              setMenuSymbol(null);
                              setAlertModalSymbol(item.symbol);
                              // Pre-suggest 5% below current price
                              const suggested = (item.market_price * 0.95).toFixed(3);
                              setAlertThreshold(suggested);
                              setAlertCondition("price-below");
                            }}
                            style={ts.menuItem}
                          >
                            <FontAwesome
                              name="bell"
                              size={13}
                              color={colors.accentPrimary}
                              style={{ marginRight: 8 }}
                            />
                            <Text style={[ts.menuItemText, { color: colors.textPrimary }]}>
                              Set Price Alert
                            </Text>
                          </Pressable>
                        </View>
                      )}
                    </View>
                  );
                }

                const raw =
                  col.key === "pnl_pct_display"
                    ? null
                    : isHoldingKey(col.key)
                      ? item[col.key]
                      : null;
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

      {/* Dismiss menu overlay */}
      {menuSymbol && (
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={() => setMenuSymbol(null)}
        />
      )}

      {/* ── Quick Alert Modal ── */}
      <Modal
        visible={alertModalSymbol !== null}
        animationType="fade"
        transparent
        onRequestClose={() => setAlertModalSymbol(null)}
      >
        <View style={ts.alertOverlay}>
          <View
            style={[
              ts.alertModal,
              { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
            ]}
          >
            <Text style={[ts.alertTitle, { color: colors.textPrimary }]}>
              Set Alert for {alertModalSymbol}
            </Text>

            {/* Condition toggle */}
            <View style={ts.alertCondRow}>
              {(["price-below", "price-above"] as const).map((cond) => (
                <Pressable
                  key={cond}
                  onPress={() => setAlertCondition(cond)}
                  style={[
                    ts.alertCondChip,
                    {
                      backgroundColor:
                        alertCondition === cond
                          ? colors.accentPrimary + "20"
                          : colors.bgSecondary,
                      borderColor:
                        alertCondition === cond
                          ? colors.accentPrimary
                          : colors.borderColor,
                    },
                  ]}
                >
                  <FontAwesome
                    name={cond === "price-below" ? "arrow-down" : "arrow-up"}
                    size={12}
                    color={
                      alertCondition === cond ? colors.accentPrimary : colors.textMuted
                    }
                  />
                  <Text
                    style={{
                      fontSize: 12,
                      fontWeight: "600",
                      color:
                        alertCondition === cond
                          ? colors.accentPrimary
                          : colors.textSecondary,
                    }}
                  >
                    {cond === "price-below" ? "Below" : "Above"}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Threshold input */}
            <Text style={[ts.alertFieldLabel, { color: colors.textSecondary }]}>
              Threshold Price
            </Text>
            <TextInput
              style={[
                ts.alertInput,
                {
                  backgroundColor: colors.bgSecondary,
                  color: colors.textPrimary,
                  borderColor: colors.borderColor,
                },
              ]}
              value={alertThreshold}
              onChangeText={setAlertThreshold}
              keyboardType="decimal-pad"
              placeholder="0.000"
              placeholderTextColor={colors.textMuted}
            />

            {/* Quick suggestions */}
            {alertModalSymbol && (
              <View style={ts.alertSuggestions}>
                {(() => {
                  const h = holdings.find((x) => x.symbol === alertModalSymbol);
                  if (!h) return null;
                  const suggestions = [
                    { label: "5% drop", val: (h.market_price * 0.95).toFixed(3) },
                    { label: "10% drop", val: (h.market_price * 0.9).toFixed(3) },
                    { label: "Avg cost", val: h.avg_cost.toFixed(3) },
                  ];
                  return suggestions.map((s) => (
                    <Pressable
                      key={s.label}
                      onPress={() => {
                        setAlertThreshold(s.val);
                        setAlertCondition("price-below");
                      }}
                      style={[
                        ts.alertSuggestChip,
                        {
                          backgroundColor: colors.bgSecondary,
                          borderColor: colors.borderColor,
                        },
                      ]}
                    >
                      <Text style={{ fontSize: 11, color: colors.textSecondary }}>
                        {s.label}: {s.val}
                      </Text>
                    </Pressable>
                  ));
                })()}
              </View>
            )}

            {/* Actions */}
            <View style={ts.alertActions}>
              <Pressable
                onPress={() => setAlertModalSymbol(null)}
                style={[
                  ts.alertBtn,
                  { borderColor: colors.borderColor, borderWidth: 1 },
                ]}
              >
                <Text style={{ fontSize: 14, fontWeight: "600", color: colors.textSecondary }}>
                  Cancel
                </Text>
              </Pressable>
              <Pressable
                onPress={async () => {
                  const num = parseFloat(alertThreshold);
                  if (isNaN(num) || num <= 0 || !alertModalSymbol) return;
                  const rule = createAlertRule({
                    symbol: alertModalSymbol,
                    condition: alertCondition,
                    threshold: num,
                    label: `${alertModalSymbol} ${alertCondition === "price-below" ? "drop" : "rise"} alert`,
                  });
                  const existing = await loadAlertRules();
                  await saveAlertRules([rule, ...existing]);
                  onAlertCreated?.(alertModalSymbol);
                  setAlertModalSymbol(null);
                  const msg = `Alert set: ${alertModalSymbol} ${alertCondition === "price-below" ? "below" : "above"} ${num.toFixed(3)}`;
                  if (Platform.OS === "web") {
                    window.alert(msg);
                  } else {
                    Alert.alert("Alert Created", msg);
                  }
                }}
                style={[ts.alertBtn, { backgroundColor: colors.accentPrimary }]}
              >
                <FontAwesome name="bell" size={13} color="#fff" style={{ marginRight: 6 }} />
                <Text style={{ fontSize: 14, fontWeight: "700", color: "#fff" }}>Save</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
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
  // ── Row action menu ──
  menuBtn: {
    width: 36,
    height: 36,
    alignItems: "center",
    justifyContent: "center",
  },
  menuPopup: {
    position: "absolute",
    top: 32,
    right: 0,
    minWidth: 160,
    borderRadius: 8,
    borderWidth: 1,
    paddingVertical: 4,
    zIndex: 100,
    elevation: 8,
    shadowColor: "#000",
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  menuItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  menuItemText: {
    fontSize: 13,
    fontWeight: "600",
  },
  // ── Quick Alert Modal ──
  alertOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    paddingHorizontal: 24,
  },
  alertModal: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
  },
  alertTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 14,
  },
  alertCondRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 10,
  },
  alertCondChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
    gap: 5,
  },
  alertFieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 4,
    marginTop: 8,
  },
  alertInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  alertSuggestions: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 10,
  },
  alertSuggestChip: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
  },
  alertActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 20,
  },
  alertBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 11,
    borderRadius: 8,
  },
});
