/**
 * Deposits screen — paginated list of cash deposits/withdrawals.
 *
 * • Pull-to-refresh
 * • Pagination controls
 * • FAB → add-deposit form
 * • Empty state
 */

import React, { useMemo, useState, useCallback } from "react";
import {
  View,
  Text,
  FlatList,
  StyleSheet,
  Pressable,
  RefreshControl,
  ActivityIndicator,
  Platform,
  Alert,
} from "react-native";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { FAB } from "react-native-paper";

import { getDeposits, deleteDeposit, exportDepositsExcel, CashDepositRecord } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import { formatCurrency } from "@/lib/currency";
import type { ThemePalette } from "@/constants/theme";

const PAGE_SIZE = 25;

// ── Single deposit row ──────────────────────────────────────────────

function DepositRow({
  item,
  colors,
  onDelete,
  onEdit,
}: {
  item: CashDepositRecord;
  colors: ThemePalette;
  onDelete?: (item: CashDepositRecord) => void;
  onEdit?: (item: CashDepositRecord) => void;
}) {
  const isDeposit = (item.source ?? "deposit") === "deposit";

  return (
    <View
      style={[
        s.row,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.borderColor,
        },
      ]}
    >
      {/* Left icon */}
      <View
        style={[
          s.iconCircle,
          {
            backgroundColor: isDeposit
              ? colors.accentPrimary + "18"
              : colors.danger + "18",
          },
        ]}
      >
        <FontAwesome
          name={isDeposit ? "arrow-down" : "arrow-up"}
          size={14}
          color={isDeposit ? colors.accentPrimary : colors.danger}
        />
      </View>

      {/* Details */}
      <View style={s.details}>
        <Text style={[s.portfolio, { color: colors.textPrimary }]}>
          {item.portfolio}
          {item.bank_name ? ` \u2022 ${item.bank_name}` : ""}
        </Text>
        <Text style={[s.date, { color: colors.textSecondary }]}>
          {item.deposit_date}
          {item.notes ? ` \u2014 ${item.notes}` : ""}
        </Text>
      </View>

      {/* Amount + edit + delete */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <View style={s.amountCol}>
          <Text
            style={[
              s.amount,
              { color: isDeposit ? colors.accentPrimary : colors.danger },
            ]}
          >
            {isDeposit ? "+" : "\u2212"}
            {formatCurrency(item.amount, item.currency ?? "KWD")}
          </Text>
          <Text style={[s.source, { color: colors.textMuted }]}>
            {isDeposit ? "Deposit" : "Withdrawal"}
          </Text>
        </View>
        {onEdit && (
          <Pressable
            onPress={() => onEdit(item)}
            style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.5 : 0.7 }]}
          >
            <FontAwesome name="pencil" size={16} color={colors.accentPrimary} />
          </Pressable>
        )}
        {onDelete && (
          <Pressable
            onPress={() => onDelete(item)}
            style={({ pressed }) => [{ padding: 8, opacity: pressed ? 0.5 : 0.7 }]}
          >
            <FontAwesome name="trash-o" size={16} color={colors.danger} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ── Main screen ─────────────────────────────────────────────────────

export default function DepositsScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [portfolioFilter, setPortfolioFilter] = useState<string | undefined>(undefined);
  const [sourceFilter, setSourceFilter] = useState<string | undefined>(undefined);

  const {
    data,
    isLoading,
    isError,
    error,
    refetch,
    isFetching,
  } = useQuery({
    queryKey: ["deposits", page, portfolioFilter],
    queryFn: () => getDeposits({ page, page_size: PAGE_SIZE, portfolio: portfolioFilter }),
    placeholderData: (prev) => prev,
  });

  const deleteMutation = useMutation({
    mutationFn: deleteDeposit,
    onSuccess: async () => {
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["portfolio-overview"] }),
        queryClient.refetchQueries({ queryKey: ["cash-balances"] }),
        queryClient.refetchQueries({ queryKey: ["deposits"] }),
        queryClient.refetchQueries({ queryKey: ["deposits-total"] }),
        queryClient.refetchQueries({ queryKey: ["holdings"] }),
        queryClient.refetchQueries({ queryKey: ["snapshots"] }),
        queryClient.refetchQueries({ queryKey: ["snapshots-chart"] }),
        queryClient.refetchQueries({ queryKey: ["tracker-data"] }),
      ]);
    },
  });

  const handleEdit = useCallback((item: CashDepositRecord) => {
    router.push({
      pathname: "/(tabs)/add-deposit" as any,
      params: {
        editId: String(item.id),
        editPortfolio: item.portfolio,
        editDate: item.deposit_date,
        editAmount: String(item.amount),
        editCurrency: item.currency ?? "KWD",
        editBankName: item.bank_name ?? "",
        editSource: item.source ?? "deposit",
        editNotes: item.notes ?? "",
      },
    });
  }, [router]);

  const handleDelete = useCallback((item: CashDepositRecord) => {
    const msg = `Delete ${(item.source ?? "deposit")} of ${formatCurrency(item.amount, item.currency ?? "KWD")} on ${item.deposit_date}?`;
    if (Platform.OS === "web") {
      if (window.confirm(msg)) deleteMutation.mutate(item.id);
    } else {
      Alert.alert("Delete Deposit", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(item.id) },
      ]);
    }
  }, [deleteMutation]);

  // Export deposits as Excel
  const [exporting, setExporting] = useState(false);
  const handleExportExcel = useCallback(async () => {
    if (Platform.OS !== "web") {
      Alert.alert("Export", "Excel export is available on the web version.");
      return;
    }
    try {
      setExporting(true);
      const blob = await exportDepositsExcel();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deposits_${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      Alert.alert("Export Failed", e?.message ?? "Unknown error");
    } finally {
      setExporting(false);
    }
  }, []);

  // Client-side source filter
  const filteredDeposits = useMemo(() => {
    const deps = data?.deposits ?? [];
    if (!sourceFilter) return deps;
    return deps.filter((d) => (d.source ?? "deposit") === sourceFilter);
  }, [data?.deposits, sourceFilter]);

  const deposits = filteredDeposits;
  const pagination = data?.pagination;
  const totalKwd = data?.total_kwd ?? 0;

  // ── Empty state ─────────────────────────────────────────────────

  const EmptyState = useMemo(
    () => (
      <View style={s.empty}>
        <FontAwesome name="bank" size={48} color={colors.textMuted} />
        <Text style={[s.emptyTitle, { color: colors.textPrimary }]}>
          No deposits yet
        </Text>
        <Text style={[s.emptyBody, { color: colors.textSecondary }]}>
          Tap the + button to record a cash deposit.
        </Text>
      </View>
    ),
    [colors]
  );

  // ── Pagination controls ─────────────────────────────────────────

  const PaginationBar = () => {
    if (!pagination || pagination.total_pages <= 1) return null;
    return (
      <View
        style={[
          s.pagination,
          { borderTopColor: colors.borderColor },
        ]}
      >
        <Pressable
          onPress={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          style={[
            s.pageBtn,
            {
              backgroundColor: colors.bgCard,
              borderColor: colors.borderColor,
              opacity: page <= 1 ? 0.4 : 1,
            },
          ]}
        >
          <FontAwesome name="chevron-left" size={14} color={colors.textSecondary} />
        </Pressable>
        <Text style={[s.pageInfo, { color: colors.textSecondary }]}>
          Page {pagination.page} of {pagination.total_pages} ({pagination.total_items} total)
        </Text>
        <Pressable
          onPress={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
          disabled={page >= pagination.total_pages}
          style={[
            s.pageBtn,
            {
              backgroundColor: colors.bgCard,
              borderColor: colors.borderColor,
              opacity: page >= pagination.total_pages ? 0.4 : 1,
            },
          ]}
        >
          <FontAwesome name="chevron-right" size={14} color={colors.textSecondary} />
        </Pressable>
      </View>
    );
  };

  // ── Header with total ───────────────────────────────────────────

  const ListHeader = () => (
    <View style={[s.header, { borderBottomColor: colors.borderColor }]}>
      <Text style={[s.headerTitle, { color: colors.textPrimary }]}>
        Cash Deposits
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
        {totalKwd > 0 && (
          <Text style={[s.headerTotal, { color: colors.accentPrimary }]}>
            Total: {formatCurrency(totalKwd, "KWD")}
          </Text>
        )}
        <Pressable
          onPress={handleExportExcel}
          disabled={exporting}
          style={({ pressed }) => [
            s.exportBtn,
            {
              backgroundColor: colors.success,
              opacity: pressed || exporting ? 0.6 : 1,
            },
          ]}
        >
          <FontAwesome name="file-excel-o" size={13} color="#fff" />
          <Text style={s.exportBtnText}>{exporting ? "..." : "Export"}</Text>
        </Pressable>
      </View>
    </View>
  );

  // ── Loading / Error ─────────────────────────────────────────────

  if (isLoading) {
    return (
      <View style={[s.center, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.accentPrimary} />
      </View>
    );
  }

  if (isError) {
    return (
      <View style={[s.center, { backgroundColor: colors.bgPrimary }]}>
        <FontAwesome name="exclamation-triangle" size={36} color={colors.danger} />
        <Text style={[s.errorText, { color: colors.danger }]}>
          {(error as Error)?.message ?? "Failed to load deposits"}
        </Text>
        <Pressable
          onPress={() => refetch()}
          style={[s.retryBtn, { backgroundColor: colors.accentPrimary }]}
        >
          <Text style={{ color: "#fff", fontWeight: "600" }}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  // ── Main list ───────────────────────────────────────────────────

  return (
    <View style={[s.screen, { backgroundColor: colors.bgPrimary }]}>
      <View
        style={[
          s.listWrap,
          isDesktop && { maxWidth: 800, alignSelf: "center", width: "100%" },
        ]}
      >
        <FlatList
          data={deposits}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <DepositRow item={item} colors={colors} onEdit={handleEdit} onDelete={handleDelete} />}
          ListHeaderComponent={
            <>
              <ListHeader />
              {/* Filters */}
              <View style={[s.filterRow, { borderBottomColor: colors.borderColor }]}>
                {[undefined, "KFH", "BBYN", "USA"].map((pf) => (
                  <Pressable
                    key={pf ?? "all"}
                    onPress={() => { setPortfolioFilter(pf); setPage(1); }}
                    style={[s.filterChip, { backgroundColor: portfolioFilter === pf ? colors.accentPrimary : colors.bgCard, borderColor: colors.borderColor }]}
                  >
                    <Text style={[s.filterChipText, { color: portfolioFilter === pf ? "#fff" : colors.textSecondary }]}>
                      {pf ?? "All"}
                    </Text>
                  </Pressable>
                ))}
                <View style={{ width: 8 }} />
                {[undefined, "deposit", "withdrawal"].map((src) => (
                  <Pressable
                    key={src ?? "any"}
                    onPress={() => setSourceFilter(src)}
                    style={[s.filterChip, { backgroundColor: sourceFilter === src ? colors.accentPrimary : colors.bgCard, borderColor: colors.borderColor }]}
                  >
                    <Text style={[s.filterChipText, { color: sourceFilter === src ? "#fff" : colors.textSecondary }]}>
                      {src === "deposit" ? "Deposits" : src === "withdrawal" ? "Withdrawals" : "All Types"}
                    </Text>
                  </Pressable>
                ))}
              </View>
            </>
          }
          ListEmptyComponent={EmptyState}
          ListFooterComponent={<PaginationBar />}
          contentContainerStyle={s.listContent}
          refreshControl={
            <RefreshControl
              refreshing={isFetching && !isLoading}
              onRefresh={refetch}
              tintColor={colors.accentPrimary}
            />
          }
        />
      </View>

      {/* FAB → Add Deposit */}
      <FAB
        icon="plus"
        onPress={() => router.push("/(tabs)/add-deposit" as any)}
        style={[
          s.fab,
          { backgroundColor: colors.accentPrimary },
          Platform.OS === "web" && { position: "fixed" as any },
        ]}
        color="#fff"
      />
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const s = StyleSheet.create({
  screen: { flex: 1 },
  center: { flex: 1, justifyContent: "center", alignItems: "center", gap: 12 },
  listWrap: { flex: 1 },
  listContent: { paddingBottom: 100 },

  header: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { fontSize: 18, fontWeight: "700" },
  headerTotal: { fontSize: 14, fontWeight: "600" },

  row: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },

  iconCircle: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
    marginRight: 12,
  },

  details: { flex: 1, marginRight: 8 },
  portfolio: { fontSize: 15, fontWeight: "600" },
  date: { fontSize: 13, marginTop: 2 },

  amountCol: { alignItems: "flex-end" },
  amount: { fontSize: 15, fontWeight: "700" },
  source: { fontSize: 11, marginTop: 2 },

  empty: {
    alignItems: "center",
    paddingTop: 80,
    gap: 8,
  },
  emptyTitle: { fontSize: 18, fontWeight: "700" },
  emptyBody: { fontSize: 14, textAlign: "center", maxWidth: 260 },

  pagination: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 16,
    gap: 12,
    borderTopWidth: 1,
  },
  pageBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  pageInfo: { fontSize: 13 },

  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: 16,
    paddingVertical: 8,
    gap: 6,
    borderBottomWidth: 1,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  filterChipText: { fontSize: 12, fontWeight: "600" },

  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  exportBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  errorText: { fontSize: 14, textAlign: "center", marginHorizontal: 24 },
  retryBtn: {
    paddingHorizontal: 24,
    paddingVertical: 10,
    borderRadius: 8,
    marginTop: 8,
  },

  fab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    borderRadius: 28,
  },
});
