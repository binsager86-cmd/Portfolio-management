"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import {
  LayoutDashboard,
  ArrowRightLeft,
  Wallet,
  PieChart,
  Users,
  TrendingUp,
  LineChart,
  DollarSign,
  CalendarRange,
  Database,
  ShieldCheck,
  Download,
  Settings,
  LogOut,
  ChevronLeft,
} from "lucide-react";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";

interface NavItem {
  label: string;
  href: string;
  icon: React.ElementType;
}

const mainNav: NavItem[] = [
  { label: "Overview", href: "/app/dashboard", icon: LayoutDashboard },
  { label: "Trading", href: "/app/trading", icon: ArrowRightLeft },
  { label: "Cash Deposits", href: "/app/cash", icon: Wallet },
  { label: "Transactions", href: "/app/transactions", icon: DollarSign },
  { label: "Portfolio Analysis", href: "/app/analysis", icon: PieChart },
  { label: "Peer Analysis", href: "/app/peers", icon: Users },
];

const secondaryNav: NavItem[] = [
  { label: "Tracker", href: "/app/tracker", icon: TrendingUp },
  { label: "Dividends", href: "/app/dividends", icon: LineChart },
  { label: "Planner", href: "/app/planner", icon: CalendarRange },
  { label: "Securities", href: "/app/securities", icon: Database },
  { label: "Backup", href: "/app/backup", icon: Download },
  { label: "Data Integrity", href: "/app/integrity", icon: ShieldCheck },
];

export default function Sidebar() {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = React.useState(false);

  return (
    <aside
      className={cn(
        "fixed inset-y-0 left-0 z-40 flex flex-col bg-brand-900 text-white transition-all duration-300",
        collapsed ? "w-[68px]" : "w-60"
      )}
    >
      {/* ── Logo ────────────────────────────────────────── */}
      <div className="flex h-16 items-center gap-3 px-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-white/10 font-bold text-brand-400">
          K
        </div>
        {!collapsed && (
          <span className="text-base font-semibold tracking-tight">
            KuwaitPortfolio
          </span>
        )}
      </div>

      <Separator className="bg-white/10" />

      {/* ── Main Nav ────────────────────────────────────── */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-2 py-4">
        <p
          className={cn(
            "mb-2 px-3 text-[0.65rem] font-semibold uppercase tracking-widest text-white/40",
            collapsed && "sr-only"
          )}
        >
          Main
        </p>
        {mainNav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-white/15 text-white"
                  : "text-white/60 hover:bg-white/10 hover:text-white"
              )}
            >
              <item.icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0 transition-colors",
                  active ? "text-brand-400" : "text-white/50 group-hover:text-white/80"
                )}
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}

        <Separator className="my-4 bg-white/10" />

        <p
          className={cn(
            "mb-2 px-3 text-[0.65rem] font-semibold uppercase tracking-widest text-white/40",
            collapsed && "sr-only"
          )}
        >
          Tools
        </p>
        {secondaryNav.map((item) => {
          const active = pathname === item.href;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                active
                  ? "bg-white/15 text-white"
                  : "text-white/60 hover:bg-white/10 hover:text-white"
              )}
            >
              <item.icon
                className={cn(
                  "h-[18px] w-[18px] shrink-0",
                  active ? "text-brand-400" : "text-white/50 group-hover:text-white/80"
                )}
              />
              {!collapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>

      {/* ── Bottom Section ──────────────────────────────── */}
      <div className="border-t border-white/10 p-3">
        <Link
          href="/app/settings"
          className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white"
        >
          <Settings className="h-[18px] w-[18px]" />
          {!collapsed && <span>Settings</span>}
        </Link>
        <button className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm text-white/60 transition-colors hover:bg-white/10 hover:text-white">
          <LogOut className="h-[18px] w-[18px]" />
          {!collapsed && <span>Log out</span>}
        </button>
      </div>

      {/* ── Collapse Toggle ─────────────────────────────── */}
      <Button
        variant="ghost"
        size="icon"
        onClick={() => setCollapsed((c) => !c)}
        className="absolute -right-3 top-20 h-6 w-6 rounded-full border border-surface-border bg-white text-brand-900 shadow-sm hover:bg-slate-100 dark:border-white/10 dark:bg-[#1a2236] dark:text-slate-200 dark:hover:bg-white/20"
      >
        <ChevronLeft
          className={cn(
            "h-3.5 w-3.5 transition-transform",
            collapsed && "rotate-180"
          )}
        />
      </Button>
    </aside>
  );
}
