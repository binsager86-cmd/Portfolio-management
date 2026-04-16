/**
 * StockMergeModal — Full-screen modal for merging duplicate stocks.
 * Extracted from holdings.tsx for the 300-line split rule.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput as RNTextInput,
  View,
} from "react-native";

import type { ThemePalette } from "@/constants/theme";
import { useAllStocksForMerge } from "@/hooks/queries";
import { fmtNum } from "@/lib/currency";
import { showErrorAlert } from "@/lib/errorHandling";
import { type Holding, mergeStocks } from "@/services/api";

interface StockMergeModalProps {
  holding: Holding;
  colors: ThemePalette;
  onClose: () => void;
  onMerged: () => void;
}

export function StockMergeModal({ holding, colors, onClose, onMerged }: StockMergeModalProps) {
  const [mergeTargetId, setMergeTargetId] = useState<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const stocksQ = useAllStocksForMerge();
  const { t } = useTranslation();

  const allStocks = stocksQ.data?.stocks ?? [];

  const currentStock = allStocks.find(
    (s) => s.symbol.trim().toUpperCase() === holding.symbol.trim().toUpperCase(),
  );

  const mergeCandidates = useMemo(() => {
    const list = allStocks.filter(
      (s) => s.symbol.trim().toUpperCase() !== holding.symbol.trim().toUpperCase(),
    );
    if (!searchText.trim()) return list;
    const q = searchText.toLowerCase();
    return list.filter(
      (s) => s.symbol.toLowerCase().includes(q) || (s.name ?? "").toLowerCase().includes(q),
    );
  }, [allStocks, holding.symbol, searchText]);

  const mergeMutation = useMutation({
    mutationFn: () => {
      if (!mergeTargetId || !currentStock) throw new Error("Missing stock IDs");
      return mergeStocks(mergeTargetId, currentStock.id);
    },
    onSuccess: (result) => {
      Alert.alert(
        t("holdingsScreen.stocksMerged"),
        t("holdingsScreen.mergedMessage", {
          source: result.source_symbol,
          target: result.target_symbol,
          count: result.transactions_moved,
        }),
      );
      onMerged();
      onClose();
    },
    onError: (err: any) => {
      showErrorAlert(t("holdingsScreen.mergeFailed"), err);
    },
  });

  const handleMerge = () => {
    if (!mergeTargetId || !currentStock) return;
    const sourceStock = allStocks.find((s) => s.id === mergeTargetId);
    const sourceName = sourceStock
      ? `${sourceStock.symbol} (${sourceStock.name})`
      : "the selected stock";

    if (Platform.OS === "web") {
      if (
        window.confirm(
          t("holdingsScreen.mergeConfirmMessage", {
            source: sourceName,
            target: holding.company,
            symbol: holding.symbol,
          }),
        )
      ) {
        mergeMutation.mutate();
      }
    } else {
      Alert.alert(
        t("holdingsScreen.confirmMerge"),
        t("holdingsScreen.mergeConfirmMessage", {
          source: sourceName,
          target: holding.company,
          symbol: holding.symbol,
        }),
        [
          { text: t("holdingsScreen.cancel"), style: "cancel" },
          { text: t("holdingsScreen.merge"), style: "destructive", onPress: () => mergeMutation.mutate() },
        ],
      );
    }
  };

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={ms.overlay} onPress={onClose} accessibilityRole="button" accessibilityLabel={t("holdingsScreen.closeDialog")}>
        <Pressable
          style={[ms.box, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
          onPress={() => {}}
        >
          {/* Title */}
          <View style={ms.titleRow}>
            <Text style={[ms.title, { color: colors.textPrimary }]}>{holding.company}</Text>
            <Pressable onPress={onClose} hitSlop={12} style={{ padding: 6 }} accessibilityRole="button" accessibilityLabel={t("holdingsScreen.close")}>
              <FontAwesome name="times" size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          {/* Stock info */}
          <View style={[ms.infoCard, { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor }]}>
            <View style={ms.infoRow}>
              <Text style={[ms.infoLabel, { color: colors.textMuted }]}>{t("holdingsScreen.symbol")}</Text>
              <Text style={[ms.infoValue, { color: colors.textPrimary }]}>{holding.symbol}</Text>
            </View>
            <View style={ms.infoRow}>
              <Text style={[ms.infoLabel, { color: colors.textMuted }]}>{t("holdingsScreen.quantity")}</Text>
              <Text style={[ms.infoValue, { color: colors.textPrimary }]}>{fmtNum(holding.shares_qty, 0)}</Text>
            </View>
            <View style={ms.infoRow}>
              <Text style={[ms.infoLabel, { color: colors.textMuted }]}>{t("holdingsScreen.marketPrice")}</Text>
              <Text style={[ms.infoValue, { color: colors.textPrimary }]}>{fmtNum(holding.market_price, 3)}</Text>
            </View>
            <View style={ms.infoRow}>
              <Text style={[ms.infoLabel, { color: colors.textMuted }]}>{t("holdings.currency")}</Text>
              <Text style={[ms.infoValue, { color: colors.textPrimary }]}>{holding.currency}</Text>
            </View>
          </View>

          {/* Merge section */}
          <Text style={[ms.sectionLabel, { color: colors.textPrimary }]}>
            {t("holdingsScreen.mergeAnother")}
          </Text>
          <Text style={[ms.sectionHint, { color: colors.textMuted }]}>
            {t("holdingsScreen.selectStockToAbsorb", { symbol: holding.symbol })}
          </Text>

          <ScrollView style={{ maxHeight: 280 }} showsVerticalScrollIndicator keyboardShouldPersistTaps="handled">
            <RNTextInput
              style={[
                ms.searchInput,
                { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgPrimary },
              ]}
              placeholder={t("holdingsScreen.searchStocks")}
              placeholderTextColor={colors.textMuted}
              value={searchText}
              onChangeText={setSearchText}
            />

            {stocksQ.isLoading ? (
              <ActivityIndicator style={{ padding: 20 }} color={colors.accentPrimary} />
            ) : mergeCandidates.length === 0 ? (
              <Text style={[ms.emptyText, { color: colors.textMuted }]}>
                {t("holdingsScreen.noOtherStocks")}
              </Text>
            ) : (
              mergeCandidates.map((stock) => {
                const selected = mergeTargetId === stock.id;
                return (
                  <Pressable
                    key={stock.id}
                    onPress={() => setMergeTargetId(selected ? null : stock.id)}
                    style={[
                      ms.stockItem,
                      {
                        backgroundColor: selected ? colors.accentPrimary + "20" : "transparent",
                        borderColor: selected ? colors.accentPrimary : colors.borderColor,
                      },
                    ]}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={[ms.stockSymbol, { color: selected ? colors.accentPrimary : colors.textPrimary }]}>
                        {stock.symbol}
                      </Text>
                      <Text style={[ms.stockName, { color: colors.textMuted }]}>
                        {stock.name} • {stock.portfolio} • {stock.currency}
                      </Text>
                    </View>
                    {selected && <FontAwesome name="check-circle" size={18} color={colors.accentPrimary} />}
                  </Pressable>
                );
              })
            )}
          </ScrollView>

          {/* Action buttons */}
          <View style={ms.btnRow}>
            <Pressable
              onPress={onClose}
              style={[ms.btn, { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor, borderWidth: 1 }]}
            >
              <Text style={[ms.btnText, { color: colors.textSecondary }]}>{t("holdingsScreen.cancel")}</Text>
            </Pressable>
            <Pressable
              onPress={handleMerge}
              disabled={!mergeTargetId || mergeMutation.isPending}
              style={[
                ms.btn,
                {
                  backgroundColor: mergeTargetId ? colors.danger : colors.bgInput,
                  opacity: mergeTargetId ? 1 : 0.5,
                },
              ]}
            >
              {mergeMutation.isPending ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <Text style={[ms.btnText, { color: "#fff", fontWeight: "700" }]}>
                  {t("holdingsScreen.mergeSelected")}
                </Text>
              )}
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  box: {
    width: "92%",
    maxWidth: 480,
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
    maxHeight: "88%",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 14,
  },
  title: { fontSize: 18, fontWeight: "800" },
  infoCard: { borderRadius: 10, borderWidth: 1, padding: 12, marginBottom: 16 },
  infoRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 },
  infoLabel: { fontSize: 12, fontWeight: "600" },
  infoValue: { fontSize: 12, fontWeight: "700" },
  sectionLabel: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  sectionHint: { fontSize: 11, marginBottom: 10, lineHeight: 16 },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    fontSize: 13,
    marginBottom: 8,
  },
  emptyText: { textAlign: "center", padding: 20, fontSize: 13 },
  stockItem: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 4,
  },
  stockSymbol: { fontSize: 13, fontWeight: "700" },
  stockName: { fontSize: 11, marginTop: 1 },
  btnRow: { flexDirection: "row", gap: 10, marginTop: 14 },
  btn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { fontSize: 14, fontWeight: "600" },
});
