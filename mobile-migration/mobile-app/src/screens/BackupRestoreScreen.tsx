/**
 * Backup & Restore — Export Excel backup, import from Excel.
 *
 * Mirrors Streamlit's Backup & Restore section.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation } from "@tanstack/react-query";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Alert,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
    type ViewStyle,
} from "react-native";

import type { ThemePalette } from "@/constants/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { useScreenStyles } from "@/hooks/useScreenStyles";
import { todayISO } from "@/lib/dateUtils";
import { extractErrorMessage, showErrorAlert } from "@/lib/errorHandling";
import { exportBackup, importBackup } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";

const IMPORT_MODES = ["merge", "replace"] as const;

type SheetCounts = { new?: number; updated?: number; imported?: number; skipped?: number };
type ImportResultData = {
  imported?: number;
  skipped?: number;
  errors?: { sheet?: string; row?: number | string; error?: string }[];
  sheets?: {
    stocks?: SheetCounts;
    transactions?: SheetCounts;
    cash_deposits?: SheetCounts;
    portfolio_snapshots?: SheetCounts;
  };
};

export default function BackupRestoreScreen() {
  const { colors } = useThemeStore();
  const ss = useScreenStyles();
  const { isDesktop } = useResponsive();
  const { t } = useTranslation();
  const isDark = colors.mode === "dark";
  const [importResult, setImportResult] = useState<ImportResultData | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
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
        a.download = `portfolio_backup_${todayISO()}.xlsx`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        Alert.alert("Export", t('backup.exportSuccess'));
      }
    },
    onError: (err) => showErrorAlert("Error", err, "Export failed"),
  });

  const importMutation = useMutation({
    mutationFn: (fd: FormData) => importBackup(fd, importMode),
    onSuccess: (result) => {
      setImportError(null);
      setImportResult(result);
      setPendingFile(null);
      setSelectedFileName(null);
    },
    onError: (err: unknown) => {
      setImportResult(null);
      let msg: string;
      const hasResponse = !!(err && typeof err === "object" && "response" in err && (err as { response?: unknown }).response);
      if (!hasResponse) {
        msg = t('backup.cannotReachServer');
      } else {
        msg = extractErrorMessage(err, "Import failed.");
      }
      setImportError(msg);
    },
  });

  const handlePickFile = () => {
    if (Platform.OS === "web") {
      const input = document.createElement("input");
      input.type = "file";
      input.accept = ".xlsx,.xls";
      input.onchange = (e: Event) => {
        const target = e.target as HTMLInputElement | null;
        const file = target?.files?.[0];
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
      Alert.alert("Import", t('backup.fileImportWebOnly'));
    }
  };

  const handleImport = () => {
    if (!pendingFile) return;
    importMutation.mutate(pendingFile);
  };

  return (
    <ScrollView
      style={ss.container}
      contentContainerStyle={[ss.content, isDesktop && { maxWidth: 700, alignSelf: "center", width: "100%" }]}
    >
      <Text style={[ss.title, { marginBottom: 4 }]}>{t('backup.title')}</Text>
      <Text style={[s.desc, { color: colors.textSecondary }]}>
        {t('backup.description')}
      </Text>

      {/* Export Section */}
      <View style={[s.section, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={s.sectionIcon}>
          <FontAwesome name="download" size={32} color={colors.accentPrimary} />
        </View>
        <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{t('backup.exportBackup')}</Text>
        <Text style={[s.sectionDesc, { color: colors.textSecondary }]}>
          {t('backup.exportDesc')}
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
            {exportMutation.isPending ? t('backup.exporting') : t('backup.downloadExcel')}
          </Text>
        </Pressable>
      </View>

      {/* Import Section */}
      <View style={[s.section, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <View style={s.sectionIcon}>
          <FontAwesome name="upload" size={32} color={colors.accentPrimary} />
        </View>
        <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{t('backup.restoreFromBackup')}</Text>
        <Text style={[s.sectionDesc, { color: colors.textSecondary }]}>
          {t('backup.restoreDesc')}
        </Text>

        {/* Mode selector */}
        <Text style={[s.fieldLabel, { color: colors.textSecondary }]}>{t('backup.importMode')}</Text>
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
            {t('backup.replaceWarning')}
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
              borderStyle: "dashed" as ViewStyle["borderStyle"],
              opacity: pressed ? 0.6 : 1,
              marginBottom: 8,
            },
          ]}
        >
          <FontAwesome name="file-excel-o" size={16} color={colors.accentPrimary} />
          <Text style={[s.btnText, { color: colors.textPrimary }]}>
            {selectedFileName ?? t('backup.chooseExcelFile')}
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
              ? t('backup.importing')
              : pendingFile
                ? `${t('backup.importMode')} (${importMode})`
                : t('backup.selectFileFirst')}
          </Text>
        </Pressable>
      </View>

      {/* Import Result — Success Summary */}
      {importResult && (
        <ImportSuccessCard result={importResult} colors={colors} onDismiss={() => setImportResult(null)} />
      )}

      {/* Import Error */}
      {importError && (
        <View style={[s.resultBox, { backgroundColor: isDark ? "rgba(239,68,68,0.08)" : "rgba(239,68,68,0.05)", borderColor: colors.danger }]}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 }}>
            <FontAwesome name="exclamation-circle" size={18} color={colors.danger} />
            <Text style={[s.resultTitle, { color: colors.danger }]}>{t('backup.importFailed')}</Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 14, lineHeight: 20 }}>{importError}</Text>
          <Pressable onPress={() => setImportError(null)} hitSlop={8} accessibilityRole="button" accessibilityLabel={t('backup.dismiss')} style={{ marginTop: 12 }}>
            <Text style={{ color: colors.accentPrimary, fontSize: 13, fontWeight: "600" }}>{t('backup.dismiss')}</Text>
          </Pressable>
        </View>
      )}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ── Import Success Card component ───────────────────────────────────

function ImportSuccessCard({
  result,
  colors,
  onDismiss,
}: {
  result: ImportResultData;
  colors: ThemePalette;
  onDismiss: () => void;
}) {
  const isDark = colors.mode === "dark";
  const sheets = result?.sheets;
  const totalImported = result?.imported ?? 0;
  const totalSkipped = result?.skipped ?? 0;
  const errorCount = result?.errors?.length ?? 0;
  const hasErrors = errorCount > 0;

  const sheetRows: { icon: string; label: string; detail: string }[] = [];
  if (sheets?.stocks) {
    const sr = sheets.stocks;
    const parts = [`${sr.new ?? 0} new`, `${sr.updated ?? 0} updated`];
    if (sr.skipped) parts.push(`${sr.skipped} skipped`);
    sheetRows.push({ icon: "line-chart", label: "Stocks", detail: parts.join(", ") });
  }
  if (sheets?.transactions) {
    const t = sheets.transactions;
    const parts = [`${t.imported ?? 0} imported`];
    if (t.skipped) parts.push(`${t.skipped} skipped`);
    sheetRows.push({ icon: "exchange", label: "Transactions", detail: parts.join(", ") });
  }
  if (sheets?.cash_deposits) {
    const c = sheets.cash_deposits;
    const parts = [`${c.imported ?? 0} imported`];
    if (c.skipped) parts.push(`${c.skipped} skipped`);
    sheetRows.push({ icon: "money", label: "Cash Deposits", detail: parts.join(", ") });
  }
  if (sheets?.portfolio_snapshots) {
    const p = sheets.portfolio_snapshots;
    const parts = [`${p.imported ?? 0} imported`];
    if (p.skipped) parts.push(`${p.skipped} skipped`);
    sheetRows.push({ icon: "camera", label: "Snapshots", detail: parts.join(", ") });
  }

  return (
    <View
      style={[
        s.resultBox,
        {
          backgroundColor: isDark ? "rgba(16,185,129,0.08)" : "rgba(16,185,129,0.05)",
          borderColor: isDark ? "rgba(16,185,129,0.3)" : "rgba(16,185,129,0.2)",
        },
      ]}
    >
      {/* Header */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 14 }}>
        <FontAwesome name="check-circle" size={22} color={isDark ? "#10b981" : "#047857"} />
        <Text style={{ fontSize: 17, fontWeight: "700", color: colors.textPrimary }}>
          Import Complete
        </Text>
      </View>

      {/* Summary counters */}
      <View style={{ flexDirection: "row", gap: 16, marginBottom: 14, flexWrap: "wrap" }}>
        <View style={{ alignItems: "center" }}>
          <Text style={{ fontSize: 22, fontWeight: "800", color: isDark ? "#10b981" : "#047857" }}>
            {totalImported}
          </Text>
          <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: "500" }}>Imported</Text>
        </View>
        {totalSkipped > 0 && (
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.warning }}>
              {totalSkipped}
            </Text>
            <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: "500" }}>Skipped</Text>
          </View>
        )}
        {hasErrors && (
          <View style={{ alignItems: "center" }}>
            <Text style={{ fontSize: 22, fontWeight: "800", color: colors.danger }}>
              {errorCount}
            </Text>
            <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: "500" }}>Errors</Text>
          </View>
        )}
      </View>

      {/* Per-sheet breakdown */}
      {sheetRows.length > 0 && (
        <View style={{ gap: 8, marginBottom: hasErrors ? 14 : 0 }}>
          {sheetRows.map((row) => (
            <View
              key={row.label}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: 10,
                paddingVertical: 6,
                paddingHorizontal: 10,
                backgroundColor: isDark ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
                borderRadius: 8,
              }}
            >
              <FontAwesome name={row.icon as React.ComponentProps<typeof FontAwesome>["name"]} size={14} color={colors.textMuted} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: colors.textPrimary, minWidth: 110 }}>
                {row.label}
              </Text>
              <Text style={{ fontSize: 13, color: colors.textSecondary, flex: 1 }}>{row.detail}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Row errors */}
      {hasErrors && (
        <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderColor: colors.borderColor, paddingTop: 10 }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: colors.danger, marginBottom: 6 }}>
            Row Errors ({errorCount})
          </Text>
          {result.errors!.slice(0, 10).map((e, i: number) => (
            <Text key={i} style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 2, lineHeight: 18 }}>
              {e.sheet ? `${e.sheet} · ` : ""}Row {e.row ?? "?"}: {e.error ?? JSON.stringify(e)}
            </Text>
          ))}
          {errorCount > 10 && (
            <Text style={{ fontSize: 12, color: colors.textMuted, fontStyle: "italic" }}>
              ... and {errorCount - 10} more
            </Text>
          )}
        </View>
      )}

      <Pressable onPress={onDismiss} style={{ marginTop: 12 }}>
        <Text style={{ color: colors.accentPrimary, fontSize: 13, fontWeight: "600" }}>Dismiss</Text>
      </Pressable>
    </View>
  );
}

const s = StyleSheet.create({
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
