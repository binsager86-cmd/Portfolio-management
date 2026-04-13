import { ResponsiveGrid } from "@/components/ui/ResponsiveGrid";
import { useResponsive } from "@/hooks/useResponsive";
import { fmtNum, formatCurrency, formatPercent, formatSignedCurrency } from "@/lib/currency";
import { TradingSummary } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import { useTranslation } from "react-i18next";
import { StyleSheet, Text, View } from "react-native";

export function TradingSummaryCards({ summary, dateFrom, dateTo }: { summary: TradingSummary; dateFrom?: string; dateTo?: string }) {
  const { colors } = useThemeStore();
  const { isPhone } = useResponsive();
  const { t } = useTranslation();

  const hasDateFilter = !!(dateFrom || dateTo);
  const periodLabel = hasDateFilter
    ? `${dateFrom || t("trading.inception")} → ${dateTo || t("trading.today")}`
    : t("trading.sinceInception");

  const Card = ({
    icon,
    iconColor,
    label,
    value,
    sub,
    valueColor,
    borderAccent,
  }: {
    icon: React.ComponentProps<typeof FontAwesome>["name"];
    iconColor: string;
    label: string;
    value: string;
    sub?: string;
    valueColor?: string;
    borderAccent?: string;
  }) => (
    <View
      style={[
        styles.card,
        {
          backgroundColor: colors.bgCard,
          borderColor: colors.borderColor,
          borderLeftColor: borderAccent || colors.borderColor,
          borderLeftWidth: borderAccent ? 3 : 1,
        },
      ]}
    >
      <View style={styles.cardHeader}>
        <View style={[styles.iconCircle, { backgroundColor: iconColor + "18" }]}>
          <FontAwesome name={icon} size={isPhone ? 14 : 16} color={iconColor} />
        </View>
        <Text style={[styles.cardLabel, { color: colors.textSecondary }]} numberOfLines={1}>
          {label}
        </Text>
      </View>
      <Text
        style={[
          styles.cardValue,
          {
            color: valueColor || colors.textPrimary,
            fontSize: isPhone ? 17 : 19,
          },
        ]}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
      {sub ? (
        <Text style={[styles.cardSub, { color: colors.textMuted }]}>{sub}</Text>
      ) : null}
    </View>
  );

  const pnlColor = (v: number) => (v > 0 ? colors.success : v < 0 ? colors.danger : colors.textMuted);

  return (
    <View style={styles.wrapper}>
      <View style={[styles.periodBadge, { backgroundColor: colors.accentPrimary + "12", borderColor: colors.accentPrimary + "30" }]}>
        <FontAwesome name="calendar" size={11} color={colors.accentPrimary} />
        <Text style={[styles.periodText, { color: colors.accentPrimary }]}>{periodLabel}</Text>
        <Text style={[styles.periodCcy, { color: colors.textMuted }]}>{t("trading.allValuesKWD")}</Text>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t("trading.capitalFlow")}</Text>
      <ResponsiveGrid columns={{ phone: 2, tablet: 4, desktop: 4 }}>
        <Card icon="arrow-circle-down" iconColor="#10b981" label={t("trading.totalBuys")} value={formatCurrency(summary.total_buys, "KWD")} sub={t("trading.transactionsCount", { count: summary.buy_count })} borderAccent="#10b981" />
        <Card icon="arrow-circle-up" iconColor="#f59e0b" label={t("trading.totalSells")} value={formatCurrency(summary.total_sells, "KWD")} sub={t("trading.transactionsCount", { count: summary.sell_count })} borderAccent="#f59e0b" />
        <Card icon="bank" iconColor="#3b82f6" label={t("trading.deposits")} value={formatCurrency(summary.total_deposits, "KWD")} sub={t("trading.depositsCount", { count: summary.deposit_count })} borderAccent="#3b82f6" />
        <Card icon="sign-out" iconColor="#ef4444" label={t("trading.withdrawals")} value={formatCurrency(summary.total_withdrawals, "KWD")} sub={t("trading.transactionsCount", { count: summary.withdrawal_count })} borderAccent="#ef4444" />
      </ResponsiveGrid>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t("trading.profitAndLoss")}</Text>
      <ResponsiveGrid columns={{ phone: 2, tablet: 4, desktop: 4 }}>
        <Card icon="line-chart" iconColor={pnlColor(summary.unrealized_pnl)} label={t("trading.unrealizedPL")} value={formatSignedCurrency(summary.unrealized_pnl, "KWD")} sub={t("trading.openPositions")} valueColor={pnlColor(summary.unrealized_pnl)} borderAccent={pnlColor(summary.unrealized_pnl)} />
        <Card icon="check-circle" iconColor={pnlColor(summary.realized_pnl)} label={t("trading.realizedPL")} value={formatSignedCurrency(summary.realized_pnl, "KWD")} sub={t("trading.closedPositions")} valueColor={pnlColor(summary.realized_pnl)} borderAccent={pnlColor(summary.realized_pnl)} />
        <Card icon="trophy" iconColor={pnlColor(summary.total_pnl)} label={t("trading.totalPL")} value={formatSignedCurrency(summary.total_pnl, "KWD")} sub={`${t("trading.unrealizedPL")} (${formatSignedCurrency(summary.unrealized_pnl, "KWD")}) + ${t("trading.realizedPL")} (${formatSignedCurrency(summary.realized_pnl, "KWD")})`} valueColor={pnlColor(summary.total_pnl)} borderAccent={pnlColor(summary.total_pnl)} />
        <Card icon="list-ol" iconColor={colors.accentPrimary} label={t("trading.totalTxns")} value={fmtNum(summary.total_transactions, 0)} sub={t("trading.allTransactionTypes")} borderAccent={colors.accentPrimary} />
      </ResponsiveGrid>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>{t("trading.returnsAndIncome")}</Text>
      <ResponsiveGrid columns={{ phone: 2, tablet: 4, desktop: 4 }}>
        <Card icon="money" iconColor="#8b5cf6" label={t("trading.cashDividends")} value={formatCurrency(summary.total_dividends, "KWD")} sub={t("trading.recordsCount", { count: summary.dividend_count })} borderAccent="#8b5cf6" />
        <Card icon="percent" iconColor="#6366f1" label={t("trading.totalFees")} value={formatCurrency(summary.total_fees, "KWD")} sub={t("trading.brokerageCommissions")} borderAccent="#6366f1" />
        <Card icon="exchange" iconColor={pnlColor(summary.net_cash_flow)} label={t("trading.netCashFlow")} value={formatSignedCurrency(summary.net_cash_flow, "KWD")} sub={t("trading.netCashFlowFormula")} valueColor={pnlColor(summary.net_cash_flow)} borderAccent={pnlColor(summary.net_cash_flow)} />
        <Card icon="area-chart" iconColor={pnlColor(summary.total_return_pct)} label={t("trading.totalReturn")} value={summary.total_buys > 0 ? formatPercent(summary.total_return_pct) : "N/A"} sub={t("trading.includingDividends")} valueColor={pnlColor(summary.total_return_pct)} borderAccent={pnlColor(summary.total_return_pct)} />
      </ResponsiveGrid>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { marginBottom: 8 },
  periodBadge: {
    flexDirection: "row", alignItems: "center", alignSelf: "flex-start",
    gap: 6, paddingHorizontal: 12, paddingVertical: 6,
    borderRadius: 20, borderWidth: 1, marginBottom: 12,
  },
  periodText: { fontSize: 12, fontWeight: "600" },
  periodCcy: { fontSize: 10, fontWeight: "500", marginLeft: 4 },
  sectionLabel: {
    fontSize: 10, fontWeight: "700", letterSpacing: 1.2,
    textTransform: "uppercase", marginBottom: 6, marginTop: 4,
  },
  card: {
    borderRadius: 10, borderWidth: 1, padding: 14, minHeight: 96, width: "100%",
  },
  cardHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 8 },
  iconCircle: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  cardLabel: { fontSize: 11, fontWeight: "600", letterSpacing: 0.3, textTransform: "uppercase", flex: 1 },
  cardValue: { fontSize: 19, fontWeight: "800", letterSpacing: -0.3, marginBottom: 2 },
  cardSub: { fontSize: 11, fontWeight: "500", marginTop: 2 },
});
