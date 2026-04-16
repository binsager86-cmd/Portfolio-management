/**
 * StatementsPanel — Thin orchestrator composing AiExtractionFlow,
 * SavedPdfsList, StatementTabBar, and StatementsTable.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useState } from "react";
import {
    Alert,
    Platform,
    Pressable,
    ScrollView,
    Text,
    View,
} from "react-native";

import { FAPanelSkeleton } from "@/components/ui/PageSkeletons";
import type { ThemePalette } from "@/constants/theme";
import {
    deleteStockPdf,
    downloadStockPdf,
    type SavedPdf,
} from "@/services/api/analytics";
import { useStatementManager } from "../hooks/useStatementManager";
import { st } from "../styles";
import type { PanelWithSymbolProps } from "../types";
import { STMNT_META, STMNT_TYPES } from "../types";
import { AiExtractionFlow } from "./AiExtractionFlow";
import { StatementTabBar } from "./shared";
import { StatementsTable } from "./StatementsTable";

/* ═══════════════════════════════════════════════════════════════════ */
/*  STATEMENTS PANEL                                                  */
/* ═══════════════════════════════════════════════════════════════════ */

export function StatementsPanel({ stockId, stockSymbol, colors, isDesktop }: PanelWithSymbolProps) {
  const mgr = useStatementManager(stockId);
  const { statements, isLoading, isFetching, refetch, savedPdfs, typeFilter, setTypeFilter } = mgr;

  return (
    <View style={{ flex: 1 }}>
      {/* Upload / import / online-fetch section */}
      <AiExtractionFlow mgr={mgr} colors={colors} />

      {/* Saved PDFs list */}
      <SavedPdfsList pdfs={savedPdfs} stockId={stockId} colors={colors} />

      {/* Type filter tabs */}
      <StatementTabBar value={typeFilter} onChange={setTypeFilter} colors={colors} showAll={true} />

      {isLoading ? (
        <FAPanelSkeleton />
      ) : typeFilter == null ? (
        /* "All" view: grouped by statement type */
        <ScrollView style={{ flex: 1 }}>
          {STMNT_TYPES.map((sType) => {
            const filtered = statements.filter((s) => s.statement_type === sType);
            if (filtered.length === 0) return null;
            const meta = STMNT_META[sType];
            return (
              <View key={sType}>
                <View style={{
                  flexDirection: "row", alignItems: "center", gap: 8,
                  paddingHorizontal: 14, paddingVertical: 10,
                  backgroundColor: (meta?.color ?? colors.accentPrimary) + "12",
                  borderBottomWidth: 1, borderBottomColor: colors.borderColor,
                }}>
                  <FontAwesome name={meta?.icon ?? "file-text-o"} size={14} color={meta?.color ?? colors.accentPrimary} />
                  <Text style={{ fontSize: 13, fontWeight: "700", color: meta?.color ?? colors.textPrimary, letterSpacing: 0.3 }}>
                    {meta?.label ?? sType}
                  </Text>
                  <Text style={{ fontSize: 11, color: colors.textMuted }}>
                    ({filtered.length} period{filtered.length !== 1 ? "s" : ""})
                  </Text>
                </View>
                <StatementsTable
                  stockId={stockId} stockSymbol={stockSymbol} statements={filtered}
                  colors={colors} isDesktop={isDesktop} isFetching={isFetching}
                  onRefresh={refetch} statementType={sType}
                />
              </View>
            );
          })}
        </ScrollView>
      ) : (
        <StatementsTable
          stockId={stockId} stockSymbol={stockSymbol} statements={statements}
          colors={colors} isDesktop={isDesktop} isFetching={isFetching}
          onRefresh={refetch} statementType={typeFilter}
        />
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

  const doDelete = useCallback(async (pdf: SavedPdf) => {
    try {
      await deleteStockPdf(stockId, pdf.id);
      queryClient.invalidateQueries({ queryKey: ["stock-pdfs", stockId] });
      if (Platform.OS === "web") window.alert("PDF deleted successfully.");
      else Alert.alert("Deleted", "PDF deleted successfully.");
    } catch {
      if (Platform.OS === "web") window.alert("Failed to delete PDF.");
      else Alert.alert("Error", "Failed to delete PDF.");
    }
  }, [stockId, queryClient]);

  const handleDelete = useCallback((pdf: SavedPdf) => {
    if (Platform.OS === "web") {
      if (window.confirm(`Delete "${pdf.original_name}"? This cannot be undone.`)) {
        doDelete(pdf);
      }
    } else {
      Alert.alert(
        "Delete PDF",
        `Delete "${pdf.original_name}"? This cannot be undone.`,
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete", style: "destructive", onPress: () => doDelete(pdf) },
        ],
      );
    }
  }, [doDelete]);

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
