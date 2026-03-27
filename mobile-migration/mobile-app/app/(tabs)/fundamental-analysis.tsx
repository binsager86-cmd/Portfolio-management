/**
 * Fundamental Analysis screen — thin routing shell.
 * All business logic and UI live in src/features/fundamental-analysis/.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";

import { useResponsive } from "@/hooks/useResponsive";
import { AnalysisStock } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";

import { ComparisonPanel } from "@/src/features/fundamental-analysis/components/ComparisonPanel";
import { GrowthPanel } from "@/src/features/fundamental-analysis/components/GrowthPanel";
import { MetricsPanel } from "@/src/features/fundamental-analysis/components/MetricsPanel";
import { ScorePanel } from "@/src/features/fundamental-analysis/components/ScorePanel";
import { ErrorBoundary } from "@/src/features/fundamental-analysis/components/shared";
import { StatementsPanel } from "@/src/features/fundamental-analysis/components/StatementsPanel";
import { StocksPanel } from "@/src/features/fundamental-analysis/components/StocksPanel";
import { ValuationsPanel } from "@/src/features/fundamental-analysis/components/ValuationsPanel";
import { st } from "@/src/features/fundamental-analysis/styles";
import { SUB_TABS, type SubTab } from "@/src/features/fundamental-analysis/types";

export default function FundamentalAnalysisScreen() {
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();
  const [tab, setTab] = useState<SubTab>("stocks");
  const [selectedStockId, setSelectedStockId] = useState<number | null>(null);
  const [selectedStockSymbol, setSelectedStockSymbol] = useState<string>("");

  const handleSelectStock = useCallback((stock: AnalysisStock) => {
    setSelectedStockId(stock.id);
    setSelectedStockSymbol(stock.symbol);
    setTab("statements");
  }, []);

  const handleBack = useCallback(() => {
    setSelectedStockId(null);
    setSelectedStockSymbol("");
    setTab("stocks");
  }, []);

  return (
    <View style={[st.container, { backgroundColor: colors.bgPrimary }]}>
      {/* ── Header ─────────────────────────────────────────── */}
      <View style={[st.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor }]}>
        <View style={{ flex: 1 }}>
          <View style={[st.rowCenter, { gap: 10 }]}>
            {selectedStockId && (
              <Pressable onPress={handleBack} hitSlop={12} style={st.headerBack}>
                <FontAwesome name="chevron-left" size={14} color={colors.accentPrimary} />
              </Pressable>
            )}
            <Text style={[st.headerTitle, { color: colors.textPrimary }]}>
              {selectedStockId ? selectedStockSymbol : "Fundamental Analysis"}
            </Text>
            {selectedStockId && (
              <View style={[st.headerBadge, { backgroundColor: colors.accentPrimary + "15" }]}>
                <FontAwesome name="flask" size={10} color={colors.accentPrimary} />
              </View>
            )}
          </View>
          {!selectedStockId && (
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              CFA-grade stock analysis & valuation
            </Text>
          )}
        </View>
      </View>

      {/* ── Tab bar ────────────────────────────────────────── */}
      <View style={[st.tabContainer, { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
          {SUB_TABS.map((t) => {
            const disabled = t.key !== "stocks" && !selectedStockId;
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => !disabled && setTab(t.key)}
                style={[
                  st.tabBtn,
                  active && [st.tabBtnActive, { backgroundColor: colors.accentPrimary + "12" }],
                  disabled && { opacity: 0.35 },
                ]}
              >
                <FontAwesome
                  name={t.icon}
                  size={12}
                  color={active ? colors.accentPrimary : colors.textMuted}
                  style={{ marginRight: 5 }}
                />
                <Text style={{
                  color: active ? colors.accentPrimary : colors.textSecondary,
                  fontWeight: active ? "700" : "500",
                  fontSize: 12,
                }}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Content — each panel wrapped in ErrorBoundary ── */}
      {tab === "stocks" && (
        <ErrorBoundary colors={colors}>
          <StocksPanel colors={colors} isDesktop={isDesktop} onSelect={handleSelectStock} />
        </ErrorBoundary>
      )}
      {tab === "statements" && selectedStockId && (
        <ErrorBoundary colors={colors}>
          <StatementsPanel stockId={selectedStockId} stockSymbol={selectedStockSymbol} colors={colors} isDesktop={isDesktop} />
        </ErrorBoundary>
      )}
      {tab === "comparison" && selectedStockId && (
        <ErrorBoundary colors={colors}>
          <ComparisonPanel stockId={selectedStockId} stockSymbol={selectedStockSymbol} colors={colors} isDesktop={isDesktop} />
        </ErrorBoundary>
      )}
      {tab === "metrics" && selectedStockId && (
        <ErrorBoundary colors={colors}>
          <MetricsPanel stockId={selectedStockId} stockSymbol={selectedStockSymbol} colors={colors} isDesktop={isDesktop} />
        </ErrorBoundary>
      )}
      {tab === "growth" && selectedStockId && (
        <ErrorBoundary colors={colors}>
          <GrowthPanel stockId={selectedStockId} stockSymbol={selectedStockSymbol} colors={colors} isDesktop={isDesktop} />
        </ErrorBoundary>
      )}
      {tab === "score" && selectedStockId && (
        <ErrorBoundary colors={colors}>
          <ScorePanel stockId={selectedStockId} stockSymbol={selectedStockSymbol} colors={colors} isDesktop={isDesktop} />
        </ErrorBoundary>
      )}
      {tab === "valuations" && selectedStockId && (
        <ErrorBoundary colors={colors}>
          <ValuationsPanel stockId={selectedStockId} stockSymbol={selectedStockSymbol} colors={colors} isDesktop={isDesktop} />
        </ErrorBoundary>
      )}
    </View>
  );
}
