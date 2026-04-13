/**
 * ShariaBadge — compact Sharia compliance indicator.
 *
 * Shows a colored badge with icon + label based on ShariaStatus.
 * Optionally expandable to show detailed screening criteria.
 * Only renders when enableShariaFilter is ON in user preferences.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useState } from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import type { ThemePalette } from "@/constants/theme";
import {
    type ShariaCriteria,
    type ShariaStatus,
    evaluateShariaCompliance,
    getMusaffaStatus,
    getMusaffaUrl,
    getShariaBadgeProps,
    getShariaDetails,
} from "@/lib/shariaCompliance";
import { useUserPrefsStore } from "@/src/store/userPrefsStore";

// ── Props ────────────────────────────────────────────────────────────

interface ShariaBadgeProps {
  /** Pre-computed status — if provided, criteria is ignored for status calc. */
  status?: ShariaStatus;
  /** Raw criteria — used to compute status and render detail rows. */
  criteria?: Partial<ShariaCriteria>;
  /** Stock symbol — used for Musaffa lookup & link. */
  symbol?: string;
  /** Show expandable detail view on press. Default false. */
  expandable?: boolean;
  /** Compact mode (icon only, no label). Default false. */
  compact?: boolean;
  /** Theme palette. */
  colors: ThemePalette;
}

export default function ShariaBadge({
  status: statusProp,
  criteria,
  symbol,
  expandable = false,
  compact = false,
  colors,
}: ShariaBadgeProps) {
  const enableShariaFilter = useUserPrefsStore((s) => s.preferences.enableShariaFilter);
  const [expanded, setExpanded] = useState(false);

  if (!enableShariaFilter) return null;

  // Musaffa override takes priority, then prop, then criteria-based evaluation
  const musaffaOverride = symbol ? getMusaffaStatus(symbol) : undefined;
  const computedStatus = musaffaOverride ?? statusProp ?? (criteria ? evaluateShariaCompliance(criteria) : "unknown");
  const badge = getShariaBadgeProps(computedStatus);
  const details = expanded && criteria ? getShariaDetails(criteria) : [];
  const musaffaUrl = symbol ? getMusaffaUrl(symbol) : null;

  return (
    <View>
      <Pressable
        onPress={expandable ? () => setExpanded((p) => !p) : undefined}
        style={[
          s.badge,
          { backgroundColor: badge.color + "1A", borderColor: badge.color + "40" },
        ]}
        accessibilityRole="button"
        accessibilityLabel={badge.label}
      >
        <FontAwesome name={badge.icon} size={compact ? 14 : 12} color={badge.color} />
        {!compact && (
          <Text style={[s.label, { color: badge.color }]}>{badge.label}</Text>
        )}
        {expandable && !compact && (
          <FontAwesome
            name={expanded ? "chevron-up" : "chevron-down"}
            size={10}
            color={badge.color}
            style={{ marginLeft: 4 }}
          />
        )}
      </Pressable>

      {expanded && details.length > 0 && (
        <View style={[s.detailBox, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          {details.map((d) => (
            <View key={d.label} style={s.detailRow}>
              <FontAwesome
                name={d.passed === null ? "minus" : d.passed ? "check" : "times"}
                size={12}
                color={d.passed === null ? colors.textMuted : d.passed ? "#10b981" : "#ef4444"}
                style={{ width: 18 }}
              />
              <Text style={[s.detailLabel, { color: colors.textSecondary }]}>{d.label}</Text>
              <Text style={[s.detailValue, { color: colors.textPrimary }]}>{d.value}</Text>
              <Text style={[s.detailThreshold, { color: colors.textMuted }]}>{d.threshold}</Text>
            </View>
          ))}
        </View>
      )}

      {/* Musaffa verification link — always shown when expanded or as standalone */}
      {musaffaUrl && !compact && (
        <Pressable
          onPress={() => Linking.openURL(musaffaUrl)}
          style={s.musaffaLink}
          accessibilityRole="link"
          accessibilityLabel="Verify on Musaffa"
        >
          <FontAwesome name="external-link" size={10} color={colors.accentPrimary} />
          <Text style={[s.musaffaText, { color: colors.accentPrimary }]}>
            Verify on Musaffa.com
          </Text>
        </Pressable>
      )}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const s = StyleSheet.create({
  badge: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "flex-start",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    borderWidth: 1,
    gap: 5,
  },
  label: {
    fontSize: 11,
    fontWeight: "700",
  },
  detailBox: {
    marginTop: 6,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 4,
    gap: 6,
  },
  detailLabel: {
    flex: 1,
    fontSize: 12,
  },
  detailValue: {
    fontSize: 12,
    fontWeight: "600",
    minWidth: 50,
    textAlign: "right",
  },
  detailThreshold: {
    fontSize: 11,
    minWidth: 50,
    textAlign: "right",
  },
  musaffaLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    marginTop: 6,
    alignSelf: "flex-start",
  },
  musaffaText: {
    fontSize: 11,
    fontWeight: "600",
  },
});
