"use client";

import React, { useEffect, useState, useMemo, useCallback } from "react";
import TopNavbar from "@/components/layout/top-navbar";
import KpiCards from "@/components/trading/kpi-cards";
import TradingFilters from "@/components/trading/trading-filters";
import TransactionsTable from "@/components/trading/transactions-table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Download, Eye, Pencil, Info } from "lucide-react";
import type {
  PortfolioApiResponse,
  Transaction,
  KpiData,
  TxnTypeFilter,
  SourceFilter,
} from "@/lib/types";

export default function TradingPage() {
  /* ── State ──────────────────────────────────────────── */
  const [data, setData] = useState<PortfolioApiResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  // Filters
  const [search, setSearch] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [selectedTypes, setSelectedTypes] = useState<TxnTypeFilter[]>([]);
  const [selectedSources, setSelectedSources] = useState<SourceFilter[]>([]);

  /* ── Fetch data ─────────────────────────────────────── */
  const fetchData = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);

    try {
      const res = await fetch("/api/portfolio");
      const json: PortfolioApiResponse = await res.json();
      setData(json);
    } catch (err) {
      console.error("Failed to fetch portfolio data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  /* ── Filter logic ───────────────────────────────────── */
  const toggleType = (type: TxnTypeFilter) =>
    setSelectedTypes((prev) =>
      prev.includes(type) ? prev.filter((t) => t !== type) : [...prev, type]
    );

  const toggleSource = (source: SourceFilter) =>
    setSelectedSources((prev) =>
      prev.includes(source)
        ? prev.filter((s) => s !== source)
        : [...prev, source]
    );

  const clearFilters = () => {
    setSearch("");
    setDateFrom("");
    setDateTo("");
    setSelectedTypes([]);
    setSelectedSources([]);
  };

  const filtered = useMemo(() => {
    if (!data) return [];
    let list = [...data.transactions];

    // Search
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (t) =>
          t.symbol.toLowerCase().includes(q) ||
          t.notes.toLowerCase().includes(q) ||
          t.portfolio.toLowerCase().includes(q) ||
          t.type.toLowerCase().includes(q) ||
          String(t.value).includes(q)
      );
    }

    // Date range
    if (dateFrom) list = list.filter((t) => t.date >= dateFrom);
    if (dateTo) list = list.filter((t) => t.date <= dateTo);

    // Type
    if (selectedTypes.length > 0)
      list = list.filter((t) => selectedTypes.includes(t.type));

    // Source
    if (selectedSources.length > 0)
      list = list.filter((t) => selectedSources.includes(t.source));

    return list;
  }, [data, search, dateFrom, dateTo, selectedTypes, selectedSources]);

  /* ── Loading skeleton ───────────────────────────────── */
  if (loading) {
    return (
      <>
        <TopNavbar title="Trading Section" subtitle="Loading..." />
        <div className="space-y-4 p-6">
          {/* Skeleton KPI row */}
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-lg bg-surface-raised dark:bg-white/[0.04]"
              />
            ))}
          </div>
          <div className="grid grid-cols-4 gap-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="h-28 animate-pulse rounded-lg bg-surface-raised dark:bg-white/[0.04]"
              />
            ))}
          </div>
          {/* Skeleton table */}
          <div className="h-96 animate-pulse rounded-lg bg-surface-raised dark:bg-white/[0.04]" />
        </div>
      </>
    );
  }

  if (!data) {
    return (
      <>
        <TopNavbar title="Trading Section" />
        <div className="flex h-96 items-center justify-center">
          <p className="text-surface-muted">Failed to load data.</p>
        </div>
      </>
    );
  }

  return (
    <>
      {/* ── Top Navigation Bar ─────────────────────────── */}
      <TopNavbar
        title="Trading Section"
        subtitle="All Transactions · Read-only View"
        onRefresh={() => fetchData(true)}
        refreshing={refreshing}
      />

      {/* ── Page Content ───────────────────────────────── */}
      <div className="space-y-6 p-6">
        {/* Info Banner */}
        <Card className="flex items-start gap-3 border-info/20 bg-info-light/30 p-4 dark:border-info/30 dark:bg-info/10">
          <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" />
          <div className="text-sm text-info-dark dark:text-blue-300">
            <span className="font-semibold">All saved transactions</span> —
            Buy/Sell trades, Cash Deposits, Dividends, and Bonus Shares in one
            view. Use{" "}
            <span className="font-medium">&quot;Add Transactions&quot;</span> to
            record new entries.
          </div>
        </Card>

        {/* ── KPI Cards ──────────────────────────────────── */}
        <KpiCards data={data.kpis} />

        <Separator />

        {/* ── Filters ────────────────────────────────────── */}
        <TradingFilters
          search={search}
          onSearchChange={setSearch}
          dateFrom={dateFrom}
          dateTo={dateTo}
          onDateFromChange={setDateFrom}
          onDateToChange={setDateTo}
          selectedTypes={selectedTypes}
          onToggleType={toggleType}
          selectedSources={selectedSources}
          onToggleSource={toggleSource}
          onClearAll={clearFilters}
          resultCount={filtered.length}
        />

        {/* ── View Tabs ──────────────────────────────────── */}
        <Tabs defaultValue="view" className="space-y-4">
          <div className="flex items-center justify-between">
            <TabsList>
              <TabsTrigger value="view" className="gap-1.5">
                <Eye className="h-3.5 w-3.5" />
                View
              </TabsTrigger>
              <TabsTrigger value="edit" className="gap-1.5">
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </TabsTrigger>
            </TabsList>

            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="tabular-nums">
                {filtered.length} transactions
              </Badge>
              <Button variant="outline" size="sm" className="gap-1.5 text-xs">
                <Download className="h-3.5 w-3.5" />
                Export Excel
              </Button>
            </div>
          </div>

          <TabsContent value="view">
            <TransactionsTable data={filtered} />
          </TabsContent>

          <TabsContent value="edit">
            <Card className="flex h-48 items-center justify-center dark:text-slate-400">
              <div className="text-center">
                <Pencil className="mx-auto mb-2 h-8 w-8 text-surface-muted" />
                <p className="text-sm font-medium text-surface-muted">
                  Edit mode coming soon
                </p>
                <p className="mt-1 text-xs text-surface-muted">
                  Inline editing with save &amp; delete will be wired to the
                  backend API.
                </p>
              </div>
            </Card>
          </TabsContent>
        </Tabs>

        {/* ── Footer ─────────────────────────────────────── */}
        <div className="pb-4 text-center text-xs text-surface-muted dark:text-slate-600">
          KuwaitPortfolio.ai · v4.0 Pro · Powered by Next.js
        </div>
      </div>
    </>
  );
}
