import { FormField, TextInput } from "@/components/form";
import type { StockListEntry } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useState } from "react";
import { Controller, useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import type { TxnFormValues } from "../transactionSchema";

interface StockPickerProps {
  filteredStocks: StockListEntry[];
  onSelectStock: (stock: StockListEntry) => void;
  searchText: string;
  onSearchTextChange: (text: string) => void;
}

export function StockPicker({
  filteredStocks,
  onSelectStock,
  searchText,
  onSearchTextChange,
}: StockPickerProps) {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const { control, formState: { errors } } = useFormContext<TxnFormValues>();
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <FormField label={t("addTransaction.stockSymbol")} required error={errors.stock_symbol?.message}>
      <Controller
        control={control}
        name="stock_symbol"
        render={({ field: { value, onChange } }) => (
          <View>
            <Pressable
              onPress={() => setShowDropdown(!showDropdown)}
              style={[
                styles.pickerBtn,
                {
                  backgroundColor: colors.bgInput ?? colors.bgSecondary,
                  borderColor: errors.stock_symbol ? colors.danger : colors.borderColor,
                },
              ]}
            >
              <FontAwesome name="search" size={14} color={colors.textMuted} />
              <Text
                style={[styles.pickerText, { color: value ? colors.textPrimary : colors.textMuted }]}
                numberOfLines={1}
              >
                {value || t("addTransaction.selectOrType")}
              </Text>
              <FontAwesome
                name={showDropdown ? "chevron-up" : "chevron-down"}
                size={12}
                color={colors.textMuted}
              />
            </Pressable>

            {showDropdown && (
              <View style={[styles.dropdown, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                <TextInput
                  value={searchText}
                  onChangeText={onSearchTextChange}
                  placeholder={t("addTransaction.searchStocks")}
                  autoFocus
                  autoCapitalize="characters"
                />

                {filteredStocks.length > 0 ? (
                  <ScrollView style={{ maxHeight: 220 }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                    {filteredStocks.map((stock) => (
                      <Pressable
                        key={stock.symbol}
                        onPress={() => {
                          onChange(stock.symbol);
                          onSelectStock(stock);
                          setShowDropdown(false);
                          onSearchTextChange("");
                        }}
                        style={[
                          styles.option,
                          {
                            backgroundColor: value === stock.symbol ? colors.accentPrimary + "18" : "transparent",
                            borderBottomColor: colors.borderColor,
                          },
                        ]}
                      >
                        <Text style={[styles.symbol, { color: colors.textPrimary }]}>{stock.symbol}</Text>
                        <Text style={[styles.name, { color: colors.textSecondary }]} numberOfLines={1}>
                          {stock.name}
                        </Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                ) : (
                  <Text style={[styles.empty, { color: colors.textMuted }]}>
                    {t("addTransaction.noStocksFound")}
                  </Text>
                )}

                <View style={styles.manualRow}>
                  <TextInput
                    value={value}
                    onChangeText={(tx) => onChange(tx.toUpperCase().trim())}
                    placeholder={t("addTransaction.typeManually")}
                    autoCapitalize="characters"
                    hasError={!!errors.stock_symbol}
                  />
                </View>
              </View>
            )}
          </View>
        )}
      />
    </FormField>
  );
}

const styles = StyleSheet.create({
  pickerBtn: {
    flexDirection: "row", alignItems: "center", borderRadius: 10,
    borderWidth: 1, paddingHorizontal: 12, paddingVertical: 12, gap: 8,
  },
  pickerText: { flex: 1, fontSize: 14, fontWeight: "500" },
  dropdown: { borderRadius: 10, borderWidth: 1, marginTop: 6, padding: 10, gap: 6 },
  option: {
    flexDirection: "row", alignItems: "center", paddingVertical: 10,
    paddingHorizontal: 8, borderBottomWidth: StyleSheet.hairlineWidth, gap: 8,
  },
  symbol: { fontSize: 14, fontWeight: "700", minWidth: 80 },
  name: { flex: 1, fontSize: 12 },
  empty: { fontSize: 13, textAlign: "center", paddingVertical: 12, fontStyle: "italic" },
  manualRow: { marginTop: 6 },
});
