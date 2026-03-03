/**
 * Transactions list screen — shows paginated transactions with
 * a floating "+" button to add a new one.
 *
 * Uses React Query for data fetching and pull-to-refresh.
 */

import React, { useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  RefreshControl,
  Platform,
  Alert,
} from "react-native";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { getTransactions, TransactionRecord } from "@/services/api";
import { useDeleteTransaction } from "@/hooks/useTransactionMutations";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { formatCurrency } from "@/lib/currency";
import type { ThemePalette } from "@/constants/theme";

// ── Transaction Row ─────────────────────────────────────────────────

function TxnRow({
  txn,
  colors,
  onEdit,
  onDelete,
}: {
  txn: TransactionRecord;
  colors: ThemePalette;
  onEdit?: (txn: TransactionRecord) => void;
  onDelete?: (txn: TransactionRecord) => void;
}) {
  const isBuy = txn.txn_type === "Buy";
  const amount = isBuy ? txn.purchase_cost : txn.sell_value;
  const amountColor = isBuy ? colors.danger : colors.success;
  const typeLabel = isBuy ? "BUY" : "SELL";

  return (
    <View
      style={[
        styles.row,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.borderColor,
        },
      ]}
    >
      {/* Left icon + info */}
      <View style={styles.rowLeft}>
        <View
          style={[
            styles.typeBadge,
            { backgroundColor: amountColor + "22" },
          ]}
        >
          <FontAwesome
            name={isBuy ? "arrow-down" : "arrow-up"}
            size={12}
            color={amountColor}
          />
        </View>
        <View style={{ marginLeft: 12, flex: 1 }}>
          <Text
            style={[styles.symbol, { color: colors.textPrimary }]}
            numberOfLines={1}
          >
            {txn.stock_symbol}
          </Text>
          <Text style={[styles.meta, { color: colors.textSecondary }]}>
            {typeLabel} · {txn.shares} shares · {txn.txn_date}
          </Text>
        </View>
      </View>

      {/* Right amount + actions */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <View style={styles.rowRight}>
          <Text style={[styles.amount, { color: amountColor }]}>
            {amount != null ? formatCurrency(amount, "KWD") : "—"}
          </Text>
          <Text style={[styles.portfolio, { color: colors.textMuted }]}>
            {txn.portfolio}
          </Text>
        </View>
        {onEdit && (
          <Pressable
            onPress={() => onEdit(txn)}
            style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.5 : 0.7 }]}
          >
            <FontAwesome name="pencil" size={15} color={colors.accentPrimary} />
          </Pressable>
        )}
        {onDelete && (
          <Pressable
            onPress={() => onDelete(txn)}
            style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.5 : 0.7 }]}
          >
            <FontAwesome name="trash-o" size={15} color={colors.danger} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────

export default function TransactionsScreen() {
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();
  const router = useRouter();
  const [page, setPage] = useState(1);
  const [portfolioFilter, setPortfolioFilter] = useState<string | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);

  const { data, isLoading, isError, error, refetch, isFetching } = useQuery({
    queryKey: ["transactions", page, portfolioFilter, typeFilter],
    queryFn: () => getTransactions({
      page,
      per_page: 50,
      portfolio: portfolioFilter,
      symbol: undefined,
    }),
  });

  const deleteMutation = useDeleteTransaction();

  const handleEdit = useCallback((txn: TransactionRecord) => {
    router.push({ pathname: "/(tabs)/add-transaction" as any, params: { editId: String(txn.id) } });
  }, [router]);

  const handleDelete = (txn: TransactionRecord) => {
    const msg = `Delete ${txn.txn_type} of ${txn.shares} ${txn.stock_symbol}?`;
    if (Platform.OS === "web") {
      if (window.confirm(msg)) deleteMutation.mutate(txn.id);
    } else {
      Alert.alert("Delete Transaction", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMutation.mutate(txn.id) },
      ]);
    }
  };

  // Client-side type filter
  const filteredTxns = React.useMemo(() => {
    const txns = data?.transactions ?? [];
    if (!typeFilter) return txns;
    return txns.filter((t) => t.txn_type === typeFilter);
  }, [data?.transactions, typeFilter]);

  const onRefresh = useCallback(() => {
    refetch();
  }, [refetch]);

  if (isLoading) return <LoadingScreen />;
  if (isError)
    return (
      <ErrorScreen
        message={error?.message ?? "Failed to load transactions"}
        onRetry={refetch}
      />
    );

  const transactions = filteredTxns;
  const totalPages = data?.pagination?.total_pages ?? 1;

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      {/* Header */}
      <View
        style={[
          styles.header,
          {
            backgroundColor: colors.bgSecondary,
            borderBottomColor: colors.borderColor,
          },
        ]}
      >
        <Text style={[styles.title, { color: colors.textPrimary }]}>
          Transactions
        </Text>
        <Text style={[styles.count, { color: colors.textSecondary }]}>
          {data?.count ?? 0} total
        </Text>
      </View>

      {/* Filters */}
      <View style={[styles.filterRow, { borderBottomColor: colors.borderColor }]}>
        {[undefined, "KFH", "BBYN", "USA"].map((pf) => (
          <Pressable
            key={pf ?? "all"}
            onPress={() => { setPortfolioFilter(pf); setPage(1); }}
            style={[styles.filterChip, { backgroundColor: portfolioFilter === pf ? colors.accentPrimary : colors.bgCard, borderColor: colors.borderColor }]}
          >
            <Text style={[styles.filterChipText, { color: portfolioFilter === pf ? "#fff" : colors.textSecondary }]}>
              {pf ?? "All"}
            </Text>
          </Pressable>
        ))}
        <View style={{ width: 8 }} />
        {[undefined, "Buy", "Sell"].map((tp) => (
          <Pressable
            key={tp ?? "any"}
            onPress={() => setTypeFilter(tp)}
            style={[styles.filterChip, { backgroundColor: typeFilter === tp ? (tp === "Buy" ? colors.danger : tp === "Sell" ? colors.success : colors.accentPrimary) : colors.bgCard, borderColor: colors.borderColor }]}
          >
            <Text style={[styles.filterChipText, { color: typeFilter === tp ? "#fff" : colors.textSecondary }]}>
              {tp ?? "All Types"}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* List */}
      <FlatList
        data={transactions}
        keyExtractor={(item) => String(item.id)}
        renderItem={({ item }) => <TxnRow txn={item} colors={colors} onEdit={handleEdit} onDelete={handleDelete} />}
        contentContainerStyle={[
          styles.list,
          isDesktop && { maxWidth: 800, alignSelf: "center", width: "100%" },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={onRefresh}
            tintColor={colors.accentPrimary}
          />
        }
        ListEmptyComponent={
          <View style={styles.empty}>
            <FontAwesome
              name="exchange"
              size={48}
              color={colors.textMuted}
            />
            <Text
              style={[styles.emptyText, { color: colors.textSecondary }]}
            >
              No transactions yet
            </Text>
          </View>
        }
        ListFooterComponent={
          totalPages > 1 ? (
            <View style={styles.pagination}>
              <Pressable
                onPress={() => setPage((p) => Math.max(1, p - 1))}
                disabled={page <= 1}
                style={[
                  styles.pageBtn,
                  {
                    backgroundColor: colors.bgCard,
                    borderColor: colors.borderColor,
                    opacity: page <= 1 ? 0.4 : 1,
                  },
                ]}
              >
                <FontAwesome
                  name="chevron-left"
                  size={14}
                  color={colors.textPrimary}
                />
              </Pressable>
              <Text style={[styles.pageInfo, { color: colors.textSecondary }]}>
                {page} / {totalPages}
              </Text>
              <Pressable
                onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
                style={[
                  styles.pageBtn,
                  {
                    backgroundColor: colors.bgCard,
                    borderColor: colors.borderColor,
                    opacity: page >= totalPages ? 0.4 : 1,
                  },
                ]}
              >
                <FontAwesome
                  name="chevron-right"
                  size={14}
                  color={colors.textPrimary}
                />
              </Pressable>
            </View>
          ) : null
        }
      />

      {/* FAB */}
      <Pressable
        onPress={() => router.push("/(tabs)/add-transaction" as any)}
        style={({ pressed }) => [
          styles.fab,
          {
            backgroundColor: colors.accentPrimary,
            opacity: pressed ? 0.8 : 1,
          },
        ]}
      >
        <FontAwesome name="plus" size={22} color="#fff" />
      </Pressable>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "space-between",
  },
  title: { fontSize: 24, fontWeight: "700" },
  count: { fontSize: 14 },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 100 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
  },
  rowLeft: { flexDirection: "row", alignItems: "center", flex: 1 },
  rowRight: { alignItems: "flex-end" },
  typeBadge: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: "center",
    justifyContent: "center",
  },
  symbol: { fontSize: 15, fontWeight: "600" },
  meta: { fontSize: 12, marginTop: 2 },
  amount: { fontSize: 15, fontWeight: "600" },
  portfolio: { fontSize: 11, marginTop: 2 },
  empty: { alignItems: "center", marginTop: 80 },
  emptyText: { fontSize: 16, marginTop: 12 },
  pagination: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 16,
    gap: 16,
  },
  pageBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  pageInfo: { fontSize: 14 },
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
  actionBtn: {
    padding: 8,
  },
  fab: {
    position: "absolute",
    bottom: 24,
    right: 24,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
    elevation: 6,
  },
});
