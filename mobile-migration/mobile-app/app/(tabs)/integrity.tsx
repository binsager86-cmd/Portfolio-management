/**
 * Data Integrity — run integrity checks on portfolio data.
 *
 * Mirrors Streamlit's Data Integrity section with structured,
 * human-readable display of cash, position, snapshot, anomaly,
 * and completeness checks.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useCallback, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import { ReconciliationModal } from "@/components/portfolio/ReconciliationModal";
import type { ThemePalette } from "@/constants/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { useScreenStyles } from "@/hooks/useScreenStyles";
import { fmtNum } from "@/lib/currency";
import type { ReconciliationSummary } from "@/lib/reconciliation/utils";
import { buildReconciliationSummary } from "@/lib/reconciliation/utils";
import { checkCashIntegrity, getCashBalances, getDeposits, getTransactions, integrityCheck, setCashOverride } from "@/services/api";
import { useApplyReconciliation } from "@/services/api/reconciliation";
import { useThemeStore } from "@/services/themeStore";

function StatusBadge({ status, colors }: { status: boolean | null; colors: ThemePalette }) {
  const { t } = useTranslation();
  if (status === true)
    return (
      <View style={[s.badge, { backgroundColor: colors.success + "22" }]}>
        <FontAwesome name="check-circle" size={13} color={colors.success} />
        <Text style={[s.badgeText, { color: colors.success }]}>{t('integrity.pass')}</Text>
      </View>
    );
  if (status === false)
    return (
      <View style={[s.badge, { backgroundColor: colors.danger + "22" }]}>
        <FontAwesome name="times-circle" size={13} color={colors.danger} />
        <Text style={[s.badgeText, { color: colors.danger }]}>{t('integrity.fail')}</Text>
      </View>
    );
  return (
    <View style={[s.badge, { backgroundColor: "#f59e0b22" }]}>
      <FontAwesome name="question-circle" size={13} color="#f59e0b" />
      <Text style={[s.badgeText, { color: "#f59e0b" }]}>{t('integrity.na')}</Text>
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
  const { t } = useTranslation();
  if (!data) return null;
  const comp = data.components ?? {};
  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={s.cardHeader}>
        <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('integrity.cashBalance', { pf: portfolio })}</Text>
        <StatusBadge status={data.is_valid} colors={colors} />
      </View>
      <View style={s.detailGrid}>
        <DetailLine label={t('integrity.expected')} value={data.expected_balance ?? "—"} colors={colors} />
        <DetailLine label={t('integrity.stored')} value={data.stored_balance ?? "—"} colors={colors} />
        <DetailLine
          label={t('integrity.discrepancy')}
          value={data.discrepancy ?? "0.000"}
          valueColor={parseFloat(data.discrepancy ?? "0") > 0.01 ? colors.danger : colors.success}
          colors={colors}
        />
        <DetailLine label={t('integrity.tolerance')} value={data.tolerance ?? "0.01"} colors={colors} muted />
      </View>
      {comp && Object.keys(comp).length > 0 && (
        <View style={[s.compBox, { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor }]}>
          <Text style={[s.compTitle, { color: colors.textSecondary }]}>{t('integrity.components')}</Text>
          <DetailLine label={t('integrity.deposits')} value={comp.deposits ?? "0"} colors={colors} />
          <DetailLine label={t('integrity.buys')} value={comp.buys ?? "0"} colors={colors} />
          <DetailLine label={t('integrity.sells')} value={comp.sells ?? "0"} colors={colors} />
          <DetailLine label={t('integrity.dividendsLabel')} value={comp.dividends ?? "0"} colors={colors} />
          <DetailLine label={t('integrity.fees')} value={comp.fees ?? "0"} colors={colors} />
        </View>
      )}
    </View>
  );
}

// ── Position Result Section ─────────────────────────────────────────

function PositionSection({ portfolio, data, colors }: { portfolio: string; data: any; colors: ThemePalette }) {
  const { t } = useTranslation();
  if (!data) return null;
  const mismatches = data.mismatches ?? [];
  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={s.cardHeader}>
        <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('integrity.positionsTitle', { pf: portfolio })}</Text>
        <StatusBadge status={data.is_valid} colors={colors} />
      </View>
      <DetailLine label={t('integrity.totalSymbols')} value={data.total_symbols ?? 0} colors={colors} />
      <DetailLine label={t('integrity.matched')} value={data.matched ?? 0} colors={colors} />
      <DetailLine label={t('integrity.mismatches')} value={mismatches.length} valueColor={mismatches.length > 0 ? colors.danger : colors.success} colors={colors} />
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
  const { t } = useTranslation();
  if (!data) return null;
  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={s.cardHeader}>
        <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('integrity.snapshotsTitle', { pf: portfolio })}</Text>
        <StatusBadge status={data.is_valid} colors={colors} />
      </View>
      {!data.has_snapshots ? (
        <Text style={{ color: colors.textMuted, fontSize: 13 }}>{t('integrity.noSnapshots')}</Text>
      ) : (
        <>
          <DetailLine label={t('integrity.latestDate')} value={data.latest_date ?? "—"} colors={colors} />
          <DetailLine label={t('integrity.daysSince')} value={data.days_since_snapshot ?? "—"} colors={colors} />
          <DetailLine label={t('integrity.fresh')} value={data.is_fresh ? t('integrity.yes') : t('integrity.no')} valueColor={data.is_fresh ? colors.success : "#f59e0b"} colors={colors} />
          <DetailLine label={t('integrity.snapshotValue')} value={fmtNum(data.snapshot_value ?? 0, 3)} colors={colors} />
          <DetailLine label={t('integrity.liveValue')} value={fmtNum(data.live_value ?? 0, 3)} colors={colors} />
          <DetailLine label={t('integrity.drift')} value={`${(data.drift_pct ?? 0).toFixed(2)}%`} valueColor={(data.drift_pct ?? 0) > 5 ? colors.danger : colors.success} colors={colors} />
        </>
      )}
    </View>
  );
}

// ── Anomalies Section ───────────────────────────────────────────────

function AnomaliesSection({ data, colors }: { data: any; colors: ThemePalette }) {
  const { t } = useTranslation();
  if (!data) return null;
  const anomalies = data.anomalies ?? [];
  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={s.cardHeader}>
        <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('integrity.transactionAnomalies')}</Text>
        <StatusBadge status={data.is_valid} colors={colors} />
      </View>
      <DetailLine label={t('integrity.total')} value={data.count ?? 0} colors={colors} />
      <DetailLine label={t('integrity.errors')} value={data.errors ?? 0} valueColor={(data.errors ?? 0) > 0 ? colors.danger : colors.success} colors={colors} />
      <DetailLine label={t('integrity.warnings')} value={data.warnings ?? 0} valueColor={(data.warnings ?? 0) > 0 ? "#f59e0b" : colors.success} colors={colors} />
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
          {t('integrity.andMore', { count: anomalies.length - 20 })}
        </Text>
      )}
    </View>
  );
}

// ── Completeness Section ────────────────────────────────────────────

function CompletenessSection({ data, colors }: { data: any; colors: ThemePalette }) {
  const { t } = useTranslation();
  if (!data) return null;
  const issues = data.issues ?? [];
  return (
    <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={s.cardHeader}>
        <Text style={[s.cardTitle, { color: colors.textPrimary }]}>{t('integrity.dataCompleteness')}</Text>
        <StatusBadge status={data.is_valid} colors={colors} />
      </View>
      <DetailLine label={t('integrity.portfoliosFound')} value={data.portfolios_found ?? 0} colors={colors} />
      <DetailLine label={t('integrity.orphanSymbols')} value={data.orphan_symbols ?? 0} valueColor={(data.orphan_symbols ?? 0) > 0 ? "#f59e0b" : colors.success} colors={colors} />
      <DetailLine label={t('integrity.zeroPriceSymbols')} value={data.zero_price_symbols ?? 0} valueColor={(data.zero_price_symbols ?? 0) > 0 ? "#f59e0b" : colors.success} colors={colors} />
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
  const { t } = useTranslation();
  const { colors } = useThemeStore();
  const ss = useScreenStyles();
  const { isDesktop } = useResponsive();
  const [results, setResults] = useState<any>(null);
  const [cashResults, setCashResults] = useState<Record<string, any>>({});
  const [tab, setTab] = useState<IntegrityTab>("overview");

  // ── Reconciliation state ──────────────────────────────────────────
  const [reconVisible, setReconVisible] = useState(false);
  const [reconPortfolio, setReconPortfolio] = useState("KFH");
  const [reconSummary, setReconSummary] = useState<ReconciliationSummary | null>(null);
  const [reconLoading, setReconLoading] = useState(false);
  const queryClient = useQueryClient();
  const reconMutation = useApplyReconciliation(reconPortfolio);

  const checkMutation = useMutation({
    mutationFn: integrityCheck,
    onSuccess: (data) => setResults(data),
    onError: (err: any) => setResults({ error: err?.message ?? t('app.error') }),
  });

  const cashCheckMutation = useMutation({
    mutationFn: checkCashIntegrity,
    onSuccess: (data, portfolio) => {
      setCashResults((prev) => ({ ...prev, [portfolio]: data }));
    },
  });

  const overallStatus = results?.overall_valid;
  const summary = results?.summary;

  // ── Reconciliation handlers ───────────────────────────────────────
  const openReconciliation = useCallback(async (pf: string) => {
    setReconPortfolio(pf);
    setReconLoading(true);
    try {
      const [txnResp, depositResp, cashData] = await Promise.all([
        getTransactions({ portfolio: pf, per_page: 9999 }),
        getDeposits({ portfolio: pf, page_size: 9999 }),
        getCashBalances(true),
      ]);
      const transactions = txnResp.transactions.filter((t) => !t.is_deleted);
      const deposits = depositResp.deposits.filter((d) => !d.is_deleted);
      const manualTotal = depositResp.total_kwd;
      const computedCash = cashData[pf]?.balance ?? 0;

      const reconResult = buildReconciliationSummary(
        transactions, deposits, manualTotal, computedCash,
      );
      setReconSummary(reconResult);
      setReconVisible(true);
    } catch {
      // Silently fail — user can retry
    } finally {
      setReconLoading(false);
    }
  }, []);

  const handleReconApply = useCallback(
    async (flaggedIds: number[], openingAmount: number, openingDate: string) => {
      // Try backend endpoint first
      await reconMutation.mutateAsync({
        withdrawalIds: flaggedIds,
        openingBalanceAmount: openingAmount,
        openingBalanceDate: openingDate,
      });

      // If backend didn't apply, do it via cash override as fallback
      if (!reconMutation.data?.applied) {
        try {
          const ccy = reconPortfolio === "USA" ? "USD" : "KWD";
          const currentCash = reconSummary?.computedCashFromTxns ?? 0;
          await setCashOverride(reconPortfolio, currentCash + openingAmount, ccy);
        } catch {
          // Non-critical
        }
      }
      setReconVisible(false);
      setReconSummary(null);
    },
    [reconMutation, reconPortfolio, reconSummary],
  );

  const handleReconSkip = useCallback(() => {
    setReconVisible(false);
    setReconSummary(null);
  }, []);

  return (
    <ScrollView
      style={ss.container}
      contentContainerStyle={[ss.content, isDesktop && { maxWidth: 800, alignSelf: "center", width: "100%" }]}
    >
      <Text style={[ss.title, { marginBottom: 4 }]}>{t('integrity.title')}</Text>
      <Text style={[s.desc, { color: colors.textSecondary }]}>
        {t('integrity.description')}
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
          {checkMutation.isPending ? t('integrity.running') : t('integrity.runFullCheck')}
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
              {overallStatus === true ? t('integrity.allPassed') : overallStatus === false ? t('integrity.issuesDetected') : t('integrity.partialResults')}
            </Text>
            {summary && (
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                {t('integrity.summaryLine', { cash: summary.cash_checks, position: summary.position_checks, snapshot: summary.snapshot_checks })}
                {(summary.anomaly_errors ?? 0) > 0 ? t('integrity.summaryErrors', { count: summary.anomaly_errors }) : ""}
                {(summary.anomaly_warnings ?? 0) > 0 ? t('integrity.summaryWarnings', { count: summary.anomaly_warnings }) : ""}
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
                { key: "overview" as const, label: t('integrity.overview'), icon: "dashboard" as const },
                { key: "cash" as const, label: t('integrity.cash'), icon: "money" as const },
                { key: "positions" as const, label: t('integrity.positions'), icon: "bar-chart" as const },
              ]
            ).map((item) => (
              <Pressable
                key={item.key}
                onPress={() => setTab(item.key)}
                style={[
                  s.tabChip,
                  {
                    backgroundColor: tab === item.key ? colors.accentPrimary : colors.bgCard,
                    borderColor: colors.borderColor,
                  },
                ]}
              >
                <FontAwesome name={item.icon} size={12} color={tab === item.key ? "#fff" : colors.textSecondary} />
                <Text style={{ color: tab === item.key ? "#fff" : colors.textSecondary, fontSize: 13, fontWeight: "600" }}>
                  {item.label}
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
      <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{t('integrity.quickCashCheck')}</Text>
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

      {/* Cash Reconciliation */}
      <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>{t('reconciliation.sectionTitle')}</Text>
      <View style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <Text style={[s.desc, { color: colors.textSecondary, marginBottom: 10 }]}>
          {t('reconciliation.sectionDesc')}
        </Text>
        <View style={s.portfolioRow}>
          {["KFH", "BBYN", "USA"].map((pf) => (
            <Pressable
              key={pf}
              onPress={() => openReconciliation(pf)}
              disabled={reconLoading}
              style={({ pressed }) => [
                s.pfBtn,
                {
                  backgroundColor: colors.accentSecondary + "18",
                  borderColor: colors.accentSecondary + "44",
                  opacity: pressed || reconLoading ? 0.6 : 1,
                },
              ]}
            >
              <FontAwesome name="balance-scale" size={13} color={colors.accentSecondary} />
              <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>
                {reconLoading && reconPortfolio === pf ? t('reconciliation.loading') : pf}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      {/* Reconciliation Modal */}
      <ReconciliationModal
        visible={reconVisible}
        onClose={() => setReconVisible(false)}
        summary={reconSummary}
        portfolio={reconPortfolio}
        currency={reconPortfolio === "USA" ? "USD" : "KWD"}
        colors={colors}
        onApply={handleReconApply}
        onSkip={handleReconSkip}
        applying={reconMutation.isPending}
      />

      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

const s = StyleSheet.create({
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
