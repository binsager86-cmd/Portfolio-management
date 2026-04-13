/**
 * TrendingStocksPanel — "Trending in Kuwait" anonymized social signals.
 *
 * Shows community activity on stocks with:
 *  - Sentiment direction (bullish/bearish/neutral)
 *  - Activity level badges
 *  - Price change
 *  - Opt-in toggle for contributing data
 *  - Disclaimer about anonymization
 */

import { analytics } from "@/lib/analytics";
import {
    activityEmoji,
    directionEmoji,
    getMockTrendingStocks,
    loadSignalPrefs,
    saveSignalPrefs,
    type SocialSignalPrefs,
    type TrendingStock,
} from "@/services/socialSignals";
import { useThemeStore } from "@/services/themeStore";
import { useUserPrefsStore } from "@/src/store/userPrefsStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    I18nManager,
    Pressable,
    StyleSheet,
    Switch,
    Text,
    View,
} from "react-native";

export function TrendingStocksPanel() {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const isRTL = I18nManager.isRTL;
  const expertiseLevel = useUserPrefsStore((s) => s.preferences.expertiseLevel);

  const [prefs, setPrefs] = useState<SocialSignalPrefs | null>(null);
  const [stocks, setStocks] = useState<TrendingStock[]>([]);
  const [expanded, setExpanded] = useState(false);

  // Load prefs + mock data
  useEffect(() => {
    loadSignalPrefs().then((p) => {
      setPrefs(p);
      if (p.showTrending) {
        setStocks(getMockTrendingStocks());
      }
    });
  }, []);

  const toggleOptIn = async () => {
    if (!prefs) return;
    const next = { ...prefs, optedIn: !prefs.optedIn };
    setPrefs(next);
    await saveSignalPrefs(next);
    analytics.logEvent("social_signal_optin", { opted_in: next.optedIn });
  };

  // Don't show for beginners unless opted in
  if (expertiseLevel === "normal" && !prefs?.optedIn) return null;
  if (!prefs?.showTrending) return null;

  return (
    <View
      style={[
        s.container,
        { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
      ]}
    >
      {/* Header */}
      <Pressable
        onPress={() => setExpanded(!expanded)}
        style={[s.header, { flexDirection: isRTL ? "row-reverse" : "row" }]}
        accessibilityRole="button"
        accessibilityLabel={t("socialSignals.title")}
      >
        <Text style={s.emoji}>🔥</Text>
        <View style={[s.headerText, isRTL && { alignItems: "flex-end" }]}>
          <Text style={[s.title, { color: colors.textPrimary }]}>
            {t("socialSignals.title")}
          </Text>
          <Text style={[s.subtitle, { color: colors.textMuted }]}>
            {t("socialSignals.subtitle")}
          </Text>
        </View>
        <FontAwesome
          name={expanded ? "chevron-up" : "chevron-down"}
          size={12}
          color={colors.textMuted}
        />
      </Pressable>

      {expanded && (
        <View style={s.content}>
          {/* Opt-in row */}
          <View style={[s.optInRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
            <Text style={[s.optInLabel, { color: colors.textSecondary }]}>
              {t("socialSignals.contributeData")}
            </Text>
            <Switch
              value={prefs?.optedIn ?? false}
              onValueChange={toggleOptIn}
              trackColor={{ true: colors.accentPrimary + "40", false: colors.borderColor }}
              thumbColor={prefs?.optedIn ? colors.accentPrimary : colors.textMuted}
            />
          </View>

          {/* Trending list */}
          {stocks.map((stock) => (
            <View
              key={stock.symbol}
              style={[
                s.stockRow,
                {
                  flexDirection: isRTL ? "row-reverse" : "row",
                  borderBottomColor: colors.borderColor,
                },
              ]}
            >
              <View style={s.rankBadge}>
                <Text style={[s.rankText, { color: colors.textMuted }]}>
                  #{stock.rank}
                </Text>
              </View>

              <View style={[s.stockInfo, isRTL && { alignItems: "flex-end" }]}>
                <View style={[s.stockNameRow, { flexDirection: isRTL ? "row-reverse" : "row" }]}>
                  <Text style={[s.stockSymbol, { color: colors.textPrimary }]}>
                    {stock.symbol}
                  </Text>
                  <Text style={s.directionIcon}>{directionEmoji(stock.direction)}</Text>
                  <Text style={s.activityIcon}>{activityEmoji(stock.activityLevel)}</Text>
                </View>
                <Text
                  style={[s.stockCompany, { color: colors.textMuted }]}
                  numberOfLines={1}
                >
                  {stock.company}
                </Text>
              </View>

              <View style={[s.stockMeta, isRTL && { alignItems: "flex-start" }]}>
                <Text
                  style={[
                    s.priceChange,
                    {
                      color:
                        stock.priceChangePct > 0
                          ? colors.success
                          : stock.priceChangePct < 0
                            ? colors.danger
                            : colors.textMuted,
                    },
                  ]}
                >
                  {stock.priceChangePct > 0 ? "+" : ""}
                  {stock.priceChangePct.toFixed(1)}%
                </Text>
                <Text style={[s.bullishPct, { color: colors.textMuted }]}>
                  {stock.bullishPct}% {t("socialSignals.bullish")}
                </Text>
              </View>
            </View>
          ))}

          {/* Disclaimer */}
          <Text style={[s.disclaimer, { color: colors.textMuted }]}>
            {t("socialSignals.disclaimer")}
          </Text>
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
    gap: 10,
    padding: 14,
  },
  emoji: { fontSize: 24 },
  headerText: { flex: 1, gap: 2 },
  title: { fontSize: 15, fontWeight: "700" },
  subtitle: { fontSize: 12 },
  content: { paddingHorizontal: 14, paddingBottom: 14, gap: 8 },
  optInRow: {
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 8,
    paddingHorizontal: 4,
    marginBottom: 4,
  },
  optInLabel: { fontSize: 13 },
  stockRow: {
    alignItems: "center",
    gap: 10,
    paddingVertical: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  rankBadge: { width: 28, alignItems: "center" },
  rankText: { fontSize: 12, fontWeight: "600" },
  stockInfo: { flex: 1, gap: 2 },
  stockNameRow: { alignItems: "center", gap: 6 },
  stockSymbol: { fontSize: 14, fontWeight: "700" },
  directionIcon: { fontSize: 10 },
  activityIcon: { fontSize: 10 },
  stockCompany: { fontSize: 11 },
  stockMeta: { alignItems: "flex-end", gap: 2 },
  priceChange: { fontSize: 13, fontWeight: "700" },
  bullishPct: { fontSize: 10 },
  disclaimer: {
    fontSize: 10,
    lineHeight: 14,
    textAlign: "center",
    marginTop: 8,
  },
});
