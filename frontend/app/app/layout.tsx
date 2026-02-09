"use client";

import React from "react";
import Sidebar from "@/components/layout/sidebar";
import { TooltipProvider } from "@/components/ui/tooltip";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <TooltipProvider>
      <div className="flex min-h-screen bg-surface dark:bg-[#0B1120]">
        <Sidebar />
        {/* Main content offset by sidebar width (w-60 = 15rem) */}
        <main className="ml-60 flex flex-1 flex-col transition-all duration-300">
          {children}
        </main>
      </div>
    </TooltipProvider>
  );
}
