/**
 * HoldingsDataGrid — Table sub-components (HeaderCell, DataCell, TotalCell, HoldingRow)
 * extracted from holdings.tsx for the 300-line split rule.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useTranslation } from "react-i18next";

import type { ThemePalette } from "@/constants/theme";
import { fmtNum } from "@/lib/currency";
import type { Holding } from "@/services/api";
import {
  type ColDef,
  type SortDir,
  TABLE_COLUMNS,
  fmtCell,
  getCellValue,
  getUsdOriginal,
} from "../hooks/useHoldingsView";

// ── Header cell ─────────────────────────────────────────────────────

export function HeaderCell({
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
      accessibilityLabel={t("holdingsScreen.sortBy", { label: translatedLabel })}
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

// ── Data cell ───────────────────────────────────────────────────────

export function DataCell({
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

// ── Total cell ──────────────────────────────────────────────────────

export function TotalCell({
  col,
  totals,
  colors,
}: {
  col: ColDef;
  totals: Record<string, number>;
  colors: ThemePalette;
}) {
  const { t } = useTranslation();
  if (col.key === "company") {
    return (
      <View style={[ts.dataCell, { width: col.width }]}>
        <Text style={[ts.cellText, { color: colors.accentPrimary, fontWeight: "800" }]}>
          {t("holdingsScreen.total")}
        </Text>
      </View>
    );
  }

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
          { color, fontWeight: bold ? "800" : "700", textAlign: col.align },
        ]}
        numberOfLines={1}
      >
        {text}
      </Text>
    </View>
  );
}

// ── Holding row ─────────────────────────────────────────────────────

export function HoldingRow({
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
            accessibilityLabel={t("holdingsScreen.viewDetails", { company: holding.company })}
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
        ),
      )}
    </View>
  );
}

// ── Table styles ────────────────────────────────────────────────────

export const ts = StyleSheet.create({
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
