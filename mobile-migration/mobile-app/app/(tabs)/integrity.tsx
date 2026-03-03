/**
 * Data Integrity — run integrity checks on portfolio data.
 *
 * Mirrors Streamlit's Data Integrity section with structured,
 * human-readable display of cash, position, snapshot, anomaly,
 * and completeness checks.
 */

import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
} from "react-native";
import { useMutation } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { integrityCheck, checkCashIntegrity } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import type { ThemePalette } from "@/constants/theme";

// ── Helpers ─────────────────────────────────────────────────────────

function fmtNum(n: number, decimals = 3): string {
  return n.toLocaleString(undefined, {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function StatusBadge({ status, colors }: { status: boolean | null; colors: ThemePalette }) {
  if (status === true)
    return (
      <View style={[s.badge, { backgroundColor: colors.success + "22" }]}>
        <FontAwesome name="check-circle" size={13} color={colors.success} />
        <Text style={[s.badgeText, { color: colors.success }]}>PASS</Text>
      </View>
    );
  if (status === false)
    return (
      <View style={[s.badge, { backgroundColor: colors.danger + "22" }]}>
        <FontAwesome name="times-circle" size={13} color={colors.danger} />
        <Text style={[s.badgeText, { color: colors.danger }]}>FAIL</Text>
      </View>
    );
  return (
    <View style={[s.badge, { backgroundColor: "#f59e0b22" }]}>
      <FontAwesome name="question-circle" size={13} color="#f59e0b" />
      <Text style={[s.badgeText, { color: "#f59e0b" }]}>N/A</Text>
    </View>
  );
}

function SeverityIcon({ severity, colors }: { severity: string; colors: ThemePalette }) {
  if (severity === "error")
    return <FontAwesome name="times-circle" size={14} color={colors.danger} style={{ marginRight: 8 }} />;
  if (severity === "warning")
    return <FontAwesome name="exclamation-triangle" size={14} color="#f59e0b" style={{ marginRight: 8 }} />;
  return <FontAwesome name="info-circle" size={14} color={colors.accentPrimary} style={{ marginRight: 8 }} />;
}

function DetailLine({
  label,
  value,
  valueColor,
  colors,
  muted,
}: {
  label: string;
  value: string | number;
  valueColor?: string;
  colors: ThemePalette;
  muted?: boolean;
}) {
  return (
    <View style={s.detailRow}>
      <Text style={[s.detailLabel, { color: muted ? colors.textMuted : colors.textSecondary }]}>{label}</Text>
      <Text style={[s.detailValue, { color: valueColor ?? colors.textPrimary }]}>{String(value)}</Text>
    </View>
  );
}

// ── Cash Result Card ────────────────────────────────────────────────

function CashResultCard({ portfolio, data, colors }: { portfolio: string; data: any; colors: ThemePalette }) {
  if (!data) return null;
  const comp = data.components ?? {};
  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={s.cardHeader}>
        <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{portfolio} Cash Balance</Text>
        <StatusBadge status={data.is_valid} colors={colors} />
      </View>
      <View style={s.detailGrid}>
        <DetailLine label="Expected" value={data.expected_balance ?? "—"} colors={colors} />
        <DetailLine label="Stored" value={data.stored_balance ?? "—"} colors={colors} />
        <DetailLine
          label="Discrepancy"
          value={data.discrepancy ?? "0.000"}
          valueColor={parseFloat(data.discrepancy ?? "0") > 0.01 ? colors.danger : colors.success}
          colors={colors}
        />
        <DetailLine label="Tolerance" value={data.tolerance ?? "0.01"} colors={colors} muted />
      </View>
      {comp && Object.keys(comp).length > 0 && (
        <View style={[s.compBox, { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor }]}>
          <Text style={[s.compTitle, { color: colors.textSecondary }]}>Components</Text>
          <DetailLine label="Deposits" value={comp.deposits ?? "0"} colors={colors} />
          <DetailLine label="Buys" value={comp.buys ?? "0"} colors={colors} />
          <DetailLine label="Sells" value={comp.sells ?? "0"} colors={colors} />
          <DetailLine label="Dividends" value={comp.dividends ?? "0"} colors={colors} />
          <DetailLine label="Fees" value={comp.fees ?? "0"} colors={colors} />
        </View>
      )}
    </View>
  );
}

// ── Position Result Section ─────────────────────────────────────────

function PositionSection({ portfolio, data, colors }: { portfolio: string; data: any; colors: ThemePalette }) {
  if (!data) return null;
  const mismatches = data.mismatches ?? [];
  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={s.cardHeader}>
        <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{portfolio} Positions</Text>
        <StatusBadge status={data.is_valid} colors={colors} />
      </View>
      <DetailLine label="Total Symbols" value={data.total_symbols ?? 0} colors={colors} />
      <DetailLine label="Matched" value={data.matched ?? 0} colors={colors} />
      <DetailLine label="Mismatches" value={mismatches.length} valueColor={mismatches.length > 0 ? colors.danger : colors.success} colors={colors} />
      {mismatches.map((m: any, i: number) => (
        <View key={i} style={[s.issueRow, { borderTopColor: colors.borderColor }]}>
          <SeverityIcon severity="error" colors={colors} />
          <Text style={[s.issueText, { color: colors.textPrimary }]}>
            {m.symbol}: Agg={m.agg_shares} vs WAC={m.wac_shares} (diff={m.share_diff})
          </Text>
        </View>
      ))}
    </View>
  );
}

// ── Snapshot Result Section ─────────────────────────────────────────

function SnapshotSection({ portfolio, data, colors }: { portfolio: string; data: any; colors: ThemePalette }) {
  if (!data) return null;
  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={s.cardHeader}>
        <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{portfolio} Snapshots</Text>
        <StatusBadge status={data.is_valid} colors={colors} />
      </View>
      {!data.has_snapshots ? (
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>No snapshots found</Text>
      ) : (
        <>
          <DetailLine label="Latest Date" value={data.latest_date ?? "—"} colors={colors} />
          <DetailLine label="Days Since" value={data.days_since_snapshot ?? "—"} colors={colors} />
          <DetailLine label="Fresh?" value={data.is_fresh ? "Yes" : "No"} valueColor={data.is_fresh ? colors.success : "#f59e0b"} colors={colors} />
          <DetailLine label="Snapshot Value" value={fmtNum(data.snapshot_value ?? 0)} colors={colors} />
          <DetailLine label="Live Value" value={fmtNum(data.live_value ?? 0)} colors={colors} />
          <DetailLine label="Drift" value={`${(data.drift_pct ?? 0).toFixed(2)}%`} valueColor={(data.drift_pct ?? 0) > 5 ? colors.danger : colors.success} colors={colors} />
        </>
      )}
    </View>
  );
}

// ── Anomalies Section ───────────────────────────────────────────────

function AnomaliesSection({ data, colors }: { data: any; colors: ThemePalette }) {
  if (!data) return null;
  const anomalies = data.anomalies ?? [];
  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={s.cardHeader}>
        <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Transaction Anomalies</Text>
        <StatusBadge status={data.is_valid} colors={colors} />
      </View>
      <DetailLine label="Total" value={data.count ?? 0} colors={colors} />
      <DetailLine label="Errors" value={data.errors ?? 0} valueColor={(data.errors ?? 0) > 0 ? colors.danger : colors.success} colors={colors} />
      <DetailLine label="Warnings" value={data.warnings ?? 0} valueColor={(data.warnings ?? 0) > 0 ? "#f59e0b" : colors.success} colors={colors} />
      {anomalies.slice(0, 20).map((a: any, i: number) => (
        <View key={i} style={[s.issueRow, { borderTopColor: colors.borderColor }]}>
          <SeverityIcon severity={a.severity} colors={colors} />
          <View style={{ flex: 1 }}>
            <Text style={[s.issueText, { color: colors.textPrimary }]}>{a.detail}</Text>
            <Text style={{ color: colors.textMuted, fontSize: 11 }}>ID: {a.txn_id} · {a.type}</Text>
          </View>
        </View>
      ))}
      {anomalies.length > 20 && (
        <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 6 }}>
          ...and {anomalies.length - 20} more
        </Text>
      )}
    </View>
  );
}

// ── Completeness Section ────────────────────────────────────────────

function CompletenessSection({ data, colors }: { data: any; colors: ThemePalette }) {
  if (!data) return null;
  const issues = data.issues ?? [];
  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={s.cardHeader}>
        <Text style={[s.cardTitle, { color: colors.textPrimary }]}>Data Completeness</Text>
        <StatusBadge status={data.is_valid} colors={colors} />
      </View>
      <DetailLine label="Portfolios Found" value={data.portfolios_found ?? 0} colors={colors} />
      <DetailLine label="Orphan Symbols" value={data.orphan_symbols ?? 0} valueColor={(data.orphan_symbols ?? 0) > 0 ? "#f59e0b" : colors.success} colors={colors} />
      <DetailLine label="Zero-Price Symbols" value={data.zero_price_symbols ?? 0} valueColor={(data.zero_price_symbols ?? 0) > 0 ? "#f59e0b" : colors.success} colors={colors} />
      {issues.map((issue: any, i: number) => (
        <View key={i} style={[s.issueRow, { borderTopColor: colors.borderColor }]}>
          <SeverityIcon severity={issue.severity} colors={colors} />
          <Text style={[s.issueText, { color: colors.textPrimary }]}>{issue.detail}</Text>
        </View>
      ))}
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────

type IntegrityTab = "cash" | "positions" | "overview";

export default function IntegrityScreen() {
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();
  const [results, setResults] = useState<any>(null);
  const [cashResults, setCashResults] = useState<Record<string, any>>({});
  const [tab, setTab] = useState<IntegrityTab>("overview");

  const checkMutation = useMutation({
    mutationFn: integrityCheck,
    onSuccess: (data) => setResults(data),
    onError: (err: any) => setResults({ error: err?.message ?? "Check failed" }),
  });

  const cashCheckMutation = useMutation({
    mutationFn: checkCashIntegrity,
    onSuccess: (data, portfolio) => {
      setCashResults((prev) => ({ ...prev, [portfolio]: data }));
    },
  });

  const overallStatus = results?.overall_valid;
  const summary = results?.summary;

  return (
    <ScrollView
      style={[s.container, { backgroundColor: colors.bgPrimary }]}
      contentContainerStyle={[s.content, isDesktop && { maxWidth: 800, alignSelf: "center", width: "100%" }]}
    >
      <Text style={[s.title, { color: colors.textPrimary }]}>Data Integrity</Text>
      <Text style={[s.desc, { color: colors.textSecondary }]}>
        Run automated checks to detect data inconsistencies, missing records, and calculation errors.
      </Text>

      {/* Run Full Check */}
      <Pressable
        onPress={() => checkMutation.mutate()}
        disabled={checkMutation.isPending}
        style={({ pressed }) => [
          s.runBtn,
          {
            backgroundColor: colors.accentPrimary,
            opacity: pressed || checkMutation.isPending ? 0.6 : 1,
          },
        ]}
      >
        <FontAwesome name="stethoscope" size={18} color="#fff" />
        <Text style={s.runBtnText}>
          {checkMutation.isPending ? "Running checks..." : "Run Full Integrity Check"}
        </Text>
      </Pressable>

      {/* Overall Status Banner */}
      {results && !results.error && (
        <View
          style={[
            s.overallBanner,
            {
              backgroundColor:
                overallStatus === true
                  ? colors.success + "18"
                  : overallStatus === false
                  ? colors.danger + "18"
                  : "#f59e0b18",
              borderColor:
                overallStatus === true
                  ? colors.success
                  : overallStatus === false
                  ? colors.danger
                  : "#f59e0b",
            },
          ]}
        >
          <FontAwesome
            name={overallStatus === true ? "check-circle" : overallStatus === false ? "times-circle" : "question-circle"}
            size={20}
            color={overallStatus === true ? colors.success : overallStatus === false ? colors.danger : "#f59e0b"}
          />
          <View style={{ flex: 1 }}>
            <Text style={[s.overallTitle, { color: colors.textPrimary }]}>
              {overallStatus === true ? "All Checks Passed" : overallStatus === false ? "Issues Detected" : "Partial Results"}
            </Text>
            {summary && (
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                {summary.cash_checks} cash · {summary.position_checks} position · {summary.snapshot_checks} snapshot checks
                {(summary.anomaly_errors ?? 0) > 0 ? ` · ${summary.anomaly_errors} errors` : ""}
                {(summary.anomaly_warnings ?? 0) > 0 ? ` · ${summary.anomaly_warnings} warnings` : ""}
              </Text>
            )}
          </View>
        </View>
      )}

      {results?.error && (
        <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.danger }]}>
          <Text style={{ color: colors.danger, fontWeight: "600" }}>{results.error}</Text>
        </View>
      )}

      {/* Tabs */}
      {results && !results.error && (
        <>
          <View style={s.tabRow}>
            {(
              [
                { key: "overview", label: "Overview", icon: "dashboard" },
                { key: "cash", label: "Cash", icon: "money" },
                { key: "positions", label: "Positions", icon: "bar-chart" },
              ] as const
            ).map((t) => (
              <Pressable
                key={t.key}
                onPress={() => setTab(t.key)}
                style={[
                  s.tabChip,
                  {
                    backgroundColor: tab === t.key ? colors.accentPrimary : colors.bgCard,
                    borderColor: colors.borderColor,
                  },
                ]}
              >
                <FontAwesome name={t.icon} size={12} color={tab === t.key ? "#fff" : colors.textSecondary} />
                <Text style={{ color: tab === t.key ? "#fff" : colors.textSecondary, fontSize: 13, fontWeight: "600" }}>
                  {t.label}
                </Text>
              </Pressable>
            ))}
          </View>

          {tab === "overview" && (
            <>
              <AnomaliesSection data={results.anomalies} colors={colors} />
              <CompletenessSection data={results.completeness} colors={colors} />
              {Object.entries(results.snapshots ?? {}).map(([pf, data]) => (
                <SnapshotSection key={pf} portfolio={pf} data={data} colors={colors} />
              ))}
            </>
          )}

          {tab === "cash" && (
            <>
              {Object.entries(results.cash ?? {}).map(([pf, data]) => (
                <CashResultCard key={pf} portfolio={pf} data={data} colors={colors} />
              ))}
            </>
          )}

          {tab === "positions" && (
            <>
              {Object.entries(results.positions ?? {}).map(([pf, data]) => (
                <PositionSection key={pf} portfolio={pf} data={data} colors={colors} />
              ))}
            </>
          )}
        </>
      )}

      {/* Quick Cash Checks */}
      <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>Quick Cash Check</Text>
      <View style={s.portfolioRow}>
        {["KFH", "BBYN", "USA"].map((pf) => (
          <Pressable
            key={pf}
            onPress={() => cashCheckMutation.mutate(pf)}
            style={[s.pfBtn, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
          >
            <FontAwesome name="money" size={14} color={colors.accentPrimary} />
            <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>{pf}</Text>
          </Pressable>
        ))}
      </View>

      {Object.entries(cashResults).map(([pf, data]) => (
        <CashResultCard key={pf} portfolio={pf} data={data} colors={colors} />
      ))}

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
  container: { flex: 1 },
  content: { padding: 16 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 4 },
  desc: { fontSize: 14, marginBottom: 16 },
  sectionTitle: { fontSize: 18, fontWeight: "700", marginTop: 20, marginBottom: 10 },

  runBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 10,
    paddingVertical: 14,
    borderRadius: 12,
    marginBottom: 12,
  },
  runBtnText: { color: "#fff", fontSize: 15, fontWeight: "700" },

  overallBanner: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 16,
    borderRadius: 12,
    borderWidth: 2,
    marginBottom: 12,
  },
  overallTitle: { fontSize: 16, fontWeight: "700" },

  tabRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  tabChip: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
  },

  portfolioRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 12,
  },
  pfBtn: {
    flexDirection: "row",
    gap: 6,
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
  },

  card: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 10,
  },
  cardTitle: { fontSize: 15, fontWeight: "700" },

  badge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
  },
  badgeText: { fontSize: 11, fontWeight: "700" },

  detailGrid: { gap: 2 },
  detailRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  detailLabel: { fontSize: 13 },
  detailValue: { fontSize: 13, fontWeight: "600" },

  compBox: {
    marginTop: 10,
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  compTitle: { fontSize: 12, fontWeight: "700", marginBottom: 4 },

  issueRow: {
    flexDirection: "row",
    alignItems: "flex-start",
    paddingVertical: 6,
    borderTopWidth: StyleSheet.hairlineWidth,
    marginTop: 4,
  },
  issueText: { fontSize: 13, flex: 1 },
});
