"use client";

import React from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Search, X, SlidersHorizontal } from "lucide-react";
import type { TxnTypeFilter, SourceFilter } from "@/lib/types";

interface TradingFiltersProps {
  search: string;
  onSearchChange: (val: string) => void;
  dateFrom: string;
  dateTo: string;
  onDateFromChange: (val: string) => void;
  onDateToChange: (val: string) => void;
  selectedTypes: TxnTypeFilter[];
  onToggleType: (type: TxnTypeFilter) => void;
  selectedSources: SourceFilter[];
  onToggleSource: (source: SourceFilter) => void;
  onClearAll: () => void;
  resultCount: number;
}

const txnTypes: { value: TxnTypeFilter; label: string; color: string }[] = [
  { value: "Buy", label: "Buy", color: "bg-blue-50 text-blue-700 border-blue-200" },
  { value: "Sell", label: "Sell", color: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  { value: "Deposit", label: "Deposit", color: "bg-violet-50 text-violet-700 border-violet-200" },
  { value: "Withdrawal", label: "Withdrawal", color: "bg-amber-50 text-amber-700 border-amber-200" },
  { value: "Dividend", label: "Dividend", color: "bg-green-50 text-green-700 border-green-200" },
  { value: "Bonus Shares", label: "Bonus", color: "bg-pink-50 text-pink-700 border-pink-200" },
];

const sourceTypes: { value: SourceFilter; label: string }[] = [
  { value: "MANUAL", label: "✍️ Manual" },
  { value: "UPLOAD", label: "📤 Upload" },
  { value: "RESTORE", label: "🔄 Restore" },
  { value: "API", label: "🔌 API" },
  { value: "LEGACY", label: "📜 Legacy" },
];

export default function TradingFilters({
  search,
  onSearchChange,
  dateFrom,
  dateTo,
  onDateFromChange,
  onDateToChange,
  selectedTypes,
  onToggleType,
  selectedSources,
  onToggleSource,
  onClearAll,
  resultCount,
}: TradingFiltersProps) {
  const hasFilters =
    search.length > 0 ||
    dateFrom.length > 0 ||
    dateTo.length > 0 ||
    selectedTypes.length > 0 ||
    selectedSources.length > 0;

  return (
    <Card className="p-5">
      <div className="space-y-4">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="h-4 w-4 text-surface-muted" />
            <h3 className="text-sm font-semibold text-brand-900 dark:text-white">Filters</h3>
            {hasFilters && (
              <Badge variant="info" className="ml-1 text-[10px]">
                {resultCount} results
              </Badge>
            )}
          </div>
          {hasFilters && (
            <Button
              variant="ghost"
              size="sm"
              onClick={onClearAll}
              className="h-7 gap-1 text-xs text-surface-muted hover:text-danger"
            >
              <X className="h-3 w-3" />
              Clear all
            </Button>
          )}
        </div>

        {/* Row 1: Search + Date range */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="flex-1">
            <label className="mb-1 block text-xs font-medium text-surface-muted dark:text-slate-500">
              Search
            </label>
            <div className="relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-muted" />
              <Input
                value={search}
                onChange={(e) => onSearchChange(e.target.value)}
                placeholder="Symbol, notes, amount..."
                className="h-9 pl-9 text-sm"
              />
            </div>
          </div>
          <div className="flex gap-2">
            <div>
              <label className="mb-1 block text-xs font-medium text-surface-muted dark:text-slate-500">
                From
              </label>
              <Input
                type="date"
                value={dateFrom}
                onChange={(e) => onDateFromChange(e.target.value)}
                className="h-9 w-36 text-sm"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-surface-muted dark:text-slate-500">
                To
              </label>
              <Input
                type="date"
                value={dateTo}
                onChange={(e) => onDateToChange(e.target.value)}
                className="h-9 w-36 text-sm"
              />
            </div>
          </div>
        </div>

        {/* Row 2: Type pills */}
        <div>
          <p className="mb-2 text-xs font-medium text-surface-muted dark:text-slate-500">
            Transaction Type
          </p>
          <div className="flex flex-wrap gap-2">
            {txnTypes.map((t) => {
              const active = selectedTypes.includes(t.value);
              return (
                <button
                  key={t.value}
                  onClick={() => onToggleType(t.value)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
                    active
                      ? t.color + " ring-1 ring-offset-1 dark:ring-offset-[#141B2D]"
                      : "border-surface-border bg-white text-surface-muted hover:border-slate-300 hover:text-foreground dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:border-white/20 dark:hover:text-white"
                  }`}
                >
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>

        {/* Row 3: Source pills */}
        <div>
          <p className="mb-2 text-xs font-medium text-surface-muted dark:text-slate-500">Source</p>
          <div className="flex flex-wrap gap-2">
            {sourceTypes.map((s) => {
              const active = selectedSources.includes(s.value);
              return (
                <button
                  key={s.value}
                  onClick={() => onToggleSource(s.value)}
                  className={`rounded-md border px-3 py-1.5 text-xs font-medium transition-all ${
                    active
                      ? "border-brand-200 bg-brand-50 text-brand-800 ring-1 ring-brand-300 ring-offset-1 dark:ring-offset-[#141B2D] dark:border-brand-600 dark:bg-brand-600/20 dark:text-brand-300"
                      : "border-surface-border bg-white text-surface-muted hover:border-slate-300 hover:text-foreground dark:border-white/10 dark:bg-white/5 dark:text-slate-400 dark:hover:border-white/20 dark:hover:text-white"
                  }`}
                >
                  {s.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </Card>
  );
}
