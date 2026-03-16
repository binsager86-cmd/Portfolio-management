/**
 * StatementsPanel — Financial statement upload, display, and editing.
 * Includes EditableCell (memoized), StatementsTable, and upload stepper.
 * Client-side normalizeCode removed — trusts backend canonical codes.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import { LoadingScreen } from "@/components/ui/LoadingScreen";
import type { ThemePalette } from "@/constants/theme";
import { useStatements } from "@/hooks/queries";
import { showErrorAlert } from "@/lib/errorHandling";
import {
  deleteStatementsByPeriod,
  FinancialStatement,
  updateLineItem,
} from "@/services/api";
import {
  aiAttributeExtraction,
  deleteStockPdf,
  downloadStockPdf,
  listStockPdfs,
  logStatementChange,
  type SavedPdf,
} from "@/services/api/analytics";
import { useFinancialStatements } from "../hooks/useFinancialStatements";
import { st } from "../styles";
import type { PanelProps } from "../types";
import { STMNT_ICONS } from "../types";
import { formatNumber } from "../utils";
import { StatementTabBar } from "./shared";

/* ═══════════════════════════════════════════════════════════════════ */
/*  STATEMENTS PANEL                                                  */
/* ═══════════════════════════════════════════════════════════════════ */

export function StatementsPanel({ stockId, colors, isDesktop }: PanelProps) {
  const [typeFilter, setTypeFilter] = useState<string | undefined>("income");
  const { data, isLoading, refetch, isFetching } = useStatements(stockId, typeFilter);

  const {
    processingSteps, uploadResult, uploadError, uploading, allDone,
    handlePickAndUpload,
    dismissSteps, dismissError, dismissResult,
  } = useFinancialStatements(stockId);

  const queryClient = useQueryClient();

  // AI attribution state
  const [attributing, setAttributing] = useState(false);
  const [attributionDismissed, setAttributionDismissed] = useState(false);
  const [attributionResult, setAttributionResult] = useState<{ message: string; corrections: number } | null>(null);

  // Saved PDFs query
  const { data: savedPdfs = [] } = useQuery({
    queryKey: ["stock-pdfs", stockId],
    queryFn: () => listStockPdfs(stockId),
    staleTime: 30_000,
  });

  // Refresh statements + saved PDFs when a new upload completes
  useEffect(() => {
    if (uploadResult && !uploading) {
      queryClient.invalidateQueries({ queryKey: ["stock-pdfs", stockId] });
      queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] });
      // Auto-switch to first extracted statement type so user sees the new data
      const firstType = uploadResult.statements[0]?.statement_type;
      if (firstType) setTypeFilter(firstType);
    }
  }, [uploadResult, uploading, stockId, queryClient]);

  const statements = data?.statements ?? [];

  return (
    <View style={{ flex: 1 }}>
      {/* ── Upload Section ─────────────────────────────────────────── */}
      <View style={{
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: colors.borderColor,
        backgroundColor: colors.bgCard,
      }}>
        <Pressable
          onPress={handlePickAndUpload}
          disabled={uploading}
          style={({ pressed }) => [
            {
              flexDirection: "row", alignItems: "center", justifyContent: "center",
              paddingVertical: 14, paddingHorizontal: 20,
              borderRadius: 12, borderWidth: 2, borderStyle: "dashed",
              borderColor: uploading ? colors.textMuted : colors.accentPrimary,
              backgroundColor: uploading ? colors.bgInput : colors.accentPrimary + "08",
              gap: 10,
            },
            pressed && !uploading && { backgroundColor: colors.accentPrimary + "15", transform: [{ scale: 0.98 }] },
          ]}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors.accentPrimary} />
          ) : (
            <View style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: colors.accentPrimary + "15",
              alignItems: "center", justifyContent: "center",
            }}>
              <FontAwesome name="cloud-upload" size={18} color={colors.accentPrimary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{ color: uploading ? colors.textMuted : colors.textPrimary, fontSize: 14, fontWeight: "700" }}>
              {uploading ? "Processing..." : "Upload Financial Report (PDF)"}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
              {uploading
                ? processingSteps.find((s) => s.status === "running")?.label ?? "Working..."
                : "AI extracts income, balance sheet, cash flow & equity statements"}
            </Text>
          </View>
          {!uploading && <FontAwesome name="file-pdf-o" size={20} color={colors.danger + "80"} />}
        </Pressable>

        {/* ── Processing indicator ────────────────────────────────── */}
        {processingSteps.length > 0 && (
          <View style={{ marginTop: 12, gap: 6 }}>
            {processingSteps.map((step) => {
              const iconName: React.ComponentProps<typeof FontAwesome>["name"] =
                step.status === "done" ? "check-circle" :
                step.status === "error" ? "exclamation-triangle" :
                step.status === "running" ? "spinner" : "circle-o";
              const iconColor =
                step.status === "done" ? colors.success :
                step.status === "error" ? colors.warning :
                step.status === "running" ? colors.accentPrimary : colors.textMuted;

              return (
                <View key={step.key} style={[st.rowCenter, { gap: 10, paddingVertical: 4, paddingHorizontal: 4 }]}>
                  {step.status === "running" ? (
                    <ActivityIndicator size={14} color={colors.accentPrimary} />
                  ) : (
                    <FontAwesome name={iconName} size={14} color={iconColor} />
                  )}
                  <Text style={{ fontSize: 12, fontWeight: "600", color: step.status === "pending" ? colors.textMuted : colors.textPrimary, flex: 1 }}>
                    {step.label}
                  </Text>
                  {step.detail && (
                    <Text style={{ fontSize: 10, color: step.status === "error" ? colors.warning : colors.textMuted }}>
                      {step.detail}
                    </Text>
                  )}
                </View>
              );
            })}
            {allDone && !uploading && (
              <Pressable onPress={dismissSteps} style={{ alignSelf: "flex-end", paddingVertical: 4, paddingHorizontal: 8 }} hitSlop={8}>
                <Text style={{ fontSize: 11, color: colors.accentPrimary, fontWeight: "600" }}>Dismiss</Text>
              </Pressable>
            )}
          </View>
        )}

        {/* Extraction result summary — matches Streamlit's AI Vision result display */}
        {uploadResult && !uploading && (
          <View style={{
            marginTop: 10, padding: 12, borderRadius: 10,
            backgroundColor: colors.success + "10",
            borderWidth: 1, borderColor: colors.success + "30",
          }}>
            <View style={[st.rowCenter, { gap: 8 }]}>
              <FontAwesome name="check-circle" size={16} color={colors.success} />
              <Text style={{ color: colors.success, fontSize: 13, fontWeight: "700", flex: 1 }}>
                AI Vision Extraction Complete
              </Text>
              <Pressable onPress={dismissResult} hitSlop={8}>
                <FontAwesome name="times" size={14} color={colors.textMuted} />
              </Pressable>
            </View>
            {/* Summary metrics — mirrors Streamlit's cols summary */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
              <View>
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "500" }}>Statements</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{uploadResult.statements.length}</Text>
              </View>
              <View>
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "500" }}>Confidence</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{Math.round(uploadResult.confidence * 100)}%</Text>
              </View>
              <View>
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "500" }}>Pages</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{uploadResult.pages_processed}</Text>
              </View>
              <View>
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "500" }}>Model</Text>
                <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{uploadResult.model}</Text>
              </View>
              <View>
                <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "500" }}>Audit</Text>
                <Text style={{ color: uploadResult.audit.checks_failed === 0 ? colors.success : colors.warning, fontSize: 14, fontWeight: "700" }}>
                  {uploadResult.audit.checks_passed}/{uploadResult.audit.checks_total}
                </Text>
              </View>
            </View>
            {/* Per-statement chips — like Streamlit's detected types display */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
              {uploadResult.statements.map((s, i) => (
                <View key={i} style={{
                  paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
                  backgroundColor: (STMNT_ICONS[s.statement_type]?.color ?? "#6366f1") + "15",
                }}>
                  <Text style={{
                    color: STMNT_ICONS[s.statement_type]?.color ?? "#6366f1",
                    fontSize: 10, fontWeight: "700", textTransform: "capitalize",
                  }}>
                    {s.statement_type} FY{s.fiscal_year} ({s.line_items_count} items · {s.currency})
                  </Text>
                </View>
              ))}
            </View>
            {/* Audit details — like Streamlit's validation checks */}
            {uploadResult.audit.details.length > 0 && (
              <View style={{ marginTop: 8, gap: 3 }}>
                <Text style={{ fontSize: 10, fontWeight: "700", color: colors.textMuted }}>Audit Checks</Text>
                {uploadResult.audit.details.map((d, i) => (
                  <View key={i} style={{ gap: 1 }}>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                      <FontAwesome name={d.passed ? "check" : "times"} size={10} color={d.passed ? colors.success : colors.danger} />
                      <Text style={{ fontSize: 10, color: colors.textSecondary, flex: 1 }}>
                        {d.statement_type} · {d.period} · {d.rule}
                      </Text>
                      <Text style={{ fontSize: 10, color: d.passed ? colors.textMuted : colors.danger }}>
                        {d.passed ? "OK" : `Exp: ${d.expected} / Act: ${d.actual}`}
                      </Text>
                    </View>
                    {!d.passed && d.detail ? (
                      <Text style={{ fontSize: 9, color: colors.danger, marginLeft: 14, fontFamily: "monospace" }}>
                        {d.detail}
                      </Text>
                    ) : null}
                  </View>
                ))}
              </View>
            )}

            {/* ── AI Attribution Prompt ─────────────────────────── */}
            {uploadResult.audit.checks_failed > 0 && !attributionDismissed && !attributionResult && (
              <View style={{
                marginTop: 10, padding: 12, borderRadius: 10,
                backgroundColor: colors.warning + "10",
                borderWidth: 1, borderColor: colors.warning + "30",
              }}>
                <View style={[st.rowCenter, { gap: 8 }]}>
                  <FontAwesome name="lightbulb-o" size={16} color={colors.warning} />
                  <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "600", flex: 1 }}>
                    Some items may have attribution discrepancies. Would you like AI to review and fix the linking?
                  </Text>
                </View>
                {/* Show which checks failed */}
                <View style={{ marginTop: 6, gap: 2 }}>
                  {uploadResult.audit.details
                    .filter((d) => !d.passed)
                    .map((d, i) => (
                      <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 4, marginLeft: 24 }}>
                        <FontAwesome name="exclamation-triangle" size={9} color={colors.warning} style={{ marginTop: 2 }} />
                        <Text style={{ fontSize: 10, color: colors.textSecondary, flex: 1 }}>
                          {d.detail || `${d.statement_type} · ${d.period} · ${d.rule}: Exp ${d.expected} / Act ${d.actual}`}
                        </Text>
                      </View>
                    ))}
                </View>
                <View style={{ flexDirection: "row", gap: 10, marginTop: 10, justifyContent: "flex-end" }}>
                  <Pressable
                    onPress={() => setAttributionDismissed(true)}
                    disabled={attributing}
                    style={({ pressed }) => [{
                      paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8,
                      borderWidth: 1, borderColor: colors.borderColor,
                      backgroundColor: pressed ? colors.bgInput : colors.bgCard,
                    }]}
                  >
                    <Text style={{ fontSize: 12, fontWeight: "600", color: colors.textMuted }}>No</Text>
                  </Pressable>
                  <Pressable
                    onPress={async () => {
                      setAttributing(true);
                      try {
                        const res = await aiAttributeExtraction(stockId);
                        setAttributionResult({
                          message: res.message,
                          corrections: res.corrections_applied,
                        });
                        if (res.corrections_applied > 0) {
                          queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] });
                        }
                      } catch (err) {
                        const msg = err instanceof Error ? err.message : "Attribution failed";
                        showErrorAlert("AI Attribution", msg);
                      } finally {
                        setAttributing(false);
                      }
                    }}
                    disabled={attributing}
                    style={({ pressed }) => [{
                      paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8,
                      backgroundColor: pressed ? colors.accentPrimary + "CC" : colors.accentPrimary,
                      flexDirection: "row", alignItems: "center", gap: 6,
                    }]}
                  >
                    {attributing && <ActivityIndicator size={12} color="#fff" />}
                    <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>
                      {attributing ? "Reviewing..." : "Yes, Fix with AI"}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* ── Attribution Result ───────────────────────────── */}
            {attributionResult && (
              <View style={{
                marginTop: 10, padding: 12, borderRadius: 10,
                backgroundColor: (attributionResult.corrections > 0 ? colors.success : colors.accentPrimary) + "10",
                borderWidth: 1,
                borderColor: (attributionResult.corrections > 0 ? colors.success : colors.accentPrimary) + "30",
              }}>
                <View style={[st.rowCenter, { gap: 8 }]}>
                  <FontAwesome
                    name={attributionResult.corrections > 0 ? "check-circle" : "info-circle"}
                    size={14}
                    color={attributionResult.corrections > 0 ? colors.success : colors.accentPrimary}
                  />
                  <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "600", flex: 1 }}>
                    {attributionResult.message}
                  </Text>
                  <Pressable onPress={() => setAttributionResult(null)} hitSlop={8}>
                    <FontAwesome name="times" size={12} color={colors.textMuted} />
                  </Pressable>
                </View>
              </View>
            )}
          </View>
        )}

        {/* Upload error */}
        {uploadError && !uploading && (
          <View style={{
            marginTop: 10, padding: 12, borderRadius: 10,
            backgroundColor: colors.danger + "10",
            borderWidth: 1, borderColor: colors.danger + "30",
          }}>
            <View style={[st.rowCenter, { gap: 8 }]}>
              <FontAwesome name="exclamation-circle" size={16} color={colors.danger} />
              <Text style={{ color: colors.danger, fontSize: 13, fontWeight: "600", flex: 1 }}>{uploadError}</Text>
              <Pressable onPress={dismissError} hitSlop={8}>
                <FontAwesome name="times" size={14} color={colors.textMuted} />
              </Pressable>
            </View>
            <Pressable
              onPress={handlePickAndUpload}
              style={{ alignSelf: "flex-start", flexDirection: "row", alignItems: "center", gap: 4, marginTop: 8, paddingVertical: 4, paddingHorizontal: 8 }}
              hitSlop={8}
            >
              <FontAwesome name="refresh" size={11} color={colors.accentPrimary} />
              <Text style={{ fontSize: 11, color: colors.accentPrimary, fontWeight: "600" }}>Try Again</Text>
            </Pressable>
          </View>
        )}
      </View>

      {/* ── Saved PDFs ─────────────────────────────────────────────── */}
      <SavedPdfsList pdfs={savedPdfs} stockId={stockId} colors={colors} />

      {/* Type filter tabs */}
      <StatementTabBar value={typeFilter} onChange={(v) => setTypeFilter(v ?? "income")} colors={colors} showAll={false} />

      {isLoading ? (
        <LoadingScreen />
      ) : (
        <StatementsTable stockId={stockId} statements={statements} colors={colors} isDesktop={isDesktop} isFetching={isFetching} onRefresh={refetch} statementType={typeFilter} />
      )}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  SAVED PDFs LIST                                                    */
/* ═══════════════════════════════════════════════════════════════════ */

function SavedPdfsList({ pdfs, stockId, colors }: { pdfs: SavedPdf[]; stockId: number; colors: ThemePalette }) {
  const queryClient = useQueryClient();
  const [expanded, setExpanded] = useState(true);

  const handleDownload = useCallback(async (pdf: SavedPdf) => {
    try {
      if (Platform.OS === "web") {
        await downloadStockPdf(stockId, pdf.id, pdf.original_name);
      } else {
        Alert.alert("Download", "PDF download is supported on web. On mobile, PDFs are stored on the server for reference.");
      }
    } catch {
      Alert.alert("Error", "Failed to download PDF.");
    }
  }, [stockId]);

  const handleDelete = useCallback((pdf: SavedPdf) => {
    Alert.alert(
      "Delete PDF",
      `Delete "${pdf.original_name}"? This cannot be undone.`,
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Delete",
          style: "destructive",
          onPress: async () => {
            try {
              await deleteStockPdf(stockId, pdf.id);
              queryClient.invalidateQueries({ queryKey: ["stock-pdfs", stockId] });
            } catch {
              Alert.alert("Error", "Failed to delete PDF.");
            }
          },
        },
      ],
    );
  }, [stockId, queryClient]);

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (ts: number) => {
    const d = new Date(ts * 1000);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  };

  return (
    <View style={{
      paddingHorizontal: 16, paddingVertical: 10,
      borderBottomWidth: 1, borderBottomColor: colors.borderColor,
    }}>
      <Pressable
        onPress={() => setExpanded((v) => !v)}
        style={[st.rowCenter, { gap: 8, paddingVertical: 4 }]}
      >
        <FontAwesome name="folder-open" size={14} color={colors.accentPrimary} />
        <Text style={{ fontSize: 13, fontWeight: "700", color: colors.textPrimary, flex: 1 }}>
          Saved Reports ({pdfs.length})
        </Text>
        <FontAwesome
          name={expanded ? "chevron-up" : "chevron-down"}
          size={12}
          color={colors.textMuted}
        />
      </Pressable>

      {expanded && (
        <View style={{ marginTop: 8, gap: 6 }}>
          {pdfs.length === 0 && (
            <Text style={{ fontSize: 12, color: colors.textMuted, fontStyle: "italic", paddingVertical: 8 }}>
              No saved reports yet. Upload a PDF above — it will be saved here automatically.
            </Text>
          )}
          {pdfs.map((pdf) => (
            <View
              key={pdf.id}
              style={{
                flexDirection: "row", alignItems: "center", gap: 10,
                paddingVertical: 8, paddingHorizontal: 10,
                borderRadius: 8,
                backgroundColor: colors.bgInput,
              }}
            >
              <FontAwesome name="file-pdf-o" size={16} color={colors.danger + "90"} />
              <View style={{ flex: 1 }}>
                <Text
                  numberOfLines={1}
                  style={{ fontSize: 12, fontWeight: "600", color: colors.textPrimary }}
                >
                  {pdf.original_name}
                </Text>
                <Text style={{ fontSize: 10, color: colors.textMuted, marginTop: 1 }}>
                  {formatFileSize(pdf.file_size)} · {formatDate(pdf.created_at)}
                </Text>
              </View>
              <Pressable onPress={() => handleDownload(pdf)} hitSlop={8} style={{ padding: 6 }}>
                <FontAwesome name="download" size={14} color={colors.accentPrimary} />
              </Pressable>
              <Pressable onPress={() => handleDelete(pdf)} hitSlop={8} style={{ padding: 6 }}>
                <FontAwesome name="trash-o" size={14} color={colors.danger + "80"} />
              </Pressable>
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  EDITABLE CELL (memoized)                                          */
/* ═══════════════════════════════════════════════════════════════════ */

const EditableCell = React.memo(function EditableCell({
  itemId, value, isTotal, isEdited, colWidth, colors, editingKey,
  onStartEdit, onSave, onCancel,
}: {
  itemId: number | null;
  value: number | undefined | null;
  isTotal: boolean;
  isEdited: boolean;
  colWidth: number;
  colors: ThemePalette;
  editingKey: string | null;
  onStartEdit: (id: string, val: string) => void;
  onSave: (id: number, amount: number) => void;
  onCancel: () => void;
}) {
  const cellKey = itemId != null ? String(itemId) : null;
  const isEditing = editingKey != null && cellKey === editingKey;
  const [localValue, setLocalValue] = useState(String(value ?? ""));

  useEffect(() => {
    if (isEditing) setLocalValue(String(value ?? ""));
  }, [isEditing, value]);

  const handleSubmit = useCallback(() => {
    const num = parseFloat(localValue);
    if (!isNaN(num) && itemId != null) onSave(itemId, num);
  }, [localValue, itemId, onSave]);

  if (isEditing) {
    return (
      <View style={{ width: colWidth, alignItems: "flex-end", justifyContent: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <TextInput
            value={localValue}
            onChangeText={setLocalValue}
            keyboardType="numeric"
            autoFocus
            style={{
              width: colWidth - 40, height: 26, borderWidth: 1, borderRadius: 6,
              borderColor: colors.accentPrimary, color: colors.textPrimary,
              backgroundColor: colors.bgCard, fontSize: 11,
              paddingHorizontal: 6, textAlign: "right", fontVariant: ["tabular-nums"],
            }}
            onSubmitEditing={handleSubmit}
          />
          <Pressable onPress={handleSubmit} hitSlop={6}>
            <FontAwesome name="check" size={12} color={colors.success} />
          </Pressable>
          <Pressable onPress={onCancel} hitSlop={6}>
            <FontAwesome name="times" size={12} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ width: colWidth, alignItems: "flex-end", justifyContent: "center" }}>
      <Pressable
        onPress={() => { if (cellKey) onStartEdit(cellKey, String(value ?? "")); }}
        style={{ flexDirection: "row", alignItems: "center" }}
      >
        <Text style={{
          fontSize: 12, fontWeight: isTotal ? "700" : "500",
          color: value != null && value < 0 ? colors.danger : (isTotal ? colors.textPrimary : colors.textSecondary),
          fontVariant: ["tabular-nums"], textAlign: "right",
        }}>
          {value != null ? formatNumber(value) : "-"}
        </Text>
        {isEdited && (
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning, marginLeft: 4 }} />
        )}
      </Pressable>
    </View>
  );
});

/* ═══════════════════════════════════════════════════════════════════ */
/*  STATEMENTS TABLE                                                  */
/* ═══════════════════════════════════════════════════════════════════ */

function StatementsTable({
  stockId, statements, colors, isDesktop, isFetching, onRefresh, statementType,
}: {
  stockId: number;
  statements: FinancialStatement[];
  colors: ThemePalette;
  isDesktop: boolean;
  isFetching: boolean;
  onRefresh: () => void;
  statementType?: string;
}) {
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [selectedPeriods, setSelectedPeriods] = useState<Set<string>>(new Set());
  const [deleteMode, setDeleteMode] = useState(false);

  const updateMut = useMutation({
    mutationFn: ({ itemId, amount }: { itemId: number; amount: number }) => updateLineItem(itemId, amount),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] }); setEditingKey(null); },
    onError: (err: Error) => showErrorAlert("Update Failed", err),
  });

  const handleStartEdit = useCallback((id: string, _val: string) => {
    setEditingKey(id);
  }, []);

  // Audit-aware save: confirm before modifying financial data
  const handleSaveEdit = useCallback(async (itemId: number, amount: number) => {
    const lineItem = statements
      .flatMap((s) => (s.line_items || []).map((li) => ({ ...li, _statementId: s.id })))
      .find((li) => li.id === itemId);
    const currentValue = lineItem?.amount ?? null;
    const statementId = lineItem?._statementId ?? 0;

    const msg = "Modifying financial statements affects all derived metrics and scores. This action is logged.";

    const doSave = () => {
      updateMut.mutate({ itemId, amount });
      logStatementChange(
        stockId,
        statementId,
        itemId,
        "manually_edited",
        currentValue,
        amount,
        "user",
        "Manual adjustment via UI",
      ).catch((err: unknown) => console.warn("Audit log failed:", err));
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

  const deleteMut = useMutation({
    mutationFn: (periods: string[]) => deleteStatementsByPeriod(stockId, periods),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["analysis-statements", stockId] });
      setSelectedPeriods(new Set());
      setDeleteMode(false);
      Alert.alert("Deleted", res.message);
    },
    onError: (err: Error) => showErrorAlert("Delete Failed", err),
  });

  const togglePeriod = useCallback((period: string) => {
    setSelectedPeriods((prev) => {
      const next = new Set(prev);
      if (next.has(period)) next.delete(period); else next.add(period);
      return next;
    });
  }, []);

  // Build columns — keyed by canonical line_item_code (no client-side normalization)
  const periods = useMemo(() =>
    [...statements]
      .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date))
      .map((s) => ({
        label: `FY${s.fiscal_year}${s.fiscal_quarter ? ` Q${s.fiscal_quarter}` : ""}`,
        period: s.period_end_date,
        items: Object.fromEntries(
          (s.line_items ?? []).map((li) => [li.line_item_code, { id: li.id, amount: li.amount, name: li.line_item_name, isTotal: li.is_total, edited: li.manually_edited }])
        ),
      })),
  [statements]);

  // Build unified row list — uses canonical codes directly
  const allCodes = useMemo(() => {
    const codes: { code: string; name: string; isTotal: boolean }[] = [];
    const seen = new Set<string>();
    for (const s of statements) {
      for (const li of (s.line_items ?? []).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))) {
        if (!seen.has(li.line_item_code)) {
          seen.add(li.line_item_code);
          codes.push({ code: li.line_item_code, name: li.line_item_name, isTotal: li.is_total });
        }
      }
    }
    return codes;
  }, [statements]);

  const handleDelete = useCallback(() => {
    if (selectedPeriods.size === 0) return;
    const labels = periods.filter((p) => selectedPeriods.has(p.period)).map((p) => p.label).join(", ");
    const msg = `Delete ${selectedPeriods.size} period(s)?\n\n${labels}\n\nThis will remove all statement data for these years and cannot be undone.`;
    if (Platform.OS === "web") {
      if (confirm(msg)) deleteMut.mutate(Array.from(selectedPeriods));
    } else {
      Alert.alert("Delete Periods", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMut.mutate(Array.from(selectedPeriods)) },
      ]);
    }
  }, [selectedPeriods, periods, deleteMut]);

  if (periods.length === 0) {
    return (
      <View style={st.empty}>
        <View style={[st.emptyIcon, { backgroundColor: colors.accentSecondary + "10" }]}>
          <FontAwesome name="file-text-o" size={32} color={colors.accentSecondary} />
        </View>
        <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>No statements</Text>
        <Text style={[st.emptySubtitle, { color: colors.textMuted }]}>Upload a financial report PDF above to extract statements with AI</Text>
      </View>
    );
  }

  const COL_NAME_W = isDesktop ? 200 : 160;
  const COL_VAL_W = isDesktop ? 120 : 105;

  return (
    <ScrollView refreshControl={<RefreshControl refreshing={isFetching} onRefresh={onRefresh} tintColor={colors.accentPrimary} />}>
      {/* Delete mode toolbar */}
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", paddingHorizontal: 12, paddingTop: 6, gap: 8 }}>
        {deleteMode && selectedPeriods.size > 0 && (
          <Pressable
            onPress={handleDelete}
            disabled={deleteMut.isPending}
            style={({ pressed }) => [{
              flexDirection: "row", alignItems: "center", gap: 5,
              paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
              backgroundColor: colors.danger, opacity: pressed ? 0.8 : 1,
            }]}
          >
            {deleteMut.isPending ? (
              <ActivityIndicator size="small" color="#fff" />
            ) : (
              <FontAwesome name="trash" size={12} color="#fff" />
            )}
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "700" }}>Delete ({selectedPeriods.size})</Text>
          </Pressable>
        )}
        <Pressable
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
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 4, paddingBottom: 80 }}>
        <View>
          {/* Header row */}
          <View style={{
            flexDirection: "row", alignItems: "center", paddingVertical: 10, paddingHorizontal: 8,
            borderBottomWidth: 2, borderBottomColor: colors.accentPrimary, backgroundColor: colors.bgCard,
          }}>
            <Text style={{ width: COL_NAME_W, fontSize: 12, fontWeight: "800", color: colors.textPrimary }} numberOfLines={1}>
              Line Item
            </Text>
            {periods.map((p) => (
              <Pressable
                key={p.period}
                disabled={!deleteMode}
                onPress={() => togglePeriod(p.period)}
                style={{ width: COL_VAL_W, alignItems: "center", flexDirection: "row", justifyContent: "flex-end", gap: 4 }}
              >
                {deleteMode && (
                  <View style={{
                    width: 16, height: 16, borderRadius: 4, borderWidth: 1.5,
                    borderColor: selectedPeriods.has(p.period) ? colors.danger : colors.textMuted,
                    backgroundColor: selectedPeriods.has(p.period) ? colors.danger : "transparent",
                    alignItems: "center", justifyContent: "center",
                  }}>
                    {selectedPeriods.has(p.period) && <FontAwesome name="check" size={10} color="#fff" />}
                  </View>
                )}
                <Text style={{ fontSize: 12, fontWeight: "800", color: selectedPeriods.has(p.period) ? colors.danger : colors.textPrimary, textAlign: "right" }}>
                  {p.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* Data rows */}
          {allCodes.map((item, rowIdx) => (
            <View
              key={item.code}
              style={{
                flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 8,
                backgroundColor: item.isTotal ? colors.bgInput + "60" : rowIdx % 2 === 0 ? "transparent" : colors.bgPrimary + "30",
                borderTopWidth: item.isTotal ? 1 : 0, borderTopColor: colors.borderColor,
              }}
            >
              <Text numberOfLines={1} style={{
                width: COL_NAME_W, fontSize: 12,
                fontWeight: item.isTotal ? "700" : "400",
                color: item.isTotal ? colors.textPrimary : colors.textSecondary, paddingRight: 8,
              }}>
                {item.name}
              </Text>

              {periods.map((p) => {
                const cell = p.items[item.code];
                return (
                  <EditableCell
                    key={p.period}
                    itemId={cell?.id ?? null}
                    value={cell?.amount}
                    isTotal={item.isTotal}
                    isEdited={!!cell?.edited}
                    colWidth={COL_VAL_W}
                    colors={colors}
                    editingKey={editingKey}
                    onStartEdit={handleStartEdit}
                    onSave={handleSaveEdit}
                    onCancel={handleCancelEdit}
                  />
                );
              })}
            </View>
          ))}

          {/* Balance Sheet Integrity Row — display aid for manual verification */}
          {statementType === "balance" && periods.length > 0 && (() => {
            const diffs = periods.map((p) => {
              const assets = p.items["assets"]?.amount ?? p.items["total_assets"]?.amount;
              const liabilities = p.items["liabilities"]?.amount ?? p.items["total_liabilities"]?.amount;
              const equity = p.items["equity"]?.amount ?? p.items["total_equity"]?.amount;
              if (assets == null || liabilities == null || equity == null) return null;
              return assets - (liabilities + equity);
            });
            const hasData = diffs.some((d) => d != null);
            if (!hasData) return null;
            return (
              <View style={{
                flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 8,
                borderTopWidth: 2, borderTopColor: colors.borderColor, backgroundColor: colors.bgInput + "40",
              }}>
                <Text numberOfLines={1} style={{
                  width: COL_NAME_W, fontSize: 11, fontWeight: "700",
                  color: colors.textPrimary, paddingRight: 8, fontStyle: "italic",
                }}>
                  ✔ A = L + E Check
                </Text>
                {diffs.map((diff, i) => (
                  <View key={periods[i].period} style={{ width: COL_VAL_W, alignItems: "flex-end", justifyContent: "center" }}>
                    <Text style={{
                      fontSize: 11, fontWeight: "700", fontVariant: ["tabular-nums"],
                      color: diff == null ? colors.textMuted : Math.abs(diff) < 0.01 ? colors.success : colors.danger,
                    }}>
                      {diff == null ? "—" : Math.abs(diff) < 0.01 ? "✓ Balanced" : formatNumber(diff)}
                    </Text>
                  </View>
                ))}
              </View>
            );
          })()}
        </View>
      </ScrollView>
    </ScrollView>
  );
}
