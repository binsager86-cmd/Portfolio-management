/**
 * ResponsiveGrid — auto-flowing grid that uses the responsive hook
 * to decide column count and gap.
 *
 * Usage:
 *   <ResponsiveGrid columns={{ phone: 2, tablet: 3, desktop: 5 }}>
 *     <MetricCard … />
 *     <MetricCard … />
 *   </ResponsiveGrid>
 */

import React from "react";
import { View, StyleSheet, ViewStyle } from "react-native";
import { useResponsive, Breakpoint } from "@/hooks/useResponsive";

interface Props {
  children: React.ReactNode;
  /** Column count per breakpoint (defaults: phone 2, tablet 3, desktop 4) */
  columns?: Partial<Record<Breakpoint, number>>;
  /** Extra style on the wrapper */
  style?: ViewStyle;
}

const DEFAULTS: Record<Breakpoint, number> = {
  phone: 2,
  tablet: 3,
  desktop: 4,
};

export function ResponsiveGrid({ children, columns, style }: Props) {
  const { bp, spacing } = useResponsive();
  const cols = columns?.[bp] ?? DEFAULTS[bp];
  const gap = spacing.gridGap;

  return (
    <View style={[styles.grid, { gap }, style]}>
      {React.Children.map(children, (child) => {
        if (!React.isValidElement(child)) return child;
        // Calculate width: subtract gaps, divide by cols
        // Use flexBasis with percentage for simplicity
        const pct = `${(100 / cols).toFixed(4)}%` as any;
        return (
          <View style={{ flexBasis: pct, maxWidth: pct }}>
            {child}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginBottom: 16,
  },
});
