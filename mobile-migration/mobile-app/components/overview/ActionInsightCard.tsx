/**
 * ActionInsightCard — visual insight card with priority-colored left border,
 * emoji, plain-language message, optional action button, and dismiss.
 */

import type { ThemePalette } from "@/constants/theme";
import type { InsightPriority, PortfolioInsight } from "@/lib/insightEngine";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

// ── Helpers ─────────────────────────────────────────────────────────

function borderColor(priority: InsightPriority, colors: ThemePalette): string {
  return priority === "high"
    ? colors.danger
    : priority === "medium"
      ? colors.warning
      : colors.success;
}

// ── Component ───────────────────────────────────────────────────────

interface Props {
  insight: PortfolioInsight;
  colors: ThemePalette;
  onDismiss: (id: string) => void;
}

export function ActionInsightCard({ insight, colors, onDismiss }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const leftColor = borderColor(insight.priority, colors);

  return (
    <View
      style={[
        s.card,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.borderColor,
          borderLeftColor: leftColor,
          borderLeftWidth: 4,
        },
      ]}
    >
      {/* Content row */}
      <View style={s.contentRow}>
        <Text style={s.emoji}>{insight.emoji}</Text>
        <View style={s.textCol}>
          <Text style={[s.message, { color: colors.textPrimary }]}>
            {t(insight.messageKey, insight.messageParams)}
          </Text>

          {/* Action button */}
          {insight.action && (
            <Pressable
              onPress={() => router.push(insight.action!.screen as any)}
              style={[s.actionBtn, { backgroundColor: leftColor + "18" }]}
            >
              <Text style={[s.actionLabel, { color: leftColor }]}>
                {t(insight.action.labelKey)}
              </Text>
              <FontAwesome name="chevron-right" size={10} color={leftColor} />
            </Pressable>
          )}
        </View>

        {/* Dismiss button */}
        <Pressable
          onPress={() => onDismiss(insight.id)}
          hitSlop={12}
          style={s.dismissBtn}
          accessibilityLabel={t("app.delete")}
        >
          <FontAwesome name="times" size={14} color={colors.textMuted} />
        </Pressable>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 8,
    overflow: "hidden",
  },
  contentRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 14,
    gap: 10,
  },
  emoji: {
    fontSize: 22,
    marginTop: 1,
  },
  textCol: {
    flex: 1,
    gap: 8,
  },
  message: {
    fontSize: 14,
    lineHeight: 20,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  actionLabel: {
    fontSize: 12,
    fontWeight: "600",
  },
  dismissBtn: {
    padding: 4,
  },
});
