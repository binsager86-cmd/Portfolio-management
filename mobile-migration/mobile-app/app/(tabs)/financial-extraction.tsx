/**
 * Financial Extraction — single-step AI extraction screen.
 *
 * Flow:
 *   1. User selects a stock and picks a PDF
 *   2. AI reads PDF, spatially maps data, self-audits
 *   3. Results displayed with audit trail and confidence score
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation } from "@tanstack/react-query";
import * as DocumentPicker from "expo-document-picker";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
    Animated,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View
} from "react-native";

import { useAnalysisStocks } from "@/hooks/queries/useAnalysisQueries";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useResponsive } from "@/hooks/useResponsive";
import { runExtraction } from "@/services/api/extraction";
import type {
    AIUploadResult,
    AnalysisStock,
} from "@/services/api/types";
import { useThemeStore } from "@/services/themeStore";

// ── Main Screen ─────────────────────────────────────────────────────

export default function FinancialExtractionScreen() {
  const { colors } = useThemeStore();
  const { spacing, fonts, maxContentWidth } = useResponsive();

  // ── Stock selection ─────────────────────────────────────────────
  const [stockSearch, setStockSearch] = useState("");
  const debouncedSearch = useDebouncedValue(stockSearch, 300);
  const { data: stocksData } = useAnalysisStocks(debouncedSearch);
  const stocks = useMemo(() => stocksData?.stocks ?? [], [stocksData]);
  const [selectedStock, setSelectedStock] = useState<AnalysisStock | null>(null);
  const [showStockList, setShowStockList] = useState(false);

  // ── File & extraction state ─────────────────────────────────────
  const [selectedFile, setSelectedFile] = useState<{
    uri: string; name: string; mimeType: string;
  } | null>(null);
  const [extractionResult, setExtractionResult] = useState<AIUploadResult | null>(null);
  const [elapsedMs, setElapsedMs] = useState<number | null>(null);
  const [isDone, setIsDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [liveElapsed, setLiveElapsed] = useState(0);
  const pipelineStart = useRef(0);

  const pulseAnim = useRef(new Animated.Value(1)).current;

  const startPulse = useCallback(() => {
    Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 800, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 800, useNativeDriver: true }),
      ])
    ).start();
  }, [pulseAnim]);

  const stopPulse = useCallback(() => {
    pulseAnim.stopAnimation();
    pulseAnim.setValue(1);
  }, [pulseAnim]);

  // ── File Picker ─────────────────────────────────────────────────
  const pickDocument = useCallback(async () => {
    const docResult = await DocumentPicker.getDocumentAsync({
      type: "application/pdf",
      copyToCacheDirectory: true,
    });
    if (docResult.canceled || !docResult.assets?.length) return;
    const asset = docResult.assets[0];
    setSelectedFile({
      uri: asset.uri,
      name: asset.name,
      mimeType: asset.mimeType ?? "application/pdf",
    });
    setExtractionResult(null);
    setElapsedMs(null);
    setIsDone(false);
    setError(null);
  }, []);

  // ── Extraction Mutation ─────────────────────────────────────────
  const extractionMutation = useMutation({
    mutationFn: async () => {
      if (!selectedFile) throw new Error("No file selected");
      if (!selectedStock) throw new Error("No stock selected");

      startPulse();
      setError(null);
      setIsDone(false);
      pipelineStart.current = Date.now();
      setLiveElapsed(0);

      const { result, elapsedMs: ms } = await runExtraction(
        selectedStock.id,
        selectedFile.uri,
        selectedFile.name,
        selectedFile.mimeType,
      );

      return { result, ms };
    },
    onSuccess: ({ result, ms }) => {
      stopPulse();
      setExtractionResult(result);
      setElapsedMs(ms);
      setIsDone(true);
    },
    onError: (err: Error) => {
      stopPulse();
      setError(err.message || "Extraction failed");
    },
  });

  const isProcessing = extractionMutation.isPending;

  // ── Live elapsed timer ──────────────────────────────────────────
  useEffect(() => {
    if (!isProcessing) return;
    const id = setInterval(() => {
      setLiveElapsed(Math.floor((Date.now() - pipelineStart.current) / 1000));
    }, 500);
    return () => clearInterval(id);
  }, [isProcessing]);

  const canRun = selectedFile && selectedStock && !isProcessing;

  // ── Format helpers ──────────────────────────────────────────────
  const fmt = (n: number) =>
    n.toLocaleString(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 0 });

  const pct = (n: number) => `${Math.round(n * 100)}%`;

  // ── Render ──────────────────────────────────────────────────────
  return (
    <ScrollView
      style={[styles.root, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={[
        styles.container,
        {
          paddingHorizontal: spacing.pagePx,
          paddingTop: spacing.sectionGap,
          paddingBottom: 40,
          maxWidth: maxContentWidth,
          alignSelf: "center",
          width: "100%",
        },
      ]}
    >
      {/* ── Title ── */}
      <Text style={[styles.title, { color: colors.textPrimary, fontSize: fonts.title }]}>
        Financial Extraction
      </Text>
      <Text style={[styles.subtitle, { color: colors.textSecondary, fontSize: fonts.body }]}>
        AI-powered financial statement extraction with self-audit
      </Text>

      {/* ── Stock Selector ── */}
      <View style={[styles.card, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontSize: fonts.body }]}>
          1. Select Stock
        </Text>
        {selectedStock ? (
          <View style={styles.selectedStockRow}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.stockSymbol, { color: colors.accentPrimary, fontSize: fonts.body }]}>
                {selectedStock.symbol}
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: fonts.caption }}>
                {selectedStock.company_name} · {selectedStock.exchange}
              </Text>
            </View>
            <Pressable
              onPress={() => { setSelectedStock(null); setShowStockList(true); }}
              disabled={isProcessing}
            >
              <FontAwesome name="pencil" size={16} color={colors.textMuted} />
            </Pressable>
          </View>
        ) : (
          <>
            <TextInput
              style={[
                styles.searchInput,
                {
                  color: colors.textPrimary,
                  backgroundColor: colors.bgPrimary,
                  borderColor: colors.borderColor,
                  fontSize: fonts.body,
                },
              ]}
              placeholder="Search stocks…"
              placeholderTextColor={colors.textMuted}
              value={stockSearch}
              onChangeText={(t) => { setStockSearch(t); setShowStockList(true); }}
              onFocus={() => setShowStockList(true)}
              editable={!isProcessing}
            />
            {showStockList && stocks.length > 0 && (
              <View style={[styles.stockList, { borderColor: colors.borderColor }]}>
                {stocks.slice(0, 8).map((s) => (
                  <Pressable
                    key={s.id}
                    style={({ pressed }) => [
                      styles.stockRow,
                      { backgroundColor: pressed ? colors.accentPrimary + "11" : "transparent" },
                    ]}
                    onPress={() => {
                      setSelectedStock(s);
                      setShowStockList(false);
                      setStockSearch("");
                    }}
                  >
                    <Text style={[styles.stockSymbol, { color: colors.accentPrimary, fontSize: fonts.caption }]}>
                      {s.symbol}
                    </Text>
                    <Text
                      style={{ color: colors.textSecondary, fontSize: fonts.caption, flex: 1, marginLeft: 8 }}
                      numberOfLines={1}
                    >
                      {s.company_name}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: fonts.caption }}>{s.exchange}</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </>
        )}
      </View>

      {/* ── File Picker ── */}
      <View style={[styles.card, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
        <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontSize: fonts.body }]}>
          2. Select PDF
        </Text>
        <Pressable
          onPress={pickDocument}
          disabled={isProcessing}
          style={({ pressed }) => [
            styles.pickBtn,
            {
              backgroundColor: pressed ? colors.accentPrimary + "22" : "transparent",
              borderColor: colors.accentPrimary,
              opacity: isProcessing ? 0.5 : 1,
            },
          ]}
        >
          <FontAwesome name="file-pdf-o" size={24} color={colors.accentPrimary} />
          <Text style={[styles.pickLabel, { color: colors.textPrimary, fontSize: fonts.body }]}>
            {selectedFile ? selectedFile.name : "Select PDF Document"}
          </Text>
        </Pressable>

        {canRun && (
          <Pressable
            onPress={() => extractionMutation.mutate()}
            style={({ pressed }) => [
              styles.runBtn,
              { backgroundColor: pressed ? colors.accentPrimary + "DD" : colors.accentPrimary },
            ]}
          >
            <FontAwesome name="bolt" size={16} color="#fff" />
            <Text style={styles.runLabel}>Extract Financial Data</Text>
          </Pressable>
        )}
      </View>

      {/* ── Processing Indicator ── */}
      {isProcessing && (
        <View style={[styles.card, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
          <View style={styles.summaryRow}>
            <Animated.View
              style={[
                styles.stageDot,
                { backgroundColor: colors.accentPrimary, opacity: pulseAnim },
              ]}
            >
              <FontAwesome name="search" size={10} color="#fff" />
            </Animated.View>
            <View style={{ marginLeft: 10, flex: 1 }}>
              <Text style={{ color: colors.accentPrimary, fontSize: fonts.body, fontWeight: "700" }}>
                Extracting…
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: fonts.caption }}>
                AI is reading the PDF and mapping financial data · {liveElapsed}s
              </Text>
            </View>
          </View>
        </View>
      )}

      {/* ── Error ── */}
      {error && (
        <View style={[styles.card, styles.errorCard, { borderColor: "#ef4444" }]}>
          <FontAwesome name="exclamation-triangle" size={18} color="#ef4444" />
          <Text style={[styles.errorText, { fontSize: fonts.body }]}>{error}</Text>
        </View>
      )}

      {/* ── Results ── */}
      {isDone && extractionResult && (
        <ExtractionResultCard
          result={extractionResult}
          elapsedMs={elapsedMs}
          colors={colors}
          fonts={fonts}
          fmt={fmt}
          pct={pct}
        />
      )}
    </ScrollView>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function ExtractionResultCard({
  result,
  elapsedMs,
  colors,
  fonts,
  fmt,
  pct,
}: {
  result: AIUploadResult;
  elapsedMs: number | null;
  colors: any;
  fonts: any;
  fmt: (n: number) => string;
  pct: (n: number) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const elapsedLabel = elapsedMs != null ? `${(elapsedMs / 1000).toFixed(1)}s` : "";

  return (
    <View style={[styles.card, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
      <Pressable onPress={() => setExpanded(!expanded)} style={styles.sectionHeader}>
        <View style={{ flex: 1 }}>
          <View style={styles.summaryRow}>
            <FontAwesome
              name={result.audit.checks_failed === 0 ? "check-circle" : "warning"}
              size={18}
              color={result.audit.checks_failed === 0 ? "#22c55e" : "#f59e0b"}
            />
            <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontSize: fonts.body, marginLeft: 8 }]}>
              Extraction Result
              {elapsedLabel ? (
                <Text style={{ fontWeight: "400", color: colors.textMuted, fontSize: fonts.caption }}>
                  {"  "}{elapsedLabel}
                </Text>
              ) : null}
            </Text>
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: fonts.caption, marginTop: 4 }}>
            {result.message}
          </Text>
        </View>
        <FontAwesome name={expanded ? "chevron-up" : "chevron-down"} size={14} color={colors.textMuted} />
      </Pressable>

      {/* Summary metrics */}
      <View style={styles.metricsRow}>
        <MiniMetric label="Confidence" value={pct(result.confidence)} colors={colors} fonts={fonts} />
        <MiniMetric label="Pages" value={String(result.pages_processed)} colors={colors} fonts={fonts} />
        <MiniMetric label="Checks" value={`${result.audit.checks_passed}/${result.audit.checks_total}`} colors={colors} fonts={fonts} />
        <MiniMetric label="Model" value={result.model} colors={colors} fonts={fonts} />
      </View>

      {expanded && (
        <>
          {/* Statements */}
          <View style={{ marginTop: 12, gap: 6 }}>
            <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontSize: fonts.caption }]}>
              Extracted Statements
            </Text>
            {result.statements.map((s, i) => (
              <View key={i} style={[styles.stmtRow, { borderColor: colors.borderColor }]}>
                <Text style={{ color: colors.accentPrimary, fontSize: fonts.caption, fontWeight: "600" }}>
                  {s.statement_type}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: fonts.caption }}>
                  {s.period_end_date} · FY{s.fiscal_year} · {s.line_items_count} items · {s.currency}
                </Text>
              </View>
            ))}
          </View>

          {/* Audit details */}
          {result.audit.details.length > 0 && (
            <View style={{ marginTop: 12, gap: 4 }}>
              <Text style={[styles.sectionTitle, { color: colors.textPrimary, fontSize: fonts.caption }]}>
                Audit Checks
              </Text>
              {result.audit.details.map((d, i) => (
                <View key={i} style={[styles.auditRow, { borderColor: colors.borderColor }]}>
                  <FontAwesome
                    name={d.passed ? "check" : "times"}
                    size={12}
                    color={d.passed ? "#22c55e" : "#ef4444"}
                  />
                  <Text style={{ color: colors.textSecondary, fontSize: fonts.caption - 1, flex: 1, marginLeft: 6 }}>
                    {d.statement_type} · {d.period} · {d.rule}
                  </Text>
                  <Text style={{ color: d.passed ? colors.textMuted : "#ef4444", fontSize: fonts.caption - 1 }}>
                    {d.passed ? "OK" : `Exp: ${fmt(d.expected)} / Act: ${fmt(d.actual)}`}
                  </Text>
                </View>
              ))}
            </View>
          )}
        </>
      )}
    </View>
  );
}

function MiniMetric({
  label,
  value,
  colors,
  fonts,
}: {
  label: string;
  value: string;
  colors: any;
  fonts: any;
}) {
  return (
    <View style={styles.miniMetric}>
      <Text style={[styles.miniLabel, { color: colors.textMuted, fontSize: fonts.caption }]}>
        {label}
      </Text>
      <Text style={[styles.miniValue, { color: colors.textPrimary, fontSize: fonts.body }]}>
        {value}
      </Text>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  root: { flex: 1 },
  container: { gap: 16 },
  title: { fontWeight: "800" },
  subtitle: { marginTop: -8 },
  card: {
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
  },
  sectionHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    minHeight: 44,
  },
  sectionTitle: { fontWeight: "700" },
  searchInput: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginTop: 8,
  },
  stockList: {
    borderWidth: 1,
    borderTopWidth: 0,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    maxHeight: 240,
    overflow: "hidden",
  },
  stockRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  selectedStockRow: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 8,
    gap: 8,
  },
  stockSymbol: { fontWeight: "700" },
  pickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1.5,
    borderStyle: "dashed",
    borderRadius: 10,
    padding: 16,
    minHeight: 56,
    marginTop: 8,
  },
  pickLabel: { flex: 1 },
  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderRadius: 10,
    paddingVertical: 12,
    paddingHorizontal: 20,
    marginTop: 12,
    minHeight: 48,
  },
  runLabel: { color: "#fff", fontWeight: "700", fontSize: 15 },
  stagesContainer: { marginTop: 12, gap: 14 },
  stageRow: { flexDirection: "row", alignItems: "center" },
  stageDot: {
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: "center",
    justifyContent: "center",
  },
  errorCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: "#ef444410",
  },
  errorText: { color: "#ef4444", flex: 1 },
  summaryRow: { flexDirection: "row", alignItems: "center" },
  metricsRow: { flexDirection: "row", flexWrap: "wrap", gap: 16, marginTop: 12 },
  miniMetric: { minWidth: 70 },
  miniLabel: { fontWeight: "500" },
  miniValue: { fontWeight: "700", marginTop: 2 },
  stmtRow: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: 6, gap: 2 },
  auditRow: {
    flexDirection: "row",
    alignItems: "center",
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 4,
    paddingBottom: 4,
  },
});
