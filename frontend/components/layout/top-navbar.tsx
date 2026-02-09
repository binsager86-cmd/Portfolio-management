"use client";

import React from "react";
import { Bell, Search, RefreshCw, Moon, Sun, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useTheme } from "@/components/theme-provider";

interface TopNavbarProps {
  title?: string;
  subtitle?: string;
  onRefresh?: () => void;
  refreshing?: boolean;
}

export default function TopNavbar({
  title = "Trading Section",
  subtitle,
  onRefresh,
  refreshing,
}: TopNavbarProps) {
  const { theme, toggleTheme, privacyMode, togglePrivacy } = useTheme();

  return (
    <header className="sticky top-0 z-30 flex h-16 shrink-0 items-center justify-between border-b border-surface-border bg-white/80 backdrop-blur-md dark:border-white/10 dark:bg-[#0e1525]/80 px-6">
      {/* Left: Title */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-lg font-semibold text-brand-900 dark:text-white">{title}</h1>
          {subtitle && (
            <p className="text-xs text-surface-muted dark:text-slate-400">{subtitle}</p>
          )}
        </div>
      </div>

      {/* Center: Search */}
      <div className="hidden max-w-md flex-1 px-8 md:block">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-surface-muted" />
          <Input
            placeholder="Search transactions, symbols..."
            className="h-9 bg-surface pl-9 text-sm dark:bg-white/5 dark:text-slate-200 dark:border-white/10 dark:placeholder:text-slate-500"
          />
        </div>
      </div>

      {/* Right: Actions */}
      <div className="flex items-center gap-2">
        <Select defaultValue="ALL">
          <SelectTrigger className="h-9 w-28 text-xs dark:bg-white/5 dark:border-white/10 dark:text-slate-200">
            <SelectValue placeholder="Portfolio" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">All Portfolios</SelectItem>
            <SelectItem value="KFH">KFH</SelectItem>
            <SelectItem value="BBYN">BBYN</SelectItem>
            <SelectItem value="USA">USA</SelectItem>
          </SelectContent>
        </Select>

        {onRefresh && (
          <Button
            variant="outline"
            size="sm"
            onClick={onRefresh}
            disabled={refreshing}
            className="gap-1.5 text-xs dark:border-white/10 dark:text-slate-300 dark:hover:bg-white/10"
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${refreshing ? "animate-spin" : ""}`}
            />
            Refresh
          </Button>
        )}

        {/* ── Separator ──────────────────────────────────── */}
        <div className="mx-1 h-6 w-px bg-surface-border dark:bg-white/10" />

        {/* ── Dark / Light Toggle ────────────────────────── */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="h-9 w-9 dark:text-slate-300 dark:hover:bg-white/10"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4 text-amber-400" />
              ) : (
                <Moon className="h-4 w-4 text-slate-500" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
          </TooltipContent>
        </Tooltip>

        {/* ── Privacy Toggle ─────────────────────────────── */}
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              onClick={togglePrivacy}
              className={`h-9 w-9 dark:text-slate-300 dark:hover:bg-white/10 ${
                privacyMode ? "text-brand-600 bg-brand-50 dark:bg-brand-600/20 dark:text-brand-400" : ""
              }`}
            >
              {privacyMode ? (
                <EyeOff className="h-4 w-4" />
              ) : (
                <Eye className="h-4 w-4" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            {privacyMode ? "Show values" : "Hide values (privacy)"}
          </TooltipContent>
        </Tooltip>

        {/* ── Separator ──────────────────────────────────── */}
        <div className="mx-1 h-6 w-px bg-surface-border dark:bg-white/10" />

        <Button variant="ghost" size="icon" className="relative h-9 w-9 dark:text-slate-300 dark:hover:bg-white/10">
          <Bell className="h-4 w-4 text-surface-muted" />
          <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-danger" />
        </Button>

        <div className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-900 text-xs font-semibold text-white dark:bg-brand-600">
          S
        </div>
      </div>
    </header>
  );
}
