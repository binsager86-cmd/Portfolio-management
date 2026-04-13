/**
 * LocalInsightsPanel — collapsible "Kuwait Market Pulse" panel.
 *
 * Shows up to 3 bullet market insights with trend arrows (↑↓→).
 * Only renders when the user's portfolio contains Kuwait holdings.
 * Falls back to "Market data unavailable" on error.
 * RTL-aware: arrows and text direction adapt automatically.
 */

import type { ThemePalette } from "@/constants/theme";
import type { KuwaitInsight, KuwaitInsightsResponse } from "@/services/localInsights/boursaKuwait";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    I18nManager,
    Pressable,
    StyleSheet,
    Text,
    View,
} from "react-native";

// ── Helpers ─────────────────────────────────────────────────────────

function trendArrow(trend: KuwaitInsight["trend"]): string {
  return trend === "up" ? "↑" : trend === "down" ? "↓" : "→";
}

function trendColor(trend: KuwaitInsight["trend"], colors: ThemePalette): string {
  return trend === "up"
    ? colors.success
    : trend === "down"
      ? colors.danger
      : colors.textMuted;
}

function categoryEmoji(category: KuwaitInsight["category"]): string {
  return category === "dividend" ? "💰" : category === "volume" ? "📊" : "🔄";
}

// ── Component ───────────────────────────────────────────────────────

interface Props {
  data: KuwaitInsightsResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  colors: ThemePalette;
  fonts: { body: number; caption: number };
  spacing: { sectionGap: number };
}

export function LocalInsightsPanel({
  data,
  isLoading,
  isError,
  colors,
  fonts,
  spacing,
}: Props) {
  const { t } = useTranslation();
  const isRTL = I18nManager.isRTL;
  const [collapsed, setCollapsed] = useState(false);

  return (
    <View
      style={[
        s.container,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.borderColor,
          marginBottom: spacing.sectionGap,
        },
      ]}
    >
      {/* Header — tap to collapse/expand */}
      <Pressable
        onPress={() => setCollapsed((p) => !p)}
        style={[s.header, { flexDirection: isRTL ? "row-reverse" : "row" }]}
        accessibilityRole="button"
        accessibilityLabel={t("marketPulse.title")}
        accessibilityState={{ expanded: !collapsed }}
      >
        <View style={[s.headerLeft, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
          <Text style={s.headerEmoji}>🇰🇼</Text>
          <Text style={[s.headerTitle, { color: colors.textPrimary, fontSize: fonts.body }]}>
            {t("marketPulse.title")}
          </Text>
        </View>
        <FontAwesome
          name={collapsed ? "chevron-down" : "chevron-up"}
          size={12}
          color={colors.textMuted}
        />
      </Pressable>

      {/* Body */}
      {!collapsed && (
        <View style={s.body}>
          {isLoading && (
            <View style={s.center}>
              <ActivityIndicator size="small" color={colors.accentPrimary} />
              <Text style={[s.loadingText, { color: colors.textMuted, fontSize: fonts.caption }]}>
                {t("marketPulse.loading")}
              </Text>
            </View>
          )}

          {isError && !isLoading && (
            <Text style={[s.errorText, { color: colors.textMuted, fontSize: fonts.caption }]}>
              {t("marketPulse.unavailable")}
            </Text>
          )}

          {!isLoading && !isError && data && data.insights.length > 0 && (
            <>
              {data.insights.slice(0, 3).map((insight) => (
                <View
                  key={insight.id}
                  style={[
                    s.insightRow,
                    {
                      flexDirection: isRTL ? "row-reverse" : "row",
                      borderBottomColor: colors.borderColor,
                    },
                  ]}
                >
                  <Text style={s.insightEmoji}>{categoryEmoji(insight.category)}</Text>
                  <View style={[s.insightContent, isRTL && { alignItems: "flex-end" }]}>
                    <Text
                      style={[
                        s.insightTitle,
                        {
                          color: colors.textPrimary,
                          fontSize: fonts.caption + 1,
                          textAlign: isRTL ? "right" : "left",
                        },
                      ]}
                    >
                      {insight.title}
                    </Text>
                    <Text
                      style={[
                        s.insightDesc,
                        {
                          color: colors.textSecondary,
                          fontSize: fonts.caption,
                          textAlign: isRTL ? "right" : "left",
                        },
                      ]}
                    >
                      {insight.description}
                    </Text>
                  </View>
                  <Text
                    style={[
                      s.trendArrow,
                      { color: trendColor(insight.trend, colors) },
                    ]}
                  >
                    {trendArrow(insight.trend)}
                  </Text>
                </View>
              ))}

              {/* Source + timestamp footer */}
              <Text
                style={[
                  s.footer,
                  {
                    color: colors.textMuted,
                    fontSize: Math.max(fonts.caption - 1, 10),
                    textAlign: isRTL ? "right" : "left",
                  },
                ]}
              >
                {t("marketPulse.source")} · {t("marketPulse.updated", {
                  time: new Date(data.updatedAt).toLocaleTimeString([], {
                    hour: "2-digit",
                    minute: "2-digit",
                  }),
                })}
              </Text>
            </>
          )}

          {!isLoading && !isError && data && data.insights.length === 0 && (
            <Text style={[s.errorText, { color: colors.textMuted, fontSize: fonts.caption }]}>
              {t("marketPulse.noInsights")}
            </Text>
          )}
        </View>
      )}
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: {
    borderRadius: 12,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerLeft: {
    alignItems: "center",
    gap: 8,
  },
  headerEmoji: {
    fontSize: 18,
  },
  headerTitle: {
    fontWeight: "700",
  },
  body: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  center: {
    alignItems: "center",
    paddingVertical: 16,
    gap: 8,
  },
  loadingText: {
    fontStyle: "italic",
  },
  errorText: {
    fontStyle: "italic",
    paddingVertical: 8,
  },
  insightRow: {
    alignItems: "flex-start",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  insightEmoji: {
    fontSize: 16,
    marginTop: 2,
  },
  insightContent: {
    flex: 1,
    gap: 2,
  },
  insightTitle: {
    fontWeight: "600",
  },
  insightDesc: {
    lineHeight: 18,
  },
  trendArrow: {
    fontSize: 18,
    fontWeight: "700",
    marginTop: 2,
    minWidth: 20,
    textAlign: "center",
  },
  footer: {
    marginTop: 10,
    fontStyle: "italic",
  },
});
