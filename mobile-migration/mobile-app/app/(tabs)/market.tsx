/**
 * Market Tab — Boursa Kuwait live market data.
 *
 * Sections:
 *  • Market indices (Premier, Main, All-Share, BK Main 50)
 *  • Today's Summary card (shares traded, value, trades)
 *  • Market Mood (gainers / neutral / losers bar)
 *  • Top Risers / Biggest Drops / Most Traded tables
 *  • Sector Performance table
 */

import { useMarketRefresh, useMarketSummary } from "@/hooks/queries/useMarketQueries";
import { useResponsive } from "@/hooks/useResponsive";
import type { MarketIndex, MarketMover, PerMarketSummary, SectorIndex } from "@/services/market/marketApi";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useState } from "react";
import {
    ActivityIndicator,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View,
} from "react-native";

// ── Helpers ─────────────────────────────────────────────────────────

function fmt(n: number | null | undefined, decimals = 2): string {
  if (n == null) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

function fmtCompact(n: number | null | undefined): string {
  if (n == null) return "—";
  if (Math.abs(n) >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + "B";
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + "M";
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + "K";
  return Math.round(n).toLocaleString("en-US");
}

function fmtInt(n: number | null | undefined): string {
  if (n == null) return "—";
  return Math.round(n).toLocaleString("en-US");
}

function changeColor(val: number | null | undefined, colors: any): string {
  if (val == null || val === 0) return colors.textMuted;
  return val > 0 ? "#22c55e" : "#ef4444";
}

function changePrefix(val: number | null | undefined): string {
  if (val == null || val === 0) return "";
  return val > 0 ? "+" : "";
}

// ── Sub-components ──────────────────────────────────────────────────

function IndexCard({
  index,
  colors,
  isCompact,
}: {
  index: MarketIndex;
  colors: any;
  isCompact?: boolean;
}) {
  const chgColor = changeColor(index.changePercent, colors);
  const isUp = (index.changePercent ?? 0) > 0;
  const isDown = (index.changePercent ?? 0) < 0;
  return (
    <View
      style={[
        s.indexCard,
        {
          backgroundColor: colors.cardBg,
          borderColor: colors.borderColor,
          borderLeftColor: chgColor,
          borderLeftWidth: 3,
        },
        isCompact && { minWidth: 150, flex: 1 },
      ]}
    >
      <Text style={[s.indexName, { color: colors.textSecondary }]} numberOfLines={1}>
        {index.name}
      </Text>
      <Text style={[s.indexValue, { color: colors.textPrimary }]}>
        {fmt(index.value)}
      </Text>
      <View style={s.changeRow}>
        <FontAwesome
          name={isUp ? "caret-up" : isDown ? "caret-down" : "minus"}
          size={isUp || isDown ? 16 : 10}
          color={chgColor}
          style={{ marginRight: 4 }}
        />
        <Text style={[s.changeText, { color: chgColor }]}>
          {changePrefix(index.change)}
          {fmt(index.change)}
        </Text>
        <View style={[s.changeBadge, { backgroundColor: chgColor + "18" }]}>
          <Text style={[s.changePct, { color: chgColor }]}>
            {changePrefix(index.changePercent)}
            {fmt(index.changePercent)}%
          </Text>
        </View>
      </View>
    </View>
  );
}

function SummaryCard({
  summary,
  colors,
}: {
  summary: Record<string, any>;
  colors: any;
}) {
  return (
    <View style={[s.summaryCard, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
      <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>TODAY'S ACTIVITY</Text>
      <View style={s.summaryRow}>
        <View style={s.summaryItem}>
          <FontAwesome name="bar-chart" size={16} color={colors.accentSecondary} style={{ marginBottom: 6 }} />
          <Text style={[s.summaryValue, { color: colors.textPrimary }]}>
            {fmtCompact(summary.volume)}
          </Text>
          <Text style={[s.summaryLabel, { color: colors.textMuted }]}>Shares Traded</Text>
        </View>
        <View style={[s.summaryDivider, { backgroundColor: colors.borderColor }]} />
        <View style={s.summaryItem}>
          <FontAwesome name="money" size={16} color={colors.accentPrimary} style={{ marginBottom: 6 }} />
          <Text style={[s.summaryValue, { color: colors.textPrimary }]}>
            {fmtCompact(summary.value_traded)}
          </Text>
          <Text style={[s.summaryLabel, { color: colors.textMuted }]}>Value (KWD)</Text>
        </View>
        <View style={[s.summaryDivider, { backgroundColor: colors.borderColor }]} />
        <View style={s.summaryItem}>
          <FontAwesome name="exchange" size={14} color={colors.accentTertiary} style={{ marginBottom: 6 }} />
          <Text style={[s.summaryValue, { color: colors.textPrimary }]}>
            {fmtInt(summary.trades)}
          </Text>
          <Text style={[s.summaryLabel, { color: colors.textMuted }]}>Trades</Text>
        </View>
      </View>
    </View>
  );
}

function pct(part: number | null | undefined, total: number | null | undefined): string | null {
  if (!part || !total || total === 0) return null;
  return ((part / total) * 100).toFixed(1) + "%";
}

function MarketDetailCard({
  title,
  icon,
  index,
  perMarket,
  totalSummary,
  colors,
}: {
  title: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  index: MarketIndex | undefined;
  perMarket: PerMarketSummary;
  totalSummary: Record<string, any>;
  colors: any;
}) {
  const chgColor = index ? changeColor(index.changePercent, colors) : colors.textMuted;
  const volPct = pct(perMarket.volume, totalSummary.volume);
  const valPct = pct(perMarket.value_traded, totalSummary.value_traded);
  const tradePct = pct(perMarket.trades, totalSummary.trades);
  return (
    <View style={[s.detailCard, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
      <View style={s.detailHeader}>
        <View style={[s.detailIconBg, { backgroundColor: chgColor + "15" }]}>
          <FontAwesome name={icon} size={16} color={chgColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.detailTitle, { color: colors.textPrimary }]}>{title}</Text>
          {index && (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "800" }}>
                {fmt(index.value)}
              </Text>
              <View style={[s.detailChangeBadge, { backgroundColor: chgColor + "18" }]}>
                <Text style={{ color: chgColor, fontSize: 12, fontWeight: "700" }}>
                  {changePrefix(index.changePercent)}{fmt(index.changePercent)}%
                </Text>
              </View>
            </View>
          )}
        </View>
      </View>
      <View style={s.detailStats}>
        <View style={s.detailStatItem}>
          <Text style={[s.detailStatLabel, { color: colors.textMuted }]}>Volume</Text>
          <Text style={[s.detailStatValue, { color: colors.textPrimary }]}>
            {fmtCompact(perMarket.volume)}
          </Text>
          {volPct && <Text style={[s.detailPct, { color: colors.accentSecondary }]}>{volPct}</Text>}
        </View>
        <View style={[s.summaryDivider, { backgroundColor: colors.borderColor }]} />
        <View style={s.detailStatItem}>
          <Text style={[s.detailStatLabel, { color: colors.textMuted }]}>Value (KWD)</Text>
          <Text style={[s.detailStatValue, { color: colors.textPrimary }]}>
            {fmtCompact(perMarket.value_traded)}
          </Text>
          {valPct && <Text style={[s.detailPct, { color: colors.accentPrimary }]}>{valPct}</Text>}
        </View>
        <View style={[s.summaryDivider, { backgroundColor: colors.borderColor }]} />
        <View style={s.detailStatItem}>
          <Text style={[s.detailStatLabel, { color: colors.textMuted }]}>Trades</Text>
          <Text style={[s.detailStatValue, { color: colors.textPrimary }]}>
            {fmtInt(perMarket.trades)}
          </Text>
          {tradePct && <Text style={[s.detailPct, { color: colors.accentTertiary }]}>{tradePct}</Text>}
        </View>
        {perMarket.market_cap != null && perMarket.market_cap > 0 && (
          <>
            <View style={[s.summaryDivider, { backgroundColor: colors.borderColor }]} />
            <View style={s.detailStatItem}>
              <Text style={[s.detailStatLabel, { color: colors.textMuted }]}>Market Cap</Text>
              <Text style={[s.detailStatValue, { color: colors.textPrimary }]}>
                {fmtCompact(perMarket.market_cap)}
              </Text>
            </View>
          </>
        )}
      </View>
    </View>
  );
}

function GainersLosersBar({
  gainers,
  neutral,
  losers,
  colors,
}: {
  gainers: number;
  neutral: number;
  losers: number;
  colors: any;
}) {
  const total = gainers + neutral + losers || 1;
  const gPct = Math.round((gainers / total) * 100);
  const lPct = Math.round((losers / total) * 100);
  const nPct = 100 - gPct - lPct;
  return (
    <View style={[s.glCard, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
      <Text style={[s.sectionLabel, { color: colors.textSecondary }]}>MARKET MOOD</Text>
      <Text style={[s.glSubtitle, { color: colors.textMuted }]}>
        How sectors are doing today
      </Text>
      <View style={s.glBar}>
        {gainers > 0 && (
          <View style={[s.glSegment, { flex: gainers / total, backgroundColor: "#22c55e", borderTopLeftRadius: 5, borderBottomLeftRadius: 5 }]} />
        )}
        {neutral > 0 && (
          <View style={[s.glSegment, { flex: neutral / total, backgroundColor: "#94a3b8" }]} />
        )}
        {losers > 0 && (
          <View style={[s.glSegment, { flex: losers / total, backgroundColor: "#ef4444", borderTopRightRadius: 5, borderBottomRightRadius: 5 }]} />
        )}
      </View>
      <View style={s.glLabels}>
        <View style={s.glLabelItem}>
          <View style={[s.glDot, { backgroundColor: "#22c55e" }]} />
          <Text style={[s.glLabelText, { color: "#22c55e" }]}>
            {gainers} Up ({gPct}%)
          </Text>
        </View>
        <View style={s.glLabelItem}>
          <View style={[s.glDot, { backgroundColor: "#94a3b8" }]} />
          <Text style={[s.glLabelText, { color: colors.textMuted }]}>
            {neutral} Flat ({nPct}%)
          </Text>
        </View>
        <View style={s.glLabelItem}>
          <View style={[s.glDot, { backgroundColor: "#ef4444" }]} />
          <Text style={[s.glLabelText, { color: "#ef4444" }]}>
            {losers} Down ({lPct}%)
          </Text>
        </View>
      </View>
    </View>
  );
}

function MoverTable({
  title,
  subtitle,
  movers,
  icon,
  accentColor,
  colors,
}: {
  title: string;
  subtitle: string;
  movers: MarketMover[];
  icon: React.ComponentProps<typeof FontAwesome>["name"];
  accentColor: string;
  colors: any;
}) {
  if (!movers.length) return null;
  return (
    <View style={[s.moverCard, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
      <View style={s.moverHeader}>
        <View style={[s.moverIconBg, { backgroundColor: accentColor + "15" }]}>
          <FontAwesome name={icon} size={13} color={accentColor} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
            {title}
          </Text>
          <Text style={[s.moverSubtitle, { color: colors.textMuted }]}>
            {subtitle}
          </Text>
        </View>
      </View>
      {/* Header row */}
      <View style={[s.tableRow, s.tableHeaderRow]}>
        <View style={s.colStock}>
          <Text style={[s.colHeaderText, { color: colors.textMuted }]}>Stock</Text>
        </View>
        <View style={s.colPrice}>
          <Text style={[s.colHeaderText, { color: colors.textMuted, textAlign: "right" }]}>Price</Text>
        </View>
        <View style={s.colChange}>
          <Text style={[s.colHeaderText, { color: colors.textMuted, textAlign: "right" }]}>Change</Text>
        </View>
        <View style={s.colVolume}>
          <Text style={[s.colHeaderText, { color: colors.textMuted, textAlign: "right" }]}>Volume</Text>
        </View>
      </View>
      {movers.map((m, i) => {
        const chg = changeColor(m.changePercent, colors);
        return (
          <View
            key={m.symbol}
            style={[
              s.tableRow,
              i % 2 === 0 && { backgroundColor: colors.bgSecondary + "40" },
            ]}
          >
            <View style={s.colStock}>
              <Text style={{ color: colors.textPrimary, fontWeight: "600", fontSize: 13 }} numberOfLines={1}>
                {m.symbol}
              </Text>
            </View>
            <View style={s.colPrice}>
              <Text style={{ color: colors.textPrimary, fontSize: 13, textAlign: "right" }}>
                {fmt(m.last, 0)}
              </Text>
            </View>
            <View style={[s.colChange, { alignItems: "flex-end" }]}>
              <View style={[s.changePill, { backgroundColor: chg + "12" }]}>
                <Text style={{ color: chg, fontSize: 12, fontWeight: "700" }}>
                  {changePrefix(m.changePercent)}
                  {fmt(m.changePercent)}%
                </Text>
              </View>
            </View>
            <View style={s.colVolume}>
              <Text style={{ color: colors.textSecondary, fontSize: 12, textAlign: "right" }}>
                {fmtCompact(m.volume)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

function SectorTable({
  sectors,
  colors,
}: {
  sectors: SectorIndex[];
  colors: any;
}) {
  if (!sectors.length) return null;
  // Sort: biggest gainers first, then losers
  const sorted = [...sectors].sort((a, b) => (b.changePercent ?? 0) - (a.changePercent ?? 0));
  return (
    <View style={[s.moverCard, { backgroundColor: colors.cardBg, borderColor: colors.borderColor }]}>
      <View style={s.moverHeader}>
        <View style={[s.moverIconBg, { backgroundColor: colors.accentPrimary + "15" }]}>
          <FontAwesome name="th-large" size={13} color={colors.accentPrimary} />
        </View>
        <View style={{ flex: 1 }}>
          <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
            Sector Performance
          </Text>
          <Text style={[s.moverSubtitle, { color: colors.textMuted }]}>
            How each sector moved today
          </Text>
        </View>
      </View>
      {/* Header */}
      <View style={[s.tableRow, s.tableHeaderRow]}>
        <View style={s.colSector}>
          <Text style={[s.colHeaderText, { color: colors.textMuted }]}>Sector</Text>
        </View>
        <View style={s.colChange}>
          <Text style={[s.colHeaderText, { color: colors.textMuted, textAlign: "right" }]}>Change</Text>
        </View>
        <View style={s.colIndex}>
          <Text style={[s.colHeaderText, { color: colors.textMuted, textAlign: "right" }]}>Index</Text>
        </View>
      </View>
      {sorted.map((sec, i) => {
        const chg = changeColor(sec.changePercent, colors);
        return (
          <View
            key={sec.name}
            style={[
              s.tableRow,
              i % 2 === 0 && { backgroundColor: colors.bgSecondary + "40" },
            ]}
          >
            <View style={s.colSector}>
              <Text
                style={{ color: colors.textPrimary, fontWeight: "500", fontSize: 13 }}
                numberOfLines={1}
              >
                {sec.name}
              </Text>
            </View>
            <View style={[s.colChange, { alignItems: "flex-end" }]}>
              <View style={[s.changePill, { backgroundColor: chg + "12" }]}>
                <Text style={{ color: chg, fontSize: 12, fontWeight: "700" }}>
                  {changePrefix(sec.changePercent)}
                  {fmt(sec.changePercent)}%
                </Text>
              </View>
            </View>
            <View style={s.colIndex}>
              <Text style={{ color: colors.textSecondary, fontSize: 13, textAlign: "right" }}>
                {fmt(sec.last)}
              </Text>
            </View>
          </View>
        );
      })}
    </View>
  );
}

// ── Main Screen ─────────────────────────────────────────────────────

export default function MarketScreen() {
  const { colors } = useThemeStore();
  const { isDesktop, isPhone, spacing, maxContentWidth } = useResponsive();
  const { data, isLoading, isError, refetch, isFetching } = useMarketSummary();
  const refreshMarket = useMarketRefresh();
  const [refreshing, setRefreshing] = useState(false);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshMarket();
    } catch {
      // ignore
    }
    setRefreshing(false);
  }, [refreshMarket]);

  if (isLoading) {
    return (
      <View style={[s.center, { backgroundColor: colors.bgPrimary }]}>
        <ActivityIndicator size="large" color={colors.accentPrimary} />
        <Text style={{ color: colors.textMuted, marginTop: 12 }}>Loading market data…</Text>
      </View>
    );
  }

  if (isError || !data) {
    return (
      <View style={[s.center, { backgroundColor: colors.bgPrimary }]}>
        <FontAwesome name="exclamation-triangle" size={32} color={colors.textMuted} />
        <Text style={{ color: colors.textMuted, marginTop: 12, textAlign: "center" }}>
          Market data unavailable.{"\n"}Pull down to retry.
        </Text>
      </View>
    );
  }

  const premierIndex = data.indices.find((idx) => idx.name === "Premier Market");
  const mainIndex = data.indices.find((idx) => idx.name === "Main Market");
  const summary = data.market_summary;

  return (
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bgPrimary }}
      contentContainerStyle={[
        s.scrollContent,
        { maxWidth: maxContentWidth, alignSelf: "center", width: "100%", padding: spacing.pagePx },
      ]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={onRefresh}
          tintColor={colors.accentPrimary}
          colors={[colors.accentPrimary]}
        />
      }
    >
      {/* ── Header ── */}
      <View style={s.header}>
        <View style={{ flex: 1 }}>
          <Text style={[s.screenTitle, { color: colors.textPrimary }]}>
            Boursa Kuwait
          </Text>
          <View style={s.headerMeta}>
            <View style={[s.statusDot, { backgroundColor: data.status === "open" ? "#22c55e" : "#ef4444" }]} />
            <Text style={[s.headerDate, { color: colors.textMuted }]}>
              {data.status === "open" ? "Market Open" : "Market Closed"} · {data.date || "—"}
            </Text>
          </View>
        </View>
        <Pressable
          onPress={onRefresh}
          style={[s.refreshBtn, { backgroundColor: colors.accentPrimary + "15" }]}
          disabled={isFetching}
        >
          <FontAwesome
            name="refresh"
            size={16}
            color={colors.accentPrimary}
            style={isFetching ? { opacity: 0.4 } : undefined}
          />
        </Pressable>
      </View>

      {data._stale && (
        <View style={[s.staleBanner, { backgroundColor: "#f59e0b20" }]}>
          <FontAwesome name="clock-o" size={14} color="#f59e0b" />
          <Text style={{ color: "#f59e0b", marginLeft: 6, fontSize: 12 }}>
            Showing last available data — live update failed
          </Text>
        </View>
      )}

      {/* ── Index Cards Row ── */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={s.indexRow}
      >
        {data.indices.map((idx) => (
          <IndexCard key={idx.name} index={idx} colors={colors} isCompact={isPhone} />
        ))}
      </ScrollView>

      {/* ── Today's Summary ── */}
      <SummaryCard summary={summary} colors={colors} />

      {/* ── Premier & Main Market Detail Cards ── */}
      <View style={[s.detailRow, isDesktop && { flexDirection: "row", gap: 16 }]}>
        {data.premier_summary && (
          <MarketDetailCard
            title="Premier Market"
            icon="diamond"
            index={premierIndex}
            perMarket={data.premier_summary}
            totalSummary={summary}
            colors={colors}
          />
        )}
        {data.main_summary && (
          <MarketDetailCard
            title="Main Market"
            icon="building"
            index={mainIndex}
            perMarket={data.main_summary}
            totalSummary={summary}
            colors={colors}
          />
        )}
      </View>

      {/* ── Market Mood ── */}
      <GainersLosersBar
        gainers={summary.gainers ?? 0}
        neutral={summary.neutral ?? 0}
        losers={summary.losers ?? 0}
        colors={colors}
      />

      {/* ── Top movers (side by side on desktop) ── */}
      <View style={[s.moversRow, isDesktop && { flexDirection: "row", gap: 16 }]}>
        <MoverTable
          title="Top Risers"
          subtitle="Stocks with biggest gains today"
          movers={data.top_gainers}
          icon="arrow-up"
          accentColor="#22c55e"
          colors={colors}
        />
        <MoverTable
          title="Biggest Drops"
          subtitle="Stocks with biggest losses today"
          movers={data.top_losers}
          icon="arrow-down"
          accentColor="#ef4444"
          colors={colors}
        />
      </View>

      {/* ── Most Traded ── */}
      <MoverTable
        title="Most Traded"
        subtitle="Highest value traded today"
        movers={data.top_value}
        icon="money"
        accentColor={colors.accentPrimary}
        colors={colors}
      />

      {/* ── Sector Performance ── */}
      <SectorTable sectors={data.sectors} colors={colors} />

      {/* Footer spacing */}
      <View style={{ height: 40 }} />
    </ScrollView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const s = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
  },
  scrollContent: {
    paddingBottom: 24,
  },

  /* Header */
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  screenTitle: {
    fontSize: 22,
    fontWeight: "800",
  },
  headerMeta: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 4,
    gap: 6,
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  headerDate: {
    fontSize: 13,
    fontWeight: "500",
  },
  refreshBtn: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  staleBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    marginBottom: 12,
  },

  /* Section label (uppercase, matches Overview tab) */
  sectionLabel: {
    fontSize: 13,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginBottom: 12,
  },

  /* Index cards */
  indexRow: {
    gap: 10,
    paddingVertical: 4,
    marginBottom: 16,
  },
  indexCard: {
    padding: 14,
    borderRadius: 12,
    borderWidth: 1,
    minWidth: 155,
  },
  indexName: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  indexValue: {
    fontSize: 20,
    fontWeight: "800",
    marginBottom: 6,
  },
  changeRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
  },
  changeText: {
    fontSize: 13,
    fontWeight: "600",
  },
  changeBadge: {
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  changePct: {
    fontSize: 12,
    fontWeight: "700",
  },

  /* Summary card */
  summaryCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  summaryItem: {
    alignItems: "center",
    flex: 1,
    paddingVertical: 4,
  },
  summaryValue: {
    fontSize: 17,
    fontWeight: "800",
    marginBottom: 2,
  },
  summaryLabel: {
    fontSize: 11,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },
  summaryDivider: {
    width: 1,
    height: 36,
    opacity: 0.5,
  },

  /* Market detail cards (Premier / Main) */
  detailRow: {
    marginBottom: 16,
  },
  detailCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 12,
    flex: 1,
  },
  detailHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginBottom: 14,
  },
  detailIconBg: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
  },
  detailTitle: {
    fontSize: 13,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  detailChangeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 6,
  },
  detailStats: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-around",
  },
  detailStatItem: {
    alignItems: "center",
    flex: 1,
    paddingVertical: 4,
  },
  detailStatLabel: {
    fontSize: 10,
    fontWeight: "600",
    textTransform: "uppercase",
    letterSpacing: 0.3,
    marginBottom: 4,
  },
  detailStatValue: {
    fontSize: 15,
    fontWeight: "800",
  },
  detailPct: {
    fontSize: 11,
    fontWeight: "700",
    marginTop: 2,
  },

  /* Gainers/Losers bar */
  glCard: {
    borderRadius: 14,
    borderWidth: 1,
    padding: 16,
    marginBottom: 16,
  },
  glSubtitle: {
    fontSize: 12,
    marginTop: -8,
    marginBottom: 10,
  },
  glBar: {
    flexDirection: "row",
    height: 10,
    borderRadius: 5,
    overflow: "hidden",
    marginBottom: 10,
  },
  glSegment: {
    height: "100%",
  },
  glLabels: {
    flexDirection: "row",
    justifyContent: "space-around",
  },
  glLabelItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
  },
  glDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  glLabelText: {
    fontSize: 12,
    fontWeight: "600",
  },

  /* Mover / Sector tables */
  moversRow: {
    gap: 12,
    marginBottom: 4,
  },
  moverCard: {
    flex: 1,
    borderRadius: 14,
    borderWidth: 1,
    padding: 14,
    marginBottom: 12,
  },
  moverHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
  },
  moverIconBg: {
    width: 30,
    height: 30,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
  },
  moverSubtitle: {
    fontSize: 11,
    marginTop: 1,
  },

  /* Table grid — View-based cells for reliable alignment */
  tableRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 6,
    borderRadius: 6,
    gap: 8,
  },
  tableHeaderRow: {
    borderBottomWidth: 1,
    borderBottomColor: "rgba(128,128,128,0.15)",
    marginBottom: 2,
    paddingVertical: 8,
  },
  colHeaderText: {
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },

  /* Mover table columns */
  colStock: {
    flex: 1.4,
  },
  colPrice: {
    flex: 0.9,
  },
  colChange: {
    flex: 1.0,
  },
  colVolume: {
    flex: 0.9,
  },

  /* Sector table columns */
  colSector: {
    flex: 2,
  },
  colIndex: {
    flex: 1,
  },

  changePill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
});
