/**
 * ExtractionResultCard — Displays AI extraction results with audit
 * details and attribution prompt. Extracted from AiExtractionFlow.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import {
    ActivityIndicator,
    Pressable,
    Text,
    View,
} from "react-native";

import type { ThemePalette } from "@/constants/theme";
import type { StatementManagerState } from "../hooks/useStatementManager";
import { st } from "../styles";
import { STMNT_ICONS } from "../types";

interface ExtractionResultCardProps {
  uploadResult: NonNullable<StatementManagerState["uploadResult"]>;
  colors: ThemePalette;
  dismissResult: () => void;
  attributing: boolean;
  attributionDismissed: boolean;
  setAttributionDismissed: (v: boolean) => void;
  attributionResult: { message: string; corrections: number } | null;
  setAttributionResult: (v: { message: string; corrections: number } | null) => void;
  handleAttribution: () => void;
}

export function ExtractionResultCard({
  uploadResult, colors, dismissResult,
  attributing, attributionDismissed, setAttributionDismissed,
  attributionResult, setAttributionResult, handleAttribution,
}: ExtractionResultCardProps) {
  return (
    <View style={{
      marginTop: 10, padding: 12, borderRadius: 10,
      backgroundColor: colors.success + "10",
      borderWidth: 1, borderColor: colors.success + "30",
    }}>
      <View style={[st.rowCenter, { gap: 8 }]}>
        <FontAwesome name="check-circle" size={16} color={colors.success} />
        <Text style={{ color: colors.success, fontSize: 13, fontWeight: "700", flex: 1 }}>
          AI Vision Extraction Complete
        </Text>
        <Pressable onPress={dismissResult} hitSlop={8}>
          <FontAwesome name="times" size={14} color={colors.textMuted} />
        </Pressable>
      </View>
      {/* Summary metrics */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 12, marginTop: 10 }}>
        <View>
          <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "500" }}>Statements</Text>
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{uploadResult.statements.length}</Text>
        </View>
        <View>
          <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "500" }}>Confidence</Text>
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{Math.round(uploadResult.confidence * 100)}%</Text>
        </View>
        <View>
          <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "500" }}>Pages</Text>
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{uploadResult.pages_processed}</Text>
        </View>
        <View>
          <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "500" }}>Model</Text>
          <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{uploadResult.model}</Text>
        </View>
        <View>
          <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "500" }}>Audit</Text>
          <Text style={{ color: uploadResult.audit.checks_failed === 0 ? colors.success : colors.warning, fontSize: 14, fontWeight: "700" }}>
            {uploadResult.audit.checks_passed}/{uploadResult.audit.checks_total}
          </Text>
        </View>
      </View>
      {/* Per-statement chips */}
      <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
        {uploadResult.statements.map((s, i) => (
          <View key={i} style={{
            paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6,
            backgroundColor: (STMNT_ICONS[s.statement_type]?.color ?? "#6366f1") + "15",
          }}>
            <Text style={{
              color: STMNT_ICONS[s.statement_type]?.color ?? "#6366f1",
              fontSize: 10, fontWeight: "700", textTransform: "capitalize",
            }}>
              {s.statement_type} FY{s.fiscal_year} ({s.line_items_count} items · {s.currency})
            </Text>
          </View>
        ))}
      </View>
      {/* Audit details */}
      {uploadResult.audit.details.length > 0 && (
        <View style={{ marginTop: 8, gap: 3 }}>
          <Text style={{ fontSize: 10, fontWeight: "700", color: colors.textMuted }}>Audit Checks</Text>
          {uploadResult.audit.details.map((d, i) => (
            <View key={i} style={{ gap: 1 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <FontAwesome name={d.passed ? "check" : "times"} size={10} color={d.passed ? colors.success : colors.danger} />
                <Text style={{ fontSize: 10, color: colors.textSecondary, flex: 1 }}>
                  {d.statement_type} · {d.period} · {d.rule}
                </Text>
                <Text style={{ fontSize: 10, color: d.passed ? colors.textMuted : colors.danger }}>
                  {d.passed ? "OK" : `Exp: ${d.expected} / Act: ${d.actual}`}
                </Text>
              </View>
              {!d.passed && d.detail ? (
                <Text style={{ fontSize: 9, color: colors.danger, marginLeft: 14, fontFamily: "monospace" }}>
                  {d.detail}
                </Text>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {/* ── AI Attribution Prompt ─────────────────────────── */}
      {uploadResult.audit.checks_failed > 0 && !attributionDismissed && !attributionResult && (
        <View style={{
          marginTop: 10, padding: 12, borderRadius: 10,
          backgroundColor: colors.warning + "10",
          borderWidth: 1, borderColor: colors.warning + "30",
        }}>
          <View style={[st.rowCenter, { gap: 8 }]}>
            <FontAwesome name="lightbulb-o" size={16} color={colors.warning} />
            <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "600", flex: 1 }}>
              Some items may have attribution discrepancies. Would you like AI to review and fix the linking?
            </Text>
          </View>
          <View style={{ marginTop: 6, gap: 2 }}>
            {uploadResult.audit.details
              .filter((d) => !d.passed)
              .map((d, i) => (
                <View key={i} style={{ flexDirection: "row", alignItems: "flex-start", gap: 4, marginLeft: 24 }}>
                  <FontAwesome name="exclamation-triangle" size={9} color={colors.warning} style={{ marginTop: 2 }} />
                  <Text style={{ fontSize: 10, color: colors.textSecondary, flex: 1 }}>
                    {d.detail || `${d.statement_type} · ${d.period} · ${d.rule}: Exp ${d.expected} / Act ${d.actual}`}
                  </Text>
                </View>
              ))}
          </View>
          <View style={{ flexDirection: "row", gap: 10, marginTop: 10, justifyContent: "flex-end" }}>
            <Pressable
              onPress={() => setAttributionDismissed(true)}
              disabled={attributing}
              style={({ pressed }) => [{
                paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8,
                borderWidth: 1, borderColor: colors.borderColor,
                backgroundColor: pressed ? colors.bgInput : colors.bgCard,
              }]}
            >
              <Text style={{ fontSize: 12, fontWeight: "600", color: colors.textMuted }}>No</Text>
            </Pressable>
            <Pressable
              onPress={handleAttribution}
              disabled={attributing}
              style={({ pressed }) => [{
                paddingVertical: 8, paddingHorizontal: 16, borderRadius: 8,
                backgroundColor: pressed ? colors.accentPrimary + "CC" : colors.accentPrimary,
                flexDirection: "row", alignItems: "center", gap: 6,
              }]}
            >
              {attributing && <ActivityIndicator size={12} color="#fff" />}
              <Text style={{ fontSize: 12, fontWeight: "700", color: "#fff" }}>
                {attributing ? "Reviewing..." : "Yes, Fix with AI"}
              </Text>
            </Pressable>
          </View>
        </View>
      )}

      {/* ── Attribution Result ───────────────────────────── */}
      {attributionResult && (
        <View style={{
          marginTop: 10, padding: 12, borderRadius: 10,
          backgroundColor: (attributionResult.corrections > 0 ? colors.success : colors.accentPrimary) + "10",
          borderWidth: 1,
          borderColor: (attributionResult.corrections > 0 ? colors.success : colors.accentPrimary) + "30",
        }}>
          <View style={[st.rowCenter, { gap: 8 }]}>
            <FontAwesome
              name={attributionResult.corrections > 0 ? "check-circle" : "info-circle"}
              size={14}
              color={attributionResult.corrections > 0 ? colors.success : colors.accentPrimary}
            />
            <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "600", flex: 1 }}>
              {attributionResult.message}
            </Text>
            <Pressable onPress={() => setAttributionResult(null)} hitSlop={8}>
              <FontAwesome name="times" size={12} color={colors.textMuted} />
            </Pressable>
          </View>
        </View>
      )}
    </View>
  );
}
