/**
 * KFH Trade Import Modal — shows preview of parsed statement + import button.
 */

import { extractErrorMessage } from "@/lib/errorHandling";
import type { ThemePalette } from "@/constants/theme";
import type { KfhImportPreview, KfhImportResult } from "@/lib/kfh/kfhTradeTypes";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    ActivityIndicator,
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

interface Props {
  visible: boolean;
  preview: KfhImportPreview | null;
  onClose: () => void;
  onImport: (preview: KfhImportPreview) => Promise<KfhImportResult>;
}

export default function KfhTradeImportModal({ visible, preview, onClose, onImport }: Props) {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<KfhImportResult | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });

  const handleImport = async () => {
    if (!preview) return;
    setImporting(true);
    setResult(null);
    try {
      const res = await onImport(preview);
      setResult(res);
    } catch (err: unknown) {
      setResult({
        imported: 0,
        skipped: 0,
        errors: 1,
        details: [extractErrorMessage(err, "Unknown error")],
      });
    } finally {
      setImporting(false);
    }
  };

  const handleClose = () => {
    setResult(null);
    setProgress({ current: 0, total: 0 });
    onClose();
  };

  if (!preview) return null;
  const c = preview.counts;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={s.backdrop} onPress={handleClose}>
        <Pressable
          style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
          onPress={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <View style={[s.header, { borderBottomColor: colors.borderColor }]}>
            <FontAwesome name="file-excel-o" size={20} color={colors.accentPrimary} />
            <View style={{ flex: 1 }}>
              <Text style={[s.title, { color: colors.textPrimary }]}>Import Preview</Text>
              <Text style={[s.subtitle, { color: colors.textMuted }]} numberOfLines={1}>
                {preview.fileName}
              </Text>
            </View>
            <Pressable onPress={handleClose} hitSlop={12}>
              <FontAwesome name="times" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView style={s.body}>
            {/* Result banner */}
            {result && (
              <View
                style={[
                  s.resultBanner,
                  {
                    backgroundColor:
                      result.errors > 0
                        ? colors.danger + "15"
                        : colors.success + "15",
                    borderColor:
                      result.errors > 0
                        ? colors.danger + "40"
                        : colors.success + "40",
                  },
                ]}
              >
                <FontAwesome
                  name={result.errors > 0 ? "exclamation-triangle" : "check-circle"}
                  size={16}
                  color={result.errors > 0 ? colors.danger : colors.success}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[s.resultText, { color: colors.textPrimary }]}>
                    {result.imported} imported, {result.skipped} skipped, {result.errors} errors
                  </Text>
                  {result.details.length > 0 && (
                    <Text style={[s.resultDetail, { color: colors.textMuted }]} numberOfLines={5}>
                      {result.details.slice(0, 5).join("\n")}
                    </Text>
                  )}
                </View>
              </View>
            )}

            {/* Bonus shares reminder — shown after successful import */}
            {result && result.imported > 0 && (
              <View
                style={[
                  s.bonusNotice,
                  {
                    backgroundColor: colors.accentPrimary + "12",
                    borderColor: colors.accentPrimary + "40",
                  },
                ]}
              >
                <FontAwesome name="info-circle" size={16} color={colors.accentPrimary} />
                <View style={{ flex: 1 }}>
                  <Text style={[s.bonusTitle, { color: colors.textPrimary }]}>
                    {t("kfhImport.bonusSharesTitle")}
                  </Text>
                  <Text style={[s.bonusText, { color: colors.textSecondary }]}>
                    {t("kfhImport.bonusSharesMessage")}
                  </Text>
                </View>
              </View>
            )}

            {/* Summary stats */}
            <View style={[s.statsBox, { borderColor: colors.borderColor }]}>
              <StatRow label="Total rows parsed" value={preview.totalRows} color={colors.textPrimary} colors={colors} />
              <StatRow label="Ready to import" value={preview.readyRows.length} color={colors.success} colors={colors} bold />
              <StatRow label="Ignored" value={c.ignored} color={colors.warning} colors={colors} />
              <StatRow label="Errors" value={c.errors} color={colors.danger} colors={colors} />
              <StatRow label="Duplicates" value={c.duplicates} color={colors.textMuted} colors={colors} />
            </View>

            {/* Ready breakdown */}
            {preview.readyRows.length > 0 && (
              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
                  Ready to Import
                </Text>
                <View style={[s.breakdownBox, { borderColor: colors.borderColor }]}>
                  <BreakdownRow icon="arrow-down" label="Buys" count={c.buys} color={colors.danger} colors={colors} />
                  <BreakdownRow icon="arrow-up" label="Sells" count={c.sells} color={colors.success} colors={colors} />
                  <BreakdownRow icon="money" label="Cash Dividends" count={c.cashDividends} color={colors.accentPrimary} colors={colors} />
                  <BreakdownRow icon="bank" label="Deposits" count={c.deposits} color={colors.success} colors={colors} />
                  <BreakdownRow icon="sign-out" label="Withdrawals" count={c.withdrawals} color={colors.warning} colors={colors} />
                </View>
              </View>
            )}

            {/* Ignored rows */}
            {preview.ignoredRows.length > 0 && (
              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
                  Ignored ({preview.ignoredRows.length})
                </Text>
                <View style={[s.detailBox, { borderColor: colors.borderColor }]}>
                  {groupByReason(preview.ignoredRows).map(([reason, count]) => (
                    <View key={reason} style={s.detailRow}>
                      <Text style={[s.detailReason, { color: colors.textMuted }]}>{reason}</Text>
                      <Text style={[s.detailCount, { color: colors.warning }]}>{count}</Text>
                    </View>
                  ))}
                </View>
              </View>
            )}

            {/* Duplicate rows */}
            {preview.duplicateRows.length > 0 && (
              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
                  Duplicates ({preview.duplicateRows.length})
                </Text>
                <Text style={[s.detailHint, { color: colors.textMuted }]}>
                  These rows appear to already be imported or are repeated in the file.
                </Text>
              </View>
            )}

            {/* Error rows */}
            {preview.errorRows.length > 0 && (
              <View style={s.section}>
                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
                  Errors ({preview.errorRows.length})
                </Text>
                <View style={[s.detailBox, { borderColor: colors.borderColor }]}>
                  {preview.errorRows.slice(0, 10).map((row, i) => (
                    <View key={i} style={s.detailRow}>
                      <Text style={[s.detailReason, { color: colors.danger }]} numberOfLines={2}>
                        {row.errorReason}
                      </Text>
                    </View>
                  ))}
                  {preview.errorRows.length > 10 && (
                    <Text style={[s.detailHint, { color: colors.textMuted }]}>
                      ... and {preview.errorRows.length - 10} more
                    </Text>
                  )}
                </View>
              </View>
            )}
          </ScrollView>

          {/* Actions */}
          <View style={[s.footer, { borderTopColor: colors.borderColor }]}>
            <Pressable
              onPress={handleClose}
              style={[s.btn, { borderColor: colors.borderColor }]}
            >
              <Text style={[s.btnText, { color: colors.textSecondary }]}>
                {result ? "Close" : "Cancel"}
              </Text>
            </Pressable>

            {!result && (
              <Pressable
                onPress={handleImport}
                disabled={importing || preview.readyRows.length === 0}
                style={[
                  s.btn,
                  s.importBtn,
                  {
                    backgroundColor: colors.accentPrimary,
                    opacity: importing || preview.readyRows.length === 0 ? 0.5 : 1,
                  },
                ]}
              >
                {importing ? (
                  <ActivityIndicator size="small" color="#fff" />
                ) : (
                  <FontAwesome name="download" size={14} color="#fff" />
                )}
                <Text style={s.importBtnText}>
                  {importing
                    ? `Importing...`
                    : `Import ${preview.readyRows.length} rows`}
                </Text>
              </Pressable>
            )}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Sub-components ──────────────────────────────────────────────────

function StatRow({
  label,
  value,
  color,
  colors,
  bold,
}: {
  label: string;
  value: number;
  color: string;
  colors: ThemePalette;
  bold?: boolean;
}) {
  return (
    <View style={s.statRow}>
      <Text style={[s.statLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[s.statValue, { color, fontWeight: bold ? "700" : "500" }]}>{value}</Text>
    </View>
  );
}

function BreakdownRow({
  icon,
  label,
  count,
  color,
  colors,
}: {
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  label: string;
  count: number;
  color: string;
  colors: ThemePalette;
}) {
  if (count === 0) return null;
  return (
    <View style={s.breakdownRow}>
      <FontAwesome name={icon} size={12} color={color} style={{ width: 18 }} />
      <Text style={[s.breakdownLabel, { color: colors.textSecondary }]}>{label}</Text>
      <Text style={[s.breakdownCount, { color }]}>{count}</Text>
    </View>
  );
}

function groupByReason(rows: { ignoreReason: string | null }[]): [string, number][] {
  const map = new Map<string, number>();
  for (const r of rows) {
    const key = r.ignoreReason ?? "Unknown";
    map.set(key, (map.get(key) ?? 0) + 1);
  }
  return Array.from(map.entries()).sort((a, b) => b[1] - a[1]);
}

// ── Styles ──────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    maxWidth: 540,
    width: "100%",
    maxHeight: "85%",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    borderBottomWidth: 1,
  },
  title: { fontSize: 16, fontWeight: "700" },
  subtitle: { fontSize: 12, marginTop: 2 },
  body: { padding: 16 },
  resultBanner: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  resultText: { fontSize: 13, fontWeight: "600" },
  resultDetail: { fontSize: 11, marginTop: 4, lineHeight: 16 },
  bonusNotice: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 10,
    padding: 12,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 16,
  },
  bonusTitle: { fontSize: 13, fontWeight: "700", marginBottom: 2 },
  bonusText: { fontSize: 12, lineHeight: 18 },
  statsBox: { borderWidth: 1, borderRadius: 10, padding: 12, gap: 8, marginBottom: 16 },
  statRow: { flexDirection: "row", justifyContent: "space-between" },
  statLabel: { fontSize: 13 },
  statValue: { fontSize: 13 },
  section: { marginBottom: 16 },
  sectionTitle: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
  breakdownBox: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 6 },
  breakdownRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  breakdownLabel: { flex: 1, fontSize: 12 },
  breakdownCount: { fontSize: 13, fontWeight: "700", minWidth: 24, textAlign: "right" },
  detailBox: { borderWidth: 1, borderRadius: 10, padding: 10, gap: 6 },
  detailRow: { flexDirection: "row", justifyContent: "space-between", gap: 8 },
  detailReason: { fontSize: 12, flex: 1 },
  detailCount: { fontSize: 12, fontWeight: "600", minWidth: 20, textAlign: "right" },
  detailHint: { fontSize: 11, marginTop: 4 },
  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 10,
    padding: 16,
    borderTopWidth: 1,
  },
  btn: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { fontSize: 13, fontWeight: "600" },
  importBtn: {
    flexDirection: "row",
    gap: 8,
    borderWidth: 0,
  },
  importBtnText: { color: "#fff", fontSize: 13, fontWeight: "700" },
});
