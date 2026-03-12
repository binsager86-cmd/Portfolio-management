/**
 * KPI display widgets for portfolio analysis — card and chip variants.
 */

import React from "react";
import { View, Text, StyleSheet } from "react-native";
import type { ThemePalette } from "@/constants/theme";

export const KpiCard = React.memo(function KpiCard({ label, value, suffix, color, colors }: {
  label: string; value: string | number; suffix?: string; color?: string; colors: ThemePalette;
}) {
  return (
    <View style={[k.kpiCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <Text style={[k.kpiLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[k.kpiValue, { color: color ?? colors.textPrimary }]}>
        {value}
        {suffix ? <Text style={k.kpiSuffix}>{suffix}</Text> : null}
      </Text>
    </View>
  );
});

export const KpiChip = React.memo(function KpiChip({ label, value, valueColor, colors }: {
  label: string; value: string; valueColor?: string; colors: ThemePalette;
}) {
  return (
    <View style={k.kpiChip}>
      <Text style={[k.kpiChipLabel, { color: colors.textMuted }]}>{label}</Text>
      <Text style={[k.kpiChipValue, { color: valueColor ?? colors.textPrimary }]} numberOfLines={1}>{value}</Text>
    </View>
  );
});

export const kpiStyles = StyleSheet.create({
  kpiGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  kpiRow: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: 16, paddingVertical: 10, gap: 12, borderBottomWidth: 1 },
});

const k = StyleSheet.create({
  kpiCard: { minWidth: 140, flex: 1, paddingHorizontal: 14, paddingVertical: 12, borderRadius: 12, borderWidth: 1 },
  kpiLabel: { fontSize: 12, marginBottom: 4 },
  kpiValue: { fontSize: 18, fontWeight: "700" },
  kpiSuffix: { fontSize: 12, fontWeight: "400" },
  kpiChip: { minWidth: 100 },
  kpiChipLabel: { fontSize: 11, marginBottom: 2 },
  kpiChipValue: { fontSize: 13, fontWeight: "700" },
});
