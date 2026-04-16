import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import { useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { TxnFormValues } from "../transactionSchema";

interface Step3ReviewProps {
  onEditStep: (step: number) => void;
}

export function Step3Review({ onEditStep }: Step3ReviewProps) {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const { getValues } = useFormContext<TxnFormValues>();
  const v = getValues();

  const isDividendOnly = v.txn_type === "Dividend Only";
  const isBuy = v.txn_type === "Buy";
  const isSell = v.txn_type === "Sell";

  const fmt = (val: unknown): string => {
    if (val == null || val === "") return "—";
    return String(val);
  };

  const rows: { label: string; value: string; visible?: boolean }[] = [
    { label: t("addTransaction.portfolio"), value: v.portfolio },
    { label: t("addTransaction.transactionType"), value: v.txn_type },
    { label: t("addTransaction.stockSymbol"), value: v.stock_symbol },
    { label: t("addTransaction.date"), value: v.txn_date },
    { label: t("addTransaction.shares"), value: fmt(v.shares), visible: !isDividendOnly },
    { label: t("addTransaction.purchaseCost"), value: fmt(v.purchase_cost), visible: isBuy },
    { label: t("addTransaction.sellValue"), value: fmt(v.sell_value), visible: isSell },
    { label: t("addTransaction.cashDividend"), value: fmt(v.cash_dividend) },
    { label: t("addTransaction.reinvestedDividend"), value: fmt(v.reinvested_dividend) },
    { label: t("addTransaction.bonusShares"), value: fmt(v.bonus_shares) },
    { label: t("addTransaction.fees"), value: fmt(v.fees), visible: !isDividendOnly },
    { label: t("addTransaction.priceOverride"), value: fmt(v.price_override), visible: !isDividendOnly },
    { label: t("addTransaction.plannedCumShares"), value: fmt(v.planned_cum_shares), visible: !isDividendOnly },
    { label: t("addTransaction.broker"), value: fmt(v.broker), visible: !isDividendOnly },
    { label: t("addTransaction.reference"), value: fmt(v.reference), visible: !isDividendOnly },
    { label: t("addTransaction.notesLabel"), value: fmt(v.notes) },
  ];

  const visibleRows = rows.filter((r) => r.visible !== false);

  return (
    <View>
      <View style={styles.editRow}>
        <Pressable
          onPress={() => onEditStep(1)}
          style={[styles.editBtn, { backgroundColor: colors.bgSecondary }]}
        >
          <FontAwesome name="pencil" size={12} color={colors.accentPrimary} />
          <Text style={[styles.editText, { color: colors.accentPrimary }]}>
            {t("addTransaction.transactionType")}
          </Text>
        </Pressable>
        <Pressable
          onPress={() => onEditStep(2)}
          style={[styles.editBtn, { backgroundColor: colors.bgSecondary }]}
        >
          <FontAwesome name="pencil" size={12} color={colors.accentPrimary} />
          <Text style={[styles.editText, { color: colors.accentPrimary }]}>
            {t("addTransaction.editDetails")}
          </Text>
        </Pressable>
      </View>

      {visibleRows.map((row) => (
        <View key={row.label} style={[styles.row, { borderBottomColor: colors.borderColor }]}>
          <Text style={[styles.rowLabel, { color: colors.textSecondary }]}>{row.label}</Text>
          <Text
            style={[styles.rowValue, { color: row.value === "—" ? colors.textMuted : colors.textPrimary }]}
          >
            {row.value}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  editRow: { flexDirection: "row", gap: 8, marginBottom: 16 },
  editBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 12, paddingVertical: 8, borderRadius: 8,
  },
  editText: { fontSize: 13, fontWeight: "600" },
  row: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 10, borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rowLabel: { fontSize: 14, fontWeight: "500", flex: 1 },
  rowValue: { fontSize: 14, fontWeight: "600", flex: 1, textAlign: "right" },
});
