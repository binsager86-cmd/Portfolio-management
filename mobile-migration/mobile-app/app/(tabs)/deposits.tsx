/**
 * Deposits screen — paginated list of cash deposits/withdrawals.
 *
 * • Pull-to-refresh
 * • Pagination controls
 * • FAB → add-deposit form
 * • Empty state
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { FlashList } from "@shopify/flash-list";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useCallback, useMemo, useState } from "react";
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
import { FAB } from "react-native-paper";

import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { FilterChip } from "@/components/ui/FilterChip";
import { DepositsSkeleton } from "@/components/ui/PageSkeletons";
import { useToast } from "@/components/ui/ToastProvider";
import type { ThemePalette } from "@/constants/theme";
import { useDeposits } from "@/hooks/queries";
import { useResponsive } from "@/hooks/useResponsive";
import { formatCurrency } from "@/lib/currency";
import { todayISO } from "@/lib/dateUtils";
import { showErrorAlert } from "@/lib/errorHandling";
import { CashDepositRecord, deleteDeposit, downloadDepositsTemplate, exportDepositsExcel, importDepositsExcel } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";

const PAGE_SIZE = 25;

// ── Single deposit row ──────────────────────────────────────────────

const DepositRow = React.memo(function DepositRow({
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
});

// ── Main screen ─────────────────────────────────────────────────────

export default function DepositsScreen() {
  const router = useRouter();
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();
  const queryClient = useQueryClient();
  const toast = useToast();
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
  } = useDeposits({ page, pageSize: PAGE_SIZE, portfolio: portfolioFilter });

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
      toast.info("Excel export is available on the web version.");
      return;
    }
    try {
      setExporting(true);
      const blob = await exportDepositsExcel();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `deposits_${todayISO()}.xlsx`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  }, []);

  // ── Upload deposits from Excel ──────────────────────────────────
  const [showUpload, setShowUpload] = useState(false);
  const [uploadMode, setUploadMode] = useState<"merge" | "replace">("merge");
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<{
    imported: number;
    skipped: number;
    total_rows: number;
    errors: Array<{ row: number; error: string }>;
  } | null>(null);

  const handleDownloadTemplate = useCallback(async () => {
    if (Platform.OS !== "web") {
      toast.info("Template download is available on the web version.");
      return;
    }
    try {
      const blob = await downloadDepositsTemplate();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "cash_deposits_template.xlsx";
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to download template");
    }
  }, []);

  const handleUploadFile = useCallback(async () => {
    if (Platform.OS !== "web") {
      toast.info("Excel upload is available on the web version.");
      return;
    }

    // Create file picker via hidden input
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".xlsx,.xls";
    input.onchange = async (e: any) => {
      const file = e.target?.files?.[0];
      if (!file) return;

      // Confirm replace mode
      if (uploadMode === "replace") {
        const ok = window.confirm(
          "⚠️ REPLACE mode will DELETE ALL existing deposits before importing. Continue?"
        );
        if (!ok) return;
      }

      setUploading(true);
      setUploadResult(null);
      try {
        const fd = new FormData();
        fd.append("file", file);

        const result = await importDepositsExcel(fd, uploadMode);
        setUploadResult(result);

        // Refresh data
        await Promise.all([
          queryClient.refetchQueries({ queryKey: ["deposits"] }),
          queryClient.refetchQueries({ queryKey: ["deposits-total"] }),
          queryClient.refetchQueries({ queryKey: ["cash-balances"] }),
          queryClient.refetchQueries({ queryKey: ["portfolio-overview"] }),
          queryClient.refetchQueries({ queryKey: ["holdings"] }),
          queryClient.refetchQueries({ queryKey: ["snapshots"] }),
          queryClient.refetchQueries({ queryKey: ["tracker-data"] }),
        ]);

        if (result.imported > 0) {
          toast.success(
            `Imported ${result.imported} deposits.` +
              (result.skipped > 0 ? ` Skipped ${result.skipped}.` : "") +
              (result.errors.length > 0
                ? ` ${result.errors.length} error(s).`
                : "")
          );
        } else {
          toast.info("No deposits were imported. Check your file format.");
        }
      } catch (err: unknown) {
        showErrorAlert("Upload Failed", err);
      } finally {
        setUploading(false);
      }
    };
    input.click();
  }, [uploadMode, queryClient]);

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
    <View>
      <View style={[s.header, { borderBottomColor: colors.borderColor }]}>
        <Text style={[s.headerTitle, { color: colors.textPrimary }]}>
          Cash Deposits
        </Text>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          {totalKwd > 0 && (
            <Text style={[s.headerTotal, { color: colors.accentPrimary }]}>
              Total: {formatCurrency(totalKwd, "KWD")}
            </Text>
          )}
          <Pressable
            onPress={() => setShowUpload(!showUpload)}
            style={({ pressed }) => [
              s.exportBtn,
              {
                backgroundColor: showUpload ? colors.accentPrimary : colors.accentSecondary,
                opacity: pressed ? 0.6 : 1,
              },
            ]}
          >
            <FontAwesome name="upload" size={13} color="#fff" />
            <Text style={s.exportBtnText}>Upload</Text>
          </Pressable>
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

      {/* Upload panel (collapsible) */}
      {showUpload && (
        <View style={[s.uploadPanel, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <Text style={[s.uploadTitle, { color: colors.textPrimary }]}>
            📥 Upload Cash Deposits from Excel
          </Text>
          <Text style={[s.uploadCaption, { color: colors.textSecondary }]}>
            Upload an Excel file with columns: deposit_date, amount, currency, portfolio, source, bank_name, description, notes
          </Text>

          {/* Mode toggle */}
          <View style={s.uploadModeRow}>
            <Text style={[s.uploadModeLabel, { color: colors.textSecondary }]}>Mode:</Text>
            <Pressable
              onPress={() => setUploadMode("merge")}
              style={[
                s.uploadModeChip,
                {
                  backgroundColor: uploadMode === "merge" ? colors.accentPrimary : colors.bgInput,
                  borderColor: uploadMode === "merge" ? colors.accentPrimary : colors.borderColor,
                },
              ]}
            >
              <Text style={{ color: uploadMode === "merge" ? "#fff" : colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
                Merge (Append)
              </Text>
            </Pressable>
            <Pressable
              onPress={() => setUploadMode("replace")}
              style={[
                s.uploadModeChip,
                {
                  backgroundColor: uploadMode === "replace" ? colors.danger : colors.bgInput,
                  borderColor: uploadMode === "replace" ? colors.danger : colors.borderColor,
                },
              ]}
            >
              <Text style={{ color: uploadMode === "replace" ? "#fff" : colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
                Replace (Delete All First)
              </Text>
            </Pressable>
          </View>

          {uploadMode === "replace" && (
            <View style={[s.uploadWarning, { backgroundColor: colors.danger + "15", borderColor: colors.danger + "40" }]}>
              <FontAwesome name="exclamation-triangle" size={12} color={colors.danger} />
              <Text style={{ color: colors.danger, fontSize: 11, flex: 1 }}>
                Replace mode will DELETE ALL existing deposits before importing.
              </Text>
            </View>
          )}

          {/* Action buttons */}
          <View style={s.uploadActions}>
            <Pressable
              onPress={handleDownloadTemplate}
              style={[s.uploadActionBtn, { borderColor: colors.borderColor }]}
            >
              <FontAwesome name="download" size={12} color={colors.accentPrimary} />
              <Text style={{ color: colors.accentPrimary, fontSize: 12, fontWeight: "600" }}>
                Template
              </Text>
            </Pressable>

            <Pressable
              onPress={handleUploadFile}
              disabled={uploading}
              style={[
                s.uploadActionBtn,
                {
                  backgroundColor: colors.accentPrimary,
                  borderColor: colors.accentPrimary,
                  opacity: uploading ? 0.6 : 1,
                  flex: 1,
                },
              ]}
            >
              {uploading ? (
                <ActivityIndicator size="small" color="#fff" />
              ) : (
                <FontAwesome name="upload" size={12} color="#fff" />
              )}
              <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700" }}>
                {uploading ? "Importing..." : "Choose File & Import"}
              </Text>
            </Pressable>
          </View>

          {/* Import result summary */}
          {uploadResult && (
            <View style={[s.uploadResult, { borderColor: uploadResult.imported > 0 ? colors.success + "50" : colors.danger + "50", backgroundColor: uploadResult.imported > 0 ? colors.success + "10" : colors.danger + "10" }]}>
              <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700", marginBottom: 4 }}>
                Import Result
              </Text>
              <Text style={{ color: colors.success, fontSize: 12, fontWeight: "600" }}>
                ✅ {uploadResult.imported} imported
              </Text>
              {uploadResult.skipped > 0 && (
                <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                  ⏭ {uploadResult.skipped} skipped
                </Text>
              )}
              {uploadResult.errors.length > 0 && (
                <View>
                  <Text style={{ color: colors.danger, fontSize: 12, fontWeight: "600", marginTop: 4 }}>
                    ❌ {uploadResult.errors.length} error(s):
                  </Text>
                  {uploadResult.errors.slice(0, 5).map((err, i) => (
                    <Text key={i} style={{ color: colors.textMuted, fontSize: 11 }}>
                      Row {err.row}: {err.error}
                    </Text>
                  ))}
                  {uploadResult.errors.length > 5 && (
                    <Text style={{ color: colors.textMuted, fontSize: 11 }}>
                      ... and {uploadResult.errors.length - 5} more
                    </Text>
                  )}
                </View>
              )}
            </View>
          )}
        </View>
      )}
    </View>
  );

  // ── Loading / Error ─────────────────────────────────────────────

  if (isLoading) {
    return <DepositsSkeleton />;
  }

  if (isError) {
    return <ErrorScreen message={(error as Error)?.message ?? "Failed to load deposits"} onRetry={() => refetch()} />;
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
        <FlashList
          data={deposits}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => <DepositRow item={item} colors={colors} onEdit={handleEdit} onDelete={handleDelete} />}
          ListHeaderComponent={
            <>
              <ListHeader />
              {/* Filters */}
              <View style={[s.filterRow, { borderBottomColor: colors.borderColor }]}>
                {[undefined, "KFH", "BBYN", "USA"].map((pf) => (
                  <FilterChip
                    key={pf ?? "all"}
                    label={pf ?? "All"}
                    active={portfolioFilter === pf}
                    onPress={() => { setPortfolioFilter(pf); setPage(1); }}
                    colors={colors}
                  />
                ))}
                <View style={{ width: 8 }} />
                {[undefined, "deposit", "withdrawal"].map((src) => (
                  <FilterChip
                    key={src ?? "any"}
                    label={src === "deposit" ? "Deposits" : src === "withdrawal" ? "Withdrawals" : "All Types"}
                    active={sourceFilter === src}
                    onPress={() => setSourceFilter(src)}
                    colors={colors}
                  />
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

  exportBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 6,
    gap: 4,
  },
  exportBtnText: { color: "#fff", fontSize: 12, fontWeight: "700" },

  fab: {
    position: "absolute",
    right: 20,
    bottom: 28,
    borderRadius: 28,
  },

  // Upload panel styles
  uploadPanel: {
    marginHorizontal: 16,
    marginTop: 8,
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    gap: 10,
  },
  uploadTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  uploadCaption: {
    fontSize: 12,
    lineHeight: 18,
  },
  uploadModeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
  },
  uploadModeLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  uploadModeChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  uploadWarning: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    padding: 8,
    borderRadius: 8,
    borderWidth: 1,
  },
  uploadActions: {
    flexDirection: "row",
    gap: 8,
    alignItems: "center",
  },
  uploadActionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
    justifyContent: "center",
  },
  uploadResult: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    gap: 2,
  },
});
