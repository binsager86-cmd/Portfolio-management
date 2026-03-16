/**
 * Fundamental Analysis — Shared types, constants, and configuration.
 */

import type { ThemePalette } from "@/constants/theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";

// ── Icon type alias ───────────────────────────────────────────────
export type IconName = React.ComponentProps<typeof FontAwesome>["name"];

// ── API Error type (replaces `any` in catch blocks) ───────────────
export interface ApiError {
  response?: { data?: { detail?: string } };
  message?: string;
}

export function getApiErrorMessage(err: unknown, fallback = "Something went wrong."): string {
  if (err && typeof err === "object") {
    const e = err as ApiError;
    if (e.response?.data?.detail) return e.response.data.detail;
    if (e.message) return e.message;
  }
  return fallback;
}

// ── Sub-tab navigation ────────────────────────────────────────────
export type SubTab = "stocks" | "statements" | "comparison" | "metrics" | "growth" | "score" | "valuations";

export const SUB_TABS: { key: SubTab; label: string; icon: IconName }[] = [
  { key: "stocks",      label: "Stocks",      icon: "th-list" },
  { key: "statements",  label: "Statements",  icon: "file-text-o" },
  { key: "comparison",  label: "Compare",     icon: "columns" },
  { key: "metrics",     label: "Metrics",     icon: "bar-chart" },
  { key: "growth",      label: "Growth",      icon: "line-chart" },
  { key: "score",       label: "Score",       icon: "star" },
  { key: "valuations",  label: "Valuations",  icon: "calculator" },
];

// ── Statement types ───────────────────────────────────────────────
export const STMNT_TYPES = ["income", "balance", "cashflow", "equity"] as const;

export const STMNT_META: Record<string, { label: string; icon: IconName; color: string }> = {
  income:   { label: "Income",        icon: "money",         color: "#10b981" },
  balance:  { label: "Balance Sheet", icon: "balance-scale",  color: "#6366f1" },
  cashflow: { label: "Cash Flow",     icon: "exchange",      color: "#3b82f6" },
  equity:   { label: "Equity",        icon: "users",         color: "#ec4899" },
};

export const STMNT_ICONS = STMNT_META;

// ── Category labels for metrics ───────────────────────────────────
export const CATEGORY_LABELS: Record<string, { label: string; icon: IconName; color: string }> = {
  profitability: { label: "Profitability",         icon: "trophy",     color: "#10b981" },
  liquidity:     { label: "Liquidity",             icon: "tint",       color: "#3b82f6" },
  leverage:      { label: "Capital Structure",     icon: "building",   color: "#f59e0b" },
  efficiency:    { label: "Efficiency",            icon: "bolt",       color: "#8b5cf6" },
  valuation:     { label: "Valuation (Per-Share)", icon: "diamond",    color: "#ec4899" },
  cashflow:      { label: "Cash Flow",             icon: "money",      color: "#06b6d4" },
  growth:        { label: "Growth Rates",          icon: "line-chart", color: "#f97316" },
};

// ── Processing step types ─────────────────────────────────────────
export type StepStatus = "pending" | "running" | "done" | "error";

export interface ProcessingStep {
  key: "extraction";
  label: string;
  status: StepStatus;
  detail?: string;
}

export const INITIAL_STEPS: ProcessingStep[] = [
  { key: "extraction", label: "AI Vision extracting financials from PDF", status: "pending" },
];

// ── Valuation model info ──────────────────────────────────────────
export const MODEL_INFO: Record<string, { title: string; formula: string; icon: IconName }> = {
  graham:    { title: "Graham Number",        formula: "V = √(22.5 × EPS × BVPS)",   icon: "university" },
  dcf:       { title: "Two-Stage DCF",        formula: "Gordon Growth Terminal Value", icon: "sitemap" },
  ddm:       { title: "Dividend Discount",    formula: "Gordon Growth Model",          icon: "money" },
  multiples: { title: "Comparable Multiples", formula: "e.g., P/E × EPS",             icon: "balance-scale" },
};

// ── Panel prop interfaces ─────────────────────────────────────────
export interface PanelProps {
  stockId: number;
  colors: ThemePalette;
  isDesktop: boolean;
}

export interface PanelWithSymbolProps extends PanelProps {
  stockSymbol: string;
}

// ── Growth data types ─────────────────────────────────────────────
export interface GrowthEntry {
  prev_period: string;
  period: string;
  growth: number;
}
