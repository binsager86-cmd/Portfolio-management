/**
 * StatementsToolbar — AI reconciliation, merge, delete controls,
 * result banners, and export bar for StatementsTable.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import {
    ActivityIndicator,
    Pressable,
    Text,
    View,
} from "react-native";

import type { ThemePalette } from "@/constants/theme";
import { RECONCILE_OPTS, useStatementsTableState } from "../hooks/useStatementsTableState";
import { ExportBar } from "./shared";

// ── Types ───────────────────────────────────────────────────────────

interface StatementsToolbarProps {
  state: ReturnType<typeof useStatementsTableState>;
  colors: ThemePalette;
  stockSymbol: string;
}

// ── Component ───────────────────────────────────────────────────────

export function StatementsToolbar({ state, colors, stockSymbol }: StatementsToolbarProps) {
  const {
    rearranging, rearrangeResult, setRearrangeResult,
    pdfPickerOpen, setPdfPickerOpen, stmtPickerOpen, setStmtPickerOpen,
    reconcileType, setReconcileType,
    mergeMode, setMergeMode, mergeSelection, setMergeSelection,
    mergeResult, setMergeResult,
    tablePdfs, selectedPdfId, setSelectedPdfId,
    selectedPeriods, setSelectedPeriods, deleteMode, setDeleteMode,
    periods,
    mergeMutPending, deleteMutPending, deleteAllMutPending,
    handleRearrange, handleMerge, handleDelete, handleDeleteAll,
    exportTables,
  } = state;

  return (
    <>
      {/* Toolbar: AI Rearrange + Delete mode — FROZEN at top */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", paddingHorizontal: 12, paddingTop: 6, gap: 8, flexWrap: "wrap", zIndex: stmtPickerOpen || pdfPickerOpen ? 1000 : 1 }}>
        {/* AI Rearrange */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, zIndex: stmtPickerOpen || pdfPickerOpen ? 1000 : 1 }}>
          {tablePdfs.length > 0 && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, flexWrap: "wrap", zIndex: stmtPickerOpen || pdfPickerOpen ? 1000 : 1 }}>
              {/* Statement type picker */}
              <View style={{ position: "relative" as const, zIndex: stmtPickerOpen ? 1001 : 1 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select statement type"
                  accessibilityState={{ expanded: stmtPickerOpen }}
                  onPress={() => { setStmtPickerOpen((v) => !v); setPdfPickerOpen(false); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: colors.bgInput, borderWidth: 1, borderColor: reconcileType !== "all" ? colors.accentPrimary : colors.borderColor }}
                >
                  <FontAwesome name="file-text-o" size={10} color={reconcileType !== "all" ? colors.accentPrimary : colors.textMuted} />
                  <Text numberOfLines={1} style={{ fontSize: 10, color: reconcileType !== "all" ? colors.accentPrimary : colors.textMuted }}>
                    {RECONCILE_OPTS.find((o) => o.key === reconcileType)?.label ?? "All"}
                  </Text>
                  <FontAwesome name={stmtPickerOpen ? "caret-up" : "caret-down"} size={10} color={colors.textMuted} />
                </Pressable>
                {stmtPickerOpen && (
                  <View style={{ position: "absolute" as const, top: "100%", left: 0, zIndex: 1000, minWidth: 170, marginTop: 4, backgroundColor: colors.bgPrimary, borderRadius: 8, borderWidth: 1, borderColor: colors.borderColor, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5, overflow: "hidden" as const }}>
                    {RECONCILE_OPTS.map((opt) => (
                      <Pressable
                        key={opt.key}
                        accessibilityRole="button"
                        accessibilityLabel={`Filter by ${opt.label}`}
                        accessibilityState={{ selected: opt.key === reconcileType }}
                        onPress={() => { setReconcileType(opt.key); setStmtPickerOpen(false); }}
                        style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: opt.key === reconcileType ? colors.accentPrimary + "15" : pressed ? colors.bgInput : "transparent" }]}
                      >
                        <Text style={{ flex: 1, fontSize: 11, color: opt.key === reconcileType ? colors.accentPrimary : colors.textPrimary, fontWeight: opt.key === reconcileType ? "600" : "400" }}>
                          {opt.label}
                        </Text>
                        {opt.key === reconcileType && <FontAwesome name="check" size={10} color={colors.accentPrimary} />}
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
              {/* PDF picker */}
              <Text style={{ fontSize: 11, color: colors.textMuted }}>PDF:</Text>
              <View style={{ position: "relative" as const, zIndex: pdfPickerOpen ? 1001 : 1 }}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Select PDF source"
                  accessibilityState={{ expanded: pdfPickerOpen }}
                  onPress={() => { setPdfPickerOpen((v) => !v); setStmtPickerOpen(false); }}
                  style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, backgroundColor: selectedPdfId ? colors.accentPrimary + "20" : colors.bgInput, borderWidth: 1, borderColor: selectedPdfId ? colors.accentPrimary : colors.borderColor }}
                >
                  <Text numberOfLines={1} style={{ fontSize: 10, color: selectedPdfId ? colors.accentPrimary : colors.textMuted, maxWidth: 140 }}>
                    {selectedPdfId ? tablePdfs.find((p) => p.id === selectedPdfId)?.original_name?.slice(0, 22) ?? "PDF" : "Select PDF"}
                  </Text>
                  <FontAwesome name={pdfPickerOpen ? "caret-up" : "caret-down"} size={10} color={selectedPdfId ? colors.accentPrimary : colors.textMuted} />
                </Pressable>
                {pdfPickerOpen && (
                  <View style={{ position: "absolute" as const, top: "100%", left: 0, zIndex: 999, minWidth: 200, marginTop: 4, backgroundColor: colors.bgPrimary, borderRadius: 8, borderWidth: 1, borderColor: colors.borderColor, shadowColor: "#000", shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.15, shadowRadius: 8, elevation: 5, overflow: "hidden" as const }}>
                    {tablePdfs.map((pdf) => (
                      <Pressable
                        key={pdf.id}
                        accessibilityRole="button"
                        accessibilityLabel={`Select PDF ${pdf.original_name}`}
                        accessibilityState={{ selected: pdf.id === selectedPdfId }}
                        onPress={() => { setSelectedPdfId(pdf.id); setPdfPickerOpen(false); }}
                        style={({ pressed }) => [{ flexDirection: "row", alignItems: "center", gap: 6, paddingHorizontal: 10, paddingVertical: 8, backgroundColor: pdf.id === selectedPdfId ? colors.accentPrimary + "15" : pressed ? colors.bgInput : "transparent" }]}
                      >
                        <FontAwesome name="file-pdf-o" size={12} color={pdf.id === selectedPdfId ? colors.accentPrimary : colors.textMuted} />
                        <Text numberOfLines={1} style={{ flex: 1, fontSize: 11, color: pdf.id === selectedPdfId ? colors.accentPrimary : colors.textPrimary, fontWeight: pdf.id === selectedPdfId ? "600" : "400" }}>
                          {pdf.original_name}
                        </Text>
                        {pdf.id === selectedPdfId && <FontAwesome name="check" size={10} color={colors.accentPrimary} />}
                      </Pressable>
                    ))}
                  </View>
                )}
              </View>
            </View>
          )}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={rearranging ? "Auditing statements" : "AI reconcile statements"}
            accessibilityState={{ disabled: rearranging || !selectedPdfId, busy: rearranging }}
            onPress={handleRearrange}
            disabled={rearranging || !selectedPdfId}
            style={({ pressed }) => [{
              flexDirection: "row", alignItems: "center", gap: 5,
              paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
              backgroundColor: !selectedPdfId ? colors.bgInput : colors.accentPrimary + "15",
              borderWidth: 1, borderColor: !selectedPdfId ? colors.borderColor : colors.accentPrimary,
              opacity: pressed ? 0.8 : (!selectedPdfId ? 0.5 : 1),
            }]}
          >
            {rearranging ? (
              <ActivityIndicator size="small" color={colors.accentPrimary} />
            ) : (
              <FontAwesome name="random" size={12} color={!selectedPdfId ? colors.textMuted : colors.accentPrimary} />
            )}
            <Text style={{ fontSize: 12, fontWeight: "600", color: !selectedPdfId ? colors.textMuted : colors.accentPrimary }}>
              {rearranging ? "Auditing..." : "AI Reconcile"}
            </Text>
          </Pressable>
        </View>

        {/* Merge mode */}
        {mergeMode && mergeSelection.length === 2 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Merge ${mergeSelection.length} selected rows`}
            accessibilityState={{ disabled: mergeMutPending, busy: mergeMutPending }}
            onPress={handleMerge}
            disabled={mergeMutPending}
            style={({ pressed }) => [{
              flexDirection: "row", alignItems: "center", gap: 5,
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
              backgroundColor: colors.accentPrimary, opacity: pressed ? 0.8 : 1,
            }]}
          >
            {mergeMutPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <FontAwesome name="compress" size={12} color="#fff" />
            )}
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Merge ({mergeSelection.length})</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={mergeMode ? "Cancel merge mode" : "Enter merge rows mode"}
          accessibilityState={{ selected: mergeMode }}
          onPress={() => { setMergeMode((v) => !v); setMergeSelection([]); }}
          style={({ pressed }) => [{
            flexDirection: "row", alignItems: "center", gap: 5,
            paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
            backgroundColor: mergeMode ? colors.accentPrimary + "15" : colors.bgInput,
            borderWidth: 1, borderColor: mergeMode ? colors.accentPrimary : colors.borderColor,
            opacity: pressed ? 0.8 : 1,
          }]}
        >
          <FontAwesome name={mergeMode ? "times" : "compress"} size={12} color={mergeMode ? colors.accentPrimary : colors.textMuted} />
          <Text style={{ fontSize: 12, fontWeight: "600", color: mergeMode ? colors.accentPrimary : colors.textMuted }}>
            {mergeMode ? "Cancel Merge" : "Merge Rows"}
          </Text>
        </Pressable>

        {/* Delete mode */}
        {deleteMode && selectedPeriods.size > 0 && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Delete ${selectedPeriods.size} selected periods`}
            accessibilityState={{ disabled: deleteMutPending, busy: deleteMutPending }}
            onPress={handleDelete}
            disabled={deleteMutPending}
            style={({ pressed }) => [{
              flexDirection: "row", alignItems: "center", gap: 5,
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
              backgroundColor: colors.danger, opacity: pressed ? 0.8 : 1,
            }]}
          >
            {deleteMutPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <FontAwesome name="trash" size={12} color="#fff" />
            )}
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Delete Selected ({selectedPeriods.size})</Text>
          </Pressable>
        )}
        {deleteMode && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Delete all periods"
            accessibilityState={{ disabled: deleteAllMutPending, busy: deleteAllMutPending }}
            onPress={handleDeleteAll}
            disabled={deleteAllMutPending}
            style={({ pressed }) => [{
              flexDirection: "row", alignItems: "center", gap: 5,
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
              backgroundColor: colors.danger, opacity: pressed ? 0.8 : 1,
              borderWidth: 1, borderColor: "#fff3",
            }]}
          >
            {deleteAllMutPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <FontAwesome name="trash" size={12} color="#fff" />
            )}
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Delete All</Text>
          </Pressable>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={deleteMode ? "Cancel year selection" : "Select years to delete"}
          accessibilityState={{ selected: deleteMode }}
          onPress={() => { setDeleteMode((v) => !v); setSelectedPeriods(new Set()); }}
          style={({ pressed }) => [{
            flexDirection: "row", alignItems: "center", gap: 5,
            paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
            backgroundColor: deleteMode ? colors.danger + "15" : colors.bgInput,
            borderWidth: 1, borderColor: deleteMode ? colors.danger : colors.borderColor,
            opacity: pressed ? 0.8 : 1,
          }]}
        >
          <FontAwesome name={deleteMode ? "times" : "trash-o"} size={12} color={deleteMode ? colors.danger : colors.textMuted} />
          <Text style={{ fontSize: 12, fontWeight: "600", color: deleteMode ? colors.danger : colors.textMuted }}>
            {deleteMode ? "Cancel" : "Select Years"}
          </Text>
        </Pressable>

        <View style={{ flex: 1 }} />
        <ExportBar
          onExport={async (fmt) => {
            const { exportExcel, exportCSV, exportPDF } = await import("@/lib/exportAnalysis");
            const t = exportTables();
            if (fmt === "xlsx") await exportExcel(t, stockSymbol, "Statements");
            else if (fmt === "csv") await exportCSV(t, stockSymbol, "Statements");
            else await exportPDF(t, stockSymbol, "Statements");
          }}
          colors={colors}
          disabled={periods.length === 0}
        />
      </View>

      {/* AI Rearrange result banner */}
      {rearrangeResult && (
        <ResultBanner text={rearrangeResult} colors={colors} onDismiss={() => setRearrangeResult(null)} />
      )}

      {/* Merge result banner */}
      {mergeResult && (
        <ResultBanner text={mergeResult} colors={colors} onDismiss={() => setMergeResult(null)} />
      )}
    </>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function ResultBanner({ text, colors, onDismiss }: { text: string; colors: ThemePalette; onDismiss: () => void }) {
  const isError = text.startsWith("Error");
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", marginHorizontal: 12, marginTop: 4,
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
      backgroundColor: (isError ? colors.danger : colors.success) + "15",
      gap: 6,
    }}>
      <FontAwesome
        name={isError ? "exclamation-circle" : "check-circle"}
        size={13}
        color={isError ? colors.danger : colors.success}
      />
      <Text style={{ flex: 1, fontSize: 11, color: isError ? colors.danger : colors.success }}>
        {text}
      </Text>
      <Pressable accessibilityRole="button" accessibilityLabel="Dismiss notification" onPress={onDismiss} hitSlop={8}>
        <FontAwesome name="times" size={12} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}
