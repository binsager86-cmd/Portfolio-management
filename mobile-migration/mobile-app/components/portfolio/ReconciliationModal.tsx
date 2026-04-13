/**
 * Reconciliation Modal — displays cash discrepancy details, flagged
 * income-harvesting withdrawals, and a dynamic opening-balance preview.
 *
 * Triggered from CashBalancesSection or IntegrityScreen when the computed
 * vs manual cash discrepancy exceeds a threshold.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Modal,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

import type { ThemePalette } from "@/constants/theme";
import { useResponsive } from "@/hooks/useResponsive";
import { fmtNum } from "@/lib/currency";
import type {
    IncomeHarvestingResult,
    OrphanedSellResult,
    ReconciliationSummary,
} from "@/lib/reconciliation/utils";
import type { CashDepositRecord } from "@/services/api/types";

// ── Props ───────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  onClose: () => void;
  /** Pre-computed reconciliation summary from the parent. */
  summary: ReconciliationSummary | null;
  /** Portfolio name being reconciled (e.g. "KFH"). */
  portfolio: string;
  /** Currency for formatting. */
  currency?: string;
  colors: ThemePalette;
  /** Called when user clicks "Apply". Parent handles the mutation. */
  onApply: (flaggedIds: number[], openingBalanceAmount: number, openingBalanceDate: string) => void;
  /** Called when user confirms deletion of flagged items. Receives deposit IDs (withdrawals) and transaction IDs (orphaned sells) separately. */
  onDeleteTransactions?: (depositIds: number[], txnIds: number[]) => void;
  /** Called when user clicks "Skip". */
  onSkip?: () => void;
  /** Whether the apply mutation is in progress. */
  applying?: boolean;
  /** Whether a delete operation is in progress. */
  deleting?: boolean;
}

// ── Component ───────────────────────────────────────────────────────

export function ReconciliationModal({
  visible,
  onClose,
  summary,
  portfolio,
  currency = "KWD",
  colors,
  onApply,
  onDeleteTransactions,
  onSkip,
  applying = false,
  deleting = false,
}: Props) {
  const { t } = useTranslation();
  const { isDesktop } = useResponsive();

  // User can toggle individual withdrawal flags
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  // User can toggle individual orphaned sells for deletion
  const [selectedSellIds, setSelectedSellIds] = useState<Set<number>>(new Set());
  // Step: 'review' (default) → 'confirmDelete' (confirmation before deletion)
  const [step, setStep] = useState<"review" | "confirmDelete">("review");

  // Initialise selection when summary changes — pre-select ALL withdrawals
  React.useEffect(() => {
    if (summary) {
      setSelectedIds(new Set((summary.allWithdrawals ?? []).map((w) => w.id)));
      setSelectedSellIds(new Set((summary.orphanedSells ?? []).map((s) => s.transaction.id)));
      setStep("review");
    }
  }, [summary]);

  const toggleId = useCallback((id: number) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const toggleSellId = useCallback((id: number) => {
    setSelectedSellIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  // Re-derive opening balance based on current selection
  const effectiveOpeningBalance = useMemo(() => {
    if (!summary) return 0;
    return summary.suggestedOpeningBalance.amount;
  }, [summary]);

  const handleApply = useCallback(() => {
    if (!summary) return;
    onApply(
      Array.from(selectedIds),
      effectiveOpeningBalance,
      summary.suggestedOpeningBalance.date,
    );
  }, [summary, selectedIds, effectiveOpeningBalance, onApply]);

  // Total items selected for deletion (withdrawals + orphaned sells)
  const totalDeletions = selectedIds.size + selectedSellIds.size;

  const handleProceedToDelete = useCallback(() => {
    if (totalDeletions === 0) return;
    setStep("confirmDelete");
  }, [totalDeletions]);

  const handleConfirmDelete = useCallback(() => {
    if (!onDeleteTransactions) return;
    const depositIds = Array.from(selectedIds);   // withdrawal deposit IDs
    const txnIds = Array.from(selectedSellIds);   // orphaned sell transaction IDs
    onDeleteTransactions(depositIds, txnIds);
  }, [selectedIds, selectedSellIds, onDeleteTransactions]);

  if (!summary) return null;

  const discSign = summary.discrepancy >= 0 ? "+" : "";
  const discColor =
    Math.abs(summary.discrepancyPct) > 5 ? colors.danger : colors.warning;

  return (
    <Modal
      visible={visible}
      animationType="fade"
      transparent
      onRequestClose={onClose}
    >
      <View style={ms.overlay}>
        <View
          style={[
            ms.dialog,
            {
              backgroundColor: colors.bgCard,
              borderColor: colors.borderColor,
              maxWidth: isDesktop ? 580 : "92%",
            },
          ]}
        >
          {/* Header */}
          <View style={ms.header}>
            <View style={{ flex: 1 }}>
              <Text style={[ms.title, { color: colors.textPrimary }]}>
                <FontAwesome name="balance-scale" size={16} color={colors.accentPrimary} />{" "}
                {t("reconciliation.title")}
              </Text>
              <Text style={[ms.subtitle, { color: colors.textSecondary }]}>
                {t("reconciliation.subtitle", { portfolio })}
              </Text>
            </View>
            <Pressable onPress={onClose} hitSlop={12}>
              <FontAwesome name="times" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView
            style={{ maxHeight: 460 }}
            contentContainerStyle={{ paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
          >
            {step === "review" ? (
              <>
                {/* Discrepancy Summary */}
                <View
                  style={[
                    ms.summaryCard,
                    { backgroundColor: discColor + "12", borderColor: discColor + "44" },
                  ]}
                >
                  <Text style={[ms.summaryLabel, { color: colors.textSecondary }]}>
                    {t("reconciliation.manualDeposits")}
                  </Text>
                  <Text style={[ms.summaryValue, { color: colors.textPrimary }]}>
                    {fmtNum(summary.manualTotalDeposits, 3)} {currency}
                  </Text>

                  <Text style={[ms.summaryLabel, { color: colors.textSecondary, marginTop: 6 }]}>
                    {t("reconciliation.computedCash")}
                  </Text>
                  <Text style={[ms.summaryValue, { color: colors.textPrimary }]}>
                    {fmtNum(summary.computedCashFromTxns, 3)} {currency}
                  </Text>

                  <View style={ms.discRow}>
                    <Text style={[ms.discLabel, { color: discColor }]}>
                      {t("reconciliation.discrepancy")}
                    </Text>
                    <Text style={[ms.discValue, { color: discColor }]}>
                      {discSign}{fmtNum(summary.discrepancy, 3)} {currency} ({summary.discrepancyPct.toFixed(1)}%)
                    </Text>
                  </View>
                </View>

                {/* Withdrawal Transactions — all withdrawals for review */}
                {(summary.allWithdrawals ?? []).length > 0 && (
                  <View style={ms.section}>
                    <Text style={[ms.sectionTitle, { color: colors.textPrimary }]}>
                      <FontAwesome name="flag" size={13} color={colors.warning} />{" "}
                      {t("reconciliation.withdrawalTransactions")} ({summary.allWithdrawals.length})
                    </Text>
                    <Text style={[ms.sectionDesc, { color: colors.textMuted }]}>
                      {t("reconciliation.withdrawalDesc")}
                    </Text>

                    {summary.allWithdrawals.map((w) => (
                      <AllWithdrawalRow
                        key={w.id}
                        deposit={w}
                        selected={selectedIds.has(w.id)}
                        onToggle={toggleId}
                        colors={colors}
                        currency={currency}
                      />
                    ))}
                  </View>
                )}

                {/* Orphaned Sells (zero-holding stocks) */}
                {(summary.orphanedSells ?? []).length > 0 && (
                  <View style={ms.section}>
                    <Text style={[ms.sectionTitle, { color: colors.textPrimary }]}>
                      <FontAwesome name="exclamation-circle" size={13} color={colors.danger} />{" "}
                      {t("reconciliation.orphanedSells")} ({summary.orphanedSells.length})
                    </Text>
                    <Text style={[ms.sectionDesc, { color: colors.textMuted }]}>
                      {t("reconciliation.orphanedSellsDesc")}
                    </Text>

                    {summary.orphanedSells.map((item) => (
                      <OrphanedSellRow
                        key={item.transaction.id}
                        item={item}
                        selected={selectedSellIds.has(item.transaction.id)}
                        onToggle={toggleSellId}
                        colors={colors}
                        currency={currency}
                      />
                    ))}
                  </View>
                )}

                {/* Opening Balance Preview */}
                <View style={ms.section}>
                  <Text style={[ms.sectionTitle, { color: colors.textPrimary }]}>
                    <FontAwesome name="calculator" size={13} color={colors.accentSecondary} />{" "}
                    {t("reconciliation.openingBalance")}
                  </Text>
                  <Text style={[ms.sectionDesc, { color: colors.textMuted }]}>
                    {t("reconciliation.openingBalanceDesc")}
                  </Text>
                  <View
                    style={[
                      ms.obCard,
                      { backgroundColor: colors.accentPrimary + "10", borderColor: colors.accentPrimary + "30" },
                    ]}
                  >
                    <View style={ms.obRow}>
                      <Text style={[ms.obLabel, { color: colors.textSecondary }]}>{t("reconciliation.amount")}</Text>
                      <Text style={[ms.obValue, { color: colors.accentPrimary }]}>
                        {fmtNum(effectiveOpeningBalance, 3)} {currency}
                      </Text>
                    </View>
                    <View style={ms.obRow}>
                      <Text style={[ms.obLabel, { color: colors.textSecondary }]}>{t("reconciliation.date")}</Text>
                      <Text style={[ms.obValue, { color: colors.textPrimary }]}>
                        {summary.suggestedOpeningBalance.date}
                      </Text>
                    </View>
                  </View>
                </View>
              </>
            ) : (
              /* ── Confirmation Step ─────────────────────────── */
              <View style={ms.section}>
                <View
                  style={[
                    ms.summaryCard,
                    { backgroundColor: colors.danger + "12", borderColor: colors.danger + "44" },
                  ]}
                >
                  <FontAwesome name="exclamation-triangle" size={20} color={colors.danger} style={{ alignSelf: "center", marginBottom: 8 }} />
                  <Text style={[ms.sectionTitle, { color: colors.danger, textAlign: "center", marginBottom: 6 }]}>
                    {t("reconciliation.deleteConfirmTitle")}
                  </Text>
                  <Text style={[ms.sectionDesc, { color: colors.textSecondary, textAlign: "center", marginBottom: 12 }]}>
                    {t("reconciliation.deleteConfirmDesc")}
                  </Text>

                  {/* List selected withdrawals */}
                  {selectedIds.size > 0 && (
                    <>
                      <Text style={[ms.obLabel, { color: colors.warning, fontWeight: "700", marginBottom: 4 }]}>
                        {t("reconciliation.withdrawalTransactions")} ({selectedIds.size})
                      </Text>
                      {(summary.allWithdrawals ?? [])
                        .filter((w) => selectedIds.has(w.id))
                        .map((w) => (
                          <Text key={w.id} style={[ms.wMeta, { color: colors.textSecondary, marginBottom: 2 }]}>
                            • {w.deposit_date} — {fmtNum(Math.abs(w.amount), 3)} {currency}
                          </Text>
                        ))}
                    </>
                  )}

                  {/* List selected orphaned sells */}
                  {selectedSellIds.size > 0 && (
                    <>
                      <Text style={[ms.obLabel, { color: colors.danger, fontWeight: "700", marginTop: 8, marginBottom: 4 }]}>
                        {t("reconciliation.orphanedSells")} ({selectedSellIds.size})
                      </Text>
                      {summary.orphanedSells
                        .filter((s) => selectedSellIds.has(s.transaction.id))
                        .map((s) => (
                          <Text key={s.transaction.id} style={[ms.wMeta, { color: colors.textSecondary, marginBottom: 2 }]}>
                            • {s.transaction.stock_symbol} — {s.transaction.txn_date} — {s.transaction.shares} shares
                          </Text>
                        ))}
                    </>
                  )}

                  <Text style={[ms.sectionDesc, { color: colors.textMuted, textAlign: "center", marginTop: 12, fontStyle: "italic" }]}>
                    {t("reconciliation.deleteConfirmNote")}
                  </Text>
                </View>
              </View>
            )}
          </ScrollView>

          {/* Footer Buttons */}
          <View style={[ms.footer, { borderTopColor: colors.borderColor }]}>
            {step === "review" ? (
              <>
                {onSkip && (
                  <Pressable
                    onPress={onSkip}
                    style={({ pressed }) => [
                      ms.btn,
                      ms.btnOutline,
                      { borderColor: colors.borderColor, opacity: pressed ? 0.6 : 1 },
                    ]}
                  >
                    <Text style={[ms.btnText, { color: colors.textSecondary }]}>
                      {t("reconciliation.skip")}
                    </Text>
                  </Pressable>
                )}
                {/* Delete selected transactions button */}
                {totalDeletions > 0 && onDeleteTransactions && (
                  <Pressable
                    onPress={handleProceedToDelete}
                    style={({ pressed }) => [
                      ms.btn,
                      { backgroundColor: colors.danger, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <FontAwesome name="trash-o" size={13} color="#fff" style={{ marginRight: 6 }} />
                    <Text style={[ms.btnText, { color: "#fff", fontWeight: "700" }]}>
                      {t("reconciliation.deleteSelected", { count: totalDeletions })}
                    </Text>
                  </Pressable>
                )}
                <Pressable
                  onPress={handleApply}
                  disabled={applying}
                  style={({ pressed }) => [
                    ms.btn,
                    {
                      backgroundColor: colors.accentPrimary,
                      opacity: pressing(pressed, applying),
                    },
                  ]}
                >
                  <FontAwesome name="check" size={13} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={[ms.btnText, { color: "#fff", fontWeight: "700" }]}>
                    {applying ? t("reconciliation.applying") : t("reconciliation.apply")}
                  </Text>
                </Pressable>
              </>
            ) : (
              <>
                <Pressable
                  onPress={() => setStep("review")}
                  style={({ pressed }) => [
                    ms.btn,
                    ms.btnOutline,
                    { borderColor: colors.borderColor, opacity: pressed ? 0.6 : 1 },
                  ]}
                >
                  <Text style={[ms.btnText, { color: colors.textSecondary }]}>
                    {t("reconciliation.back")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleConfirmDelete}
                  disabled={deleting}
                  style={({ pressed }) => [
                    ms.btn,
                    {
                      backgroundColor: colors.danger,
                      opacity: pressing(pressed, deleting),
                    },
                  ]}
                >
                  <FontAwesome name="trash" size={13} color="#fff" style={{ marginRight: 6 }} />
                  <Text style={[ms.btnText, { color: "#fff", fontWeight: "700" }]}>
                    {deleting ? t("reconciliation.deleting") : t("reconciliation.confirmDelete", { count: totalDeletions })}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── All Withdrawal Row (cash deposit with source=withdrawal) ────────

function AllWithdrawalRow({
  deposit,
  selected,
  onToggle,
  colors,
  currency,
}: {
  deposit: CashDepositRecord;
  selected: boolean;
  onToggle: (id: number) => void;
  colors: ThemePalette;
  currency: string;
}) {
  const amount = Math.abs(deposit.amount);

  return (
    <Pressable
      onPress={() => onToggle(deposit.id)}
      style={[
        ms.wRow,
        {
          backgroundColor: selected ? colors.warning + "12" : colors.bgPrimary,
          borderColor: selected ? colors.warning + "44" : colors.borderColor,
        },
      ]}
    >
      <FontAwesome
        name={selected ? "check-square-o" : "square-o"}
        size={18}
        color={selected ? colors.warning : colors.textMuted}
        style={{ marginRight: 10 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={[ms.wAmount, { color: colors.textPrimary }]}>
          {fmtNum(amount, 3)} {currency}
        </Text>
        <Text style={[ms.wMeta, { color: colors.textMuted }]}>
          {deposit.deposit_date} · ID: {deposit.id}
        </Text>
      </View>
      {selected && (
        <View style={[ms.flagBadge, { backgroundColor: colors.warning + "22" }]}>
          <Text style={{ color: colors.warning, fontSize: 9, fontWeight: "700" }}>
            DELETE
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Withdrawal Row ──────────────────────────────────────────────────

function WithdrawalRow({
  item,
  selected,
  onToggle,
  colors,
  currency,
}: {
  item: IncomeHarvestingResult;
  selected: boolean;
  onToggle: (id: number) => void;
  colors: ThemePalette;
  currency: string;
}) {
  const { t } = useTranslation();
  const w = item.withdrawal;
  const amount = Math.abs(
    w.purchase_cost ?? w.sell_value ?? w.cash_dividend ?? 0,
  );

  return (
    <Pressable
      onPress={() => onToggle(w.id)}
      style={[
        ms.wRow,
        {
          backgroundColor: selected ? colors.warning + "12" : colors.bgPrimary,
          borderColor: selected ? colors.warning + "44" : colors.borderColor,
        },
      ]}
    >
      <FontAwesome
        name={selected ? "check-square-o" : "square-o"}
        size={18}
        color={selected ? colors.warning : colors.textMuted}
        style={{ marginRight: 10 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={[ms.wAmount, { color: colors.textPrimary }]}>
          {fmtNum(amount, 3)} {currency}
        </Text>
        <Text style={[ms.wMeta, { color: colors.textMuted }]}>
          {w.txn_date} · ID: {w.id}
          {item.matchedAmount != null &&
            ` · ${t("reconciliation.matchedTo")} ${fmtNum(item.matchedAmount, 3)}`}
        </Text>
      </View>
      {selected && (
        <View style={[ms.flagBadge, { backgroundColor: colors.warning + "22" }]}>
          <Text style={{ color: colors.warning, fontSize: 9, fontWeight: "700" }}>
            {t("reconciliation.harvesting")}
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Orphaned Sell Row ───────────────────────────────────────────────

function OrphanedSellRow({
  item,
  selected,
  onToggle,
  colors,
  currency,
}: {
  item: OrphanedSellResult;
  selected: boolean;
  onToggle: (id: number) => void;
  colors: ThemePalette;
  currency: string;
}) {
  const txn = item.transaction;
  const amount = Math.abs(txn.sell_value ?? txn.purchase_cost ?? 0);

  return (
    <Pressable
      onPress={() => onToggle(txn.id)}
      style={[
        ms.wRow,
        {
          backgroundColor: selected ? colors.danger + "12" : colors.bgPrimary,
          borderColor: selected ? colors.danger + "44" : colors.borderColor,
        },
      ]}
    >
      <FontAwesome
        name={selected ? "check-square-o" : "square-o"}
        size={18}
        color={selected ? colors.danger : colors.textMuted}
        style={{ marginRight: 10 }}
      />
      <View style={{ flex: 1 }}>
        <Text style={[ms.wAmount, { color: colors.textPrimary }]}>
          {txn.stock_symbol} — {txn.shares} shares
        </Text>
        <Text style={[ms.wMeta, { color: colors.textMuted }]}>
          {txn.txn_date} · {fmtNum(amount, 3)} {currency} · ID: {txn.id}
        </Text>
      </View>
      {selected && (
        <View style={[ms.flagBadge, { backgroundColor: colors.danger + "22" }]}>
          <Text style={{ color: colors.danger, fontSize: 9, fontWeight: "700" }}>
            0 SHARES
          </Text>
        </View>
      )}
    </Pressable>
  );
}

// ── Helpers ──────────────────────────────────────────────────────────

function pressing(pressed: boolean, disabled: boolean): number {
  if (disabled) return 0.4;
  return pressed ? 0.7 : 1;
}

// ── Styles ──────────────────────────────────────────────────────────

const ms = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  dialog: {
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "flex-start",
    padding: 20,
    paddingBottom: 12,
  },
  title: { fontSize: 17, fontWeight: "800" },
  subtitle: { fontSize: 12, marginTop: 2 },
  summaryCard: {
    marginHorizontal: 20,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 14,
  },
  summaryLabel: { fontSize: 11, fontWeight: "600", textTransform: "uppercase", letterSpacing: 0.3 },
  summaryValue: { fontSize: 16, fontWeight: "700", marginTop: 1 },
  discRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 10,
    paddingTop: 10,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(0,0,0,0.1)",
  },
  discLabel: { fontSize: 13, fontWeight: "700" },
  discValue: { fontSize: 14, fontWeight: "800" },

  section: { marginHorizontal: 20, marginBottom: 14 },
  sectionTitle: { fontSize: 14, fontWeight: "700", marginBottom: 4 },
  sectionDesc: { fontSize: 11, marginBottom: 8 },

  wRow: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 6,
  },
  wAmount: { fontSize: 13, fontWeight: "700" },
  wMeta: { fontSize: 10, marginTop: 2 },
  flagBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },

  obCard: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  obRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 4,
  },
  obLabel: { fontSize: 12 },
  obValue: { fontSize: 13, fontWeight: "700" },

  footer: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
    padding: 16,
    borderTopWidth: 1,
  },
  btn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
  },
  btnOutline: {
    borderWidth: 1,
  },
  btnText: { fontSize: 13, fontWeight: "600" },
});
