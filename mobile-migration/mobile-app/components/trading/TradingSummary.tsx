import React from "react";
import { View, Text, StyleSheet } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { TradingSummary } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import { ResponsiveGrid } from "@/components/ui/ResponsiveGrid";
import { formatCurrency, formatSignedCurrency, formatPercent, fmtNum } from "@/lib/currency";

export function TradingSummaryCards({ summary, dateFrom, dateTo }: { summary: TradingSummary; dateFrom?: string; dateTo?: string }) {
  const { colors } = useThemeStore();
  const { isPhone } = useResponsive();

  const hasDateFilter = !!(dateFrom || dateTo);
  const periodLabel = hasDateFilter
    ? `${dateFrom || "Inception"} → ${dateTo || "Today"}`
    : "Since Inception";

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
        <Text style={[styles.periodCcy, { color: colors.textMuted }]}>All values in KWD</Text>
      </View>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>CAPITAL FLOW</Text>
      <ResponsiveGrid columns={{ phone: 2, tablet: 4, desktop: 4 }}>
        <Card icon="arrow-circle-down" iconColor="#10b981" label="Total Buys" value={formatCurrency(summary.total_buys, "KWD")} sub={`${summary.buy_count} transactions`} borderAccent="#10b981" />
        <Card icon="arrow-circle-up" iconColor="#f59e0b" label="Total Sells" value={formatCurrency(summary.total_sells, "KWD")} sub={`${summary.sell_count} transactions`} borderAccent="#f59e0b" />
        <Card icon="bank" iconColor="#3b82f6" label="Deposits" value={formatCurrency(summary.total_deposits, "KWD")} sub={`${summary.deposit_count} deposits`} borderAccent="#3b82f6" />
        <Card icon="sign-out" iconColor="#ef4444" label="Withdrawals" value={formatCurrency(summary.total_withdrawals, "KWD")} sub={`${summary.withdrawal_count} transactions`} borderAccent="#ef4444" />
      </ResponsiveGrid>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>PROFIT & LOSS</Text>
      <ResponsiveGrid columns={{ phone: 2, tablet: 4, desktop: 4 }}>
        <Card icon="line-chart" iconColor={pnlColor(summary.unrealized_pnl)} label="Unrealized P&L" value={formatSignedCurrency(summary.unrealized_pnl, "KWD")} sub="Open positions" valueColor={pnlColor(summary.unrealized_pnl)} borderAccent={pnlColor(summary.unrealized_pnl)} />
        <Card icon="check-circle" iconColor={pnlColor(summary.realized_pnl)} label="Realized P&L" value={formatSignedCurrency(summary.realized_pnl, "KWD")} sub="Closed positions" valueColor={pnlColor(summary.realized_pnl)} borderAccent={pnlColor(summary.realized_pnl)} />
        <Card icon="trophy" iconColor={pnlColor(summary.total_pnl)} label="Total P&L" value={formatSignedCurrency(summary.total_pnl, "KWD")} sub={`Unrealized (${formatSignedCurrency(summary.unrealized_pnl, "KWD")}) + Realized (${formatSignedCurrency(summary.realized_pnl, "KWD")})`} valueColor={pnlColor(summary.total_pnl)} borderAccent={pnlColor(summary.total_pnl)} />
        <Card icon="list-ol" iconColor={colors.accentPrimary} label="Total Txns" value={fmtNum(summary.total_transactions, 0)} sub="All transaction types" borderAccent={colors.accentPrimary} />
      </ResponsiveGrid>

      <Text style={[styles.sectionLabel, { color: colors.textSecondary }]}>RETURNS & INCOME</Text>
      <ResponsiveGrid columns={{ phone: 2, tablet: 4, desktop: 4 }}>
        <Card icon="money" iconColor="#8b5cf6" label="Cash Dividends" value={formatCurrency(summary.total_dividends, "KWD")} sub={`${summary.dividend_count} records`} borderAccent="#8b5cf6" />
        <Card icon="percent" iconColor="#6366f1" label="Total Fees" value={formatCurrency(summary.total_fees, "KWD")} sub="Brokerage & commissions" borderAccent="#6366f1" />
        <Card icon="exchange" iconColor={pnlColor(summary.net_cash_flow)} label="Net Cash Flow" value={formatSignedCurrency(summary.net_cash_flow, "KWD")} sub="Sells + Dep − Buys − Fees" valueColor={pnlColor(summary.net_cash_flow)} borderAccent={pnlColor(summary.net_cash_flow)} />
        <Card icon="area-chart" iconColor={pnlColor(summary.total_return_pct)} label="Total Return" value={summary.total_buys > 0 ? formatPercent(summary.total_return_pct) : "N/A"} sub="Including dividends" valueColor={pnlColor(summary.total_return_pct)} borderAccent={pnlColor(summary.total_return_pct)} />
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
