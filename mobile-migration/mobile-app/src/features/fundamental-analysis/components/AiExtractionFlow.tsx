/**
 * AiExtractionFlow — Upload section with PDF upload, Excel import,
 * online fetch, AI model selector, processing progress, extraction
 * results, audit details, and AI attribution prompt.
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
import type { StatementManagerState } from "../hooks/useStatementManager";
import { st } from "../styles";
import { STMNT_META } from "../types";
import { ExtractionResultCard } from "./ExtractionResultCard";

// ── Props ───────────────────────────────────────────────────────────

interface AiExtractionFlowProps {
  mgr: StatementManagerState;
  colors: ThemePalette;
}

// ── Component ───────────────────────────────────────────────────────

export function AiExtractionFlow({ mgr, colors }: AiExtractionFlowProps) {
  const {
    uploading, processingSteps, uploadResult, uploadError, allDone,
    handlePickAndUpload, dismissSteps, dismissError, dismissResult,
    importing, importResult, setImportResult, handleImportExcel,
    fetchingOnline, onlineResult, setOnlineResult, handleFetchOnline,
    selectedModel, setSelectedModel,
    attributing, attributionDismissed, setAttributionDismissed,
    attributionResult, setAttributionResult, handleAttribution,
    typeFilter,
  } = mgr;

  return (
    <View style={{
      paddingHorizontal: 16, paddingVertical: 14,
      borderBottomWidth: 1, borderBottomColor: colors.borderColor,
      backgroundColor: colors.bgCard,
    }}>
      {/* ── PDF Upload Button ──────────────────────────────────── */}
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

      {/* ── Import Excel Button ──────────────────────────────────── */}
      <Pressable
        onPress={handleImportExcel}
        disabled={importing || uploading}
        style={({ pressed }) => [
          {
            flexDirection: "row", alignItems: "center", justifyContent: "center",
            paddingVertical: 10, paddingHorizontal: 16, marginTop: 10,
            borderRadius: 10, borderWidth: 1.5,
            borderColor: importing ? colors.textMuted : colors.success,
            backgroundColor: importing ? colors.bgInput : colors.success + "08",
            gap: 8,
          },
          pressed && !importing && { backgroundColor: colors.success + "15", transform: [{ scale: 0.98 }] },
        ]}
      >
        {importing ? (
          <ActivityIndicator size="small" color={colors.success} />
        ) : (
          <FontAwesome name="file-excel-o" size={16} color={colors.success} />
        )}
        <Text style={{ color: importing ? colors.textMuted : colors.textPrimary, fontSize: 13, fontWeight: "600" }}>
          {importing ? "Importing..." : "Import from Excel (.xlsx)"}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 10 }}>
          into {STMNT_META[typeFilter ?? "income"]?.label ?? "Income"}
        </Text>
      </Pressable>

      {/* Import result banner */}
      {importResult && (
        <ResultBanner
          text={importResult}
          isError={importResult.startsWith("Error")}
          colors={colors}
          onDismiss={() => setImportResult(null)}
        />
      )}

      {/* ── Get Statements Online ────────────────────────────────── */}
      <Pressable
        onPress={handleFetchOnline}
        disabled={fetchingOnline || uploading}
        style={({ pressed }) => [
          {
            flexDirection: "row", alignItems: "center", justifyContent: "center",
            paddingVertical: 10, paddingHorizontal: 16, marginTop: 10,
            borderRadius: 10, borderWidth: 1.5,
            borderColor: fetchingOnline ? colors.textMuted : colors.accentPrimary,
            backgroundColor: fetchingOnline ? colors.bgInput : colors.accentPrimary + "08",
            gap: 8,
          },
          pressed && !fetchingOnline && { backgroundColor: colors.accentPrimary + "15", transform: [{ scale: 0.98 }] },
        ]}
      >
        {fetchingOnline ? (
          <ActivityIndicator size="small" color={colors.accentPrimary} />
        ) : (
          <FontAwesome name="globe" size={16} color={colors.accentPrimary} />
        )}
        <Text style={{ color: fetchingOnline ? colors.textMuted : colors.textPrimary, fontSize: 13, fontWeight: "600" }}>
          {fetchingOnline ? "Fetching..." : "Get Statements"}
        </Text>
        <Text style={{ color: colors.textMuted, fontSize: 10 }}>
          from stockanalysis.com
        </Text>
      </Pressable>

      {/* Online fetch result banner */}
      {onlineResult && (
        <ResultBanner
          text={onlineResult}
          isError={onlineResult.startsWith("Error")}
          colors={colors}
          onDismiss={() => setOnlineResult(null)}
        />
      )}

      {/* ── Model selector ───────────────────────────────────────── */}
      <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, gap: 8 }}>
        <Text style={{ fontSize: 11, color: colors.textMuted, fontWeight: "600" }}>AI Model:</Text>
        {(["gemini-2.5-flash", "gemini-2.5-pro", "gemini-2.5-pro-preview-03-25"] as const).map((m) => {
          const label = m === "gemini-2.5-flash" ? "2.5 Flash" : m === "gemini-2.5-pro" ? "2.5 Pro" : "3.1 Pro";
          return (
            <Pressable
              key={m}
              onPress={() => setSelectedModel(m)}
              disabled={uploading}
              style={({ pressed }) => ({
                paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                borderWidth: 1,
                borderColor: selectedModel === m ? colors.accentPrimary : colors.borderColor,
                backgroundColor: selectedModel === m ? colors.accentPrimary + "18" : "transparent",
                opacity: uploading ? 0.5 : pressed ? 0.8 : 1,
              })}
            >
              <Text style={{
                fontSize: 11, fontWeight: selectedModel === m ? "700" : "500",
                color: selectedModel === m ? colors.accentPrimary : colors.textSecondary,
              }}>
                {label}
              </Text>
            </Pressable>
          );
        })}
        {selectedModel !== "gemini-2.5-flash" && (
          <Text style={{ fontSize: 9, color: colors.warning, fontWeight: "600" }}>Better accuracy, slower</Text>
        )}
      </View>

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

      {/* ── Extraction result summary ────────────────────────────── */}
      {uploadResult && !uploading && (
        <ExtractionResultCard
          uploadResult={uploadResult}
          colors={colors}
          dismissResult={dismissResult}
          attributing={attributing}
          attributionDismissed={attributionDismissed}
          setAttributionDismissed={setAttributionDismissed}
          attributionResult={attributionResult}
          setAttributionResult={setAttributionResult}
          handleAttribution={handleAttribution}
        />
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
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function ResultBanner({ text, isError, colors, onDismiss }: { text: string; isError: boolean; colors: ThemePalette; onDismiss: () => void }) {
  return (
    <View style={{
      flexDirection: "row", alignItems: "center", marginTop: 8,
      paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8,
      backgroundColor: isError ? colors.danger + "15" : colors.success + "15",
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
      <Pressable onPress={onDismiss} hitSlop={8}>
        <FontAwesome name="times" size={12} color={colors.textMuted} />
      </Pressable>
    </View>
  );
}
