/**
 * NewsCard — a single news item card adapted to the user's expertise level.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";

import type { ThemePalette } from "@/constants/theme";
import i18n from "@/lib/i18n/config";
import {
    getNewsImpactBadge,
    sentimentColor,
    sourceLabel,
    summarizeForUser,
} from "@/lib/news/summarizer";
import type { NewsItem } from "@/services/news/types";
import type { ExpertiseLevel } from "@/src/store/userPrefsStore";
import { NewsAttribution } from "./NewsAttribution";

// ── Helpers ─────────────────────────────────────────────────────

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return i18n.t('news.justNow');
  if (mins < 60) return i18n.t('news.mAgo', { m: mins });
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return i18n.t('news.hAgo', { h: hrs });
  const days = Math.floor(hrs / 24);
  return i18n.t('news.dAgo', { d: days });
}

function formatDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate().toString().padStart(2, "0");
  const month = (d.getMonth() + 1).toString().padStart(2, "0");
  const year = d.getFullYear();
  const hours = d.getHours().toString().padStart(2, "0");
  const minutes = d.getMinutes().toString().padStart(2, "0");
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

// ── Props ───────────────────────────────────────────────────────

interface NewsCardProps {
  item: NewsItem;
  colors: ThemePalette;
  expertiseLevel: ExpertiseLevel;
  onPress?: () => void;
  compact?: boolean;
}

// ── Component ───────────────────────────────────────────────────

export function NewsCard({ item, colors, expertiseLevel, onPress, compact }: NewsCardProps) {
  const summary = summarizeForUser(item, expertiseLevel);
  const impact = getNewsImpactBadge(item.impact);
  const sColor = sentimentColor(item.sentiment);

  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        s.card,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.borderColor,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      {/* ── Header: symbol + time + impact ── */}
      <View style={s.header}>
        {item.relatedSymbols.length > 0 ? (
          <View style={[s.symbolChip, { backgroundColor: colors.accentPrimary + "20", borderColor: colors.accentPrimary + "40", borderWidth: 1 }]}>
            <Text style={{ color: colors.accentPrimary, fontSize: 11, fontWeight: "700", letterSpacing: 0.5 }}>{item.relatedSymbols[0]}</Text>
          </View>
        ) : (
          <View style={[s.sourcePill, { backgroundColor: colors.bgSecondary }]}>
            <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600" }}>
              {sourceLabel(item.source)}
            </Text>
          </View>
        )}
        <Text style={{ color: colors.textMuted, fontSize: 11, flex: 1 }}>
          {timeAgo(item.publishedAt)}
        </Text>
        <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>
          {formatDate(item.publishedAt)}
        </Text>
        {item.impact && (
          <View style={[s.impactBadge, { backgroundColor: impact.color + "18" }]}>
            <FontAwesome name={impact.icon} size={10} color={impact.color} />
            {!compact && (
              <Text style={{ color: impact.color, fontSize: 10, fontWeight: "600", marginLeft: 3 }}>
                {impact.label}
              </Text>
            )}
          </View>
        )}
      </View>

      {/* ── Sentiment dot + Title ── */}
      <View style={s.titleRow}>
        <View style={[s.sentimentDot, { backgroundColor: sColor }]} />
        <Text
          style={[s.title, { color: colors.textPrimary }]}
          numberOfLines={compact ? 2 : 3}
        >
          {item.title}
        </Text>
      </View>

      {/* ── Summary (hidden in compact mode) ── */}
      {!compact && (
        <Text
          style={[s.summary, { color: colors.textSecondary }]}
          numberOfLines={expertiseLevel === "advanced" ? 6 : 3}
        >
          {summary}
        </Text>
      )}

      {/* ── Related symbols + source ── */}
      <View style={s.symbolsRow}>
        {item.relatedSymbols.length > 1 &&
          item.relatedSymbols.slice(1, 5).map((sym) => (
            <View key={sym} style={[s.symbolChip, { backgroundColor: colors.accentPrimary + "20", borderColor: colors.accentPrimary + "40", borderWidth: 1 }]}>
              <Text style={{ color: colors.accentPrimary, fontSize: 13, fontWeight: "700", letterSpacing: 0.5 }}>{sym}</Text>
            </View>
          ))}
        {item.relatedSymbols.length > 5 && (
          <Text style={{ color: colors.textMuted, fontSize: 11 }}>
            +{item.relatedSymbols.length - 5}
          </Text>
        )}
      </View>

      {/* ── Attribution (compliance) ── */}
      {!compact && expertiseLevel !== "normal" && (
        <NewsAttribution
          source={item.source}
          url={item.url}
          isVerified={item.isVerified}
          colors={colors}
        />
      )}
    </Pressable>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const s = StyleSheet.create({
  card: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
    marginBottom: 10,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginBottom: 8,
  },
  sourcePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  impactBadge: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 7,
    paddingVertical: 3,
    borderRadius: 6,
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    marginBottom: 6,
  },
  sentimentDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 5,
  },
  title: {
    fontSize: 14,
    fontWeight: "600",
    flex: 1,
    lineHeight: 20,
  },
  summary: {
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 8,
    marginLeft: 16,
  },
  symbolsRow: {
    flexDirection: "row",
    gap: 6,
    flexWrap: "wrap",
    marginTop: 4,
  },
  symbolChip: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 8,
  },
});
