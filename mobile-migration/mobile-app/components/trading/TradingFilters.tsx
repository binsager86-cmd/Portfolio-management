import React from "react";
import type { ThemePalette } from "@/constants/theme";

export const PORTFOLIOS = ["KFH", "BBYN", "USA"] as const;
export const TXN_TYPES = ["Buy", "Sell", "Deposit", "Withdrawal", "Dividend", "Bonus Shares", "Dividend_Only"] as const;

// Re-export shared FilterChip for backward compatibility
export { FilterChip } from "@/components/ui/FilterChip";
