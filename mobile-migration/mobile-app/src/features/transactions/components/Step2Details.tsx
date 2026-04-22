import { DateInput, FormField, NumberInput, TextInput } from "@/components/form";
import type { StockListEntry } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import { Controller, useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";
import type { TxnFormValues } from "../transactionSchema";
import { StockPicker } from "./StockPicker";

interface Step2DetailsProps {
  filteredStocks: StockListEntry[];
  onSelectStock: (stock: StockListEntry) => void;
  searchText: string;
  onSearchTextChange: (text: string) => void;
  showAdvanced: boolean;
  onToggleAdvanced: () => void;
}

export function Step2Details({
  filteredStocks, onSelectStock, searchText, onSearchTextChange,
  showAdvanced, onToggleAdvanced,
}: Step2DetailsProps) {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const { control, watch, formState: { errors } } = useFormContext<TxnFormValues>();

  const txnType = watch("txn_type");
  const isDividendOnly = txnType === "Dividend Only";
  const isBuy = txnType === "Buy";
  const isSell = txnType === "Sell";

  return (
    <>
      <StockPicker
        filteredStocks={filteredStocks}
        onSelectStock={onSelectStock}
        searchText={searchText}
        onSearchTextChange={onSearchTextChange}
      />

      {/* ── Date ──────────────────────────────── */}
      <FormField label={t("addTransaction.date")} required error={errors.txn_date?.message}>
        <Controller control={control} name="txn_date" render={({ field: { value, onChange } }) => (
          <DateInput value={value} onChangeText={onChange} hasError={!!errors.txn_date} />
        )} />
      </FormField>

      {/* ── Shares (Buy/Sell only) ────────────── */}
      {!isDividendOnly && (
        <FormField label={t("addTransaction.shares")} required error={errors.shares?.message}>
          <Controller control={control} name="shares" render={({ field: { value, onChange } }) => (
            <NumberInput
              value={value != null ? String(value) : ""}
              onChangeText={(tx) => onChange(tx === "" ? undefined : tx)}
              placeholder="0"
              hasError={!!errors.shares}
            />
          )} />
        </FormField>
      )}

      {/* ── Purchase Cost (Buy only) ──────────── */}
      {isBuy && (
        <FormField label={t("addTransaction.purchaseCost")} required error={errors.purchase_cost?.message}>
          <Controller control={control} name="purchase_cost" render={({ field: { value, onChange } }) => (
            <NumberInput
              value={value != null && value !== "" ? String(value) : ""}
              onChangeText={(tx) => onChange(tx)}
              placeholder={t("addTransaction.totalCost")}
              suffix="KWD"
              hasError={!!errors.purchase_cost}
            />
          )} />
        </FormField>
      )}

      {/* ── Sell Value (Sell only) ────────────── */}
      {isSell && (
        <FormField label={t("addTransaction.sellValue")} required error={errors.sell_value?.message}>
          <Controller control={control} name="sell_value" render={({ field: { value, onChange } }) => (
            <NumberInput
              value={value != null && value !== "" ? String(value) : ""}
              onChangeText={(tx) => onChange(tx)}
              placeholder={t("addTransaction.totalProceeds")}
              suffix="KWD"
              hasError={!!errors.sell_value}
            />
          )} />
        </FormField>
      )}

      {/* ── Dividend / Income Fields ─────────── */}
      <View style={[styles.groupHeader, { borderColor: colors.borderColor }]}>
        <FontAwesome name="money" size={13} color={colors.accentTertiary ?? colors.accentSecondary} />
        <Text style={[styles.groupTitle, { color: colors.textPrimary }]}>
          {isDividendOnly ? t("addTransaction.dividendDetails") : t("addTransaction.dividendBonusOptional")}
        </Text>
      </View>

      <FormField
        label={isDividendOnly ? t("addTransaction.cashDividendKD") : t("addTransaction.cashDividend")}
        required={isDividendOnly}
        error={errors.cash_dividend?.message}
      >
        <Controller control={control} name="cash_dividend" render={({ field: { value, onChange } }) => (
          <NumberInput
            value={value != null && value !== "" ? String(value) : ""}
            onChangeText={(tx) => onChange(tx)}
            placeholder="0.000" suffix="KWD" hasError={!!errors.cash_dividend}
          />
        )} />
      </FormField>

      <FormField label={t("addTransaction.reinvestedDividend")} error={errors.reinvested_dividend?.message}>
        <Controller control={control} name="reinvested_dividend" render={({ field: { value, onChange } }) => (
          <NumberInput
            value={value != null && value !== "" ? String(value) : ""}
            onChangeText={(tx) => onChange(tx)}
            placeholder="0.000" suffix="KWD"
          />
        )} />
      </FormField>

      <FormField label={t("addTransaction.bonusShares")} error={errors.bonus_shares?.message}>
        <Controller control={control} name="bonus_shares" render={({ field: { value, onChange } }) => (
          <NumberInput
            value={value != null && value !== "" ? String(value) : ""}
            onChangeText={(tx) => onChange(tx)}
            placeholder="0"
          />
        )} />
      </FormField>

      {/* ── Advanced Section (Buy/Sell only) ── */}
      {!isDividendOnly && (
        <>
          <Pressable
            onPress={onToggleAdvanced}
            style={[styles.advancedToggle, { borderColor: colors.borderColor }]}
          >
            <Text style={[styles.advancedLabel, { color: colors.textSecondary }]}>
              {t("addTransaction.advancedFields")}
            </Text>
            <FontAwesome
              name={showAdvanced ? "chevron-up" : "chevron-down"}
              size={14} color={colors.textSecondary}
            />
          </Pressable>

          {showAdvanced && (
            <View style={styles.advancedSection}>
              <FormField label={t("addTransaction.fees")} error={errors.fees?.message}>
                <Controller control={control} name="fees" render={({ field: { value, onChange } }) => (
                  <NumberInput
                    value={value != null && value !== "" ? String(value) : ""}
                    onChangeText={(tx) => onChange(tx)} placeholder="0.000" suffix="KWD"
                  />
                )} />
              </FormField>

              <FormField label={t("addTransaction.priceOverride")} error={errors.price_override?.message}>
                <Controller control={control} name="price_override" render={({ field: { value, onChange } }) => (
                  <NumberInput
                    value={value != null && value !== "" ? String(value) : ""}
                    onChangeText={(tx) => onChange(tx)} placeholder="0.000000"
                  />
                )} />
              </FormField>

              <FormField label={t("addTransaction.plannedCumShares")} error={errors.planned_cum_shares?.message}>
                <Controller control={control} name="planned_cum_shares" render={({ field: { value, onChange } }) => (
                  <NumberInput
                    value={value != null && value !== "" ? String(value) : ""}
                    onChangeText={(tx) => onChange(tx)} placeholder="0"
                  />
                )} />
              </FormField>

              <FormField label={t("addTransaction.broker")} error={errors.broker?.message}>
                <Controller control={control} name="broker" render={({ field: { value, onChange } }) => (
                  <TextInput value={value ?? ""} onChangeText={onChange} placeholder={t("addTransaction.brokerExample")} />
                )} />
              </FormField>

              <FormField label={t("addTransaction.reference")} error={errors.reference?.message}>
                <Controller control={control} name="reference" render={({ field: { value, onChange } }) => (
                  <TextInput value={value ?? ""} onChangeText={onChange} placeholder={t("addTransaction.orderReceipt")} />
                )} />
              </FormField>
            </View>
          )}
        </>
      )}

      {/* ── Notes ────────────────────────────── */}
      <FormField label={t("addTransaction.notesLabel")} error={errors.notes?.message}>
        <Controller control={control} name="notes" render={({ field: { value, onChange } }) => (
          <TextInput
            value={value ?? ""} onChangeText={onChange}
            placeholder={t("addTransaction.optionalNotes")} multiline numberOfLines={3}
          />
        )} />
      </FormField>
    </>
  );
}

const styles = StyleSheet.create({
  groupHeader: {
    flexDirection: "row", alignItems: "center", gap: 8,
    paddingVertical: 10, marginTop: 8, borderTopWidth: 1, marginBottom: 4,
  },
  groupTitle: { fontSize: 14, fontWeight: "700" },
  advancedToggle: {
    flexDirection: "row", justifyContent: "space-between", alignItems: "center",
    paddingVertical: 12, borderTopWidth: 1, marginTop: 8, marginBottom: 8,
  },
  advancedLabel: { fontSize: 14, fontWeight: "600" },
  advancedSection: { marginBottom: 8 },
});
