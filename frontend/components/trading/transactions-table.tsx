"use client";

import React from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { cn, formatNumber } from "@/lib/utils";
import { useTheme } from "@/components/theme-provider";
import type { Transaction } from "@/lib/types";

interface TransactionsTableProps {
  data: Transaction[];
}

function typeBadge(type: Transaction["type"]) {
  const map: Record<string, { variant: "success" | "info" | "warning" | "danger" | "secondary" | "outline"; label: string }> = {
    Buy: { variant: "info", label: "Buy" },
    Sell: { variant: "success", label: "Sell" },
    Deposit: { variant: "secondary", label: "Deposit" },
    Withdrawal: { variant: "warning", label: "Withdraw" },
    Dividend: { variant: "success", label: "Dividend" },
    "Bonus Shares": { variant: "outline", label: "Bonus" },
  };
  const cfg = map[type] ?? { variant: "secondary" as const, label: type };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function statusBadge(status: Transaction["status"]) {
  if (!status) return null;
  const map: Record<string, { variant: "success" | "info" | "warning" | "danger" | "secondary" | "outline"; label: string }> = {
    Unrealized: { variant: "info", label: "Unrealized" },
    Realized: { variant: "success", label: "Realized" },
    Income: { variant: "success", label: "Income" },
    Bonus: { variant: "outline", label: "Bonus" },
    Closed: { variant: "secondary", label: "Closed" },
  };
  const cfg = map[status];
  if (!cfg) return null;
  return <Badge variant={cfg.variant} className="text-[10px]">{cfg.label}</Badge>;
}

function sourceBadge(source: Transaction["source"]) {
  const map: Record<string, string> = {
    MANUAL: "✍️",
    UPLOAD: "📤",
    RESTORE: "🔄",
    API: "🔌",
    LEGACY: "📜",
  };
  return (
    <span className="text-xs text-surface-muted">
      {map[source] ?? "📋"} {source}
    </span>
  );
}

export default function TransactionsTable({ data }: TransactionsTableProps) {
  const { privacyMode } = useTheme();
  const blur = privacyMode ? "privacy-blur" : "";

  if (data.length === 0) {
    return (
      <div className="flex h-40 items-center justify-center rounded-lg border border-dashed border-surface-border dark:border-white/10">
        <p className="text-sm text-surface-muted dark:text-slate-500">
          No transactions match your filters.
        </p>
      </div>
    );
  }

  return (
    <Table>
      <TableHeader>
        <TableRow>
          <TableHead className="w-20">Date</TableHead>
          <TableHead>Symbol</TableHead>
          <TableHead className="w-16">Port.</TableHead>
          <TableHead className="w-24">Type</TableHead>
          <TableHead className="w-20">Status</TableHead>
          <TableHead className="w-16">Source</TableHead>
          <TableHead className="text-right">Qty</TableHead>
          <TableHead className="text-right">Avg Cost</TableHead>
          <TableHead className="text-right">Price</TableHead>
          <TableHead className="text-right">Mkt Price</TableHead>
          <TableHead className="text-right">Value</TableHead>
          <TableHead className="text-right">P&L</TableHead>
          <TableHead className="text-right">P&L %</TableHead>
          <TableHead className="text-right">Fees</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {data.map((txn) => (
          <TableRow key={txn.id} className="table-row-hover">
            <TableCell className="whitespace-nowrap text-xs tabular-nums text-surface-muted">
              {txn.date}
            </TableCell>
            <TableCell className="font-medium text-brand-900 dark:text-white">
              {txn.symbol}
            </TableCell>
            <TableCell>
              <Badge variant="secondary" className="text-[10px]">
                {txn.portfolio}
              </Badge>
            </TableCell>
            <TableCell>{typeBadge(txn.type)}</TableCell>
            <TableCell>{statusBadge(txn.status)}</TableCell>
            <TableCell>{sourceBadge(txn.source)}</TableCell>
            <TableCell className="text-right tabular-nums">
              {txn.quantity ? formatNumber(txn.quantity) : "—"}
            </TableCell>
            <TableCell className={cn("text-right tabular-nums", blur)}>
              {txn.avgCost > 0 ? txn.avgCost.toFixed(3) : "—"}
            </TableCell>
            <TableCell className={cn("text-right tabular-nums", blur)}>
              {txn.price > 0 ? txn.price.toFixed(3) : "—"}
            </TableCell>
            <TableCell className={cn("text-right tabular-nums", blur)}>
              {txn.currentPrice > 0 ? txn.currentPrice.toFixed(3) : "—"}
            </TableCell>
            <TableCell className={cn("text-right tabular-nums font-medium", blur)}>
              {txn.value !== 0 ? formatNumber(txn.value, 2) : "—"}
            </TableCell>
            <TableCell
              className={cn(
                "text-right tabular-nums font-semibold",
                txn.pnl > 0 && "text-success",
                txn.pnl < 0 && "text-danger",
                blur
              )}
            >
              {txn.pnl !== 0
                ? formatNumber(txn.pnl, 2, { showSign: true })
                : "—"}
            </TableCell>
            <TableCell
              className={cn(
                "text-right tabular-nums text-xs",
                txn.pnlPct > 0 && "text-success",
                txn.pnlPct < 0 && "text-danger",
                blur
              )}
            >
              {txn.pnlPct !== 0
                ? formatNumber(txn.pnlPct, 2, { showSign: true, suffix: "%" })
                : "—"}
            </TableCell>
            <TableCell className={cn("text-right tabular-nums text-surface-muted", blur)}>
              {txn.fees > 0 ? txn.fees.toFixed(2) : "—"}
            </TableCell>
          </TableRow>
        ))}
      </TableBody>
    </Table>
  );
}
