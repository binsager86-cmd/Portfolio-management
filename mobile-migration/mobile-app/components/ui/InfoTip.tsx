/**
 * InfoTip — "?" icon that shows a popover definition on press.
 * Used next to financial jargon labels (WACC, Sharpe Ratio, etc.).
 */

import { useThemeStore } from "@/services/themeStore";
import { FontAwesome } from "@expo/vector-icons";
import React, { useState } from "react";
import { Modal, Platform, Pressable, StyleSheet, Text, View } from "react-native";

interface InfoTipProps {
  term: string;
  definition: string;
  size?: number;
}

export function InfoTip({ term, definition, size = 13 }: InfoTipProps) {
  const { colors } = useThemeStore();
  const [visible, setVisible] = useState(false);

  return (
    <>
      <Pressable
        onPress={() => setVisible(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel={`Info about ${term}`}
        style={Platform.OS === "web" ? ({ cursor: "pointer" } as any) : undefined}
      >
        <FontAwesome name="question-circle-o" size={size} color={colors.textMuted} />
      </Pressable>

      <Modal visible={visible} transparent animationType="fade" onRequestClose={() => setVisible(false)}>
        <Pressable style={styles.backdrop} onPress={() => setVisible(false)}>
          <View style={[styles.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <Text style={[styles.term, { color: colors.accentPrimary }]}>{term}</Text>
            <Text style={[styles.definition, { color: colors.textSecondary }]}>{definition}</Text>
            <Pressable
              onPress={() => setVisible(false)}
              style={[styles.close, { borderTopColor: colors.borderColor }]}
            >
              <Text style={{ color: colors.accentPrimary, fontWeight: "600" }}>Got it</Text>
            </Pressable>
          </View>
        </Pressable>
      </Modal>
    </>
  );
}

/** Common financial term definitions. */
export const GLOSSARY: Record<string, string> = {
  "WACC": "Weighted Average Cost of Capital — the blended rate a company must earn on its assets to satisfy both debt and equity holders.",
  "DCF": "Discounted Cash Flow — a valuation method that estimates the present value of future cash flows.",
  "Sharpe Ratio": "Risk-adjusted return metric. Higher is better — it measures excess return per unit of total risk (volatility).",
  "Sortino Ratio": "Like Sharpe Ratio but only penalizes downside volatility, ignoring upside swings.",
  "Beta": "A measure of a stock's volatility relative to the market. Beta > 1 means more volatile than the market.",
  "P/E": "Price-to-Earnings ratio — how much investors pay per dollar of earnings. Lower may indicate undervaluation.",
  "EPS": "Earnings Per Share — net income divided by outstanding shares. A key profitability metric.",
  "P/B": "Price-to-Book ratio — market price vs. accounting book value per share.",
  "P/S": "Price-to-Sales ratio — market cap divided by annual revenue.",
  "P/CF": "Price-to-Cash-Flow — market price relative to operating cash flow per share.",
  "EV/EBITDA": "Enterprise Value to EBITDA — a valuation multiple that accounts for debt. Lower often means cheaper.",
  "ROE": "Return on Equity — net income as a percentage of shareholders' equity. Measures profitability efficiency.",
  "ROA": "Return on Assets — net income as a percentage of total assets.",
  "FCF": "Free Cash Flow — operating cash flow minus capital expenditures. Cash available to investors.",
  "LFCF": "Levered Free Cash Flow — free cash flow after debt obligations are met.",
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.45)",
    justifyContent: "center",
    alignItems: "center",
  },
  card: {
    width: 300,
    borderRadius: 14,
    borderWidth: 1,
    padding: 20,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
  },
  term: {
    fontSize: 16,
    fontWeight: "700",
    marginBottom: 8,
  },
  definition: {
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 16,
  },
  close: {
    borderTopWidth: 1,
    paddingTop: 12,
    alignItems: "center",
  },
});
