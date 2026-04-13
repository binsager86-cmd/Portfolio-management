/**
 * AI Financial Intelligence — prompt library, category selector,
 * custom prompt input, and analysis result display.
 */

import type { ThemePalette } from "@/constants/theme";
import { generateStockSummary, type AISummary, type ScoreInput } from "@/lib/aiSummaryGenerator";
import { useUserPrefsStore } from "@/src/store/userPrefsStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { UseMutationResult } from "@tanstack/react-query";
import React from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

// ── AI Prompt Library ────────────────────────────────────────────────

export const AI_PROMPT_CATEGORIES = [
  {
    label: "portfolioHealth",
    icon: "heartbeat" as const,
    promptKeys: ["ai.prompt_health1", "ai.prompt_health2", "ai.prompt_health3"],
  },
  {
    label: "performance",
    icon: "line-chart" as const,
    promptKeys: ["ai.prompt_perf1", "ai.prompt_perf2", "ai.prompt_perf3"],
  },
  {
    label: "recommendations",
    icon: "lightbulb-o" as const,
    promptKeys: ["ai.prompt_rec1", "ai.prompt_rec2", "ai.prompt_rec3"],
  },
  {
    label: "dividends",
    icon: "money" as const,
    promptKeys: ["ai.prompt_div1", "ai.prompt_div2", "ai.prompt_div3"],
  },
];

// ── Component Props ──────────────────────────────────────────────────

/** Extract a beginner-friendly one-liner from AI analysis text. */
function extractBeginnerSummary(text: string): string {
  // Use the first sentence as a summary; cap at ~120 chars
  const firstSentence = text.split(/[.\n]/)[0]?.trim() ?? "";
  if (firstSentence.length > 120) {
    return firstSentence.slice(0, 117) + "\u2026";
  }
  return firstSentence || "";
}

interface StockContext {
  name: string;
  currentPrice: number;
  fairValue: number | null;
  score: ScoreInput | null;
}

interface AIFinancialIntelligenceProps {
  colors: ThemePalette;
  aiCategory: number | null;
  setAiCategory: (v: number | null) => void;
  aiPrompt: string;
  setAiPrompt: (v: string) => void;
  aiResult: string | null;
  aiMutation: UseMutationResult<{ analysis: string } | undefined, Error, string>;
  handleAiAnalyze: (prompt: string) => void;
  aiStatusData?: { configured: boolean } | undefined;
  /** Optional stock context — when provided, generates an expertise-level summary card */
  stockContext?: StockContext;
  /** Navigation callback for "View Technical Analysis" (advanced mode) */
  onViewDetails?: () => void;
}

// ── Component ────────────────────────────────────────────────────────

export function AIFinancialIntelligence({
  colors,
  aiCategory,
  setAiCategory,
  aiPrompt,
  setAiPrompt,
  aiResult,
  aiMutation,
  handleAiAnalyze,
  aiStatusData,
  stockContext,
  onViewDetails,
}: AIFinancialIntelligenceProps) {
  const { preferences } = useUserPrefsStore();
  const { t } = useTranslation();
  const isBeginner = preferences.expertiseLevel === "normal";
  const [showFullAnalysis, setShowFullAnalysis] = React.useState(false);

  // Generate stock summary when context is available
  const summary: AISummary | null = React.useMemo(() => {
    if (!stockContext) return null;
    return generateStockSummary(
      stockContext.name,
      stockContext.currentPrice,
      stockContext.fairValue,
      stockContext.score,
      preferences,
    );
  }, [stockContext, preferences]);

  return (
    <View style={[s.aiSection, { borderColor: colors.borderColor }]}>
      <View style={s.aiHeader}>
        <FontAwesome name="magic" size={20} color={colors.accentPrimary} />
        <Text style={[s.sectionTitle, { color: colors.textSecondary, marginBottom: 0, marginTop: 0, marginLeft: 8 }]}>
          {t('ai.title')}
        </Text>
      </View>

      {aiStatusData?.configured === false && (
        <View style={[s.aiWarning, { backgroundColor: colors.warning + "22", borderColor: colors.warning }]}>
          <FontAwesome name="exclamation-triangle" size={14} color={colors.warning} />
          <Text style={{ color: colors.warning, fontSize: 13, marginLeft: 8, flex: 1 }}>
            {t('ai.notConfigured')}
          </Text>
        </View>
      )}

      {/* Prompt Categories */}
      <View style={s.aiCategories}>
        {AI_PROMPT_CATEGORIES.map((cat, idx) => (
          <Pressable
            key={cat.label}
            onPress={() => setAiCategory(aiCategory === idx ? null : idx)}
            style={[
              s.aiCatBtn,
              {
                backgroundColor: aiCategory === idx ? colors.accentPrimary + "22" : colors.bgCard,
                borderColor: aiCategory === idx ? colors.accentPrimary : colors.borderColor,
              },
            ]}
          >
            <FontAwesome name={cat.icon} size={14} color={aiCategory === idx ? colors.accentPrimary : colors.textSecondary} />
            <Text style={{ color: aiCategory === idx ? colors.accentPrimary : colors.textSecondary, fontSize: 12, fontWeight: "600", marginLeft: 6 }}>
              {t('ai.' + cat.label)}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Prompt suggestions for selected category */}
      {aiCategory !== null && (
        <View style={{ marginBottom: 12 }}>
          {AI_PROMPT_CATEGORIES[aiCategory].promptKeys.map((key) => (
            <Pressable
              key={key}
              onPress={() => setAiPrompt(t(key))}
              style={[s.aiPromptSuggestion, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 13, flex: 1 }}>{t(key)}</Text>
              <FontAwesome name="arrow-right" size={12} color={colors.accentPrimary} />
            </Pressable>
          ))}
        </View>
      )}

      {/* Custom prompt input */}
      <View style={s.aiInputRow}>
        <TextInput
          style={[s.aiInput, { backgroundColor: colors.bgCard, color: colors.textPrimary, borderColor: colors.borderColor }]}
          placeholderTextColor={colors.textMuted}
          placeholder={t('ai.askPlaceholder')}
          value={aiPrompt}
          onChangeText={setAiPrompt}
          multiline
        />
        <Pressable
          onPress={() => aiPrompt.trim() && handleAiAnalyze(aiPrompt.trim())}
          disabled={aiMutation.isPending || !aiPrompt.trim()}
          style={[
            s.aiSendBtn,
            {
              backgroundColor: colors.accentPrimary,
              opacity: aiMutation.isPending || !aiPrompt.trim() ? 0.5 : 1,
            },
          ]}
        >
          {aiMutation.isPending ? (
            <ActivityIndicator size="small" color="#fff" />
          ) : (
            <FontAwesome name="send" size={16} color="#fff" />
          )}
        </Pressable>
      </View>

      {/* AI Result */}
      {aiMutation.isPending && (
        <View style={[s.aiResultCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <ActivityIndicator size="small" color={colors.accentPrimary} />
          <Text style={{ color: colors.textSecondary, marginLeft: 12, fontSize: 13 }}>{t('ai.analyzing')}</Text>
        </View>
      )}
      {/* Stock Summary Card (when stockContext provided) */}
      {summary && (
        <View style={[s.summaryCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 10 }}>
            <Text style={{ fontSize: 20, marginRight: 8 }}>{summary.emoji}</Text>
            <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700", flex: 1 }}>
              {summary.headline}
            </Text>
          </View>

          {summary.bullets.map((bullet, idx) => (
            <View key={idx} style={{ flexDirection: "row", alignItems: "flex-start", marginBottom: 4, paddingLeft: 4 }}>
              <Text style={{ color: colors.textMuted, fontSize: 13, marginRight: 6 }}>{"\u2022"}</Text>
              <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19, flex: 1 }}>{bullet}</Text>
            </View>
          ))}

          {summary.actionHint && isBeginner && (
            <View style={[s.beginnerBanner, { backgroundColor: colors.accentPrimary + "14", borderColor: colors.accentPrimary + "40", marginTop: 8 }]}>
              <FontAwesome name="lightbulb-o" size={14} color={colors.accentPrimary} />
              <Text style={{ color: colors.accentPrimary, fontSize: 13, fontWeight: "600", marginLeft: 8, flex: 1 }}>
                {summary.actionHint}
              </Text>
            </View>
          )}

          {preferences.expertiseLevel !== "normal" && preferences.showAdvancedMetrics && onViewDetails && (
            <Pressable onPress={onViewDetails} style={[s.viewDetailsBtn, { borderColor: colors.accentPrimary + "40" }]}>
              <Text style={{ color: colors.accentPrimary, fontSize: 13, fontWeight: "600" }}>
                {t('ai.viewTechnical')}
              </Text>
            </Pressable>
          )}

          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, paddingTop: 8, borderTopWidth: 1, borderTopColor: colors.borderColor + "40" }}>
            <View style={{
              width: 8, height: 8, borderRadius: 4, marginRight: 6,
              backgroundColor: summary.riskLevel === "low" ? colors.success : summary.riskLevel === "high" ? colors.danger : colors.warning,
            }} />
            <Text style={{ color: colors.textMuted, fontSize: 12 }}>
              {t('ai.risk', { level: summary.riskLevel.charAt(0).toUpperCase() + summary.riskLevel.slice(1) })}
            </Text>
          </View>
        </View>
      )}

      {/* AI Chat Result */}
      {aiResult && !aiMutation.isPending && (
        <View style={[s.aiResultCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, flexDirection: "column" }]}>
          {isBeginner && (
            <View style={[s.beginnerBanner, { backgroundColor: colors.accentPrimary + "14", borderColor: colors.accentPrimary + "40" }]}>
              <FontAwesome name="lightbulb-o" size={16} color={colors.accentPrimary} />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ color: colors.accentPrimary, fontSize: 13, fontWeight: "700", marginBottom: 2 }}>
                  {t('ai.simpleSummary')}
                </Text>
                <Text style={{ color: colors.textSecondary, fontSize: 13, lineHeight: 19 }}>
                  {extractBeginnerSummary(aiResult) || t('ai.seeDetailed')}
                </Text>
              </View>
            </View>
          )}
          {/* Collapsible full analysis for beginners */}
          {isBeginner && !showFullAnalysis ? (
            <Pressable onPress={() => setShowFullAnalysis(true)} style={{ paddingVertical: 8 }}>
              <Text style={{ color: colors.accentPrimary, fontSize: 13, fontWeight: "600" }}>
                {t('ai.showFull')}
              </Text>
            </Pressable>
          ) : (
            <>
              {isBeginner && (
                <Pressable onPress={() => setShowFullAnalysis(false)} style={{ paddingVertical: 4, marginBottom: 4 }}>
                  <Text style={{ color: colors.accentPrimary, fontSize: 13, fontWeight: "600" }}>
                    {t('ai.hideFull')}
                  </Text>
                </Pressable>
              )}
              <ScrollView style={{ maxHeight: 400 }} nestedScrollEnabled>
                <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 22 }}>{aiResult}</Text>
              </ScrollView>
            </>
          )}
        </View>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const s = StyleSheet.create({
  sectionTitle: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
    marginTop: 4,
  },
  aiSection: {
    marginTop: 8,
    marginBottom: 16,
    borderTopWidth: 1,
    paddingTop: 16,
  },
  aiHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 16,
  },
  aiWarning: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  aiCategories: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 12,
  },
  aiCatBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 20,
    borderWidth: 1,
    minHeight: 44,
  },
  aiPromptSuggestion: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 6,
    gap: 8,
    minHeight: 44,
  },
  aiInputRow: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    marginBottom: 12,
  },
  aiInput: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
    minHeight: 44,
    maxHeight: 100,
  },
  aiSendBtn: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: "center",
    justifyContent: "center",
  },
  aiResultCard: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
  },
  beginnerBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 12,
  },
  summaryCard: {
    padding: 16,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 14,
  },
  viewDetailsBtn: {
    marginTop: 10,
    paddingVertical: 8,
    alignItems: "center",
    borderRadius: 8,
    borderWidth: 1,
  },
});
