/**
 * Cash Management Section — manual override for cash balances per portfolio.
 */

import React, { useState, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  Platform,
  TextInput as RNTextInput,
  Alert,
} from "react-native";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
  setCashOverride,
  clearCashOverride,
  PortfolioCashBalance,
} from "@/services/api";
import type { ThemePalette } from "@/constants/theme";
import { fmtNum } from "@/lib/currency";
import { showErrorAlert } from "@/lib/errorHandling";

const PORTFOLIO_CCY: Record<string, string> = { KFH: "KWD", BBYN: "KWD", USA: "USD" };
export const DEFAULT_USD_KWD_RATE = 0.307;

export function CashBalancesSection({ cashData, depositTotals, colors, spacing, queryClient }: {
  cashData: Record<string, PortfolioCashBalance>;
  depositTotals: Record<string, number>;
  colors: ThemePalette;
  spacing: { pagePx: number };
  queryClient: ReturnType<typeof useQueryClient>;
}) {
  const [editingPf, setEditingPf] = useState<string | null>(null);
  const [editValue, setEditValue] = useState("");

  const overrideMutation = useMutation({
    mutationFn: ({ portfolio, balance, currency }: { portfolio: string; balance: number; currency: string }) =>
      setCashOverride(portfolio, balance, currency),
    onSuccess: async () => { await Promise.all([queryClient.refetchQueries({ queryKey: ["cash-balances"] }), queryClient.refetchQueries({ queryKey: ["portfolio-overview"] })]); setEditingPf(null); setEditValue(""); },
    onError: (err) => showErrorAlert("Error", err, "Failed to save"),
  });

  const clearMutation = useMutation({
    mutationFn: (portfolio: string) => clearCashOverride(portfolio),
    onSuccess: async () => { await Promise.all([queryClient.refetchQueries({ queryKey: ["cash-balances"] }), queryClient.refetchQueries({ queryKey: ["portfolio-overview"] })]); },
  });

  const handleSaveOverride = (portfolio: string) => {
    const num = parseFloat(editValue);
    if (isNaN(num) || num < 0) {
      if (Platform.OS === "web") window.alert("Enter a valid positive number");
      else Alert.alert("Invalid", "Enter a valid positive number");
      return;
    }
    overrideMutation.mutate({ portfolio, balance: num, currency: PORTFOLIO_CCY[portfolio] ?? "KWD" });
  };

  const cashPortfolios = ["KFH", "BBYN", "USA"];

  const totalFreeCashKwd = useMemo(() => {
    let total = 0;
    for (const pf of cashPortfolios) {
      const item = cashData[pf];
      if (!item) continue;
      total += item.currency === "USD" ? item.balance * DEFAULT_USD_KWD_RATE : item.balance;
    }
    return total;
  }, [cashData]);

  return (
    <View style={[cs.section, { marginHorizontal: spacing.pagePx, backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={cs.cashHeader}>
        <Text style={[cs.sectionTitle, { color: colors.textPrimary }]}>
          <FontAwesome name="money" size={16} color={colors.accentPrimary} />{" "}
          Cash Management
        </Text>
        <Text style={[cs.cashCaption, { color: colors.textMuted }]}>Edit cash balances manually. Tap the pencil to override.</Text>
      </View>

      {/* Table Header */}
      <View style={[cs.tableHeaderRow, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderColor }]}>
        <Text style={[cs.tableHeaderCell, cs.cellPortfolio, { color: colors.textSecondary }]}>Portfolio</Text>
        <Text style={[cs.tableHeaderCell, cs.cellCcy, { color: colors.textSecondary }]}>CCY</Text>
        <Text style={[cs.tableHeaderCell, cs.cellCapital, { color: colors.textSecondary }]}>Total Capital</Text>
        <Text style={[cs.tableHeaderCell, cs.cellCash, { color: colors.textSecondary }]}>Available Cash</Text>
        <Text style={[cs.tableHeaderCell, cs.cellActions, { color: colors.textSecondary }]}> </Text>
      </View>

      {cashPortfolios.map((pf) => {
        const item = cashData[pf];
        const balance = item?.balance ?? 0;
        const ccy = PORTFOLIO_CCY[pf] ?? "KWD";
        const ccyDisplay = ccy === "USD" ? `USD (${DEFAULT_USD_KWD_RATE.toFixed(3)})` : ccy;
        const balanceKwd = ccy === "USD" ? balance * DEFAULT_USD_KWD_RATE : balance;
        const totalDeposited = depositTotals[pf] ?? 0;
        const isEditing = editingPf === pf;
        const isManual = item?.manual_override ?? false;

        return (
          <View key={pf} style={[cs.tableDataRow, { borderBottomColor: colors.borderColor }]}>
            <View style={[cs.cellPortfolio, cs.cellInner]}>
              <Text style={[cs.cellText, { color: colors.textPrimary, fontWeight: "600" }]}>{pf}</Text>
              {isManual && (
                <View style={[cs.overrideBadge, { backgroundColor: colors.warning + "22" }]}>
                  <Text style={[cs.manualBadgeText, { color: colors.warning }]}>MANUAL</Text>
                </View>
              )}
            </View>

            <View style={[cs.cellCcy, cs.cellInner]}>
              <Text style={[cs.cellText, { color: colors.textSecondary, fontSize: 11 }]}>{ccyDisplay}</Text>
            </View>

            <View style={[cs.cellCapital, cs.cellInner]}>
              <Text style={[cs.cellText, { color: colors.textMuted }]}>{fmtNum(totalDeposited, ccy === "KWD" ? 0 : 2)}</Text>
            </View>

            {isEditing ? (
              <View style={[cs.cellCash, cs.editRow]}>
                <RNTextInput
                  style={[cs.editInput, { color: colors.textPrimary, backgroundColor: colors.bgInput, borderColor: colors.borderColor }]}
                  value={editValue}
                  onChangeText={setEditValue}
                  keyboardType="decimal-pad"
                  placeholder={ccy === "USD" ? "Amount (USD)" : "Amount"}
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                />
                <Pressable onPress={() => handleSaveOverride(pf)} style={[cs.editBtn, { backgroundColor: colors.success + "22" }]}>
                  <FontAwesome name="check" size={12} color={colors.success} />
                </Pressable>
                <Pressable onPress={() => { setEditingPf(null); setEditValue(""); }} style={[cs.editBtn, { backgroundColor: colors.danger + "22" }]}>
                  <FontAwesome name="times" size={12} color={colors.danger} />
                </Pressable>
              </View>
            ) : (
              <View style={[cs.cellCash, cs.cellInner]}>
                {ccy === "USD" ? (
                  <>
                    <Text style={[cs.cellText, { color: colors.textPrimary, fontWeight: "600" }]}>{fmtNum(balanceKwd, 3)} KWD</Text>
                    <Text style={[cs.usdSubline, { color: colors.textMuted }]}>({fmtNum(balance, 2)} USD)</Text>
                  </>
                ) : (
                  <Text style={[cs.cellText, { color: colors.textPrimary, fontWeight: "600" }]}>{fmtNum(balance, 3)}</Text>
                )}
              </View>
            )}

            {!isEditing && (
              <View style={[cs.cellActions, cs.cellInner, cs.actionsRow]}>
                <Pressable
                  onPress={() => { setEditingPf(pf); setEditValue(balance.toString()); }}
                  style={({ pressed }) => [cs.actionBtn, { backgroundColor: colors.accentPrimary + "20", borderColor: colors.accentPrimary + "44", opacity: pressed ? 0.6 : 1 }]}
                >
                  <FontAwesome name="pencil" size={15} color={colors.accentPrimary} />
                </Pressable>
                {isManual && (
                  <Pressable
                    onPress={() => {
                      const msg = `Clear manual override for ${pf}? Balance will be recalculated automatically.`;
                      if (Platform.OS === "web") { if (window.confirm(msg)) clearMutation.mutate(pf); }
                      else { Alert.alert("Clear Override", msg, [{ text: "Cancel", style: "cancel" }, { text: "Clear", onPress: () => clearMutation.mutate(pf) }]); }
                    }}
                    style={({ pressed }) => [cs.actionBtn, { backgroundColor: colors.warning + "20", borderColor: colors.warning + "44", opacity: pressed ? 0.6 : 1 }]}
                  >
                    <FontAwesome name="undo" size={14} color={colors.warning} />
                  </Pressable>
                )}
              </View>
            )}
            {isEditing && <View style={cs.cellActions} />}
          </View>
        );
      })}

      <View style={[cs.totalCashRow, { borderTopColor: colors.accentPrimary }]}>
        <Text style={[cs.totalCashLabel, { color: colors.textSecondary }]}>Total Free Cash</Text>
        <Text style={[cs.totalCashValue, { color: colors.accentPrimary }]}>{fmtNum(totalFreeCashKwd, 3)} KWD</Text>
      </View>
    </View>
  );
}

const cs = StyleSheet.create({
  section: { borderRadius: 10, borderWidth: 1, padding: 0, marginBottom: 24, overflow: "hidden" as const },
  cashHeader: { padding: 16, paddingBottom: 8 },
  sectionTitle: { fontSize: 16, fontWeight: "700", marginBottom: 4 },
  cashCaption: { fontSize: 11, lineHeight: 16 },
  tableHeaderRow: { flexDirection: "row", paddingVertical: 8, paddingHorizontal: 12, borderBottomWidth: 2 },
  tableHeaderCell: { fontSize: 10, fontWeight: "700", textTransform: "uppercase", letterSpacing: 0.3 },
  cellPortfolio: { flex: 1.2, minWidth: 65 },
  cellCcy: { flex: 1.2, minWidth: 65 },
  cellCapital: { flex: 1.5, minWidth: 85, textAlign: "right" as const },
  cellCash: { flex: 1.5, minWidth: 85, textAlign: "right" as const },
  cellActions: { width: 80, textAlign: "center" as const },
  tableDataRow: { flexDirection: "row", paddingVertical: 10, paddingHorizontal: 12, borderBottomWidth: StyleSheet.hairlineWidth, alignItems: "center" },
  cellInner: { justifyContent: "center" as const },
  cellText: { fontSize: 12 },
  overrideBadge: { paddingHorizontal: 4, paddingVertical: 1, borderRadius: 3, marginTop: 2 },
  editRow: { flexDirection: "row" as const, alignItems: "center" as const, gap: 4, justifyContent: "flex-end" as const },
  editInput: { width: 80, height: 30, borderWidth: 1, borderRadius: 4, paddingHorizontal: 6, fontSize: 12 },
  editBtn: { width: 26, height: 26, borderRadius: 4, justifyContent: "center" as const, alignItems: "center" as const },
  totalCashRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingVertical: 12, paddingHorizontal: 16, borderTopWidth: 2 },
  totalCashLabel: { fontSize: 13, fontWeight: "600" },
  totalCashValue: { fontSize: 16, fontWeight: "800" },
  manualBadgeText: { fontSize: 9, fontWeight: "700" },
  actionBtn: { width: 32, height: 32, borderRadius: 6, borderWidth: 1, justifyContent: "center" as const, alignItems: "center" as const },
  actionsRow: { flexDirection: "row" as const, gap: 8, justifyContent: "center" as const, alignItems: "center" as const },
  usdSubline: { fontSize: 9, marginTop: 1 },
});
