/**
 * useStatementsTableState — State, mutations, and handlers
 * extracted from StatementsTable component.
 */

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Platform, ScrollView } from "react-native";

import {
    KeyboardSensor,
    PointerSensor,
    useSensor,
    useSensors,
    type DragEndEvent,
} from "@dnd-kit/core";
import { arrayMove } from "@dnd-kit/sortable";

import { showErrorAlert } from "@/lib/errorHandling";
import type { TableData } from "@/lib/exportAnalysis";
import {
    createLineItem,
    deleteAllStatements,
    deleteLineItem,
    deleteStatementsByPeriod,
    FinancialStatement,
    mergeLineItems,
    reorderLineItems,
    updateLineItem,
} from "@/services/api";
import {
    aiRearrangeStatement,
    listStockPdfs,
    logStatementChange,
} from "@/services/api/analytics";
import { STMNT_META } from "../types";
import type { PeriodInfo } from "./StatementTableRows";

const RECONCILE_OPTS = [
  { key: "all", label: "All Types" },
  { key: "income", label: "Income Only" },
  { key: "balance", label: "Balance Sheet Only" },
  { key: "cashflow", label: "Cash Flow Only" },
  { key: "equity", label: "Equity Only" },
] as const;

export { RECONCILE_OPTS };

export function useStatementsTableState(
  stockId: number,
  stockSymbol: string,
  statements: FinancialStatement[],
  isDesktop: boolean,
  statementType?: string,
) {
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [selectedPeriods, setSelectedPeriods] = useState<Set<string>>(new Set());
  const [deleteMode, setDeleteMode] = useState(false);
  const [rearranging, setRearranging] = useState(false);
  const [rearrangeResult, setRearrangeResult] = useState<string | null>(null);
  const [pdfPickerOpen, setPdfPickerOpen] = useState(false);
  const [stmtPickerOpen, setStmtPickerOpen] = useState(false);
  const [reconcileType, setReconcileType] = useState<string>("all");

  const [mergeMode, setMergeMode] = useState(false);
  const [mergeSelection, setMergeSelection] = useState<string[]>([]);
  const [mergeResult, setMergeResult] = useState<string | null>(null);
  const [localOrder, setLocalOrder] = useState<{ code: string; name: string; isTotal: boolean }[] | null>(null);
  const headerScrollRef = useRef<ScrollView>(null);

  const { data: tablePdfs = [] } = useQuery({
    queryKey: ["stock-pdfs", stockId],
    queryFn: () => listStockPdfs(stockId),
    staleTime: 30_000,
  });
  const [selectedPdfId, setSelectedPdfId] = useState<number | undefined>();

  useEffect(() => {
    if (tablePdfs.length > 0 && !selectedPdfId) {
      setSelectedPdfId(tablePdfs[0].id);
    }
  }, [tablePdfs, selectedPdfId]);

  const handleRearrange = useCallback(async () => {
    const targetType = reconcileType === "all" ? statementType : reconcileType;
    if (!targetType) return;
    setPdfPickerOpen(false);
    setStmtPickerOpen(false);
    setRearranging(true);
    setRearrangeResult(null);
    try {
      const typesToReconcile = reconcileType === "all"
        ? ["income", "balance", "cashflow", "equity"]
        : [reconcileType];
      const messages: string[] = [];
      let totalCorrections = 0;
      for (const t of typesToReconcile) {
        const res = await aiRearrangeStatement(stockId, t, undefined, selectedPdfId);
        messages.push(res.message);
        totalCorrections += res.corrections_applied;
      }
      const combined = typesToReconcile.length > 1
        ? `Reconciled ${typesToReconcile.length} statements — ${totalCorrections} total corrections.\n${messages.join("\n")}`
        : messages[0];
      setRearrangeResult(combined);
      if (totalCorrections > 0) {
        queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] });
      }
    } catch (err: unknown) {
      let msg = "AI reconciliation failed";
      if (err && typeof err === "object" && "response" in err) {
        const axErr = err as { response?: { data?: { detail?: string } } };
        msg = axErr.response?.data?.detail || (err instanceof Error ? err.message : msg);
      } else if (err instanceof Error) {
        msg = err.message;
      }
      setRearrangeResult(`Error: ${msg}`);
    } finally {
      setRearranging(false);
    }
  }, [stockId, statementType, reconcileType, selectedPdfId, queryClient]);

  const updateMut = useMutation({
    mutationFn: ({ itemId, amount }: { itemId: number; amount: number }) => updateLineItem(itemId, amount),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] }); setEditingKey(null); },
    onError: (err: Error) => showErrorAlert("Update Failed", err),
  });

  const handleStartEdit = useCallback((id: string, _val: string) => { setEditingKey(id); }, []);

  const handleSaveEdit = useCallback(async (itemId: number, amount: number) => {
    const lineItem = statements
      .flatMap((s) => (s.line_items || []).map((li) => ({ ...li, _statementId: s.id })))
      .find((li) => li.id === itemId);
    const currentValue = lineItem?.amount ?? null;
    const statementId = lineItem?._statementId ?? 0;

    const msg = "Modifying financial statements affects all derived metrics and scores. This action is logged.";

    const doSave = () => {
      updateMut.mutate({ itemId, amount });
      logStatementChange(stockId, statementId, itemId, "manually_edited", currentValue, amount, "user", "Manual adjustment via UI")
        .catch((err: unknown) => console.warn("Audit log failed:", err));
    };

    if (Platform.OS === "web") {
      if (confirm(msg)) doSave();
    } else {
      Alert.alert("Confirm Adjustment", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Confirm", style: "default", onPress: doSave },
      ]);
    }
  }, [updateMut, stockId, statements]);

  const handleCancelEdit = useCallback(() => { setEditingKey(null); }, []);

  const createMut = useMutation({
    mutationFn: (payload: { statement_id: number; line_item_code: string; line_item_name: string; amount: number; order_index?: number }) =>
      createLineItem(stockId, payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] }); setEditingKey(null); },
    onError: (err: Error) => showErrorAlert("Create Failed", err),
  });

  const handleCreateSave = useCallback((statementId: number, code: string, name: string, orderIdx: number, amount: number) => {
    createMut.mutate({ statement_id: statementId, line_item_code: code, line_item_name: name, amount, order_index: orderIdx });
  }, [createMut]);

  const reorderMut = useMutation({
    mutationFn: (items: Array<{ id: number; order_index: number }>) => reorderLineItems(stockId, items),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] }); },
    onError: (err: Error) => { showErrorAlert("Reorder Failed", err); setLocalOrder(null); },
  });

  const deleteLineItemMut = useMutation({
    mutationFn: (itemId: number) => deleteLineItem(itemId),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] }); },
    onError: (err: Error) => showErrorAlert("Delete Failed", err),
  });

  const mergeMut = useMutation({
    mutationFn: ({ keepCode, removeCode }: { keepCode: string; removeCode: string }) =>
      mergeLineItems(stockId, keepCode, removeCode),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] });
      setMergeResult(res.message);
      setMergeSelection([]);
      setMergeMode(false);
    },
    onError: (err: Error) => { showErrorAlert("Merge Failed", err); },
  });

  const handleToggleMerge = useCallback((code: string) => {
    setMergeSelection((prev) => {
      if (prev.includes(code)) return prev.filter((c) => c !== code);
      if (prev.length >= 2) return [prev[1], code];
      return [...prev, code];
    });
  }, []);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor),
  );

  const deleteMut = useMutation({
    mutationFn: (periods: string[]) => deleteStatementsByPeriod(stockId, periods, statementType),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] });
      setSelectedPeriods(new Set());
      setDeleteMode(false);
      Alert.alert("Deleted", res.message);
    },
    onError: (err: Error) => showErrorAlert("Delete Failed", err),
  });

  const deleteAllMut = useMutation({
    mutationFn: () => deleteAllStatements(stockId),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] });
      setDeleteMode(false);
      Alert.alert("Deleted", res.message);
    },
    onError: (err: Error) => showErrorAlert("Delete All Failed", err),
  });

  const togglePeriod = useCallback((period: string) => {
    setSelectedPeriods((prev) => {
      const next = new Set(prev);
      if (next.has(period)) next.delete(period); else next.add(period);
      return next;
    });
  }, []);

  const periods: PeriodInfo[] = useMemo(() =>
    [...statements]
      .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date))
      .map((s) => ({
        label: `FY${s.fiscal_year}${s.fiscal_quarter ? ` Q${s.fiscal_quarter}` : ""}`,
        period: s.period_end_date,
        statementId: s.id,
        items: Object.fromEntries(
          (s.line_items ?? []).map((li) => [li.line_item_code, { id: li.id, amount: li.amount, name: li.line_item_name, isTotal: li.is_total, edited: li.manually_edited }])
        ),
      })),
  [statements]);

  const allCodes = useMemo(() => {
    const map = new Map<string, { name: string; isTotal: boolean; minOrder: number }>();
    for (const s of statements) {
      for (const li of s.line_items ?? []) {
        const existing = map.get(li.line_item_code);
        const idx = li.order_index ?? 9999;
        if (!existing) {
          map.set(li.line_item_code, { name: li.line_item_name, isTotal: li.is_total, minOrder: idx });
        } else if (idx < existing.minOrder) {
          existing.minOrder = idx;
        }
      }
    }
    return [...map.entries()]
      .sort((a, b) => a[1].minOrder - b[1].minOrder)
      .map(([code, v]) => ({ code, name: v.name, isTotal: v.isTotal }));
  }, [statements]);

  const allCodesKey = useMemo(() => allCodes.map((r) => r.code).join(","), [allCodes]);
  useEffect(() => { setLocalOrder(null); }, [allCodesKey]);

  const displayRows = localOrder ?? allCodes;

  const handleMerge = useCallback(() => {
    if (mergeSelection.length !== 2) return;
    const [keepCode, removeCode] = mergeSelection;
    const keepName = displayRows.find((r) => r.code === keepCode)?.name ?? keepCode;
    const removeName = displayRows.find((r) => r.code === removeCode)?.name ?? removeCode;
    const msg = `Merge "${removeName}" into "${keepName}"?\n\nValues from "${removeName}" will fill empty cells in "${keepName}", then "${removeName}" row will be deleted.`;
    const doMerge = () => mergeMut.mutate({ keepCode, removeCode });
    if (Platform.OS === "web") {
      if (confirm(msg)) doMerge();
    } else {
      Alert.alert("Merge Rows", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Merge", style: "default", onPress: doMerge },
      ]);
    }
  }, [mergeSelection, displayRows, mergeMut]);

  const handleDeleteRow = useCallback((code: string, name: string) => {
    const ids: number[] = [];
    for (const p of periods) {
      const cell = p.items[code];
      if (cell?.id != null) ids.push(cell.id);
    }
    if (ids.length === 0) return;
    const msg = `Delete row "${name}" from all periods? (${ids.length} item${ids.length > 1 ? "s" : ""})`;
    const doDelete = () => { ids.forEach((id) => deleteLineItemMut.mutate(id)); };
    if (Platform.OS === "web") {
      if (confirm(msg)) doDelete();
    } else {
      Alert.alert("Delete Row", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: doDelete },
      ]);
    }
  }, [periods, deleteLineItemMut]);

  const handleDragEnd = useCallback((event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const rows = localOrder ?? allCodes;
    const oldIndex = rows.findIndex((r) => r.code === active.id);
    const newIndex = rows.findIndex((r) => r.code === over.id);
    if (oldIndex === -1 || newIndex === -1) return;
    const newOrder = arrayMove(rows, oldIndex, newIndex);
    setLocalOrder(newOrder);
    const reorderItems: Array<{ id: number; order_index: number }> = [];
    newOrder.forEach((row, idx) => {
      for (const p of periods) {
        const cell = p.items[row.code];
        if (cell?.id != null) {
          reorderItems.push({ id: cell.id, order_index: idx + 1 });
        }
      }
    });
    if (reorderItems.length > 0) reorderMut.mutate(reorderItems);
  }, [localOrder, allCodes, periods, reorderMut]);

  const exportTables = useCallback((): TableData[] => {
    const headers = ["Line Item", ...periods.map((p) => p.label)];
    const rows = displayRows.map((item) => {
      const row: (string | number | null)[] = [item.name];
      for (const p of periods) {
        const val = p.items[item.code]?.amount;
        row.push(val ?? null);
      }
      return row;
    });
    const typeName = STMNT_META[statementType ?? ""]?.label ?? statementType ?? "Statements";
    return [{ title: typeName, headers, rows }];
  }, [periods, displayRows, statementType]);

  const handleDelete = useCallback(() => {
    if (selectedPeriods.size === 0) return;
    const labels = periods.filter((p) => selectedPeriods.has(p.period)).map((p) => p.label).join(", ");
    const typeName = statementType ? (STMNT_META[statementType]?.label ?? statementType) : "all statement types";
    const msg = `Delete ${selectedPeriods.size} period(s) for ${typeName}?\n\n${labels}\n\nThis will permanently remove the selected data and cannot be undone.`;
    if (Platform.OS === "web") {
      if (confirm(msg)) deleteMut.mutate(Array.from(selectedPeriods));
    } else {
      Alert.alert("Delete Periods", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMut.mutate(Array.from(selectedPeriods)) },
      ]);
    }
  }, [selectedPeriods, periods, deleteMut, statementType]);

  const handleDeleteAll = useCallback(() => {
    const total = periods.length;
    if (total === 0) return;
    const msg = `Delete ALL ${total} statement(s) for this stock?\n\nThis will permanently remove every statement and line item and cannot be undone.`;
    if (Platform.OS === "web") {
      if (confirm(msg)) deleteAllMut.mutate();
    } else {
      Alert.alert("Delete All Statements", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete All", style: "destructive", onPress: () => deleteAllMut.mutate() },
      ]);
    }
  }, [periods, deleteAllMut]);

  const COL_NAME_W = isDesktop ? 200 : 160;
  const COL_VAL_W = isDesktop ? 120 : 105;

  return {
    editingKey, selectedPeriods, setSelectedPeriods, deleteMode, setDeleteMode,
    rearranging, rearrangeResult, setRearrangeResult,
    pdfPickerOpen, setPdfPickerOpen, stmtPickerOpen, setStmtPickerOpen,
    reconcileType, setReconcileType,
    mergeMode, setMergeMode, mergeSelection, setMergeSelection,
    mergeResult, setMergeResult,
    headerScrollRef,
    tablePdfs, selectedPdfId, setSelectedPdfId,
    periods, displayRows, COL_NAME_W, COL_VAL_W,
    sensors,
    mergeMutPending: mergeMut.isPending, deleteMutPending: deleteMut.isPending, deleteAllMutPending: deleteAllMut.isPending,
    handleRearrange, handleStartEdit, handleSaveEdit, handleCancelEdit,
    handleCreateSave, handleMerge, handleDeleteRow, handleDragEnd,
    handleDelete, handleDeleteAll, togglePeriod, handleToggleMerge,
    exportTables,
  };
}
