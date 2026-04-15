/**
 * Fundamental Analysis — Shared types, constants, and configuration.
 */

import type { ThemePalette } from "@/constants/theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";

import type { ExpertiseLevel } from "@/src/store/userPrefsStore";

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
export type SubTab = "stocks" | "statements" | "comparison" | "metrics" | "growth" | "score" | "decision" | "valuations" | "buffett" | "news";

export const SUB_TABS: { key: SubTab; label: string; icon: IconName; minLevel?: ExpertiseLevel }[] = [
  { key: "stocks",      label: "Stocks",      icon: "th-list" },
  { key: "statements",  label: "Statements",  icon: "file-text-o", minLevel: "advanced" },
  { key: "comparison",  label: "Compare",     icon: "columns",     minLevel: "intermediate" },
  { key: "metrics",     label: "Metrics",     icon: "bar-chart",   minLevel: "intermediate" },
  { key: "growth",      label: "Growth",      icon: "line-chart",  minLevel: "advanced" },
  { key: "score",       label: "Score",       icon: "star",        minLevel: "intermediate" },
  { key: "decision",    label: "Decision",    icon: "gavel" },
  { key: "valuations",  label: "Valuations",  icon: "calculator",  minLevel: "advanced" },
  { key: "buffett",     label: "Buffett",     icon: "check-square-o", minLevel: "intermediate" },
  { key: "news",        label: "News",        icon: "newspaper-o", minLevel: "intermediate" },
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
  graham:    { title: "Graham Growth",        formula: "IV = EPS × (8.5 + 2g) × 4.4 / Y",  icon: "university" },
  dcf:       { title: "Two-Stage DCF",        formula: "Gordon Growth Terminal Value", icon: "sitemap" },
  ddm:       { title: "Dividend Discount",    formula: "Gordon Growth Model",          icon: "money" },
  multiples: { title: "Comparable Multiples", formula: "e.g., P/E × EPS",             icon: "balance-scale" },
};

/**
 * CFA-Based Composite Scoring Model v2.1
 *
 * Methodology: Weighted positive pillars minus risk penalty
 * Source: CFA Program Curriculum Level II – Equity Valuation
 *
 * Weight Rationale:
 * - Fundamental (30%): Core profitability (ROIC/ROE), margins & leverage
 * - Quality (25%): Earnings quality, cash conversion, accruals
 * - Growth (25%): Multi-year CAGRs, stability, profit-aware growth
 * - Valuation (20%): Earnings yield, EV/EBIT, P/B, intrinsic value discount
 * - Risk (−15% deduction): Volatility, drawdown, balance sheet risk, market cap
 *   Risk does NOT contribute positively. It only penalizes risky stocks.
 *
 * Note: Scores are absolute (0-100), not peer-relative.
 * Use sector_percentile (when available) for peer comparison.
 */
export const SCORE_WEIGHTS = {
  FUNDAMENTAL: { value: 0.30, label: "30%", key: "fundamental_score" as const, iconColor: "#10b981" },
  QUALITY:     { value: 0.25, label: "25%", key: "quality_score" as const,     iconColor: "#3b82f6" },
  GROWTH:      { value: 0.25, label: "25%", key: "growth_score" as const,      iconColor: "#f97316" },
  VALUATION:   { value: 0.20, label: "20%", key: "valuation_score" as const,   iconColor: "#6366f1" },
  RISK:        { value: 0.15, label: "−15%", key: "risk_score" as const,       iconColor: "#ef4444" },
} as const;

export const SCORE_THRESHOLDS = {
  EXCEPTIONAL: 85,
  STRONG: 70,
  ACCEPTABLE: 55,
  WEAK: 40,
  AVOID: 0,
} as const;

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
