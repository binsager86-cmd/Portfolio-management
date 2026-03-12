/**
 * AI Financial Intelligence — prompt library, category selector,
 * custom prompt input, and analysis result display.
 */

import React from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import type { UseMutationResult } from "@tanstack/react-query";
import type { ThemePalette } from "@/constants/theme";

// ── AI Prompt Library ────────────────────────────────────────────────

export const AI_PROMPT_CATEGORIES = [
  {
    label: "Portfolio Health",
    icon: "heartbeat" as const,
    prompts: [
      "Analyze my portfolio health and diversification",
      "What are my biggest risk exposures?",
      "How well diversified is my portfolio across sectors?",
    ],
  },
  {
    label: "Performance",
    icon: "line-chart" as const,
    prompts: [
      "Identify my top and bottom performers",
      "Compare my portfolio performance vs market",
      "Which stocks are dragging down my returns?",
    ],
  },
  {
    label: "Recommendations",
    icon: "lightbulb-o" as const,
    prompts: [
      "What changes would you recommend to improve my portfolio?",
      "Should I rebalance? If so, how?",
      "Which positions should I consider adding to or trimming?",
    ],
  },
  {
    label: "Dividends",
    icon: "money" as const,
    prompts: [
      "Analyze my dividend income potential",
      "Which stocks have the best dividend yield?",
      "How can I improve my passive income?",
    ],
  },
];

// ── Component Props ──────────────────────────────────────────────────

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
}: AIFinancialIntelligenceProps) {
  return (
    <View style={[s.aiSection, { borderColor: colors.borderColor }]}>
      <View style={s.aiHeader}>
        <FontAwesome name="magic" size={20} color={colors.accentPrimary} />
        <Text style={[s.sectionTitle, { color: colors.textSecondary, marginBottom: 0, marginTop: 0, marginLeft: 8 }]}>
          AI Financial Intelligence
        </Text>
      </View>

      {aiStatusData?.configured === false && (
        <View style={[s.aiWarning, { backgroundColor: colors.warning + "22", borderColor: colors.warning }]}>
          <FontAwesome name="exclamation-triangle" size={14} color={colors.warning} />
          <Text style={{ color: colors.warning, fontSize: 13, marginLeft: 8, flex: 1 }}>
            AI not configured. Add your Gemini API key in Settings.
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
              {cat.label}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* Prompt suggestions for selected category */}
      {aiCategory !== null && (
        <View style={{ marginBottom: 12 }}>
          {AI_PROMPT_CATEGORIES[aiCategory].prompts.map((p) => (
            <Pressable
              key={p}
              onPress={() => setAiPrompt(p)}
              style={[s.aiPromptSuggestion, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
            >
              <Text style={{ color: colors.textPrimary, fontSize: 13, flex: 1 }}>{p}</Text>
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
          placeholder="Ask anything about your portfolio..."
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
          <Text style={{ color: colors.textSecondary, marginLeft: 12, fontSize: 13 }}>Analyzing portfolio...</Text>
        </View>
      )}
      {aiResult && !aiMutation.isPending && (
        <View style={[s.aiResultCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          <ScrollView style={{ maxHeight: 400 }} nestedScrollEnabled>
            <Text style={{ color: colors.textPrimary, fontSize: 14, lineHeight: 22 }}>{aiResult}</Text>
          </ScrollView>
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
});
