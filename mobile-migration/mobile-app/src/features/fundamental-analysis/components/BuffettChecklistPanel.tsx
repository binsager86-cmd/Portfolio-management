/**
 * Buffett Checklist Panel — Sub-tab under Fundamental Analysis.
 *
 * Sections rendered in order:
 * A. Header / Summary
 * B. Top Controls (scale, sector, buttons)
 * C. Final Score Cards
 * D. Qualitative Checklist
 * E. Auto-Scored Quantitative Metrics
 * F. Hard Cap / Penalty Rules
 * G. Section Breakdown
 * H. Strengths / Blockers Summary
 * I. Assumptions / Missing Data
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from "react-native";

import type { ThemePalette } from "@/constants/theme";
import { useStatements, useStockMetrics, useValuations } from "@/hooks/queries/useAnalysisQueries";
import { useAnalysisStocks } from "@/hooks/queries/useAnalysisQueries";

import { st } from "../styles";
import type { IconName, PanelWithSymbolProps } from "../types";
import { ActionButton, Card, Chip, FadeIn, SectionHeader } from "./shared";

import {
  calculateBuffettScore,
  createEmptyAssessment,
  DEFAULT_SCALE,
  deleteAssessment,
  detectSector,
  getScaleLabel,
  loadAssessment,
  QUALITATIVE_SECTIONS,
  QUANTITATIVE_SECTIONS,
  remapToScale,
  saveAssessment,
  SCALE_CONFIGS,
  SECTOR_OPTIONS,
  updateAssessmentScores,
} from "../buffett-checklist";
import type {
  BuffettAssessment,
  BuffettChecklistResult,
  BuffettSector,
  Confidence,
  ItemBreakdown,
  ScaleMode,
  SectionBreakdown,
  Verdict,
} from "../buffett-checklist";

// ── Verdict display helpers ───────────────────────────────────────

function verdictColor(verdict: Verdict, colors: ThemePalette): string {
  switch (verdict) {
    case "Very High Buffett Fit": return colors.success;
    case "Strong Buffett Fit": return "#22c55e";
    case "Partial Buffett Fit": return colors.warning ?? "#f59e0b";
    case "Low Buffett Fit": return "#f97316";
    case "Very Unlikely Buffett-Style Pick": return colors.danger;
  }
}

function confidenceColor(confidence: Confidence, colors: ThemePalette): string {
  switch (confidence) {
    case "High": return colors.success;
    case "Medium": return colors.warning ?? "#f59e0b";
    case "Low": return colors.danger;
  }
}

function scoreRingColor(score: number, colors: ThemePalette): string {
  if (score >= 90) return colors.success;
  if (score >= 75) return "#22c55e";
  if (score >= 60) return colors.warning ?? "#f59e0b";
  if (score >= 40) return "#f97316";
  return colors.danger;
}

// ── Main panel ────────────────────────────────────────────────────

export function BuffettChecklistPanel({ stockId, stockSymbol, colors, isDesktop }: PanelWithSymbolProps) {
  // ── Data hooks ──────────────────────────────────────────────────
  const statementsQ = useStatements(stockId);
  const metricsQ = useStockMetrics(stockId);
  const valuationsQ = useValuations(stockId);
  const stocksQ = useAnalysisStocks();

  const stock = useMemo(
    () => stocksQ.data?.stocks?.find((s) => s.id === stockId),
    [stocksQ.data, stockId],
  );

  // ── Local state ─────────────────────────────────────────────────
  const [assessment, setAssessment] = useState<BuffettAssessment | null>(null);
  const [scaleMode, setScaleMode] = useState<ScaleMode>(DEFAULT_SCALE);
  const [sector, setSector] = useState<BuffettSector>("non_financial");
  const [marketPrice, setMarketPrice] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [showSectorPicker, setShowSectorPicker] = useState(false);
  const hasLoadedRef = useRef(false);

  // ── Load assessment on mount ────────────────────────────────────
  useEffect(() => {
    if (hasLoadedRef.current) return;
    hasLoadedRef.current = true;

    (async () => {
      const saved = await loadAssessment(stockId);
      const detectedSector = detectSector(stock?.sector, stock?.industry);

      if (saved) {
        setAssessment(saved);
        setScaleMode(saved.selectedScaleMode);
        setSector(saved.sectorUsed);
      } else {
        const empty = createEmptyAssessment(stockId, detectedSector);
        setAssessment(empty);
        setSector(detectedSector);
      }
      setLoading(false);
    })();
  }, [stockId, stock?.sector, stock?.industry]);

  // ── Compute result ──────────────────────────────────────────────
  const result: BuffettChecklistResult | null = useMemo(() => {
    if (!assessment) return null;

    return calculateBuffettScore({
      qualitativeAnswers: assessment.qualitativeAnswers,
      statements: statementsQ.data?.statements ?? [],
      metrics: metricsQ.data?.metrics ?? [],
      valuations: valuationsQ.data?.valuations ?? [],
      sector,
      marketPrice: marketPrice ? parseFloat(marketPrice) : null,
    });
  }, [assessment, statementsQ.data, metricsQ.data, valuationsQ.data, sector, marketPrice]);

  // ── Handlers ────────────────────────────────────────────────────
  const handleScaleChange = useCallback((newScale: ScaleMode) => {
    setScaleMode(newScale);
    if (assessment) {
      // Remap existing answers to nearest option in new scale
      const remapped: Record<string, number> = {};
      for (const [key, val] of Object.entries(assessment.qualitativeAnswers)) {
        remapped[key] = remapToScale(val, newScale);
      }
      setAssessment({
        ...assessment,
        selectedScaleMode: newScale,
        qualitativeAnswers: remapped,
        updatedAt: Date.now(),
      });
    }
  }, [assessment]);

  const handleAnswer = useCallback((itemId: string, normalized: number) => {
    if (!assessment) return;
    setAssessment({
      ...assessment,
      qualitativeAnswers: { ...assessment.qualitativeAnswers, [itemId]: normalized },
      updatedAt: Date.now(),
    });
  }, [assessment]);

  const handleSave = useCallback(async () => {
    if (!assessment || !result) return;
    setSaving(true);
    const updated = updateAssessmentScores(
      { ...assessment, selectedScaleMode: scaleMode, sectorUsed: sector },
      result.rawScore,
      result.finalScore,
      result.activeCaps,
      result.dataCoveragePercent,
    );
    await saveAssessment(updated);
    setAssessment(updated);
    setSaving(false);
    if (Platform.OS === "web") {
      window.alert("Assessment saved.");
    } else {
      Alert.alert("Saved", "Buffett checklist assessment saved.");
    }
  }, [assessment, result, scaleMode, sector]);

  const handleReset = useCallback(() => {
    const doReset = async () => {
      await deleteAssessment(stockId);
      const detectedSector = detectSector(stock?.sector, stock?.industry);
      const empty = createEmptyAssessment(stockId, detectedSector);
      setAssessment(empty);
      setScaleMode(DEFAULT_SCALE);
      setSector(detectedSector);
      setMarketPrice("");
    };

    if (Platform.OS === "web") {
      if (window.confirm("Reset all checklist answers for this stock?")) doReset();
    } else {
      Alert.alert("Reset Checklist", "Reset all checklist answers for this stock?", [
        { text: "Cancel", style: "cancel" },
        { text: "Reset", style: "destructive", onPress: doReset },
      ]);
    }
  }, [stockId, stock?.sector, stock?.industry]);

  // ── Loading state ───────────────────────────────────────────────
  const isDataLoading = statementsQ.isLoading || metricsQ.isLoading || valuationsQ.isLoading;

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: "center", alignItems: "center", padding: 40 }}>
        <ActivityIndicator size="large" color={colors.accentPrimary} />
      </View>
    );
  }

  if (!assessment || !result) return null;

  // ── Render ──────────────────────────────────────────────────────
  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bgPrimary }}
      contentContainerStyle={{ padding: 12, paddingBottom: 80 }}
      keyboardShouldPersistTaps="handled"
    >
      {/* A. Header / Summary */}
      <FadeIn>
        <Card colors={colors} style={{ marginBottom: 14 }}>
          <View style={[st.rowCenter, { gap: 8, marginBottom: 6 }]}>
            <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: "#f59e0b18", justifyContent: "center", alignItems: "center" }}>
              <FontAwesome name="check-square-o" size={14} color="#f59e0b" />
            </View>
            <Text style={{ fontSize: 16, fontWeight: "800", color: colors.textPrimary, flex: 1 }}>
              Buffett Compatibility Score
            </Text>
          </View>
          <Text style={{ fontSize: 11, color: colors.textMuted, lineHeight: 16 }}>
            Buffett-inspired checklist based on business quality, predictability, capital allocation,
            balance sheet strength, and valuation. It is a compatibility model, not a prediction of
            Buffett's actual purchase decision.
          </Text>
        </Card>
      </FadeIn>

      {/* B. Top Controls */}
      <FadeIn delay={50}>
        <TopControls
          colors={colors}
          scaleMode={scaleMode}
          onScaleChange={handleScaleChange}
          sector={sector}
          onSectorChange={setSector}
          showSectorPicker={showSectorPicker}
          onToggleSectorPicker={() => setShowSectorPicker((v) => !v)}
          detectedSector={detectSector(stock?.sector, stock?.industry)}
          stockSectorLabel={stock?.sector ?? null}
          marketPrice={marketPrice}
          onMarketPriceChange={setMarketPrice}
          saving={saving}
          onSave={handleSave}
          onReset={handleReset}
        />
      </FadeIn>

      {isDataLoading && (
        <View style={{ padding: 20, alignItems: "center" }}>
          <ActivityIndicator size="small" color={colors.accentPrimary} />
          <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6 }}>Loading financial data...</Text>
        </View>
      )}

      {/* C. Final Score Cards */}
      <FadeIn delay={100}>
        <ScoreCards colors={colors} result={result} isDesktop={isDesktop} />
      </FadeIn>

      {/* D. Qualitative Checklist */}
      <FadeIn delay={150}>
        <QualitativeSection
          colors={colors}
          scaleMode={scaleMode}
          answers={assessment.qualitativeAnswers}
          onAnswer={handleAnswer}
        />
      </FadeIn>

      {/* E. Auto-Scored Quantitative Metrics */}
      <FadeIn delay={200}>
        <QuantitativeSection colors={colors} items={result.itemBreakdown.filter((b) => b.type === "quantitative")} />
      </FadeIn>

      {/* F. Hard Cap / Penalty Rules */}
      {result.activeCaps.length > 0 && (
        <FadeIn delay={250}>
          <HardCapsSection colors={colors} caps={result.activeCaps} rawScore={result.rawScore} finalScore={result.finalScore} />
        </FadeIn>
      )}

      {/* G. Section Breakdown */}
      <FadeIn delay={300}>
        <BreakdownSection colors={colors} breakdown={result.sectionBreakdown} />
      </FadeIn>

      {/* H. Strengths / Blockers */}
      <FadeIn delay={350}>
        <StrengthsBlockersSection colors={colors} strengths={result.strengths} blockers={result.blockers} />
      </FadeIn>

      {/* I. Assumptions / Missing Data */}
      {(result.assumptions.length > 0 || result.missingData.length > 0) && (
        <FadeIn delay={400}>
          <AssumptionsSection colors={colors} assumptions={result.assumptions} missingData={result.missingData} />
        </FadeIn>
      )}
    </ScrollView>
  );
}

// ═══════════════════════════════════════════════════════════════════
// Sub-components
// ═══════════════════════════════════════════════════════════════════

// ── B. Top Controls ───────────────────────────────────────────────

function TopControls({
  colors, scaleMode, onScaleChange, sector, onSectorChange,
  showSectorPicker, onToggleSectorPicker, detectedSector, stockSectorLabel,
  marketPrice, onMarketPriceChange, saving, onSave, onReset,
}: {
  colors: ThemePalette;
  scaleMode: ScaleMode;
  onScaleChange: (s: ScaleMode) => void;
  sector: BuffettSector;
  onSectorChange: (s: BuffettSector) => void;
  showSectorPicker: boolean;
  onToggleSectorPicker: () => void;
  detectedSector: BuffettSector;
  stockSectorLabel: string | null;
  marketPrice: string;
  onMarketPriceChange: (v: string) => void;
  saving: boolean;
  onSave: () => void;
  onReset: () => void;
}) {
  const scales: ScaleMode[] = ["binary", "three_point", "five_point"];

  return (
    <Card colors={colors} style={{ marginBottom: 14 }}>
      {/* Scale selector */}
      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.textMuted, letterSpacing: 0.5, marginBottom: 6 }}>
        ANSWER SCALE
      </Text>
      <View style={{ flexDirection: "row", gap: 6, marginBottom: 14 }}>
        {scales.map((s) => (
          <Chip
            key={s}
            label={SCALE_CONFIGS[s].label}
            active={scaleMode === s}
            onPress={() => onScaleChange(s)}
            colors={colors}
          />
        ))}
      </View>

      {/* Sector display */}
      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.textMuted, letterSpacing: 0.5, marginBottom: 6 }}>
        SECTOR {stockSectorLabel ? `(${stockSectorLabel})` : ""}
      </Text>
      <Pressable
        onPress={onToggleSectorPicker}
        style={{
          flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 9,
          borderRadius: 10, borderWidth: 1, borderColor: colors.borderColor, backgroundColor: colors.bgInput,
          marginBottom: showSectorPicker ? 6 : 14,
        }}
      >
        <Text style={{ flex: 1, fontSize: 13, color: colors.textPrimary }}>
          {SECTOR_OPTIONS.find((o) => o.key === sector)?.label ?? sector}
        </Text>
        <FontAwesome name={showSectorPicker ? "chevron-up" : "chevron-down"} size={10} color={colors.textMuted} />
      </Pressable>
      {showSectorPicker && (
        <View style={{ marginBottom: 14, borderRadius: 8, borderWidth: 1, borderColor: colors.borderColor, overflow: "hidden" }}>
          {SECTOR_OPTIONS.map((opt) => (
            <Pressable
              key={opt.key}
              onPress={() => { onSectorChange(opt.key); onToggleSectorPicker(); }}
              style={({ pressed }) => ({
                paddingHorizontal: 14, paddingVertical: 10,
                backgroundColor: sector === opt.key ? colors.accentPrimary + "15" : pressed ? colors.bgCard : "transparent",
              })}
            >
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <Text style={{
                  fontSize: 13, color: sector === opt.key ? colors.accentPrimary : colors.textPrimary,
                  fontWeight: sector === opt.key ? "700" : "500", flex: 1,
                }}>
                  {opt.label}
                </Text>
                {opt.key === detectedSector && (
                  <Text style={{ fontSize: 10, color: colors.textMuted }}>auto-detected</Text>
                )}
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {/* Market price */}
      <Text style={{ fontSize: 11, fontWeight: "600", color: colors.textMuted, letterSpacing: 0.5, marginBottom: 4 }}>
        CURRENT MARKET PRICE
      </Text>
      <TextInput
        placeholder="Enter current share price..."
        placeholderTextColor={colors.textMuted + "80"}
        value={marketPrice}
        onChangeText={onMarketPriceChange}
        keyboardType="numeric"
        style={[st.input, { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput, marginBottom: 14 }]}
      />

      {/* Buttons */}
      <View style={{ flexDirection: "row", gap: 8 }}>
        <ActionButton label="Save" icon="save" onPress={onSave} colors={colors} variant="primary" loading={saving} flex={1} />
        <ActionButton label="Reset" icon="refresh" onPress={onReset} colors={colors} variant="danger" flex={1} />
      </View>
    </Card>
  );
}

// ── C. Score Cards ────────────────────────────────────────────────

function ScoreCards({ colors, result, isDesktop }: { colors: ThemePalette; result: BuffettChecklistResult; isDesktop: boolean }) {
  const ringColor = scoreRingColor(result.finalScore, colors);
  const vColor = verdictColor(result.verdict, colors);
  const cColor = confidenceColor(result.confidence, colors);
  const hasCap = result.activeCaps.length > 0;
  const strongestCap = hasCap ? result.activeCaps.reduce((a, b) => a.capValue < b.capValue ? a : b) : null;

  return (
    <Card colors={colors} style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: isDesktop ? "row" : "column", gap: 16, alignItems: isDesktop ? "center" : "stretch" }}>
        {/* Score ring */}
        <View style={{ alignItems: "center" }}>
          <View style={[st.scoreRing, { borderColor: ringColor + "30", backgroundColor: ringColor + "08" }]}>
            <View style={[st.scoreRingInner, { backgroundColor: colors.bgCard }]}>
              <Text style={[st.scoreNum, { color: ringColor }]}>{result.finalScore}</Text>
              <Text style={{ fontSize: 10, color: colors.textMuted, fontWeight: "600" }}>/ 100</Text>
            </View>
          </View>
          {hasCap && (
            <View style={{
              flexDirection: "row", alignItems: "center", marginTop: 6, paddingHorizontal: 8, paddingVertical: 3,
              backgroundColor: colors.danger + "15", borderRadius: 6,
            }}>
              <FontAwesome name="lock" size={9} color={colors.danger} style={{ marginRight: 4 }} />
              <Text style={{ fontSize: 9, color: colors.danger, fontWeight: "700" }}>CAPPED</Text>
            </View>
          )}
        </View>

        {/* Info cards */}
        <View style={{ flex: 1, gap: 8 }}>
          {/* Verdict */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: vColor }} />
            <Text style={{ fontSize: 14, fontWeight: "700", color: vColor }}>{result.verdict}</Text>
          </View>

          {/* Confidence */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <FontAwesome name="signal" size={11} color={cColor} />
            <Text style={{ fontSize: 12, color: colors.textSecondary }}>
              Confidence: <Text style={{ fontWeight: "700", color: cColor }}>{result.confidence}</Text>
              <Text style={{ color: colors.textMuted }}> ({result.dataCoveragePercent}% data coverage)</Text>
            </Text>
          </View>

          {/* Raw score vs final */}
          {hasCap && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <FontAwesome name="info-circle" size={11} color={colors.textMuted} />
              <Text style={{ fontSize: 11, color: colors.textMuted }}>
                Raw score: {result.rawScore} → Capped at {strongestCap!.capValue} ({strongestCap!.label})
              </Text>
            </View>
          )}

          {/* Hard cap */}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <FontAwesome name="shield" size={11} color={hasCap ? colors.danger : colors.success} />
            <Text style={{ fontSize: 11, color: colors.textMuted }}>
              Hard Cap: {hasCap ? strongestCap!.label : "None"}
            </Text>
          </View>
        </View>
      </View>
    </Card>
  );
}

// ── D. Qualitative Checklist ──────────────────────────────────────

function QualitativeSection({
  colors, scaleMode, answers, onAnswer,
}: {
  colors: ThemePalette;
  scaleMode: ScaleMode;
  answers: Record<string, number>;
  onAnswer: (id: string, normalized: number) => void;
}) {
  const scale = SCALE_CONFIGS[scaleMode];

  return (
    <View style={{ marginBottom: 14 }}>
      <SectionHeader title="Qualitative Checklist" icon="pencil-square-o" iconColor="#f59e0b" colors={colors} badge={44} />
      <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 10, marginLeft: 34 }}>
        User-rated items • {scale.label} scale • 44 points total
      </Text>

      {QUALITATIVE_SECTIONS.map((section) => (
        <Card key={section.key} colors={colors} style={{ marginBottom: 10 }}>
          {/* Section header */}
          <View style={[st.rowCenter, { gap: 8, marginBottom: 10 }]}>
            <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: section.color + "18", justifyContent: "center", alignItems: "center" }}>
              <FontAwesome name={section.icon as IconName} size={11} color={section.color} />
            </View>
            <Text style={{ fontSize: 13, fontWeight: "700", color: colors.textPrimary, flex: 1 }}>
              {section.label}
            </Text>
            <Text style={{ fontSize: 11, color: colors.textMuted, fontVariant: ["tabular-nums"] }}>
              {section.items.reduce((sum, it) => sum + (answers[it.id] != null ? answers[it.id] * it.maxPoints : 0), 0).toFixed(1)} / {section.maxPoints}
            </Text>
          </View>

          {/* Tooltip */}
          <Text style={{ fontSize: 10, color: colors.textMuted, lineHeight: 15, marginBottom: 10, fontStyle: "italic" }}>
            {section.tooltip}
          </Text>

          {/* Items */}
          {section.items.map((item, idx) => (
            <QualitativeItemRow
              key={item.id}
              item={item}
              colors={colors}
              scale={scale}
              answer={answers[item.id] ?? null}
              onAnswer={(v) => onAnswer(item.id, v)}
              isLast={idx === section.items.length - 1}
            />
          ))}
        </Card>
      ))}
    </View>
  );
}

function QualitativeItemRow({
  item, colors, scale, answer, onAnswer, isLast,
}: {
  item: { id: string; question: string; maxPoints: number; tooltip?: string };
  colors: ThemePalette;
  scale: { options: { label: string; value: number }[] };
  answer: number | null;
  onAnswer: (v: number) => void;
  isLast: boolean;
}) {
  const points = answer != null ? answer * item.maxPoints : 0;

  return (
    <View style={{
      paddingVertical: 10,
      borderBottomWidth: isLast ? 0 : 1,
      borderBottomColor: colors.borderColor + "60",
    }}>
      {/* Question */}
      <View style={[st.rowBetween, { marginBottom: 6 }]}>
        <Text style={{ fontSize: 12, color: colors.textPrimary, flex: 1, lineHeight: 17, paddingRight: 8 }}>
          {item.question}
        </Text>
        <Text style={{ fontSize: 11, color: colors.textMuted, fontVariant: ["tabular-nums"], minWidth: 50, textAlign: "right" }}>
          {answer != null ? points.toFixed(1) : "–"} / {item.maxPoints}
        </Text>
      </View>

      {/* Tooltip */}
      {item.tooltip && (
        <Text style={{ fontSize: 10, color: colors.textMuted + "aa", marginBottom: 6, fontStyle: "italic" }}>
          {item.tooltip}
        </Text>
      )}

      {/* Scale options */}
      <View style={{ flexDirection: "row", gap: 4, flexWrap: "wrap" }}>
        {scale.options.map((opt) => {
          const isSelected = answer != null && Math.abs(answer - opt.value) < 0.01;
          return (
            <Pressable
              key={opt.value}
              onPress={() => onAnswer(opt.value)}
              style={{
                paddingHorizontal: 12, paddingVertical: 6, borderRadius: 8,
                borderWidth: 1.5,
                borderColor: isSelected ? colors.accentPrimary : colors.borderColor,
                backgroundColor: isSelected ? colors.accentPrimary + "15" : "transparent",
              }}
            >
              <Text style={{
                fontSize: 11, fontWeight: isSelected ? "700" : "500",
                color: isSelected ? colors.accentPrimary : colors.textSecondary,
              }}>
                {opt.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

// ── E. Quantitative Metrics ───────────────────────────────────────

function QuantitativeSection({ colors, items }: { colors: ThemePalette; items: ItemBreakdown[] }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <SectionHeader title="Auto-Scored Metrics" icon="cog" iconColor="#3b82f6" colors={colors} badge={56} />
      <Text style={{ fontSize: 11, color: colors.textMuted, marginBottom: 10, marginLeft: 34 }}>
        Formula-based scoring from financial data • 56 points total
      </Text>

      {QUANTITATIVE_SECTIONS.map((section) => {
        const sectionItems = items.filter((b) => b.section === section.key);
        const earned = sectionItems.reduce((sum, b) => sum + b.pointsEarned, 0);

        return (
          <Card key={section.key} colors={colors} style={{ marginBottom: 10 }}>
            <View style={[st.rowCenter, { gap: 8, marginBottom: 10 }]}>
              <View style={{ width: 24, height: 24, borderRadius: 7, backgroundColor: section.color + "18", justifyContent: "center", alignItems: "center" }}>
                <FontAwesome name={section.icon as IconName} size={11} color={section.color} />
              </View>
              <Text style={{ fontSize: 13, fontWeight: "700", color: colors.textPrimary, flex: 1 }}>
                {section.label}
              </Text>
              <Text style={{ fontSize: 11, color: colors.textMuted, fontVariant: ["tabular-nums"] }}>
                {earned.toFixed(1)} / {section.maxPoints}
              </Text>
            </View>

            <Text style={{ fontSize: 10, color: colors.textMuted, lineHeight: 15, marginBottom: 10, fontStyle: "italic" }}>
              {section.tooltip}
            </Text>

            {sectionItems.map((item, idx) => (
              <QuantitativeItemRow
                key={item.id}
                item={item}
                colors={colors}
                isLast={idx === sectionItems.length - 1}
              />
            ))}
          </Card>
        );
      })}
    </View>
  );
}

function QuantitativeItemRow({ item, colors, isLast }: { item: ItemBreakdown; colors: ThemePalette; isLast: boolean }) {
  const pct = item.maxPoints > 0 ? item.pointsEarned / item.maxPoints : 0;
  const barColor = pct >= 0.75 ? colors.success : pct >= 0.5 ? colors.warning ?? "#f59e0b" : pct >= 0.25 ? "#f97316" : colors.danger;

  return (
    <View style={{
      paddingVertical: 8,
      borderBottomWidth: isLast ? 0 : 1,
      borderBottomColor: colors.borderColor + "60",
    }}>
      <View style={[st.rowBetween, { marginBottom: 4 }]}>
        <Text style={{ fontSize: 12, fontWeight: "600", color: colors.textPrimary, flex: 1 }}>{item.label}</Text>
        <Text style={{ fontSize: 11, color: colors.textMuted, fontVariant: ["tabular-nums"], minWidth: 50, textAlign: "right" }}>
          {item.isMissing ? "N/A" : item.pointsEarned.toFixed(1)} / {item.maxPoints}
        </Text>
      </View>

      {/* Progress bar */}
      {!item.isMissing && (
        <View style={[st.scoreBarTrack, { backgroundColor: colors.borderColor + "40", marginBottom: 4 }]}>
          <View style={[st.scoreBarFill, { width: `${pct * 100}%`, backgroundColor: barColor }]} />
        </View>
      )}

      {/* Source description */}
      <Text style={{ fontSize: 10, color: item.isMissing ? colors.danger + "cc" : colors.textMuted, lineHeight: 14 }}>
        {item.isMissing && <FontAwesome name="exclamation-triangle" size={9} color={colors.danger} />}
        {item.isMissing ? " " : ""}
        {item.sourceDescription ?? item.missingReason ?? ""}
      </Text>
    </View>
  );
}

// ── F. Hard Caps ──────────────────────────────────────────────────

function HardCapsSection({
  colors, caps, rawScore, finalScore,
}: {
  colors: ThemePalette;
  caps: { id: string; label: string; capValue: number; reason: string }[];
  rawScore: number;
  finalScore: number;
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <SectionHeader title="Hard Caps Applied" icon="lock" iconColor={colors.danger} colors={colors} />
      <Card colors={colors} style={{ borderColor: colors.danger + "40" }}>
        <Text style={{ fontSize: 12, color: colors.textSecondary, marginBottom: 10 }}>
          Raw score of <Text style={{ fontWeight: "700" }}>{rawScore}</Text> was capped to{" "}
          <Text style={{ fontWeight: "700", color: colors.danger }}>{finalScore}</Text>.
        </Text>

        {caps.map((cap) => (
          <View key={cap.id} style={{ flexDirection: "row", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
            <FontAwesome name="times-circle" size={12} color={colors.danger} style={{ marginTop: 2 }} />
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.textPrimary }}>
                {cap.label} (cap: {cap.capValue})
              </Text>
              <Text style={{ fontSize: 10, color: colors.textMuted }}>{cap.reason}</Text>
            </View>
          </View>
        ))}
      </Card>
    </View>
  );
}

// ── G. Section Breakdown ──────────────────────────────────────────

function BreakdownSection({ colors, breakdown }: { colors: ThemePalette; breakdown: SectionBreakdown[] }) {
  return (
    <View style={{ marginBottom: 14 }}>
      <SectionHeader title="Section Breakdown" icon="pie-chart" iconColor="#6366f1" colors={colors} />
      <Card colors={colors}>
        {breakdown.map((s, idx) => {
          const pct = s.maxPoints > 0 ? s.pointsEarned / s.maxPoints : 0;
          const barColor = pct >= 0.75 ? colors.success : pct >= 0.5 ? colors.warning ?? "#f59e0b" : pct >= 0.25 ? "#f97316" : colors.danger;

          return (
            <View key={s.key} style={{
              paddingVertical: 8,
              borderBottomWidth: idx < breakdown.length - 1 ? 1 : 0,
              borderBottomColor: colors.borderColor + "60",
            }}>
              <View style={[st.rowBetween, { marginBottom: 4 }]}>
                <Text style={{ fontSize: 12, fontWeight: "600", color: colors.textPrimary, flex: 1 }}>{s.label}</Text>
                <Text style={{ fontSize: 11, color: colors.textMuted, fontVariant: ["tabular-nums"] }}>
                  {s.pointsEarned.toFixed(1)} / {s.maxPoints} ({s.percent}%)
                </Text>
              </View>
              <View style={[st.scoreBarTrack, { backgroundColor: colors.borderColor + "40" }]}>
                <View style={[st.scoreBarFill, { width: `${pct * 100}%`, backgroundColor: barColor }]} />
              </View>
            </View>
          );
        })}
      </Card>
    </View>
  );
}

// ── H. Strengths / Blockers ───────────────────────────────────────

function StrengthsBlockersSection({
  colors, strengths, blockers,
}: {
  colors: ThemePalette;
  strengths: ItemBreakdown[];
  blockers: ItemBreakdown[];
}) {
  if (strengths.length === 0 && blockers.length === 0) return null;

  return (
    <View style={{ marginBottom: 14 }}>
      {/* Strengths */}
      {strengths.length > 0 && (
        <>
          <SectionHeader title="Top Strengths" icon="thumbs-up" iconColor={colors.success} colors={colors} />
          <Card colors={colors} style={{ marginBottom: 10 }}>
            {strengths.map((s, i) => (
              <View key={s.id} style={{
                flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6,
                borderBottomWidth: i < strengths.length - 1 ? 1 : 0,
                borderBottomColor: colors.borderColor + "60",
              }}>
                <FontAwesome name="check-circle" size={12} color={colors.success} />
                <Text style={{ fontSize: 12, color: colors.textPrimary, flex: 1 }}>{s.label}</Text>
                <Text style={{ fontSize: 11, color: colors.success, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                  {s.pointsEarned.toFixed(1)}/{s.maxPoints}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}

      {/* Blockers */}
      {blockers.length > 0 && (
        <>
          <SectionHeader title="Main Blockers" icon="thumbs-down" iconColor={colors.danger} colors={colors} />
          <Card colors={colors}>
            {blockers.map((b, i) => (
              <View key={b.id} style={{
                flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 6,
                borderBottomWidth: i < blockers.length - 1 ? 1 : 0,
                borderBottomColor: colors.borderColor + "60",
              }}>
                <FontAwesome name="exclamation-circle" size={12} color={colors.danger} />
                <Text style={{ fontSize: 12, color: colors.textPrimary, flex: 1 }}>{b.label}</Text>
                <Text style={{ fontSize: 11, color: colors.danger, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                  {b.pointsEarned.toFixed(1)}/{b.maxPoints}
                </Text>
              </View>
            ))}
          </Card>
        </>
      )}
    </View>
  );
}

// ── I. Assumptions / Missing Data ─────────────────────────────────

function AssumptionsSection({
  colors, assumptions, missingData,
}: {
  colors: ThemePalette;
  assumptions: string[];
  missingData: string[];
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <SectionHeader title="Assumptions & Missing Data" icon="info-circle" iconColor={colors.textMuted} colors={colors} />
      <Card colors={colors}>
        {assumptions.length > 0 && (
          <View style={{ marginBottom: missingData.length > 0 ? 10 : 0 }}>
            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textSecondary, marginBottom: 4 }}>Assumptions</Text>
            {assumptions.map((a, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 6, marginBottom: 3 }}>
                <Text style={{ fontSize: 10, color: colors.textMuted }}>•</Text>
                <Text style={{ fontSize: 10, color: colors.textMuted, flex: 1, lineHeight: 15 }}>{a}</Text>
              </View>
            ))}
          </View>
        )}
        {missingData.length > 0 && (
          <View>
            <Text style={{ fontSize: 11, fontWeight: "700", color: colors.warning ?? "#f59e0b", marginBottom: 4 }}>Missing Data</Text>
            {missingData.map((m, i) => (
              <View key={i} style={{ flexDirection: "row", gap: 6, marginBottom: 3 }}>
                <FontAwesome name="exclamation-triangle" size={9} color={colors.warning ?? "#f59e0b"} style={{ marginTop: 2 }} />
                <Text style={{ fontSize: 10, color: colors.textMuted, flex: 1, lineHeight: 15 }}>{m}</Text>
              </View>
            ))}
          </View>
        )}
      </Card>
    </View>
  );
}
