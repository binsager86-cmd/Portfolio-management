/**
 * Realized Trades Breakdown — expandable section showing
 * summary metrics, per-stock aggregation, and recent trades table.
 */

import { MetricCard } from "@/components/ui/MetricCard";
import type { ThemePalette } from "@/constants/theme";
import { formatCurrency, formatSignedCurrency } from "@/lib/currency";
import type { RealizedProfitData } from "@/services/api";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

export function RealizedTradesSection({
  data,
  colors,
  fonts,
  isPhone,
}: {
  data: RealizedProfitData;
  colors: ThemePalette;
  fonts: { caption: number };
  isPhone: boolean;
}) {
  const [expanded, setExpanded] = useState(false);
  const { t } = useTranslation();

  // Summary by stock
  const byStock = useMemo(() => {
    if (!data?.details) return [];
    const map: Record<string, { symbol: string; trades: number; profit: number; loss: number; net: number }> = {};
    for (const d of data.details) {
      if (!map[d.symbol]) {
        map[d.symbol] = { symbol: d.symbol, trades: 0, profit: 0, loss: 0, net: 0 };
      }
      map[d.symbol].trades++;
      if (d.realized_pnl_kwd >= 0) map[d.symbol].profit += d.realized_pnl_kwd;
      else map[d.symbol].loss += d.realized_pnl_kwd;
      map[d.symbol].net += d.realized_pnl_kwd;
    }
    return Object.values(map).sort((a, b) => b.net - a.net);
  }, [data?.details]);

  const { profitCount, lossCount } = useMemo(() => {
    const details = data?.details;
    if (!details) return { profitCount: 0, lossCount: 0 };
    let wins = 0, losses = 0;
    for (const d of details) {
      if (d.realized_pnl > 0) wins++;
      else if (d.realized_pnl < 0) losses++;
    }
    return { profitCount: wins, lossCount: losses };
  }, [data?.details]);

  return (
    <View style={s.mb16}>
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={s.toggleRow}
      >
        <FontAwesome
          name={expanded ? "chevron-down" : "chevron-right"}
          size={12}
          color={colors.textSecondary}
        />
        <Text
          style={[
            s.sectionTitle,
            { color: colors.textSecondary, fontSize: Math.max(fonts.caption, 13), marginBottom: 0, marginTop: 0 },
          ]}
        >
          {t("realizedTrades.breakdown")}
        </Text>
        <View style={s.toggleBadges}>
          <Text style={[s.badge, { color: colors.success }]}>
            {profitCount} {t("realizedTrades.wins")}
          </Text>
          <Text style={[s.badge, { color: colors.danger }]}>
            {lossCount} {t("realizedTrades.losses")}
          </Text>
        </View>
      </Pressable>

      {expanded && (
        <View>
          {/* Summary row */}
          <View
            style={[
              s.grid,
              { gap: 8, marginBottom: 12 },
            ]}
          >
            <MetricCard
              label={t("realizedTrades.totalTrades")}
              value={`${data?.details?.length ?? 0}`}
              subline={`${profitCount}W / ${lossCount}L`}
              icon="exchange"
              accentColor={colors.accentPrimary}
              width={isPhone ? "48%" : "24%"}
            />
            <MetricCard
              label={t("realizedTrades.totalRealized")}
              value={formatSignedCurrency(data.total_realized_kwd)}
              subline={t("realizedTrades.netPL") + " (KWD)"}
              trend={data.total_realized_kwd >= 0 ? "up" : "down"}
              width={isPhone ? "48%" : "24%"}
            />
            <MetricCard
              label={t("realizedTrades.grossGains")}
              value={formatCurrency(data.total_profit_kwd)}
              subline={t("realizedTrades.winningTrades")}
              accentColor={colors.success}
              width={isPhone ? "48%" : "24%"}
            />
            <MetricCard
              label={t("realizedTrades.grossLosses")}
              value={formatCurrency(Math.abs(data.total_loss_kwd))}
              subline={t("realizedTrades.losingTrades")}
              accentColor={colors.danger}
              width={isPhone ? "48%" : "24%"}
            />
          </View>

          {/* Summary by stock table */}
          <Text style={[s.tableLabel, { color: colors.textSecondary }]}>
            {t("realizedTrades.summaryByStock")}
          </Text>
          <View style={[s.tableContainer, { borderColor: colors.borderColor, marginBottom: 12 }]}>
            {/* Header */}
            <View style={[s.headerRow, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderColor }]}>
              <Text style={[s.headerCellWide, { color: colors.textSecondary }]}>{t("realizedTrades.symbol")}</Text>
              <Text style={[s.headerCell, { color: colors.textSecondary }]}>{t("realizedTrades.trades")}</Text>
              <Text style={[s.headerCellMed, { color: colors.textSecondary }]}>{t("realizedTrades.gains")}</Text>
              <Text style={[s.headerCellMed, { color: colors.textSecondary }]}>{t("realizedTrades.losses")}</Text>
              <Text style={[s.headerCellMed, { color: colors.textSecondary }]}>{t("realizedTrades.netPL")}</Text>
            </View>
            {/* Rows */}
            {byStock.map((row, idx) => (
              <View
                key={row.symbol}
                style={[
                  s.dataRow,
                  { borderBottomWidth: idx < byStock.length - 1 ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.borderColor, backgroundColor: idx % 2 === 0 ? "transparent" : colors.bgCardHover + "20" },
                ]}
              >
                <Text style={[s.cellWide, { color: colors.textPrimary, fontWeight: "600" }]}>{row.symbol}</Text>
                <Text style={[s.cell, { color: colors.textSecondary }]}>{row.trades}</Text>
                <Text style={[s.cellMed, { color: colors.success }]}>{formatCurrency(row.profit)}</Text>
                <Text style={[s.cellMed, { color: colors.danger }]}>{formatCurrency(Math.abs(row.loss))}</Text>
                <Text style={[s.cellMed, { color: row.net >= 0 ? colors.success : colors.danger, fontWeight: "600" }]}>
                  {row.net >= 0 ? "+" : ""}{formatCurrency(row.net)}
                </Text>
              </View>
            ))}
          </View>

          {/* Detailed trades table */}
          <Text style={[s.tableLabel, { color: colors.textSecondary }]}>
            {t("realizedTrades.recentTrades", { shown: Math.min(30, data?.details?.length ?? 0), total: data?.details?.length ?? 0 })}
          </Text>
          <View style={[s.tableContainer, { borderColor: colors.borderColor }]}>
            {/* Header */}
            <View style={[s.headerRow, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderColor }]}>
              <Text style={[s.headerCellMed, { color: colors.textSecondary }]}>{t("realizedTrades.symbol")}</Text>
              <Text style={[s.headerCellMed, { color: colors.textSecondary }]}>{t("realizedTrades.date")}</Text>
              <Text style={[s.headerCell, { color: colors.textSecondary }]}>{t("realizedTrades.shares")}</Text>
              <Text style={[s.headerCellMed, { color: colors.textSecondary }]}>{t("realizedTrades.plKWD")}</Text>
            </View>
            {(data?.details ?? []).slice(0, 30).map((d, idx) => (
              <View
                key={d.id}
                style={[
                  s.dataRow,
                  { borderBottomWidth: idx < Math.min(29, (data?.details?.length ?? 1) - 1) ? StyleSheet.hairlineWidth : 0, borderBottomColor: colors.borderColor, backgroundColor: idx % 2 === 0 ? "transparent" : colors.bgCardHover + "20" },
                ]}
              >
                <Text style={[s.cellMed, { color: colors.textPrimary, fontWeight: "500", fontSize: 12 }]}>{d.symbol}</Text>
                <Text style={[s.cellMed, { color: colors.textSecondary, fontSize: 12 }]}>{d.txn_date}</Text>
                <Text style={[s.cell, { color: colors.textSecondary, fontSize: 12 }]}>{d.shares.toLocaleString()}</Text>
                <Text style={[s.cellMed, { color: d.realized_pnl_kwd >= 0 ? colors.success : colors.danger, fontWeight: "600", fontSize: 12 }]}>
                  {d.realized_pnl_kwd >= 0 ? "+" : ""}{formatCurrency(d.realized_pnl_kwd)}
                </Text>
              </View>
            ))}
          </View>
        </View>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  mb16: { marginBottom: 16 },
  toggleRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
    gap: 8,
  },
  toggleBadges: { flexDirection: "row", gap: 8, marginLeft: "auto" },
  badge: { fontSize: 12, fontWeight: "600" },
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
    marginTop: 4,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "space-between",
    rowGap: 12,
    marginBottom: 24,
  },
  tableLabel: {
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  tableContainer: {
    borderWidth: 1,
    borderRadius: 8,
    overflow: "hidden",
  },
  headerRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderBottomWidth: 1,
  },
  headerCellWide: { flex: 2, fontSize: 11, fontWeight: "700" },
  headerCell: { flex: 1, fontSize: 11, fontWeight: "700", textAlign: "right" },
  headerCellMed: { flex: 1.5, fontSize: 11, fontWeight: "700", textAlign: "right" },
  dataRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 12,
  },
  cellWide: { flex: 2, fontSize: 13 },
  cell: { flex: 1, fontSize: 13, textAlign: "right" },
  cellMed: { flex: 1.5, fontSize: 13, textAlign: "right" },
});
