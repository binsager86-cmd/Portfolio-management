"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { cn, formatNumber, pnlColor } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import type { KpiData } from "@/lib/types";
import {
  ShoppingCart,
  Banknote,
  ArrowDownToLine,
  ArrowUpFromLine,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Hash,
  DollarSign,
  Receipt,
  ArrowLeftRight,
  Percent,
} from "lucide-react";

interface KpiCardProps {
  label: string;
  value: string;
  subtext?: string;
  icon: React.ElementType;
  iconColor?: string;
  trend?: "up" | "down" | "neutral";
}

function KpiCard({ label, value, subtext, icon: Icon, iconColor = "text-brand-500", trend }: KpiCardProps) {
  const { privacyMode } = useTheme();

  return (
    <Card className="kpi-card group relative overflow-hidden p-5">
      {/* Subtle gradient accent at top */}
      <div className="absolute inset-x-0 top-0 h-0.5 bg-gradient-to-r from-brand-500 to-brand-700 opacity-0 transition-opacity group-hover:opacity-100" />

      <div className="flex items-start justify-between">
        <div className="space-y-2">
          <p className="text-kpi-label uppercase text-surface-muted dark:text-slate-500">{label}</p>
          <p className={cn("text-kpi tabular-nums", trend === "down" ? "text-danger" : trend === "up" ? "text-success-dark" : "text-brand-900 dark:text-white", privacyMode && "privacy-blur")}>
            {value}
          </p>
          {subtext && (
            <p className="text-xs text-surface-muted dark:text-slate-500">{subtext}</p>
          )}
        </div>
        <div className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-surface-raised dark:bg-white/[0.06]", iconColor)}>
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </Card>
  );
}

interface KpiCardsProps {
  data: KpiData;
}

export default function KpiCards({ data }: KpiCardsProps) {
  return (
    <div className="space-y-4">
      {/* Row 1: Trade Activity */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Total Buys"
          value={formatNumber(data.totalBuys, 0)}
          subtext={`${data.buyCount} transactions`}
          icon={ShoppingCart}
          iconColor="text-brand-600"
        />
        <KpiCard
          label="Total Sells"
          value={formatNumber(data.totalSells, 0)}
          subtext={`${data.sellCount} transactions`}
          icon={Banknote}
          iconColor="text-info"
        />
        <KpiCard
          label="Deposits"
          value={formatNumber(data.totalDeposits, 0)}
          subtext={`${data.depositCount} deposits`}
          icon={ArrowDownToLine}
          iconColor="text-success"
        />
        <KpiCard
          label="Withdrawals"
          value={formatNumber(data.totalWithdrawals, 0)}
          subtext={`${data.withdrawalCount} withdrawals`}
          icon={ArrowUpFromLine}
          iconColor="text-warning"
        />
      </div>

      {/* Row 2: P&L */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Unrealized P&L"
          value={formatNumber(data.unrealizedPnl, 2, { showSign: true })}
          subtext="Open positions"
          icon={TrendingUp}
          iconColor="text-success"
          trend={data.unrealizedPnl >= 0 ? "up" : "down"}
        />
        <KpiCard
          label="Realized P&L"
          value={formatNumber(data.realizedPnl, 2, { showSign: true })}
          subtext="Closed positions"
          icon={TrendingDown}
          iconColor="text-info"
          trend={data.realizedPnl >= 0 ? "up" : "down"}
        />
        <KpiCard
          label="Total P&L"
          value={formatNumber(data.totalPnl, 2, { showSign: true })}
          subtext="Capital gains"
          icon={BarChart3}
          iconColor={data.totalPnl >= 0 ? "text-success" : "text-danger"}
          trend={data.totalPnl >= 0 ? "up" : "down"}
        />
        <KpiCard
          label="Total Transactions"
          value={formatNumber(data.totalTransactions)}
          icon={Hash}
          iconColor="text-surface-muted"
        />
      </div>

      {/* Row 3: Dividends & Flow */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <KpiCard
          label="Cash Dividends"
          value={formatNumber(data.cashDividends, 2)}
          subtext={`${data.dividendCount} payments`}
          icon={DollarSign}
          iconColor="text-success"
        />
        <KpiCard
          label="Total Fees"
          value={formatNumber(data.totalFees, 2)}
          icon={Receipt}
          iconColor="text-surface-muted"
        />
        <KpiCard
          label="Net Cash Flow"
          value={formatNumber(data.netCashFlow, 0, { showSign: true })}
          icon={ArrowLeftRight}
          iconColor={data.netCashFlow >= 0 ? "text-success" : "text-danger"}
          trend={data.netCashFlow >= 0 ? "up" : "down"}
        />
        <KpiCard
          label="Total Return"
          value={formatNumber(data.totalReturnPct, 2, { showSign: true, suffix: "%" })}
          subtext="Incl. dividends"
          icon={Percent}
          iconColor={data.totalReturnPct >= 0 ? "text-success" : "text-danger"}
          trend={data.totalReturnPct >= 0 ? "up" : "down"}
        />
      </div>
    </div>
  );
}
