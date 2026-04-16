/**
 * KFH Trade Import Button — file picker + import flow orchestration.
 */

import { extractErrorMessage } from "@/lib/errorHandling";
import type { KfhImportPreview, KfhImportResult } from "@/lib/kfh/kfhTradeTypes";
import { setCashOverride } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as DocumentPicker from "expo-document-picker";
import React, { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import KfhTradeHelpModal from "./KfhTradeHelpModal";
import KfhTradeImportModal from "./KfhTradeImportModal";

interface Props {
  portfolio?: string;
  onImportComplete?: () => void;
}

export default function KfhTradeImportButton({ portfolio = "KFH", onImportComplete }: Props) {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const [preview, setPreview] = useState<KfhImportPreview | null>(null);
  const [previewVisible, setPreviewVisible] = useState(false);
  const [helpVisible, setHelpVisible] = useState(false);
  const [picking, setPicking] = useState(false);
  const pendingCashRef = useRef<number | null>(null);

  const showError = useCallback((msg: string) => {
    if (Platform.OS === "web") {
      window.alert(msg);
    } else {
      Alert.alert(t("kfhImport.importError"), msg);
    }
  }, []);

  const handlePick = useCallback(async () => {
    if (picking) return;
    setPicking(true);
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
          "application/octet-stream",
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];
      const fileName = asset.name ?? "statement.xlsx";

      let arrayBuffer: ArrayBuffer;

      if (Platform.OS === "web") {
        // On web, fetch the blob URI
        const response = await fetch(asset.uri);
        arrayBuffer = await response.arrayBuffer();
      } else {
        // On native, read from file system
        const FS = await import("expo-file-system");
        const base64 = await FS.readAsStringAsync(asset.uri, {
          encoding: "base64" as const,
        });
        const binary = atob(base64);
        const bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) {
          bytes[i] = binary.charCodeAt(i);
        }
        arrayBuffer = bytes.buffer as ArrayBuffer;
      }

      const { parseAndPreview } = await import("@/lib/kfh/kfhTradeImportService");
      const { preview: p, error } = await parseAndPreview(arrayBuffer, fileName);

      if (error) {
        showError(error);
        return;
      }

      if (p) {
        setPreview(p);
        setPreviewVisible(true);
      }
    } catch (err: unknown) {
      showError(extractErrorMessage(err, "Failed to read file"));
    } finally {
      setPicking(false);
    }
  }, [picking, showError]);

  const handleImport = useCallback(
    async (p: KfhImportPreview): Promise<KfhImportResult> => {
      const { executeImport } = await import("@/lib/kfh/kfhTradeImportService");
      const result = await executeImport(p.readyRows, portfolio);
      if (result.imported > 0) {
        // Save cash position if user entered one
        if (pendingCashRef.current != null) {
          try {
            await setCashOverride(portfolio, pendingCashRef.current, "KWD");
          } catch {
            // non-critical — don't block the import result
          }
          pendingCashRef.current = null;
        }
      }
      // Auto-close preview and trigger reconciliation immediately
      console.log("[KfhImport] Import done, auto-closing preview and triggering reconciliation");
      setPreviewVisible(false);
      setPreview(null);
      onImportComplete?.();
      return result;
    },
    [portfolio, onImportComplete]
  );

  const handleClosePreview = useCallback(() => {
    setPreviewVisible(false);
    setPreview(null);
  }, []);

  return (
    <>
      <View style={s.row}>
        <Pressable
          onPress={() => setHelpVisible(true)}
          disabled={picking}
          style={({ pressed }) => [
            s.btn,
            {
              borderColor: colors.accentPrimary,
              backgroundColor: colors.accentPrimary + "10",
              opacity: pressed || picking ? 0.6 : 1,
            },
          ]}
        >
          <FontAwesome name="upload" size={13} color={colors.accentPrimary} />
          <Text style={[s.btnText, { color: colors.accentPrimary }]}>
            {picking ? t("kfhImport.reading") : t("kfhImport.importKfhStatement")}
          </Text>
        </Pressable>
      </View>

      <KfhTradeImportModal
        visible={previewVisible}
        preview={preview}
        onClose={handleClosePreview}
        onImport={handleImport}
      />

      <KfhTradeHelpModal
        visible={helpVisible}
        onClose={() => setHelpVisible(false)}
        onUpload={(cashBalance) => {
          pendingCashRef.current = cashBalance;
          setHelpVisible(false);
          handlePick();
        }}
      />
    </>
  );
}

const s = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
  },
  btnText: {
    fontSize: 12,
    fontWeight: "600",
  },
});
