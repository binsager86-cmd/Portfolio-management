/**
 * Trading Section — CFA/IFRS-compliant trading overview.
 *
 * Mirrors the Streamlit ``ui_trading_section()`` screen:
 *   - 12 summary metric cards (buys, sells, deposits, withdrawals,
 *     unrealized/realized/total P&L, dividends, fees, net cash flow, return %)
 *   - Portfolio / type / search filters
 *   - Full 19-column data table matching Streamlit render_trading_table()
 *   - Pull-to-refresh, pagination, click-to-sort columns
 *
 * All heavy WAC computation happens server-side via
 * GET /api/v1/portfolio/trading-summary
 */

import React, { useState, useCallback, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  RefreshControl,
  TextInput,
  Platform,
  Alert,
  ActivityIndicator,
} from "react-native";
import { useQueryClient, useMutation } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useTradingSummary, useStocks } from "@/hooks/queries";
import {
  recalculateWAC,
  exportTradingExcel,
  renameStockBySymbol,
  updateTransaction,
  deleteTransaction,
  TradingTransaction,
} from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import { todayISO } from "@/lib/dateUtils";
import { fmtNum } from "@/lib/currency";
import { showErrorAlert } from "@/lib/errorHandling";

// Extracted components
import { TradingSummaryCards } from "@/components/trading/TradingSummary";
import {
  TABLE_COLUMNS,
  TOTAL_TABLE_WIDTH,
  sortTransactions,
  HeaderCell,
  TableRow,
  ts,
} from "@/components/trading/TradingTable";
import type { SortDir } from "@/components/trading/TradingTable";
import { FilterChip, PORTFOLIOS, TXN_TYPES } from "@/components/trading/TradingFilters";
import {
  EditRowData,
  txnToEditRow,
  editRowChanged,
  EDIT_COLUMNS,
  EDIT_TABLE_WIDTH,
  EditableTableRow,
  editStyles,
} from "@/components/trading/TradingEditableRow";

// ── Main Screen ─────────────────────────────────────────────────────

export default function TradingScreen() {
  const { colors } = useThemeStore();
  const { isDesktop, fonts } = useResponsive();
  const queryClient = useQueryClient();

  const [portfolios, setPortfolios] = useState<string[]>([]);
  const [txnTypes, setTxnTypes] = useState<string[]>([]);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search);
  const debouncedDateFrom = useDebouncedValue(dateFrom);
  const debouncedDateTo = useDebouncedValue(dateTo);

  const hasActiveFilters = !!(portfolios.length || txnTypes.length || dateFrom || dateTo || search);

  const clearAllFilters = useCallback(() => {
    setPortfolios([]);
    setTxnTypes([]);
    setDateFrom("");
    setDateTo("");
    setSearch("");
    setPage(1);
  }, []);

  const { data, isLoading, isError, error, refetch, isFetching } = useTradingSummary({
    portfolios,
    txnTypes,
    dateFrom: debouncedDateFrom,
    dateTo: debouncedDateTo,
    search: debouncedSearch,
    page,
    pageSize: 100,
  });

  // Recalculate WAC mutation
  const recalcMutation = useMutation({
    mutationFn: recalculateWAC,
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["trading-summary"] });
      Alert.alert(
        "Recalculation Complete",
        `Updated ${result.updated} transactions across ${result.positions_processed} positions.`
        + (result.errors.length > 0 ? `\n\nErrors: ${result.errors.join(", ")}` : "")
      );
    },
    onError: (err) => showErrorAlert("Error", err, "Failed to recalculate"),
  });

  // Fetch cached stocks for the stock picker in edit mode
  const { data: stocksData } = useStocks();
  const allStocks = useMemo(() => stocksData?.stocks ?? [], [stocksData]);

  // Rename stock mutation (inline edit on company name)
  const renameMutation = useMutation({
    mutationFn: ({ symbol, name }: { symbol: string; name: string }) =>
      renameStockBySymbol(symbol, name),
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["trading-summary"] });
      Alert.alert("Updated", `"${result.symbol}" renamed to "${result.name}"`);
    },
    onError: (err: any) => {
      Alert.alert("Rename Failed", err?.message ?? "Could not rename stock");
    },
  });

  const handleRename = useCallback(
    (symbol: string, newName: string) => {
      renameMutation.mutate({ symbol, name: newName });
    },
    [renameMutation]
  );

  // Export handler
  const handleExport = useCallback(async () => {
    try {
      if (Platform.OS === "web") {
        const blob = await exportTradingExcel();
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `transactions_${todayISO()}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        Alert.alert("Export", "Excel export is available on the web version.");
      }
    } catch (err: any) {
      Alert.alert("Export Error", err?.message ?? "Failed to export");
    }
  }, []);

  const onRefresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ["trading-summary"] });
    refetch();
  }, [refetch, queryClient]);

  const totalPages = data?.pagination?.total_pages ?? 1;

  // ── Sort state (must be before early returns) ──────────────────
  const [sortCol, setSortCol] = useState<keyof TradingTransaction | null>(null);
  const [sortDir, setSortDir] = useState<SortDir>(null);

  const onSort = useCallback(
    (key: keyof TradingTransaction) => {
      if (sortCol !== key) {
        setSortCol(key);
        setSortDir("asc");
      } else if (sortDir === "asc") {
        setSortDir("desc");
      } else {
        setSortCol(null);
        setSortDir(null);
      }
    },
    [sortCol, sortDir]
  );

  const transactions = data?.transactions ?? [];

  // Client-side multi-select filtering (backend only supports single values)
  const filteredTransactions = useMemo(() => {
    let txns = transactions;
    if (portfolios.length > 1) {
      txns = txns.filter((t) => portfolios.includes(t.portfolio ?? ""));
    }
    if (txnTypes.length > 1) {
      txns = txns.filter((t) => {
        const ttype = (t.type ?? "").toLowerCase();
        return txnTypes.some((ft) => {
          const ftl = ft.toLowerCase();
          if (ftl === "dividend_only") return ttype === "dividend" || ttype.includes("div");
          return ttype === ftl || ttype.includes(ftl);
        });
      });
    }
    return txns;
  }, [transactions, portfolios, txnTypes]);

  const sortedTransactions = useMemo(
    () => sortTransactions(filteredTransactions, sortCol, sortDir),
    [filteredTransactions, sortCol, sortDir]
  );

  // ── Edit Mode state ───────────────────────────────────────────
  const [editMode, setEditMode] = useState(false);
  const [editRows, setEditRows] = useState<Record<number, EditRowData>>({});
  const [originalRows, setOriginalRows] = useState<Record<number, EditRowData>>({});
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [deleteConfirmPending, setDeleteConfirmPending] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Populate edit rows when entering edit mode or when data changes
  const enterEditMode = useCallback(() => {
    const rows: Record<number, EditRowData> = {};
    const orig: Record<number, EditRowData> = {};
    for (const txn of sortedTransactions) {
      const r = txnToEditRow(txn);
      rows[txn.id] = { ...r };
      orig[txn.id] = { ...r };
    }
    setEditRows(rows);
    setOriginalRows(orig);
    setSelectedIds(new Set());
    setDeleteConfirmPending(false);
    setEditMode(true);
  }, [sortedTransactions]);

  const exitEditMode = useCallback(() => {
    setEditMode(false);
    setEditRows({});
    setOriginalRows({});
    setSelectedIds(new Set());
    setDeleteConfirmPending(false);
  }, []);

  const handleToggleSelect = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const handleUpdateField = useCallback(
    (id: number, field: keyof EditRowData, value: string) => {
      setEditRows((prev) => ({
        ...prev,
        [id]: { ...prev[id], [field]: value },
      }));
    },
    []
  );

  // Save changes — compare each row and call updateTransaction for changed rows
  const handleSaveChanges = useCallback(async () => {
    setIsSaving(true);
    try {
      let changes = 0;
      const errors: string[] = [];

      for (const [idStr, editRow] of Object.entries(editRows)) {
        const id = Number(idStr);
        const orig = originalRows[id];
        if (!orig || !editRowChanged(editRow, orig)) continue;

        const qty = parseFloat(editRow.quantity) || 0;
        const price = parseFloat(editRow.price) || 0;
        const fees = parseFloat(editRow.fees) || 0;
        const txnType = editRow.type;

        // Calculate purchase_cost / sell_value based on type (matches Streamlit logic)
        let purchase_cost: number | null = null;
        let sell_value: number | null = null;
        if (txnType === "Buy" || txnType === "Deposit") {
          purchase_cost = qty > 0 && price > 0 ? qty * price : 0;
          sell_value = 0;
        } else if (txnType === "Sell" || txnType === "Withdrawal") {
          purchase_cost = 0;
          sell_value = qty > 0 && price > 0 ? qty * price : 0;
        }

        try {
          await updateTransaction(id, {
            txn_date: editRow.date,
            stock_symbol: editRow.symbol,
            portfolio: editRow.portfolio,
            txn_type: txnType as any,
            shares: qty,
            fees,
            notes: editRow.notes || null,
            ...(purchase_cost != null ? { purchase_cost } : {}),
            ...(sell_value != null ? { sell_value } : {}),
          });
          changes++;
        } catch (err: any) {
          errors.push(`ID ${id}: ${err?.message ?? "Failed"}`);
        }
      }

      if (changes > 0) {
        queryClient.invalidateQueries({ queryKey: ["trading-summary"] });
        // Recalculate WAC after edits
        try { await recalculateWAC(); } catch (_) { /* non-critical */ }
        queryClient.invalidateQueries({ queryKey: ["trading-summary"] });
        Alert.alert(
          "Saved",
          `Updated ${changes} transaction(s).` +
            (errors.length > 0 ? `\n\nErrors:\n${errors.join("\n")}` : "")
        );
      } else if (errors.length > 0) {
        Alert.alert("Errors", errors.join("\n"));
      } else {
        Alert.alert("No Changes", "No modifications detected.");
      }
      exitEditMode();
    } catch (err: any) {
      Alert.alert("Save Error", err?.message ?? "Failed to save changes");
    } finally {
      setIsSaving(false);
    }
  }, [editRows, originalRows, queryClient, exitEditMode]);

  // Delete selected rows
  const handleDeleteSelected = useCallback(async () => {
    setIsDeleting(true);
    try {
      let deleted = 0;
      const errors: string[] = [];
      for (const id of selectedIds) {
        try {
          await deleteTransaction(id);
          deleted++;
        } catch (err: any) {
          errors.push(`ID ${id}: ${err?.message ?? "Failed"}`);
        }
      }
      if (deleted > 0) {
        queryClient.invalidateQueries({ queryKey: ["trading-summary"] });
        try { await recalculateWAC(); } catch (_) { /* non-critical */ }
        queryClient.invalidateQueries({ queryKey: ["trading-summary"] });
        Alert.alert(
          "Deleted",
          `Deleted ${deleted} transaction(s). Use Trash to undo.` +
            (errors.length > 0 ? `\n\nErrors:\n${errors.join("\n")}` : "")
        );
      } else if (errors.length > 0) {
        Alert.alert("Errors", errors.join("\n"));
      }
      exitEditMode();
    } catch (err: any) {
      Alert.alert("Delete Error", err?.message ?? "Failed to delete");
    } finally {
      setIsDeleting(false);
      setDeleteConfirmPending(false);
    }
  }, [selectedIds, queryClient, exitEditMode]);

  if (isLoading && !data) return <LoadingScreen />;
  if (isError && !data)
    return <ErrorScreen message={error?.message ?? "Failed to load"} onRetry={refetch} />;

  const summary = data?.summary;

  // ── Render helpers ──────────────────────────────────────────────

  const renderHeader = () => (
    <View style={{ paddingBottom: 8 }}>
      {/* Title */}
      <View style={[s.headerCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Text style={[s.title, { color: colors.textPrimary, fontSize: fonts.title }]}>
          ًں“ˆ Trading Section
        </Text>
        <Text style={[s.subtitle, { color: colors.textSecondary }]}>
          All transactions آ· Real-time P&L آ· CFA-compliant cost basis
        </Text>
      </View>

      {/* Info card */}
      <View style={[s.infoCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Text style={[s.infoTitle, { color: colors.textPrimary }]}>ًں“‹ All your saved transactions</Text>
        <Text style={[s.infoBody, { color: colors.textSecondary }]}>
          Buy/Sell trades, Cash Deposits/Withdrawals, Dividends, Bonus Shares — all in one view.
          {"\n"}P&L calculated using CFA-compliant Weighted Average Cost method per portfolio.
        </Text>
      </View>

      {/* Summary metrics */}
      {summary && <TradingSummaryCards summary={summary} dateFrom={dateFrom} dateTo={dateTo} />}

      {/* Section header: Filters */}
      <View style={[s.sectionHeader, { borderBottomColor: colors.borderColor }]}>
        <FontAwesome name="filter" size={14} color={colors.accentSecondary} />
        <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Filters</Text>
      </View>

      {/* Portfolio filter */}
      <View style={s.filterRow}>
        {PORTFOLIOS.map((pf) => (
          <FilterChip
            key={pf}
            label={pf}
            active={portfolios.includes(pf)}
            onPress={() => {
              setPortfolios((prev) =>
                prev.includes(pf) ? prev.filter((p) => p !== pf) : [...prev, pf]
              );
              setPage(1);
            }}
            colors={colors}
          />
        ))}
      </View>

      {/* Type filter */}
      <View style={s.filterRow}>
        {TXN_TYPES.map((tp) => (
          <FilterChip
            key={tp}
            label={tp === "Dividend_Only" ? "Div Only" : tp}
            active={txnTypes.includes(tp)}
            onPress={() => {
              setTxnTypes((prev) =>
                prev.includes(tp) ? prev.filter((t) => t !== tp) : [...prev, tp]
              );
              setPage(1);
            }}
            activeColor={
              tp === "Buy" ? colors.success
              : tp === "Sell" ? colors.danger
              : tp === "Dividend" || tp === "Dividend_Only" ? colors.accentTertiary
              : undefined
            }
            colors={colors}
          />
        ))}
      </View>

      {/* Date range filter */}
      <View style={s.dateRow}>
        <View style={[s.dateInputWrap, { backgroundColor: colors.bgInput, borderColor: colors.borderColor }]}>
          <FontAwesome name="calendar" size={12} color={colors.textMuted} />
          {Platform.OS === "web" ? (
            <input
              type="date"
              value={dateFrom}
              onChange={(e: any) => { setDateFrom(e.target.value); setPage(1); }}
              style={{
                flex: 1,
                fontSize: 13,
                color: colors.textPrimary,
                background: "transparent",
                border: "none",
                outline: "none",
                fontFamily: "inherit",
              } as any}
            />
          ) : (
            <TextInput
              value={dateFrom}
              onChangeText={(t) => { setDateFrom(t); setPage(1); }}
              placeholder="From (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              style={[s.dateInput, { color: colors.textPrimary }]}
              maxLength={10}
              returnKeyType="done"
            />
          )}
        </View>
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>â†’</Text>
        <View style={[s.dateInputWrap, { backgroundColor: colors.bgInput, borderColor: colors.borderColor }]}>
          <FontAwesome name="calendar" size={12} color={colors.textMuted} />
          {Platform.OS === "web" ? (
            <input
              type="date"
              value={dateTo}
              onChange={(e: any) => { setDateTo(e.target.value); setPage(1); }}
              style={{
                flex: 1,
                fontSize: 13,
                color: colors.textPrimary,
                background: "transparent",
                border: "none",
                outline: "none",
                fontFamily: "inherit",
              } as any}
            />
          ) : (
            <TextInput
              value={dateTo}
              onChangeText={(t) => { setDateTo(t); setPage(1); }}
              placeholder="To (YYYY-MM-DD)"
              placeholderTextColor={colors.textMuted}
              style={[s.dateInput, { color: colors.textPrimary }]}
              maxLength={10}
              returnKeyType="done"
            />
          )}
        </View>
      </View>

      {/* Clear Filters */}
      {hasActiveFilters && (
        <Pressable
          onPress={clearAllFilters}
          style={[s.clearBtn, { borderColor: colors.danger }]}
        >
          <FontAwesome name="times" size={12} color={colors.danger} />
          <Text style={[s.clearBtnText, { color: colors.danger }]}>Clear All Filters</Text>
        </Pressable>
      )}

      {/* Search */}
      <View style={[s.searchRow, { backgroundColor: colors.bgInput, borderColor: colors.borderColor }]}>
        <FontAwesome name="search" size={14} color={colors.textMuted} />
        <TextInput
          value={search}
          onChangeText={(t) => { setSearch(t); setPage(1); }}
          placeholder="Search symbol, portfolio, notes..."
          placeholderTextColor={colors.textMuted}
          style={[s.searchInput, { color: colors.textPrimary }]}
          returnKeyType="search"
          autoCapitalize="none"
          autoCorrect={false}
        />
        {search.length > 0 && (
          <Pressable onPress={() => setSearch("")}>
            <FontAwesome name="times-circle" size={16} color={colors.textMuted} />
          </Pressable>
        )}
      </View>

      {/* Results count */}
      <View style={s.resultsRow}>
        <Text style={[s.resultsText, { color: colors.textSecondary }]}>
          {data?.pagination?.total_items ?? 0} transactions
          {portfolios.length ? ` آ· ${portfolios.join(", ")}` : ""}
          {txnTypes.length ? ` آ· ${txnTypes.join(", ")}` : ""}
          {dateFrom ? ` آ· from ${dateFrom}` : ""}
          {dateTo ? ` آ· to ${dateTo}` : ""}
          {search ? ` آ· "${search}"` : ""}
        </Text>
      </View>

      {/* Action buttons */}
      <View style={s.actionRow}>
        <Pressable
          onPress={() => recalcMutation.mutate()}
          disabled={recalcMutation.isPending}
          style={[
            s.actionBtn,
            {
              backgroundColor: colors.accentPrimary + "18",
              borderColor: colors.accentPrimary,
              opacity: recalcMutation.isPending ? 0.6 : 1,
            },
          ]}
        >
          {recalcMutation.isPending ? (
            <ActivityIndicator size="small" color={colors.accentPrimary} />
          ) : (
            <FontAwesome name="refresh" size={13} color={colors.accentPrimary} />
          )}
          <Text style={[s.actionBtnText, { color: colors.accentPrimary }]}>
            {recalcMutation.isPending ? "Recalculating..." : "Recalculate WAC"}
          </Text>
        </Pressable>

        <Pressable
          onPress={handleExport}
          style={[
            s.actionBtn,
            {
              backgroundColor: colors.success + "18",
              borderColor: colors.success,
            },
          ]}
        >
          <FontAwesome name="download" size={13} color={colors.success} />
          <Text style={[s.actionBtnText, { color: colors.success }]}>Export Excel</Text>
        </Pressable>
      </View>

      {/* Section header: Transaction Log */}
      <View style={[s.sectionHeader, { borderBottomColor: colors.borderColor }]}>
        <FontAwesome name="list" size={14} color={colors.success} />
        <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Transaction Log</Text>
      </View>

      {/* View / Edit mode toggle */}
      <View style={[editStyles.modeToggle, { borderColor: colors.borderColor }]}>
        <Pressable
          onPress={() => { if (editMode) exitEditMode(); }}
          style={[
            editStyles.modeBtn,
            {
              backgroundColor: !editMode ? colors.accentPrimary : "transparent",
            },
          ]}
        >
          <FontAwesome name="bar-chart" size={12} color={!editMode ? "#fff" : colors.textSecondary} />
          <Text style={[editStyles.modeBtnText, { color: !editMode ? "#fff" : colors.textSecondary }]}>
            View
          </Text>
        </Pressable>
        <Pressable
          onPress={() => { if (!editMode) enterEditMode(); }}
          style={[
            editStyles.modeBtn,
            {
              backgroundColor: editMode ? colors.accentPrimary : "transparent",
            },
          ]}
        >
          <FontAwesome name="pencil" size={12} color={editMode ? "#fff" : colors.textSecondary} />
          <Text style={[editStyles.modeBtnText, { color: editMode ? "#fff" : colors.textSecondary }]}>
            Edit
          </Text>
        </Pressable>
      </View>

      {/* Edit mode warning */}
      {editMode && (
        <View style={[editStyles.editWarning, { backgroundColor: "#f59e0b18", borderColor: "#f59e0b50" }]}>
          <FontAwesome name="exclamation-triangle" size={14} color="#f59e0b" />
          <Text style={[editStyles.editWarningText, { color: "#f59e0b" }]}>
            Editing here updates the main transactions table. Changes affect portfolio positions and cash.
          </Text>
        </View>
      )}

      {/* Edit mode: Save / Delete action buttons */}
      {editMode && (
        <>
          <View style={editStyles.editActionRow}>
            <Pressable
              onPress={handleSaveChanges}
              disabled={isSaving}
              style={[
                editStyles.editActionBtn,
                {
                  backgroundColor: colors.accentPrimary + "18",
                  borderColor: colors.accentPrimary,
                  opacity: isSaving ? 0.6 : 1,
                },
              ]}
            >
              {isSaving ? (
                <ActivityIndicator size="small" color={colors.accentPrimary} />
              ) : (
                <FontAwesome name="save" size={13} color={colors.accentPrimary} />
              )}
              <Text style={[editStyles.editActionBtnText, { color: colors.accentPrimary }]}>
                {isSaving ? "Saving..." : "Save Changes"}
              </Text>
            </Pressable>

            <Pressable
              onPress={() => {
                if (selectedIds.size === 0) return;
                setDeleteConfirmPending(true);
              }}
              disabled={selectedIds.size === 0 || isDeleting}
              style={[
                editStyles.editActionBtn,
                {
                  backgroundColor: selectedIds.size > 0 ? colors.danger + "18" : colors.bgCard,
                  borderColor: selectedIds.size > 0 ? colors.danger : colors.borderColor,
                  opacity: selectedIds.size === 0 ? 0.5 : 1,
                },
              ]}
            >
              <FontAwesome
                name="trash"
                size={13}
                color={selectedIds.size > 0 ? colors.danger : colors.textMuted}
              />
              <Text
                style={[
                  editStyles.editActionBtnText,
                  { color: selectedIds.size > 0 ? colors.danger : colors.textMuted },
                ]}
              >
                Delete ({selectedIds.size})
              </Text>
            </Pressable>

            <Pressable
              onPress={exitEditMode}
              style={[editStyles.editActionBtn, { borderColor: colors.borderColor }]}
            >
              <FontAwesome name="times" size={13} color={colors.textSecondary} />
              <Text style={[editStyles.editActionBtnText, { color: colors.textSecondary }]}>Cancel</Text>
            </Pressable>
          </View>

          {/* Delete confirmation dialog */}
          {deleteConfirmPending && (
            <View style={[editStyles.confirmOverlay, { backgroundColor: colors.danger + "10", borderColor: colors.danger + "50" }]}>
              <Text style={[editStyles.confirmText, { color: colors.danger }]}>
                âڑ ï¸ڈ CONFIRM DELETE: You are about to permanently delete {selectedIds.size} transaction(s). This cannot be undone!
              </Text>
              <View style={editStyles.confirmBtnRow}>
                <Pressable
                  onPress={handleDeleteSelected}
                  disabled={isDeleting}
                  style={[editStyles.confirmBtn, { backgroundColor: colors.danger, borderColor: colors.danger }]}
                >
                  {isDeleting ? (
                    <ActivityIndicator size="small" color="#fff" />
                  ) : (
                    <FontAwesome name="check" size={11} color="#fff" />
                  )}
                  <Text style={[editStyles.confirmBtnText, { color: "#fff" }]}>
                    {isDeleting ? "Deleting..." : "Yes, Delete"}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => setDeleteConfirmPending(false)}
                  style={[editStyles.confirmBtn, { borderColor: colors.borderColor }]}
                >
                  <FontAwesome name="times" size={11} color={colors.textSecondary} />
                  <Text style={[editStyles.confirmBtnText, { color: colors.textSecondary }]}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          )}
        </>
      )}

      {/* Hint for view mode */}
      {!editMode && (
        <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 6 }}>
          Switch to <Text style={{ fontWeight: "700" }}>Edit</Text> mode to modify transactions.
        </Text>
      )}
    </View>
  );

  return (
    <View style={[s.container, { backgroundColor: colors.bgPrimary }]}>
      <ScrollView
        contentContainerStyle={[
          s.list,
          isDesktop && { maxWidth: 1200, alignSelf: "center" as const, width: "100%" },
        ]}
        refreshControl={
          <RefreshControl
            refreshing={isFetching && !isLoading}
            onRefresh={onRefresh}
            tintColor={colors.accentPrimary}
          />
        }
      >
        {renderHeader()}

        {/* ── Data Table (horizontal scroll) ─────────────────────── */}
        {sortedTransactions.length === 0 ? (
          <View style={s.empty}>
            <FontAwesome name="bar-chart" size={48} color={colors.textMuted} />
            <Text style={[s.emptyText, { color: colors.textSecondary }]}>
              No transactions found
            </Text>
            <Text style={[s.emptyHint, { color: colors.textMuted }]}>
              Use "Add Transactions" to record trades
            </Text>
          </View>
        ) : editMode ? (
          /* ── EDIT MODE TABLE ──────────────────────────────────── */
          <View style={[ts.tableOuter, { borderColor: colors.accentPrimary + "50", backgroundColor: colors.bgCard }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={{ minWidth: EDIT_TABLE_WIDTH }}>
                {/* Edit header row */}
                <View
                  style={[
                    ts.headerRow,
                    { borderBottomColor: colors.accentPrimary, backgroundColor: colors.bgSecondary },
                  ]}
                >
                  {EDIT_COLUMNS.map((col) => (
                    <View key={col.key} style={[ts.headerCell, { width: col.width }]}>
                      <Text
                        style={[ts.headerText, { color: colors.textPrimary, textAlign: "center" }]}
                        numberOfLines={1}
                      >
                        {col.label}
                      </Text>
                    </View>
                  ))}
                </View>

                {/* Editable data rows */}
                {sortedTransactions.map((txn, idx) => {
                  const row = editRows[txn.id];
                  if (!row) return null;
                  return (
                    <EditableTableRow
                      key={txn.id}
                      row={row}
                      isSelected={selectedIds.has(txn.id)}
                      onToggleSelect={handleToggleSelect}
                      onUpdateField={handleUpdateField}
                      colors={colors}
                      isEven={idx % 2 === 0}
                      stocks={allStocks}
                    />
                  );
                })}
              </View>
            </ScrollView>
          </View>
        ) : (
          /* ── VIEW MODE TABLE ──────────────────────────────────── */
          <View style={[ts.tableOuter, { borderColor: colors.borderColor, backgroundColor: colors.bgCard }]}>
            <ScrollView horizontal showsHorizontalScrollIndicator={true}>
              <View style={{ minWidth: TOTAL_TABLE_WIDTH }}>
                {/* Header row */}
                <View
                  style={[
                    ts.headerRow,
                    { borderBottomColor: colors.borderColor, backgroundColor: colors.bgSecondary },
                  ]}
                >
                  {TABLE_COLUMNS.map((col) => (
                    <HeaderCell
                      key={col.key}
                      col={col}
                      colors={colors}
                      sortCol={sortCol}
                      sortDir={sortDir}
                      onSort={onSort}
                    />
                  ))}
                </View>

                {/* Data rows */}
                {sortedTransactions.map((txn, idx) => (
                  <TableRow key={txn.id} txn={txn} colors={colors} isEven={idx % 2 === 0} onRename={handleRename} />
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        {/* Pagination */}
        {totalPages > 1 && (
          <View style={s.pagination}>
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
              <FontAwesome name="chevron-left" size={14} color={colors.textPrimary} />
            </Pressable>
            <Text style={[s.pageInfo, { color: colors.textSecondary }]}>
              {page} / {totalPages}
            </Text>
            <Pressable
              onPress={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              style={[
                s.pageBtn,
                {
                  backgroundColor: colors.bgCard,
                  borderColor: colors.borderColor,
                  opacity: page >= totalPages ? 0.4 : 1,
                },
              ]}
            >
              <FontAwesome name="chevron-right" size={14} color={colors.textPrimary} />
            </Pressable>
          </View>
        )}
      </ScrollView>

      {/* Footer stats bar */}
      {summary && (
        <View style={[s.footer, { backgroundColor: colors.bgSecondary, borderTopColor: colors.borderColor }]}>
          <View style={s.footerStat}>
            <Text style={[s.footerValue, { color: colors.accentPrimary }]}>
              {fmtNum(summary.total_transactions, 0)}
            </Text>
            <Text style={[s.footerLabel, { color: colors.textSecondary }]}>Total Txns</Text>
          </View>
          <View style={[s.footerDivider, { backgroundColor: colors.borderColor }]} />
          <View style={s.footerStat}>
            <Text style={[s.footerValue, { color: colors.accentSecondary }]}>
              {fmtNum(summary.total_trades, 0)}
            </Text>
            <Text style={[s.footerLabel, { color: colors.textSecondary }]}>Buy/Sell</Text>
          </View>
          <View style={[s.footerDivider, { backgroundColor: colors.borderColor }]} />
          <View style={s.footerStat}>
            <Text style={[s.footerValue, { color: summary.total_pnl >= 0 ? colors.success : colors.danger }]}>
              {summary.total_pnl >= 0 ? "+" : ""}{fmtNum(summary.total_pnl, 2)}
            </Text>
            <Text style={[s.footerLabel, { color: colors.textSecondary }]}>Total P&L</Text>
          </View>
        </View>
      )}
    </View>
  );
}


// ── General styles (s) ──────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  list: { paddingHorizontal: 16, paddingTop: 12, paddingBottom: 80 },

  // Header card
  headerCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 20,
    marginBottom: 16,
    alignItems: "center",
  },
  title: { fontWeight: "800", letterSpacing: -0.5, marginBottom: 4 },
  subtitle: { fontSize: 13, fontWeight: "500", textAlign: "center" },

  // Info card
  infoCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  infoTitle: { fontSize: 14, fontWeight: "700", marginBottom: 6 },
  infoBody: { fontSize: 13, lineHeight: 20 },

  // Section header
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    marginTop: 8,
    borderBottomWidth: 1,
    marginBottom: 8,
  },
  sectionTitle: { fontSize: 15, fontWeight: "700" },

  // Filters
  filterRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 6,
    marginBottom: 8,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    borderWidth: 1,
  },
  chipText: { fontSize: 12, fontWeight: "600" },

  // Search
  searchRow: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === "ios" ? 10 : 4,
    marginBottom: 8,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}),
  },

  // Results count
  resultsRow: { marginBottom: 4 },
  resultsText: { fontSize: 12 },

  // Date filter
  dateRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  dateInputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: Platform.OS === "ios" ? 8 : 4,
    gap: 6,
  },
  dateInput: {
    flex: 1,
    fontSize: 13,
    ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}),
  },

  // Clear filters
  clearBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 8,
  },
  clearBtnText: { fontSize: 12, fontWeight: "600" },

  // Action buttons
  actionRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 8,
    flexWrap: "wrap",
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
  },
  actionBtnText: { fontSize: 13, fontWeight: "600" },

  // Empty state
  empty: { alignItems: "center", marginTop: 60 },
  emptyText: { fontSize: 16, marginTop: 12, fontWeight: "600" },
  emptyHint: { fontSize: 13, marginTop: 4 },

  // Pagination
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

  // Footer bar
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 20,
    borderTopWidth: 1,
    gap: 16,
  },
  footerStat: { alignItems: "center" },
  footerValue: { fontSize: 16, fontWeight: "700" },
  footerLabel: { fontSize: 10, marginTop: 1 },
  footerDivider: { width: 1, height: 24 },
});
