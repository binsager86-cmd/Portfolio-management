/**
 * Backup & Restore — Export Excel backup, import from Excel.
 *
 * Mirrors Streamlit's Backup & Restore section.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Platform,
  Alert,
} from "react-native";
import { useMutation } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { exportBackup, importBackup } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import type { ThemePalette } from "@/constants/theme";

const IMPORT_MODES = ["merge", "replace"] as const;

export default function BackupRestoreScreen() {
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();
  const [importResult, setImportResult] = useState<string | null>(null);
  const [importMode, setImportMode] = useState<"merge" | "replace">("merge");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [pendingFile, setPendingFile] = useState<FormData | null>(null);

  const exportMutation = useMutation({
    mutationFn: exportBackup,
    onSuccess: (blob) => {
      if (Platform.OS === "web") {
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `portfolio_backup_${new Date().toISOString().slice(0, 10)}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        Alert.alert("Export", "Backup file downloaded successfully");
      }
    },
    onError: (err: any) => {
      const msg = err?.message ?? "Export failed";
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Error", msg);
    },
  });

  const importMutation = useMutation({
    mutationFn: (fd: FormData) => importBackup(fd, importMode),
    onSuccess: (result) => {
      const lines: string[] = [];
      // Per-sheet breakdown
      const sheets = result?.sheets;
      if (sheets) {
        if (sheets.stocks) {
          const s = sheets.stocks;
          lines.push(`Stocks: ${s.new ?? 0} new, ${s.updated ?? 0} updated${s.skipped ? `, ${s.skipped} skipped` : ""}`);
        }
        if (sheets.transactions) {
          const t = sheets.transactions;
          lines.push(`Transactions: ${t.imported ?? 0} imported${t.skipped ? `, ${t.skipped} skipped` : ""}`);
        }
        if (sheets.cash_deposits) {
          const c = sheets.cash_deposits;
          lines.push(`Cash Deposits: ${c.imported ?? 0} imported${c.skipped ? `, ${c.skipped} skipped` : ""}`);
        }
        if (sheets.portfolio_snapshots) {
          const p = sheets.portfolio_snapshots;
          lines.push(`Snapshots: ${p.imported ?? 0} imported${p.skipped ? `, ${p.skipped} skipped` : ""}`);
        }
      }
      // Summary line
      lines.push(
        [
          `Total: ${result?.imported ?? 0}`,
          result?.skipped ? `Skipped: ${result.skipped}` : null,
          result?.errors?.length ? `Errors: ${result.errors.length}` : null,
          `Mode: ${result?.mode ?? importMode}`,
        ].filter(Boolean).join(" | ")
      );
      // Show per-row errors if any
      if (result?.errors?.length) {
        lines.push("");
        lines.push("--- Row Errors (first 20) ---");
        result.errors.slice(0, 20).forEach((e: any, i: number) => {
          const sheet = e.sheet ? `[${e.sheet}] ` : "";
          lines.push(`  ${i + 1}. ${sheet}Row ${e.row ?? "?"}: ${e.error ?? JSON.stringify(e)}`);
        });
        if (result.errors.length > 20) {
          lines.push(`  ... and ${result.errors.length - 20} more`);
        }
      }
      setImportResult(lines.join("\n"));
      setPendingFile(null);
      setSelectedFileName(null);
    },
    onError: (err: any) => {
      // Build detailed debug info
      const lines: string[] = ["--- IMPORT ERROR DEBUG ---"];

      // HTTP status
      const status = err?.response?.status;
      if (status) lines.push(`HTTP Status: ${status}`);

      // Request URL
      const url = err?.config?.url || err?.request?.responseURL;
      if (url) lines.push(`URL: ${url}`);

      // FastAPI validation errors (422)
      const detail = err?.response?.data?.detail;
      if (Array.isArray(detail)) {
        lines.push(`Validation Errors (${detail.length}):`);
        detail.forEach((d: any, i: number) => {
          const loc = d.loc?.join(".") ?? "unknown";
          lines.push(`  ${i + 1}. [${loc}] ${d.msg} (type: ${d.type ?? "-"})`);
          if (d.input !== undefined) lines.push(`     input: ${JSON.stringify(d.input).slice(0, 100)}`);
        });
      } else if (typeof detail === "string") {
        lines.push(`Detail: ${detail}`);
      }

      // Server error code
      const errorCode = err?.response?.data?.error_code;
      if (errorCode) lines.push(`Error Code: ${errorCode}`);

      // Full response body (truncated)
      if (err?.response?.data) {
        const raw = JSON.stringify(err.response.data).slice(0, 300);
        lines.push(`Raw Response: ${raw}`);
      }

      // Network error
      if (!err?.response) {
        lines.push(`Network Error: ${err?.message ?? "No response from server"}`);
        lines.push(`Hint: Is the backend running? Check http://localhost:8004/health`);
      }

      setImportResult(lines.join("\n"));
    },
  });

  const handlePickFile = () => {
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".xlsx,.xls";
      input.onchange = (e: any) => {
        const file = e.target.files?.[0];
        if (file) {
          const formData = new FormData();
          formData.append("file", file);
          setPendingFile(formData);
          setSelectedFileName(file.name);
          setImportResult(null);
        }
      };
      input.click();
    } else {
      Alert.alert("Import", "File import is available on web. Please use the web version to import Excel files.");
    }
  };

  const handleImport = () => {
    if (!pendingFile) return;
    importMutation.mutate(pendingFile);
  };

  return (
    <ScrollView
      style={[s.container, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={[s.content, isDesktop && { maxWidth: 700, alignSelf: "center", width: "100%" }]}
    >
      <Text style={[s.title, { color: colors.textPrimary }]}>Backup & Restore</Text>
      <Text style={[s.desc, { color: colors.textSecondary }]}>
        Export your portfolio data as an Excel file, or import transactions from a backup.
      </Text>

      {/* Export Section */}
      <View style={[s.section, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={s.sectionIcon}>
          <FontAwesome name="download" size={32} color={colors.accentPrimary} />
        </View>
        <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Export Backup</Text>
        <Text style={[s.sectionDesc, { color: colors.textSecondary }]}>
          Download a full Excel backup of all transactions, deposits, holdings, and snapshots.
        </Text>
        <Pressable
          onPress={() => exportMutation.mutate()}
          disabled={exportMutation.isPending}
          style={({ pressed }) => [
            s.btn,
            {
              backgroundColor: colors.accentPrimary,
              opacity: pressed || exportMutation.isPending ? 0.6 : 1,
            },
          ]}
        >
          <FontAwesome name="file-excel-o" size={16} color="#fff" />
          <Text style={s.btnText}>
            {exportMutation.isPending ? "Exporting..." : "Download Excel"}
          </Text>
        </Pressable>
      </View>

      {/* Import Section */}
      <View style={[s.section, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={s.sectionIcon}>
          <FontAwesome name="upload" size={32} color={colors.accentPrimary} />
        </View>
        <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Restore from Backup</Text>
        <Text style={[s.sectionDesc, { color: colors.textSecondary }]}>
          Upload an Excel backup (.xlsx) to restore all data — stocks, transactions, cash deposits, and snapshots. Portfolio is read from each row automatically.
        </Text>

        {/* Mode selector */}
        <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>Import Mode</Text>
        <View style={s.chipRow}>
          {IMPORT_MODES.map((m) => (
            <Pressable
              key={m}
              onPress={() => setImportMode(m)}
              style={[
                s.chip,
                {
                  backgroundColor: importMode === m ? colors.accentPrimary : colors.bgPrimary,
                  borderColor: importMode === m ? colors.accentPrimary : colors.borderColor,
                },
              ]}
            >
              <FontAwesome
                name={m === "merge" ? "plus-circle" : "exchange"}
                size={13}
                color={importMode === m ? "#fff" : colors.textSecondary}
                style={{ marginRight: 6 }}
              />
              <Text style={{ color: importMode === m ? "#fff" : colors.textSecondary, fontWeight: "600", fontSize: 14, textTransform: "capitalize" }}>
                {m}
              </Text>
            </Pressable>
          ))}
        </View>
        {importMode === "replace" && (
          <Text style={[s.modeWarning, { color: colors.danger }]}>
            Replace mode will delete ALL existing data (stocks, transactions, cash deposits, snapshots) before importing.
          </Text>
        )}

        {/* File picker */}
        <Pressable
          onPress={handlePickFile}
          disabled={importMutation.isPending}
          style={({ pressed }) => [
            s.btn,
            {
              backgroundColor: colors.bgPrimary,
              borderWidth: 1,
              borderColor: colors.borderColor,
              borderStyle: "dashed" as any,
              opacity: pressed ? 0.6 : 1,
              marginBottom: 8,
            },
          ]}
        >
          <FontAwesome name="file-excel-o" size={16} color={colors.accentPrimary} />
          <Text style={[s.btnText, { color: colors.textPrimary }]}>
            {selectedFileName ?? "Choose Excel File..."}
          </Text>
        </Pressable>

        {/* Import button */}
        <Pressable
          onPress={handleImport}
          disabled={importMutation.isPending || !pendingFile}
          style={({ pressed }) => [
            s.btn,
            {
              backgroundColor: colors.success,
              opacity: pressed || importMutation.isPending || !pendingFile ? 0.5 : 1,
            },
          ]}
        >
          <FontAwesome name="cloud-upload" size={16} color="#fff" />
          <Text style={s.btnText}>
            {importMutation.isPending
              ? "Importing..."
              : pendingFile
                ? `Import (${importMode})`
                : "Select a file first"}
          </Text>
        </Pressable>
      </View>

      {/* Import Result */}
      {importResult && (
        <View style={[s.resultBox, {
          backgroundColor: importResult.startsWith("---") ? "#1a0000" : colors.bgCard,
          borderColor: importResult.startsWith("---") ? colors.danger : colors.borderColor,
        }]}>
          <Text style={[s.resultTitle, {
            color: importResult.startsWith("---") ? colors.danger : colors.textPrimary,
          }]}>
            {importResult.startsWith("---") ? "Import Error (Debug)" : "Import Result"}
          </Text>
          <Text
            style={[
              s.resultText,
              {
                color: importResult.startsWith("---") ? "#ff9999" : colors.textSecondary,
                fontFamily: importResult.startsWith("---") ? (Platform.OS === "web" ? "monospace" : "Courier") : undefined,
                fontSize: importResult.startsWith("---") ? 12 : 14,
              },
            ]}
            selectable
          >
            {importResult}
          </Text>
          <Pressable onPress={() => setImportResult(null)} style={{ marginTop: 8 }}>
            <Text style={{ color: colors.accentPrimary, fontSize: 13, fontWeight: "600" }}>Dismiss</Text>
          </Pressable>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 4 },
  desc: { fontSize: 14, marginBottom: 20 },
  section: {
    padding: 24,
    borderRadius: 16,
    borderWidth: 1,
    marginBottom: 16,
    alignItems: "center",
  },
  sectionIcon: { marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 6 },
  sectionDesc: { fontSize: 13, textAlign: "center", marginBottom: 16, maxWidth: 400 },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 10,
  },
  btnText: { color: "#fff", fontSize: 15, fontWeight: "600" },
  resultBox: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
  },
  resultTitle: { fontSize: 15, fontWeight: "700", marginBottom: 8 },
  resultText: { fontSize: 12, fontFamily: Platform.select({ web: "monospace", default: undefined }) },
  fieldLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 8,
    alignSelf: "flex-start",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  chipRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 14,
    flexWrap: "wrap",
  },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 44,
  },
  modeWarning: {
    fontSize: 12,
    fontWeight: "500",
    marginBottom: 12,
    textAlign: "center",
  },
});
