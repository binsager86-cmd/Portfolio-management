import { useToast } from "@/components/ui/ToastProvider";
import { TXN_DEPENDENT_QUERY_KEYS } from "@/hooks/useTransactionMutations";
import { showErrorAlert } from "@/lib/errorHandling";
import { deleteAllTransactions, importTransactions } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
  ActivityIndicator, Alert, Platform, Pressable, StyleSheet, Text, View,
} from "react-native";

export function TransactionImport() {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const toast = useToast();

  const [uploadPortfolio, setUploadPortfolio] = useState<"KFH" | "BBYN" | "USA">("KFH");
  const [uploadMode, setUploadMode] = useState<"merge" | "replace">("merge");
  const [selectedFile, setSelectedFile] = useState<{ name: string; file: File } | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);

  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!selectedFile) throw new Error(t("addTransaction.noFileSelected"));
      return importTransactions(selectedFile.file, uploadPortfolio, uploadMode);
    },
    onSuccess: async (result) => {
      setUploadResult(result);
      setSelectedFile(null);
      await Promise.all(
        [...TXN_DEPENDENT_QUERY_KEYS, "stocks-list"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] })
        )
      );
      toast.success(t("addTransaction.importedMsg", { count: result?.imported ?? 0, mode: uploadMode }));
    },
    onError: (err) => showErrorAlert(t("addTransaction.importError"), err, t("addTransaction.uploadFailed")),
  });

  const deleteMutation = useMutation({
    mutationFn: () => deleteAllTransactions(),
    onSuccess: async (result) => {
      await Promise.all(
        TXN_DEPENDENT_QUERY_KEYS.map((key) => queryClient.invalidateQueries({ queryKey: [key] }))
      );
      toast.info(result?.message ?? t("addTransaction.deletedMsg", { count: result?.deleted_count ?? 0 }));
    },
    onError: (err) => showErrorAlert(t("app.error"), err, t("addTransaction.deleteFailed")),
  });

  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ],
        copyToCacheDirectory: true,
      });
      if (result.canceled || !result.assets?.length) return;
      const asset = result.assets[0];
      const response = await fetch(asset.uri);
      const blob = await response.blob();
      const file = new File([blob], asset.name, { type: asset.mimeType ?? "application/octet-stream" });
      setSelectedFile({ name: asset.name, file });
    } catch (error) {
      console.error("File picker error:", error);
    }
  };

  const confirmDeleteAll = () => {
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-restricted-globals
      if (confirm(t("addTransaction.confirmDeleteAllRestore"))) deleteMutation.mutate();
    } else {
      Alert.alert(
        t("addTransaction.deleteAllTransactions"),
        t("addTransaction.confirmDeleteAllBody"),
        [
          { text: t("app.cancel"), style: "cancel" },
          { text: t("addTransaction.deleteAll"), style: "destructive", onPress: () => deleteMutation.mutate() },
        ]
      );
    }
  };

  return (
    <>
      <View style={[styles.divider, { borderColor: colors.borderColor }]} />

      <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
        <FontAwesome name="upload" size={16} color={colors.textPrimary} />{" "}
        {t("addTransaction.importFromExcel")}
      </Text>
      <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
        {t("addTransaction.importHintBulk")}
      </Text>

      {/* Portfolio selector */}
      <View style={styles.uploadRow}>
        <Text style={[styles.uploadLabel, { color: colors.textSecondary }]}>{t("addTransaction.portfolio")}</Text>
        <View style={styles.segmentRow}>
          {(["KFH", "BBYN", "USA"] as const).map((p) => (
            <Pressable
              key={p}
              onPress={() => setUploadPortfolio(p)}
              style={[
                styles.segmentBtn,
                {
                  backgroundColor: uploadPortfolio === p ? colors.accentPrimary : colors.bgSecondary,
                  borderColor: colors.borderColor,
                },
              ]}
            >
              <Text style={[styles.segmentText, { color: uploadPortfolio === p ? "#fff" : colors.textPrimary }]}>
                {p}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Mode selector */}
      <View style={styles.uploadRow}>
        <Text style={[styles.uploadLabel, { color: colors.textSecondary }]}>{t("addTransaction.mode")}</Text>
        <View style={styles.segmentRow}>
          {([
            { key: "merge" as const, label: t("addTransaction.mergeAppend"), icon: "plus" as const },
            { key: "replace" as const, label: t("addTransaction.replaceAll"), icon: "refresh" as const },
          ]).map((m) => (
            <Pressable
              key={m.key}
              onPress={() => setUploadMode(m.key)}
              style={[
                styles.segmentBtn,
                {
                  backgroundColor: uploadMode === m.key ? colors.accentPrimary : colors.bgSecondary,
                  borderColor: colors.borderColor,
                  flex: 1,
                },
              ]}
            >
              <Text style={[styles.segmentText, { color: uploadMode === m.key ? "#fff" : colors.textPrimary }]}>
                <FontAwesome
                  name={m.icon}
                  size={12}
                  color={uploadMode === m.key ? "#fff" : colors.textPrimary}
                />{" "}
                {m.label}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {uploadMode === "replace" && (
        <Text style={[styles.warningText, { color: colors.warning ?? "#e67e22" }]}>
          {t("addTransaction.replaceWarningPortfolio", { portfolio: uploadPortfolio })}
        </Text>
      )}

      {/* File picker */}
      <Pressable
        onPress={pickFile}
        style={[styles.filePickBtn, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}
      >
        <FontAwesome name="file-excel-o" size={20} color={colors.accentPrimary} />
        <Text style={[styles.filePickText, { color: colors.textPrimary }]}>
          {selectedFile ? selectedFile.name : t("addTransaction.chooseExcelFile")}
        </Text>
      </Pressable>

      {/* Upload button */}
      <Pressable
        onPress={() => uploadMutation.mutate()}
        disabled={!selectedFile || uploadMutation.isPending}
        style={({ pressed }) => [
          styles.submitBtn,
          {
            backgroundColor: !selectedFile ? colors.textMuted ?? "#888" : colors.accentPrimary,
            opacity: pressed || uploadMutation.isPending ? 0.7 : 1,
          },
        ]}
      >
        {uploadMutation.isPending ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color="#fff" />
            <Text style={[styles.submitText, { marginLeft: 8 }]}>{t("addTransaction.importing")}</Text>
          </View>
        ) : (
          <Text style={styles.submitText}>
            <FontAwesome name="cloud-upload" size={16} color="#fff" /> {t("addTransaction.uploadImport")}
          </Text>
        )}
      </Pressable>

      {/* Upload result */}
      {uploadResult && (
        <View style={[styles.resultBox, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
          <Text style={[styles.resultTitle, { color: colors.accentPrimary }]}>{t("addTransaction.importResult")}</Text>
          <Text style={{ color: colors.textPrimary }}>
            {t("addTransaction.importedStats", {
              imported: uploadResult.imported ?? 0,
              skipped: uploadResult.skipped ?? 0,
              errors: uploadResult.errors ?? 0,
            })}
          </Text>
          {uploadResult.mode && (
            <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
              {t("addTransaction.mode")}: {uploadResult.mode}
            </Text>
          )}
        </View>
      )}

      {/* ── Danger Zone ─────────────────────── */}
      <View style={[styles.divider, { borderColor: colors.borderColor }]} />

      <Text style={[styles.sectionTitle, { color: colors.danger ?? "#e74c3c" }]}>
        <FontAwesome name="exclamation-triangle" size={16} color={colors.danger ?? "#e74c3c"} />{" "}
        {t("addTransaction.dangerZone")}
      </Text>

      <Pressable
        onPress={confirmDeleteAll}
        disabled={deleteMutation.isPending}
        style={({ pressed }) => [
          styles.deleteAllBtn,
          {
            borderColor: colors.danger ?? "#e74c3c",
            opacity: pressed || deleteMutation.isPending ? 0.7 : 1,
          },
        ]}
      >
        {deleteMutation.isPending ? (
          <View style={styles.loadingRow}>
            <ActivityIndicator size="small" color={colors.danger ?? "#e74c3c"} />
            <Text style={[styles.deleteAllText, { color: colors.danger ?? "#e74c3c", marginLeft: 8 }]}>
              {t("addTransaction.deleting")}
            </Text>
          </View>
        ) : (
          <Text style={[styles.deleteAllText, { color: colors.danger ?? "#e74c3c" }]}>
            <FontAwesome name="trash" size={14} color={colors.danger ?? "#e74c3c"} />{" "}
            {t("addTransaction.deleteAllTransactions")}
          </Text>
        )}
      </Pressable>
      <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
        {t("addTransaction.deleteAllHintFull")}
      </Text>
    </>
  );
}

const styles = StyleSheet.create({
  divider: { borderTopWidth: 1, marginTop: 28, marginBottom: 20 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginBottom: 6 },
  sectionHint: { fontSize: 13, marginBottom: 16, lineHeight: 18 },
  uploadRow: { marginBottom: 12 },
  uploadLabel: { fontSize: 13, fontWeight: "600", marginBottom: 6 },
  segmentRow: { flexDirection: "row", gap: 8 },
  segmentBtn: {
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1, alignItems: "center",
  },
  segmentText: { fontSize: 13, fontWeight: "600" },
  warningText: { fontSize: 12, marginBottom: 12, fontStyle: "italic" },
  filePickBtn: {
    flexDirection: "row", alignItems: "center", gap: 10, padding: 14,
    borderRadius: 10, borderWidth: 1, borderStyle: "dashed", marginBottom: 12,
  },
  filePickText: { fontSize: 14, fontWeight: "500" },
  submitBtn: { paddingVertical: 16, borderRadius: 12, alignItems: "center", marginTop: 12 },
  submitText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  loadingRow: { flexDirection: "row", alignItems: "center", justifyContent: "center" },
  resultBox: { padding: 14, borderRadius: 10, borderWidth: 1, marginTop: 12 },
  resultTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  deleteAllBtn: {
    paddingVertical: 14, borderRadius: 12, alignItems: "center", borderWidth: 2, marginBottom: 6,
  },
  deleteAllText: { fontSize: 15, fontWeight: "700" },
});
