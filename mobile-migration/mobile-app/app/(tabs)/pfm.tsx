/**
 * Personal Finance Manager — balance sheet, income/expenses,
 * financial ratios, PFM snapshot history.
 *
 * Mirrors Streamlit's Personal Finance section with its 4 tabs.
 */

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
  FlatList,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import {
  getPfmSnapshots,
  getPfmSnapshot,
  deletePfmSnapshot,
  PfmSnapshotSummary,
  PfmSnapshotFull,
} from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { formatCurrency } from "@/lib/currency";
import type { ThemePalette } from "@/constants/theme";

type Tab = "snapshots" | "balance" | "income" | "ratios";

export default function PfmScreen() {
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("snapshots");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: listData, isLoading, isError, error, refetch } = useQuery({
    queryKey: ["pfm-snapshots"],
    queryFn: () => getPfmSnapshots({ page: 1, page_size: 100 }),
  });

  const { data: detailData, isLoading: detailLoading } = useQuery({
    queryKey: ["pfm-snapshot", selectedId],
    queryFn: () => getPfmSnapshot(selectedId!),
    enabled: selectedId != null,
  });

  const deleteMutation = useMutation({
    mutationFn: deletePfmSnapshot,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["pfm-snapshots"] });
      if (selectedId) {
        queryClient.invalidateQueries({ queryKey: ["pfm-snapshot", selectedId] });
        setSelectedId(null);
      }
    },
  });

  const handleDelete = useCallback((snap: PfmSnapshotSummary) => {
    const msg = `Delete PFM snapshot for ${snap.snapshot_date}?`;
    if (Platform.OS === "web") {
      if (window.confirm(msg)) deleteMutation.mutate(snap.id);
    } else {
      Alert.alert("Delete", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(snap.id) },
      ]);
    }
  }, [deleteMutation]);

  if (isLoading) return <LoadingScreen />;
  if (isError) return <ErrorScreen message={error?.message ?? "Failed to load PFM data"} onRetry={refetch} />;

  const snapshots = listData?.snapshots ?? [];
  const detail = detailData;

  return (
    <View style={[s.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View style={[s.header, { borderBottomColor: colors.borderColor }]}>
        <Text style={[s.title, { color: colors.textPrimary }]}>Personal Finance</Text>
      </View>

      {/* Tabs */}
      <View style={[s.tabRow, { borderBottomColor: colors.borderColor }]}>
        {([
          { key: "snapshots", label: "Snapshots", icon: "camera" },
          { key: "balance", label: "Balance Sheet", icon: "balance-scale" },
          { key: "income", label: "Income & Expenses", icon: "money" },
          { key: "ratios", label: "Ratios", icon: "calculator" },
        ] as const).map((t) => (
          <Pressable
            key={t.key}
            onPress={() => setTab(t.key)}
            style={[s.tabBtn, tab === t.key && { borderBottomColor: colors.accentPrimary, borderBottomWidth: 2 }]}
          >
            <FontAwesome name={t.icon} size={14} color={tab === t.key ? colors.accentPrimary : colors.textMuted} />
            <Text style={{ color: tab === t.key ? colors.accentPrimary : colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
              {t.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={[s.content, isDesktop && { maxWidth: 900, alignSelf: "center", width: "100%" }]}>
        {tab === "snapshots" && (
          <>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>PFM Snapshots ({snapshots.length})</Text>
            {snapshots.length === 0 ? (
              <View style={s.empty}>
                <FontAwesome name="file-text-o" size={48} color={colors.textMuted} />
                <Text style={[s.emptyText, { color: colors.textSecondary }]}>
                  No PFM snapshots yet. Create one from the Streamlit app.
                </Text>
              </View>
            ) : (
              snapshots.map((snap) => (
                <Pressable
                  key={snap.id}
                  onPress={() => { setSelectedId(snap.id); setTab("balance"); }}
                  style={[s.snapCard, { backgroundColor: selectedId === snap.id ? colors.accentPrimary + "18" : colors.bgCard, borderColor: colors.borderColor }]}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={[s.snapDate, { color: colors.textPrimary }]}>{snap.snapshot_date}</Text>
                    {snap.notes && <Text style={[s.snapNotes, { color: colors.textSecondary }]}>{snap.notes}</Text>}
                    <View style={{ flexDirection: "row", gap: 12, marginTop: 4 }}>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>Assets: {formatCurrency(snap.total_assets, "KWD")}</Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>Liabilities: {formatCurrency(snap.total_liabilities, "KWD")}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[s.netWorth, { color: snap.net_worth >= 0 ? colors.success : colors.danger }]}>
                      {formatCurrency(snap.net_worth, "KWD")}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.textMuted }}>Net Worth</Text>
                    <Pressable onPress={() => handleDelete(snap)} style={{ padding: 4, marginTop: 4 }}>
                      <FontAwesome name="trash-o" size={14} color={colors.danger} />
                    </Pressable>
                  </View>
                </Pressable>
              ))
            )}
          </>
        )}

        {tab === "balance" && detail && (
          <>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
              Balance Sheet — {detail.snapshot_date}
            </Text>

            {/* Assets */}
            <Text style={[s.subTitle, { color: colors.success }]}>
              <FontAwesome name="plus-circle" size={14} /> Assets ({formatCurrency(detail.total_assets, "KWD")})
            </Text>
            <View style={[s.dataTable, { borderColor: colors.borderColor }]}>
              {detail.assets.map((a, i) => (
                <View key={i} style={[s.dataRow, { borderBottomColor: colors.borderColor }]}>
                  <Text style={[s.dataCell, { color: colors.textPrimary, flex: 2 }]}>{a.name || a.asset_type}</Text>
                  <Text style={[s.dataCell, { color: colors.textSecondary }]}>{a.category}</Text>
                  <Text style={[s.dataCell, { color: colors.textPrimary, textAlign: "right" }]}>{formatCurrency(a.value_kwd, "KWD")}</Text>
                </View>
              ))}
            </View>

            {/* Liabilities */}
            <Text style={[s.subTitle, { color: colors.danger }]}>
              <FontAwesome name="minus-circle" size={14} /> Liabilities ({formatCurrency(detail.total_liabilities, "KWD")})
            </Text>
            <View style={[s.dataTable, { borderColor: colors.borderColor }]}>
              {detail.liabilities.length === 0 ? (
                <Text style={[{ color: colors.textMuted, padding: 12, fontSize: 13 }]}>No liabilities</Text>
              ) : (
                detail.liabilities.map((l, i) => (
                  <View key={i} style={[s.dataRow, { borderBottomColor: colors.borderColor }]}>
                    <Text style={[s.dataCell, { color: colors.textPrimary, flex: 2 }]}>{l.category}</Text>
                    <Text style={[s.dataCell, { color: colors.textSecondary }]}>{l.is_current ? "Current" : "Long-term"}</Text>
                    <Text style={[s.dataCell, { color: colors.danger, textAlign: "right" }]}>{formatCurrency(l.amount_kwd, "KWD")}</Text>
                  </View>
                ))
              )}
            </View>

            {/* Net Worth */}
            <View style={[s.netWorthBar, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.textPrimary }}>Net Worth</Text>
              <Text style={{ fontSize: 20, fontWeight: "800", color: detail.net_worth >= 0 ? colors.success : colors.danger }}>
                {formatCurrency(detail.net_worth, "KWD")}
              </Text>
            </View>
          </>
        )}

        {tab === "balance" && !detail && (
          <View style={s.empty}>
            <FontAwesome name="hand-pointer-o" size={48} color={colors.textMuted} />
            <Text style={[s.emptyText, { color: colors.textSecondary }]}>
              Select a snapshot from the Snapshots tab to view its balance sheet
            </Text>
          </View>
        )}

        {tab === "income" && detail && (
          <>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
              Income & Expenses — {detail.snapshot_date}
            </Text>
            <View style={[s.dataTable, { borderColor: colors.borderColor }]}>
              <View style={[s.dataRow, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderColor }]}>
                <Text style={[s.dataCell, { color: colors.textSecondary, fontWeight: "700", flex: 2 }]}>Category</Text>
                <Text style={[s.dataCell, { color: colors.textSecondary, fontWeight: "700" }]}>Type</Text>
                <Text style={[s.dataCell, { color: colors.textSecondary, fontWeight: "700", textAlign: "right" }]}>Monthly</Text>
              </View>
              {detail.income_expenses.map((ie, i) => (
                <View key={i} style={[s.dataRow, { borderBottomColor: colors.borderColor }]}>
                  <Text style={[s.dataCell, { color: colors.textPrimary, flex: 2 }]}>{ie.category}</Text>
                  <Text style={[s.dataCell, { color: ie.kind === "income" ? colors.success : colors.danger }]}>{ie.kind}</Text>
                  <Text style={[s.dataCell, { color: ie.kind === "income" ? colors.success : colors.danger, textAlign: "right" }]}>
                    {formatCurrency(ie.monthly_amount, "KWD")}
                  </Text>
                </View>
              ))}
            </View>
          </>
        )}

        {tab === "income" && !detail && (
          <View style={s.empty}>
            <Text style={[s.emptyText, { color: colors.textSecondary }]}>Select a snapshot first</Text>
          </View>
        )}

        {tab === "ratios" && detail && (
          <>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
              Financial Ratios — {detail.snapshot_date}
            </Text>
            {(() => {
              const totalIncome = detail.income_expenses
                .filter((ie) => ie.kind === "income")
                .reduce((sum, ie) => sum + ie.monthly_amount, 0);
              const totalExpenses = detail.income_expenses
                .filter((ie) => ie.kind === "expense")
                .reduce((sum, ie) => sum + ie.monthly_amount, 0);
              const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome * 100) : 0;
              const debtToAsset = detail.total_assets > 0 ? (detail.total_liabilities / detail.total_assets * 100) : 0;
              const financeCosts = detail.income_expenses
                .filter((ie) => ie.is_finance_cost)
                .reduce((sum, ie) => sum + ie.monthly_amount, 0);

              return (
                <View style={s.ratiosGrid}>
                  <View style={[s.ratioCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                    <Text style={[s.ratioLabel, { color: colors.textSecondary }]}>Net Worth</Text>
                    <Text style={[s.ratioValue, { color: detail.net_worth >= 0 ? colors.success : colors.danger }]}>
                      {formatCurrency(detail.net_worth, "KWD")}
                    </Text>
                  </View>
                  <View style={[s.ratioCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                    <Text style={[s.ratioLabel, { color: colors.textSecondary }]}>Savings Rate</Text>
                    <Text style={[s.ratioValue, { color: savingsRate >= 0 ? colors.success : colors.danger }]}>
                      {savingsRate.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={[s.ratioCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                    <Text style={[s.ratioLabel, { color: colors.textSecondary }]}>Debt / Assets</Text>
                    <Text style={[s.ratioValue, { color: debtToAsset < 50 ? colors.success : colors.danger }]}>
                      {debtToAsset.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={[s.ratioCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                    <Text style={[s.ratioLabel, { color: colors.textSecondary }]}>Monthly Income</Text>
                    <Text style={[s.ratioValue, { color: colors.success }]}>
                      {formatCurrency(totalIncome, "KWD")}
                    </Text>
                  </View>
                  <View style={[s.ratioCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                    <Text style={[s.ratioLabel, { color: colors.textSecondary }]}>Monthly Expenses</Text>
                    <Text style={[s.ratioValue, { color: colors.danger }]}>
                      {formatCurrency(totalExpenses, "KWD")}
                    </Text>
                  </View>
                  <View style={[s.ratioCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                    <Text style={[s.ratioLabel, { color: colors.textSecondary }]}>Finance Costs</Text>
                    <Text style={[s.ratioValue, { color: colors.danger }]}>
                      {formatCurrency(financeCosts, "KWD")}
                    </Text>
                  </View>
                </View>
              );
            })()}
          </>
        )}

        {tab === "ratios" && !detail && (
          <View style={s.empty}>
            <Text style={[s.emptyText, { color: colors.textSecondary }]}>Select a snapshot first</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
  },
  title: { fontSize: 24, fontWeight: "700" },
  content: { padding: 16, paddingBottom: 80 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 10 },
  subTitle: { fontSize: 15, fontWeight: "700", marginTop: 14, marginBottom: 6 },
  tabRow: {
    flexDirection: "row",
    borderBottomWidth: 1,
  },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  empty: { alignItems: "center", paddingVertical: 60, gap: 12 },
  emptyText: { fontSize: 14, textAlign: "center", maxWidth: 280 },
  snapCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  snapDate: { fontSize: 15, fontWeight: "700" },
  snapNotes: { fontSize: 12, marginTop: 2 },
  netWorth: { fontSize: 16, fontWeight: "700" },
  dataTable: { borderWidth: 1, borderRadius: 8, overflow: "hidden", marginBottom: 8 },
  dataRow: {
    flexDirection: "row",
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  dataCell: { flex: 1, fontSize: 13 },
  netWorthBar: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginTop: 12,
  },
  ratiosGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  ratioCard: {
    minWidth: 150,
    flex: 1,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  ratioLabel: { fontSize: 12, marginBottom: 4 },
  ratioValue: { fontSize: 18, fontWeight: "700" },
});
