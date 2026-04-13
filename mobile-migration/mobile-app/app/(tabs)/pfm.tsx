/**
 * Personal Finance Manager — balance sheet, income/expenses,
 * financial ratios, PFM snapshot history.
 *
 * Mirrors Streamlit's Personal Finance section with its 4 tabs.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Alert,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { PfmSkeleton } from "@/components/ui/PageSkeletons";
import { usePfmSnapshot, usePfmSnapshots } from "@/hooks/queries";
import { useResponsive } from "@/hooks/useResponsive";
import { useScreenStyles } from "@/hooks/useScreenStyles";
import { formatCurrency } from "@/lib/currency";
import {
    deletePfmSnapshot,
    PfmSnapshotSummary,
} from "@/services/api";
import { useThemeStore } from "@/services/themeStore";

type Tab = "snapshots" | "balance" | "income" | "ratios";

export default function PfmScreen() {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const ss = useScreenStyles();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<Tab>("snapshots");
  const [selectedId, setSelectedId] = useState<number | null>(null);

  const { data: listData, isLoading, isError, error, refetch } = usePfmSnapshots();

  const { data: detailData } = usePfmSnapshot(selectedId);

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
    const msg = t('pfm.deleteSnapshot', { date: snap.snapshot_date });
    if (Platform.OS === "web") {
      if (window.confirm(msg)) deleteMutation.mutate(snap.id);
    } else {
      Alert.alert(t('app.delete'), msg, [
        { text: t('app.cancel'), style: "cancel" },
        { text: t('app.delete'), style: "destructive", onPress: () => deleteMutation.mutate(snap.id) },
      ]);
    }
  }, [deleteMutation, t]);

  if (isLoading) return <PfmSkeleton />;
  if (isError) return <ErrorScreen message={error?.message ?? "Failed to load PFM data"} onRetry={refetch} />;

  const snapshots = listData?.snapshots ?? [];
  const detail = detailData;

  const ratios = useMemo(() => {
    if (!detail) return null;
    let totalIncome = 0, totalExpenses = 0, financeCosts = 0;
    for (const ie of detail.income_expenses) {
      if (ie.kind === "income") totalIncome += ie.monthly_amount;
      else if (ie.kind === "expense") totalExpenses += ie.monthly_amount;
      if (ie.is_finance_cost) financeCosts += ie.monthly_amount;
    }
    const savingsRate = totalIncome > 0 ? ((totalIncome - totalExpenses) / totalIncome * 100) : 0;
    const debtToAsset = detail.total_assets > 0 ? (detail.total_liabilities / detail.total_assets * 100) : 0;
    return { totalIncome, totalExpenses, financeCosts, savingsRate, debtToAsset };
  }, [detail]);

  return (
    <View style={ss.container}>
      {/* Header */}
      <View style={ss.header}>
        <Text style={ss.title}>{t('pfm.title')}</Text>
      </View>

      {/* Tabs */}
      <View style={[s.tabRow, { borderBottomColor: colors.borderColor }]}>
        {([
          { key: "snapshots", label: t('pfm.snapshots'), icon: "camera" },
          { key: "balance", label: t('pfm.balanceSheet'), icon: "balance-scale" },
          { key: "income", label: t('pfm.incomeExpenses'), icon: "money" },
          { key: "ratios", label: t('pfm.ratios'), icon: "calculator" },
        ] as const).map((tb) => (
          <Pressable
            key={tb.key}
            onPress={() => setTab(tb.key)}
            style={[s.tabBtn, tab === tb.key && { borderBottomColor: colors.accentPrimary, borderBottomWidth: 2 }]}
          >
            <FontAwesome name={tb.icon} size={14} color={tab === tb.key ? colors.accentPrimary : colors.textMuted} />
            <Text style={{ color: tab === tb.key ? colors.accentPrimary : colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
              {tb.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <ScrollView contentContainerStyle={[s.content, isDesktop && { maxWidth: 900, alignSelf: "center", width: "100%" }]}>
        {tab === "snapshots" && (
          <>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{t('pfm.pfmSnapshots')} ({snapshots.length})</Text>
            {snapshots.length === 0 ? (
              <View style={s.empty}>
                <FontAwesome name="file-text-o" size={48} color={colors.textMuted} />
                <Text style={[s.emptyText, { color: colors.textSecondary }]}>
                  {t('pfm.noSnapshots')}
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
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>{t('pfm.assets')}: {formatCurrency(snap.total_assets, "KWD")}</Text>
                      <Text style={{ fontSize: 12, color: colors.textSecondary }}>{t('pfm.liabilities')}: {formatCurrency(snap.total_liabilities, "KWD")}</Text>
                    </View>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={[s.netWorth, { color: snap.net_worth >= 0 ? colors.success : colors.danger }]}>
                      {formatCurrency(snap.net_worth, "KWD")}
                    </Text>
                    <Text style={{ fontSize: 10, color: colors.textMuted }}>{t('pfm.netWorth')}</Text>
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
              {t('pfm.balanceSheet')} — {detail.snapshot_date}
            </Text>

            {/* Assets */}
            <Text style={[s.subTitle, { color: colors.success }]}>
              <FontAwesome name="plus-circle" size={14} /> {t('pfm.assets')} ({formatCurrency(detail.total_assets, "KWD")})
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
              <FontAwesome name="minus-circle" size={14} /> {t('pfm.liabilities')} ({formatCurrency(detail.total_liabilities, "KWD")})
            </Text>
            <View style={[s.dataTable, { borderColor: colors.borderColor }]}>
              {detail.liabilities.length === 0 ? (
                <Text style={[{ color: colors.textMuted, padding: 12, fontSize: 13 }]}>{t('pfm.noLiabilities')}</Text>
              ) : (
                detail.liabilities.map((l, i) => (
                  <View key={i} style={[s.dataRow, { borderBottomColor: colors.borderColor }]}>
                    <Text style={[s.dataCell, { color: colors.textPrimary, flex: 2 }]}>{l.category}</Text>
                    <Text style={[s.dataCell, { color: colors.textSecondary }]}>{l.is_current ? t('pfm.current') : t('pfm.longTerm')}</Text>
                    <Text style={[s.dataCell, { color: colors.danger, textAlign: "right" }]}>{formatCurrency(l.amount_kwd, "KWD")}</Text>
                  </View>
                ))
              )}
            </View>

            {/* Net Worth */}
            <View style={[s.netWorthBar, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
              <Text style={{ fontSize: 16, fontWeight: "700", color: colors.textPrimary }}>{t('pfm.netWorth')}</Text>
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
              {t('pfm.selectSnapshot')}
            </Text>
          </View>
        )}

        {tab === "income" && detail && (
          <>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
              {t('pfm.incomeExpenses')} — {detail.snapshot_date}
            </Text>
            <View style={[s.dataTable, { borderColor: colors.borderColor }]}>
              <View style={[s.dataRow, { backgroundColor: colors.bgSecondary, borderBottomColor: colors.borderColor }]}>
                <Text style={[s.dataCell, { color: colors.textSecondary, fontWeight: "700", flex: 2 }]}>{t('pfm.category')}</Text>
                <Text style={[s.dataCell, { color: colors.textSecondary, fontWeight: "700" }]}>{t('pfm.type')}</Text>
                <Text style={[s.dataCell, { color: colors.textSecondary, fontWeight: "700", textAlign: "right" }]}>{t('pfm.monthly')}</Text>
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
            <Text style={[s.emptyText, { color: colors.textSecondary }]}>{t('pfm.selectSnapshotFirst')}</Text>
          </View>
        )}

        {tab === "ratios" && detail && ratios && (
          <>
            <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
              {t('pfm.ratios')} — {detail.snapshot_date}
            </Text>
                <View style={s.ratiosGrid}>
                  <View style={[s.ratioCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                    <Text style={[s.ratioLabel, { color: colors.textSecondary }]}>{t('pfm.netWorth')}</Text>
                    <Text style={[s.ratioValue, { color: detail.net_worth >= 0 ? colors.success : colors.danger }]}>
                      {formatCurrency(detail.net_worth, "KWD")}
                    </Text>
                  </View>
                  <View style={[s.ratioCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                    <Text style={[s.ratioLabel, { color: colors.textSecondary }]}>{t('pfm.savingsRate')}</Text>
                    <Text style={[s.ratioValue, { color: ratios.savingsRate >= 0 ? colors.success : colors.danger }]}>
                      {ratios.savingsRate.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={[s.ratioCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                    <Text style={[s.ratioLabel, { color: colors.textSecondary }]}>{t('pfm.debtAssets')}</Text>
                    <Text style={[s.ratioValue, { color: ratios.debtToAsset < 50 ? colors.success : colors.danger }]}>
                      {ratios.debtToAsset.toFixed(1)}%
                    </Text>
                  </View>
                  <View style={[s.ratioCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                    <Text style={[s.ratioLabel, { color: colors.textSecondary }]}>{t('pfm.monthlyIncome')}</Text>
                    <Text style={[s.ratioValue, { color: colors.success }]}>
                      {formatCurrency(ratios.totalIncome, "KWD")}
                    </Text>
                  </View>
                  <View style={[s.ratioCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                    <Text style={[s.ratioLabel, { color: colors.textSecondary }]}>{t('pfm.monthlyExpenses')}</Text>
                    <Text style={[s.ratioValue, { color: colors.danger }]}>
                      {formatCurrency(ratios.totalExpenses, "KWD")}
                    </Text>
                  </View>
                  <View style={[s.ratioCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                    <Text style={[s.ratioLabel, { color: colors.textSecondary }]}>{t('pfm.financeCosts')}</Text>
                    <Text style={[s.ratioValue, { color: colors.danger }]}>
                      {formatCurrency(ratios.financeCosts, "KWD")}
                    </Text>
                  </View>
                </View>
          </>
        )}

        {tab === "ratios" && !detail && (
          <View style={s.empty}>
            <Text style={[s.emptyText, { color: colors.textSecondary }]}>{t('pfm.selectSnapshotFirst')}</Text>
          </View>
        )}

        <View style={{ height: 40 }} />
      </ScrollView>
    </View>
  );
}

const s = StyleSheet.create({
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
