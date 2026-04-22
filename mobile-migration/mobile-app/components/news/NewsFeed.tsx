/**
 * NewsFeed — fetches and displays a list of news items.
 *
 * Supports:
 *  • Cursor-based infinite scrolling
 *  • Portfolio-filtered or market-wide mode
 *  • Category filter tabs
 *  • Pull-to-refresh
 *  • Expertise-level-aware rendering
 *  • Skeleton loading & empty state
 *  • Compliance disclaimer
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { FlashList } from "@shopify/flash-list";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
    ActivityIndicator,
    Linking,
  Modal,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    View
} from "react-native";

import { useHoldings } from "@/hooks/queries";
import { useNewsDetail } from "@/hooks/queries/useNewsQueries";
import { useNewsFeed, useNewsHistoryInfinite } from "@/hooks/queries/useNewsQueries";
import i18n from "@/lib/i18n/config";
import type { NewsCategory, NewsItem } from "@/services/news/types";
import { useThemeStore } from "@/services/themeStore";
import { useUserPrefsStore } from "@/src/store/userPrefsStore";
import { NewsDisclaimer } from "./NewsAttribution";
import { NewsCard } from "./NewsCard";

// ── Category filter config ──────────────────────────────────────

interface CategoryTab {
  key: NewsCategory | "all";
  label: string;
  icon: React.ComponentProps<typeof FontAwesome>["name"];
}

const CATEGORIES: CategoryTab[] = [
  { key: "all",                    label: "catAll",           icon: "globe" },
  { key: "company_announcement",   label: "catAnnouncements", icon: "bullhorn" },
  { key: "financial",              label: "catFinancial",     icon: "file-text-o" },
  { key: "dividend",               label: "catDividends",     icon: "money" },
  { key: "earnings",               label: "catEarnings",      icon: "bar-chart" },
  { key: "market_news",            label: "catMarket",        icon: "line-chart" },
  { key: "regulatory",             label: "catRegulatory",    icon: "gavel" },
];

// ── Props ───────────────────────────────────────────────────────

interface NewsFeedProps {
  /** Only show news related to user's portfolio symbols */
  portfolioOnly?: boolean;
  /** Compact card style for embedding in other screens */
  compact?: boolean;
  /** Max items to show (useful when embedding) */
  maxItems?: number;
  /** Hide category filter tabs */
  hideCategoryFilter?: boolean;
  /** Fixed symbol filter (for stock detail pages) */
  symbol?: string;
  /** Search query for client-side title filtering */
  searchQuery?: string;
}

// ── Component ───────────────────────────────────────────────────

export function NewsFeed({
  portfolioOnly = false,
  compact = false,
  maxItems,
  hideCategoryFilter = false,
  symbol,
  searchQuery = "",
}: NewsFeedProps) {
  const { colors } = useThemeStore();
  const expertiseLevel = useUserPrefsStore((s) => s.preferences.expertiseLevel);
  const [activeCategory, setActiveCategory] = useState<NewsCategory | "all">("all");
  const [lang, setLang] = useState(i18n.language);
  const [selectedItem, setSelectedItem] = useState<NewsItem | null>(null);

  useEffect(() => {
    const onLangChanged = (lng: string) => setLang(lng);
    i18n.on("languageChanged", onLangChanged);
    return () => { i18n.off("languageChanged", onLangChanged); };
  }, []);

  // Get user's portfolio symbols
  const { data: holdingsResp } = useHoldings();
  const userSymbols = useMemo(() => {
    if (symbol) return [symbol];
    return (holdingsResp?.holdings?.map((h: { symbol?: string }) => h.symbol).filter(Boolean) as string[]) ?? [];
  }, [holdingsResp?.holdings, symbol]);

  const categoryFilter = activeCategory === "all" ? undefined : [activeCategory] as NewsCategory[];

  // ── Live feed query (cursor-based infinite scroll) ──
  const {
    data,
    isLoading,
    isError,
    refetch,
    isRefetching,
    fetchNextPage,
    hasNextPage,
    isFetchingNextPage,
  } = useNewsFeed({
    categories: categoryFilter,
    lang,
  });

  // ── History query (past year, infinite scroll) ──
  const {
    data: historyData,
    isLoading: historyLoading,
    fetchNextPage: fetchNextHistory,
    hasNextPage: hasNextHistory,
    isFetchingNextPage: isFetchingNextHistory,
  } = useNewsHistoryInfinite({
    categories: categoryFilter,
    lang,
  });

  const { data: selectedDetail } = useNewsDetail(selectedItem?.id ?? "", !!selectedItem?.id);

  // Merge live feed + history, deduplicate by id, sort by date descending
  const newsItems = useMemo(() => {
    const liveItems: NewsItem[] = data?.pages?.flatMap((p) => p.items) ?? [];
    const historyItems: NewsItem[] = historyData?.pages?.flatMap((p) => p.items) ?? [];

    // Deduplicate — live items take priority
    const seen = new Set<string>();
    const merged: NewsItem[] = [];
    for (const item of [...liveItems, ...historyItems]) {
      if (!seen.has(item.id)) {
        seen.add(item.id);
        merged.push(item);
      }
    }

    // Sort by publishedAt descending (newest first)
    merged.sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime());

    // Client-side filter: if portfolioOnly or single-symbol mode, match by holdings
    const shouldFilter = (portfolioOnly || !!symbol) && userSymbols.length > 0;
    let filtered = shouldFilter
      ? merged.filter((it) => {
          const symSet = new Set(userSymbols.map((s) => s.toUpperCase()));
          return it.relatedSymbols.some((rs: string) => symSet.has(rs.toUpperCase()));
        })
      : merged;

    // Client-side search filter
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      filtered = filtered.filter(
        (it) =>
          it.title.toLowerCase().includes(q) ||
          it.relatedSymbols.some((rs: string) => rs.toLowerCase().includes(q))
      );
    }

    return maxItems ? filtered.slice(0, maxItems) : filtered;
  }, [data?.pages, historyData?.pages, maxItems, portfolioOnly, symbol, userSymbols, searchQuery]);

  const onRefresh = useCallback(async () => {
    await refetch();
  }, [refetch]);

  const openExternal = useCallback(async (item: NewsItem) => {
    const external = item.attachments?.[0]?.url || item.url;
    if (!external) return;
    const normalized = /^https?:\/\//i.test(external) ? external : `https://${external}`;
    try {
      await Linking.openURL(normalized);
    } catch {
      // Keep silent; user can still read in-app detail.
    }
  }, []);

  const onEndReached = useCallback(() => {
    if (hasNextPage && !isFetchingNextPage && !maxItems) {
      fetchNextPage();
    }
    // Also load more history when live feed is exhausted
    if (!hasNextPage && hasNextHistory && !isFetchingNextHistory && !maxItems) {
      fetchNextHistory();
    }
  }, [hasNextPage, isFetchingNextPage, fetchNextPage, hasNextHistory, isFetchingNextHistory, fetchNextHistory, maxItems]);

  const anyLoading = isLoading || historyLoading;

  // ── Loading ──
  if (anyLoading && !isRefetching) {
    return (
      <View style={s.loadingContainer}>
        {[1, 2, 3].map((i) => (
          <View key={i} style={[s.skeleton, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
            <View style={[s.skeletonLine, { backgroundColor: colors.borderColor, width: "40%" }]} />
            <View style={[s.skeletonLine, { backgroundColor: colors.borderColor, width: "90%", marginTop: 8 }]} />
            <View style={[s.skeletonLine, { backgroundColor: colors.borderColor, width: "60%", marginTop: 6 }]} />
          </View>
        ))}
      </View>
    );
  }

  // ── Error / Offline ──
  if (isError && newsItems.length === 0) {
    return (
      <View style={s.errorContainer}>
        <FontAwesome name="wifi" size={28} color={colors.textMuted} />
        <Text style={[s.errorText, { color: colors.textSecondary }]}>
          {i18n.t('news.unableToLoad')}
        </Text>
        <Pressable
          onPress={() => refetch()}
          style={[s.retryBtn, { borderColor: colors.accentPrimary }]}
        >
          <FontAwesome name="refresh" size={13} color={colors.accentPrimary} />
          <Text style={{ color: colors.accentPrimary, fontSize: 13, fontWeight: "600", marginLeft: 6 }}>
            {i18n.t('app.retry')}
          </Text>
        </Pressable>
      </View>
    );
  }

  // ── Render ──
  return (
    <View style={{ flex: compact ? undefined : 1 }}>
      {/* Category filter tabs */}
      {!hideCategoryFilter && !compact && (
        <View style={[s.filterRow, { borderBottomColor: colors.borderColor }]}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 12, gap: 6 }}>
            {CATEGORIES.map((cat) => {
              const active = activeCategory === cat.key;
              return (
                <Pressable
                  key={cat.key}
                  onPress={() => setActiveCategory(cat.key)}
                  style={[
                    s.filterChip,
                    {
                      backgroundColor: active ? colors.accentPrimary + "15" : "transparent",
                      borderColor: active ? colors.accentPrimary : colors.borderColor,
                    },
                  ]}
                >
                  <FontAwesome
                    name={cat.icon}
                    size={11}
                    color={active ? colors.accentPrimary : colors.textMuted}
                  />
                  <Text
                    style={{
                      color: active ? colors.accentPrimary : colors.textSecondary,
                      fontSize: 12,
                      fontWeight: active ? "700" : "500",
                      marginLeft: 5,
                    }}
                  >
                    {i18n.t('news.' + cat.label)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
        </View>
      )}

      {/* News list — FlashList for 60fps virtualization */}
      <FlashList
        data={newsItems}
        keyExtractor={(item) => item.id}
        drawDistance={200}
        renderItem={({ item }) => (
          <NewsCard
            item={item}
            colors={colors}
            expertiseLevel={expertiseLevel}
            compact={compact}
            onPress={() => setSelectedItem(item)}
          />
        )}
        contentContainerStyle={{ padding: compact ? 0 : 14 }}
        onEndReached={onEndReached}
        onEndReachedThreshold={0.5}
        refreshControl={
          compact ? undefined : (
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={onRefresh}
              tintColor={colors.accentPrimary}
            />
          )
        }
        ListHeaderComponent={
          <>
            {isError && newsItems.length > 0 ? (
              <View style={[s.cachedBanner, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
                <FontAwesome name="wifi" size={12} color={colors.textMuted} />
                <Text style={{ color: colors.textMuted, fontSize: 12, marginLeft: 6, flex: 1 }}>
                  {i18n.t('news.showingCached')}
                </Text>
                <Pressable onPress={() => refetch()} hitSlop={8}>
                  <Text style={{ color: colors.accentPrimary, fontSize: 12, fontWeight: "600" }}>{i18n.t('app.retry')}</Text>
                </Pressable>
              </View>
            ) : null}
          </>
        }
        ListFooterComponent={
          <>
            {(isFetchingNextPage || isFetchingNextHistory) && (
              <ActivityIndicator
                size="small"
                color={colors.accentPrimary}
                style={{ marginVertical: 16 }}
              />
            )}
            {!compact && newsItems.length > 0 && (
              <NewsDisclaimer colors={colors} />
            )}
          </>
        }
        ListEmptyComponent={
          <View style={s.emptyContainer}>
            <FontAwesome name="newspaper-o" size={32} color={colors.textMuted} />
            <Text style={[s.emptyText, { color: colors.textMuted }]}>
              {portfolioOnly
                ? i18n.t('news.noPortfolioNews')
                : i18n.t('news.noNews')}
            </Text>
          </View>
        }
        scrollEnabled={!compact}
      />

      {/* In-app detail viewer ensures old/cached articles remain openable */}
      <Modal
        visible={!!selectedItem}
        transparent
        animationType="slide"
        onRequestClose={() => setSelectedItem(null)}
      >
        <View style={[s.modalBackdrop, { backgroundColor: "rgba(0,0,0,0.45)" }]}>
          <View style={[s.modalCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
            <View style={s.modalHeader}>
              <Text style={[s.modalTitle, { color: colors.textPrimary }]} numberOfLines={2}>
                {selectedDetail?.title ?? selectedItem?.title}
              </Text>
              <Pressable onPress={() => setSelectedItem(null)} hitSlop={8}>
                <FontAwesome name="times" size={18} color={colors.textMuted} />
              </Pressable>
            </View>

            <Text style={[s.modalMeta, { color: colors.textMuted }]}>
              {selectedDetail?.publishedAt ?? selectedItem?.publishedAt}
            </Text>

            <ScrollView style={{ maxHeight: 360 }}>
              <Text style={[s.modalBody, { color: colors.textSecondary }]}>
                {selectedDetail?.fullContent || selectedDetail?.summary || selectedItem?.fullContent || selectedItem?.summary || i18n.t('news.noDetailsAvailable')}
              </Text>
            </ScrollView>

            <View style={s.modalActions}>
              <Pressable
                onPress={() => setSelectedItem(null)}
                style={[s.modalBtn, { borderColor: colors.borderColor }]}
              >
                <Text style={{ color: colors.textSecondary, fontWeight: "600" }}>{i18n.t('app.close', 'Close')}</Text>
              </Pressable>
              <Pressable
                onPress={() => selectedItem && openExternal(selectedItem)}
                style={[s.modalBtn, { borderColor: colors.accentPrimary, backgroundColor: colors.accentPrimary + "15" }]}
              >
                <Text style={{ color: colors.accentPrimary, fontWeight: "700" }}>{i18n.t('news.openSource', 'Open Source')}</Text>
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const s = StyleSheet.create({
  loadingContainer: {
    padding: 14,
    gap: 10,
  },
  skeleton: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  skeletonLine: {
    height: 12,
    borderRadius: 4,
  },
  filterRow: {
    borderBottomWidth: 1,
    paddingVertical: 8,
  },
  filterChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
    borderWidth: 1,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  emptyText: {
    fontSize: 14,
    textAlign: "center",
  },
  errorContainer: {
    alignItems: "center",
    justifyContent: "center",
    padding: 40,
    gap: 12,
  },
  errorText: {
    fontSize: 14,
    textAlign: "center",
    lineHeight: 20,
  },
  retryBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 18,
    paddingVertical: 9,
    borderRadius: 8,
    borderWidth: 1,
    marginTop: 4,
  },
  cachedBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 10,
  },
  modalBackdrop: {
    flex: 1,
    justifyContent: "center",
    padding: 16,
  },
  modalCard: {
    borderRadius: 12,
    borderWidth: 1,
    padding: 14,
  },
  modalHeader: {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
    marginBottom: 6,
  },
  modalTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: "700",
    lineHeight: 22,
  },
  modalMeta: {
    fontSize: 12,
    marginBottom: 10,
  },
  modalBody: {
    fontSize: 14,
    lineHeight: 21,
  },
  modalActions: {
    marginTop: 12,
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 8,
  },
  modalBtn: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    minHeight: 40,
    justifyContent: "center",
  },
});
