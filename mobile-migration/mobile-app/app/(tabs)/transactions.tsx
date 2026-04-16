/**
 * Transactions list screen — shows paginated transactions with
 * a floating "+" button to add a new one.
 *
 * Uses React Query for data fetching and pull-to-refresh.
 */

import { ReconciliationModal } from "@/components/portfolio/ReconciliationModal";
import KfhTradeImportButton from "@/components/trading/KfhTradeImportButton";
import { withErrorBoundary } from "@/components/ui/ErrorBoundary";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { FilterChip } from "@/components/ui/FilterChip";
import { TransactionsSkeleton } from "@/components/ui/PageSkeletons";
import type { ThemePalette } from "@/constants/theme";
import { useTransactions } from "@/hooks/queries";
import { useResponsive } from "@/hooks/useResponsive";
import { useDeleteTransaction } from "@/hooks/useTransactionMutations";
import { formatCurrency } from "@/lib/currency";
import type { ReconciliationSummary } from "@/lib/reconciliation/utils";
import { buildReconciliationSummary } from "@/lib/reconciliation/utils";
import {
  deleteDeposit,
  getTransactions as fetchAllTransactions,
  getCashBalances,
  getDeposits,
  getHoldings,
  setCashOverride,
  TransactionRecord,
} from "@/services/api";
import { useApplyReconciliation } from "@/services/api/reconciliation";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { FlashList } from "@shopify/flash-list";
import { useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";

// ── Transaction Row ─────────────────────────────────────────────────

const TxnRow = React.memo(function TxnRow({
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
  const { t } = useTranslation();
  const isBuy = txn.txn_type === "Buy";
  const isDividend = txn.txn_type === "DIVIDEND_ONLY";
  const amount = isDividend
    ? txn.cash_dividend
    : isBuy
      ? txn.purchase_cost
      : txn.sell_value;
  const amountColor = isBuy ? colors.danger : colors.success;
  const typeLabel = isDividend ? t("transactionsScreen.cashDividend") : isBuy ? t("transactionsScreen.buy") : t("transactionsScreen.sell");
  const icon = isDividend ? "money" : isBuy ? "arrow-down" : "arrow-up";

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
            name={icon}
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
            {typeLabel} · {isDividend ? "" : `${txn.shares} ${t("transactionsScreen.shares")} · `}{txn.txn_date}
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
});

// ── Reconciliation Summary Banner ───────────────────────────────────

const ReconBanner = React.memo(function ReconBanner({
  summary,
  portfolio,
  colors,
  onReview,
  onDismiss,
}: {
  summary: ReconciliationSummary;
  portfolio: string;
  colors: ThemePalette;
  onReview: () => void;
  onDismiss: () => void;
}) {
  const { t } = useTranslation();
  const hasDiscrepancy = Math.abs(summary.discrepancy) > 0.01;
  const hasWithdrawals = (summary.allWithdrawals ?? []).length > 0;
  const hasOrphanedSells = (summary.orphanedSells ?? []).length > 0;
  const borderColor = hasDiscrepancy ? colors.warning : colors.success;

  return (
    <View
      style={[
        rs.banner,
        {
          backgroundColor: colors.bgCard,
          borderColor,
          borderLeftWidth: 4,
        },
      ]}
    >
      <View style={rs.bannerHeader}>
        <FontAwesome
          name={hasDiscrepancy ? "exclamation-triangle" : "check-circle"}
          size={16}
          color={borderColor}
        />
        <Text style={[rs.bannerTitle, { color: colors.textPrimary }]}>
          {t("reconciliation.sectionTitle")} — {portfolio}
        </Text>
        <Pressable onPress={onDismiss} hitSlop={12}>
          <FontAwesome name="times" size={14} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Discrepancy row */}
      <View style={rs.statRow}>
        <Text style={[rs.statLabel, { color: colors.textSecondary }]}>
          {t("reconciliation.manualDeposits")}
        </Text>
        <Text style={[rs.statValue, { color: colors.textPrimary }]}>
          {formatCurrency(summary.manualTotalDeposits, "KWD")}
        </Text>
      </View>
      <View style={rs.statRow}>
        <Text style={[rs.statLabel, { color: colors.textSecondary }]}>
          {t("reconciliation.computedCash")}
        </Text>
        <Text style={[rs.statValue, { color: colors.textPrimary }]}>
          {formatCurrency(summary.computedCashFromTxns, "KWD")}
        </Text>
      </View>
      {hasDiscrepancy && (
        <View style={[rs.statRow, { marginTop: 4 }]}>
          <Text style={[rs.statLabel, { color: colors.warning, fontWeight: "600" }]}>
            {t("reconciliation.discrepancy")} ({summary.discrepancyPct.toFixed(1)}%)
          </Text>
          <Text style={[rs.statValue, { color: colors.warning, fontWeight: "700" }]}>
            {formatCurrency(summary.discrepancy, "KWD")}
          </Text>
        </View>
      )}

      {/* Withdrawal transactions count */}
      {hasWithdrawals && (
        <View style={[rs.flagRow, { backgroundColor: colors.warning + "15" }]}>
          <FontAwesome name="flag" size={12} color={colors.warning} />
          <Text style={[rs.flagText, { color: colors.textSecondary }]}>
            {summary.allWithdrawals.length} {t("reconciliation.withdrawalTransactions").toLowerCase()}
          </Text>
        </View>
      )}

      {/* Orphaned sells count */}
      {hasOrphanedSells && (
        <View style={[rs.flagRow, { backgroundColor: colors.danger + "15" }]}>
          <FontAwesome name="exclamation-circle" size={12} color={colors.danger} />
          <Text style={[rs.flagText, { color: colors.textSecondary }]}>
            {summary.orphanedSells.length} {t("reconciliation.orphanedSells").toLowerCase()}
          </Text>
        </View>
      )}

      {/* Actions */}
      <View style={rs.actions}>
        <Pressable
          onPress={onReview}
          style={[rs.reviewBtn, { backgroundColor: colors.accentPrimary }]}
        >
          <FontAwesome name="balance-scale" size={12} color="#fff" />
          <Text style={rs.reviewBtnText}>{t("reconciliation.reviewManually")}</Text>
        </Pressable>
        <Pressable onPress={onDismiss} style={[rs.dismissBtn, { borderColor: colors.borderColor }]}>
          <Text style={[rs.dismissBtnText, { color: colors.textSecondary }]}>
            {t("reconciliation.skip")}
          </Text>
        </Pressable>
      </View>
    </View>
  );
});

// ── Main Screen ─────────────────────────────────────────────────────

function TransactionsScreen() {
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();
  const router = useRouter();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [page, setPage] = useState(1);
  const [portfolioFilter, setPortfolioFilter] = useState<string | undefined>(undefined);
  const [typeFilter, setTypeFilter] = useState<string | undefined>(undefined);

  // Reconciliation state
  const [reconSummary, setReconSummary] = useState<ReconciliationSummary | null>(null);
  const [reconPortfolio, setReconPortfolio] = useState("KFH");
  const [reconModalVisible, setReconModalVisible] = useState(false);
  const [reconLoading, setReconLoading] = useState(false);
  const [reconDeleting, setReconDeleting] = useState(false);
  const reconMutation = useApplyReconciliation(reconPortfolio);

  const { data, isLoading, isError, error, refetch, isFetching } = useTransactions({
    page,
    perPage: 50,
    portfolio: portfolioFilter,
  });

  const deleteMutation = useDeleteTransaction();

  const handleEdit = useCallback((txn: TransactionRecord) => {
    router.push({ pathname: "/(tabs)/add-transaction" as any, params: { editId: String(txn.id) } });
  }, [router]);

  const handleDelete = (txn: TransactionRecord) => {
    const msg = t("transactionsScreen.deleteConfirm", { type: txn.txn_type, shares: txn.shares, symbol: txn.stock_symbol });
    if (Platform.OS === "web") {
      if (window.confirm(msg)) deleteMutation.mutate(txn.id);
    } else {
      Alert.alert(t("transactionsScreen.deleteTransaction"), msg, [
        { text: t("app.cancel"), style: "cancel" },
        { text: t("app.delete"), style: "destructive", onPress: () => deleteMutation.mutate(txn.id) },
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

  // ── Reconciliation: post-import handler ─────────────────────────
  const handleImportComplete = useCallback(async () => {
    refetch();
    setReconLoading(true);
    try {
      const pf = "KFH";
      const [txnData, depData, cashData, holdingsData] = await Promise.all([
        fetchAllTransactions({ portfolio: pf, per_page: 10000 }),
        getDeposits({ portfolio: pf, page_size: 10000 }),
        getCashBalances(true),
        getHoldings(pf),
      ]);
      const txns = txnData.transactions ?? [];
      const deposits = depData.deposits ?? [];
      const holdings = holdingsData.holdings ?? [];
      const cashBal = cashData[pf];
      const manualDeposits = cashBal?.manual_override ? cashBal.balance : 0;
      const computedCash = cashBal?.balance ?? 0;
      const summary = buildReconciliationSummary(txns, deposits, manualDeposits, computedCash, undefined, holdings);
      console.log("[Reconciliation]", {
        txns: txns.length,
        deposits: deposits.length,
        holdings: holdings.length,
        cashBal: !!cashBal,
        manualDeposits,
        computedCash,
        withdrawals: summary.allWithdrawals.length,
        orphanedSells: summary.orphanedSells.length,
        discrepancy: summary.discrepancy,
      });
      if (
        summary.allWithdrawals.length > 0 ||
        summary.orphanedSells.length > 0 ||
        Math.abs(summary.discrepancy) > 0.01
      ) {
        setReconSummary(summary);
        setReconPortfolio(pf);
        setReconModalVisible(true);
      }
    } catch (err) {
      console.error("[Reconciliation] Error:", err);
    } finally {
      setReconLoading(false);
    }
  }, [refetch]);

  const handleReconApply = useCallback(
    async (flaggedIds: number[], openingAmount: number, openingDate: string) => {
      try {
        await reconMutation.mutateAsync({
          withdrawalIds: flaggedIds,
          openingBalanceAmount: openingAmount,
          openingBalanceDate: openingDate,
        });
      } catch {
        // Fallback: set cash override if backend endpoint doesn't exist
        try {
          const newBalance = (reconSummary?.computedCashFromTxns ?? 0) + openingAmount;
          await setCashOverride(reconPortfolio, newBalance, "KWD");
          queryClient.invalidateQueries({ queryKey: ["cash-balances"] });
        } catch { /* ignore */ }
      }
      setReconModalVisible(false);
      setReconSummary(null);
      refetch();
    },
    [reconPortfolio, reconSummary, reconMutation, queryClient, refetch],
  );

  const handleReconDismiss = useCallback(() => {
    setReconSummary(null);
    setReconModalVisible(false);
  }, []);

  // Delete selected withdrawal deposits + orphaned-sell transactions after confirmation
  const handleDeleteTransactions = useCallback(
    async (depositIds: number[], txnIds: number[]) => {
      if (depositIds.length === 0 && txnIds.length === 0) return;
      setReconDeleting(true);
      try {
        // Delete withdrawal deposit records
        for (const id of depositIds) {
          await deleteDeposit(id);
        }
        // Delete orphaned sell transactions
        for (const id of txnIds) {
          await deleteMutation.mutateAsync(id);
        }
        setReconModalVisible(false);
        setReconSummary(null);
        refetch();
      } catch (err) {
        console.error("[Reconciliation] Delete error:", err);
      } finally {
        setReconDeleting(false);
      }
    },
    [deleteMutation, refetch],
  );

  if (isLoading) return <TransactionsSkeleton />;
  if (isError)
    return (
      <ErrorScreen
        message={error?.message ?? t("transactionsScreen.failedToLoad")}
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
        <View>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {t("transactionsScreen.title")}
          </Text>
          <Text style={[styles.count, { color: colors.textSecondary }]}>
            {t("transactionsScreen.total", { count: data?.count ?? 0 })}
          </Text>
        </View>
        <KfhTradeImportButton portfolio="KFH" onImportComplete={handleImportComplete} />
      </View>

      {/* Filters */}
      <View style={[styles.filterRow, { borderBottomColor: colors.borderColor }]}>
        {[undefined, "KFH", "BBYN", "USA"].map((pf) => (
          <FilterChip
            key={pf ?? "all"}
            label={pf ?? t("transactionsScreen.all")}
            active={portfolioFilter === pf}
            onPress={() => { setPortfolioFilter(pf); setPage(1); }}
            colors={colors}
          />
        ))}
        <View style={{ width: 8 }} />
        {[undefined, "Buy", "Sell", "DIVIDEND_ONLY"].map((tp) => (
          <FilterChip
            key={tp ?? "any"}
            label={tp === "DIVIDEND_ONLY" ? t("transactionsScreen.dividend") : tp ?? t("transactionsScreen.allTypes")}
            active={typeFilter === tp}
            onPress={() => setTypeFilter(tp)}
            activeColor={tp === "Buy" ? colors.danger : tp === "Sell" ? colors.success : tp === "DIVIDEND_ONLY" ? colors.accentPrimary : undefined}
            colors={colors}
          />
        ))}
      </View>

      {/* Reconciliation loading */}
      {reconLoading && (
        <View style={[rs.loadingRow, { borderBottomColor: colors.borderColor }]}>
          <ActivityIndicator size="small" color={colors.accentPrimary} />
          <Text style={[rs.loadingText, { color: colors.textSecondary }]}>
            {t("reconciliation.loading")}
          </Text>
        </View>
      )}

      {/* Reconciliation summary banner (shown after upload) */}
      {reconSummary && !reconLoading && (
        <ReconBanner
          summary={reconSummary}
          portfolio={reconPortfolio}
          colors={colors}
          onReview={() => setReconModalVisible(true)}
          onDismiss={handleReconDismiss}
        />
      )}

      {/* List */}
      <FlashList
        data={transactions}
        keyExtractor={(item) => String(item.id)}
        estimatedItemSize={80}
        drawDistance={200}
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
              {t("transactionsScreen.noTransactionsYet")}
            </Text>
            <Pressable
              onPress={() => router.push("/(tabs)/add-transaction" as any)}
              style={[{ backgroundColor: colors.accentPrimary, paddingHorizontal: 18, paddingVertical: 8, borderRadius: 8, marginTop: 12 }, Platform.OS === "web" ? ({ cursor: "pointer" } as any) : undefined]}
            >
              <Text style={{ color: "#fff", fontWeight: "600", fontSize: 13 }}>{t("transactionsScreen.addTransaction")}</Text>
            </Pressable>
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

      {/* Reconciliation detail modal */}
      {reconSummary && (
        <ReconciliationModal
          visible={reconModalVisible}
          onClose={() => setReconModalVisible(false)}
          summary={reconSummary}
          portfolio={reconPortfolio}
          currency="KWD"
          colors={colors}
          onApply={handleReconApply}
          onDeleteTransactions={handleDeleteTransactions}
          onSkip={handleReconDismiss}
          applying={reconMutation.isPending}
          deleting={reconDeleting}
        />
      )}
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
    alignItems: "center",
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

// ── Reconciliation Banner Styles ────────────────────────────────────

const rs = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
  },
  bannerHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 10,
  },
  bannerTitle: { flex: 1, fontSize: 14, fontWeight: "700" },
  statRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 3,
  },
  statLabel: { fontSize: 13 },
  statValue: { fontSize: 13, fontWeight: "600" },
  flagRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 8,
    padding: 8,
    borderRadius: 8,
  },
  flagText: { fontSize: 12 },
  actions: {
    flexDirection: "row",
    gap: 8,
    marginTop: 12,
  },
  reviewBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
  },
  reviewBtnText: { color: "#fff", fontSize: 13, fontWeight: "600" },
  dismissBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  dismissBtnText: { fontSize: 13 },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderBottomWidth: 1,
  },
  loadingText: { fontSize: 13 },
});

export default withErrorBoundary(TransactionsScreen, "Unable to load Transactions. Please try again.");
