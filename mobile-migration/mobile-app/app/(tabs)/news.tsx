/**
 * News & Market Data — dedicated news screen.
 *
 * Sections:
 *  • Search bar with debounced filtering
 *  • Toggle: "My Holdings" / "All Market"
 *  • Category filter tabs
 *  • News feed list with pull-to-refresh
 *
 * Expertise gating: visible to intermediate+ users via tab layout.
 */

import { NewsFeed } from "@/components/news/NewsFeed";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import {
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

export default function NewsScreen() {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const [portfolioOnly, setPortfolioOnly] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearch = useDebouncedValue(searchQuery, 300);

  return (
    <View style={[s.container, { backgroundColor: colors.bgPrimary }]}>
      {/* ── Header ── */}
      <View style={[s.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor }]}>
        <View style={s.headerTop}>
          <View style={{ flex: 1 }}>
            <Text style={[s.headerTitle, { color: colors.textPrimary }]}>
              {t("news.title")}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              {t("news.subtitle")}
            </Text>
          </View>
        </View>

        {/* ── Search bar ── */}
        <View style={[s.searchBar, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
          <FontAwesome name="search" size={14} color={colors.textMuted} />
          <TextInput
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder={t("news.searchPlaceholder")}
            placeholderTextColor={colors.textMuted}
            style={[s.searchInput, { color: colors.textPrimary }]}
            returnKeyType="search"
            autoComplete="off"
          />
          {searchQuery.length > 0 && (
            <Pressable onPress={() => setSearchQuery("")} hitSlop={8}>
              <FontAwesome name="times-circle" size={16} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {/* ── Feed toggle: My Holdings / All Market ── */}
        <View style={s.toggleRow}>
          <Pressable
            onPress={() => setPortfolioOnly(true)}
            style={[
              s.toggleBtn,
              {
                backgroundColor: portfolioOnly ? colors.accentPrimary + "15" : "transparent",
                borderColor: portfolioOnly ? colors.accentPrimary : colors.borderColor,
              },
            ]}
          >
            <FontAwesome
              name="briefcase"
              size={12}
              color={portfolioOnly ? colors.accentPrimary : colors.textMuted}
            />
            <Text
              style={{
                color: portfolioOnly ? colors.accentPrimary : colors.textSecondary,
                fontSize: 13,
                fontWeight: portfolioOnly ? "700" : "500",
                marginLeft: 6,
              }}
            >
              {t("news.myHoldings")}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => setPortfolioOnly(false)}
            style={[
              s.toggleBtn,
              {
                backgroundColor: !portfolioOnly ? colors.accentPrimary + "15" : "transparent",
                borderColor: !portfolioOnly ? colors.accentPrimary : colors.borderColor,
              },
            ]}
          >
            <FontAwesome
              name="globe"
              size={12}
              color={!portfolioOnly ? colors.accentPrimary : colors.textMuted}
            />
            <Text
              style={{
                color: !portfolioOnly ? colors.accentPrimary : colors.textSecondary,
                fontSize: 13,
                fontWeight: !portfolioOnly ? "700" : "500",
                marginLeft: 6,
              }}
            >
              {t("news.allMarket")}
            </Text>
          </Pressable>
        </View>
      </View>

      {/* ── News feed ── */}
      <NewsFeed
        portfolioOnly={portfolioOnly}
        searchQuery={debouncedSearch}
      />
    </View>
  );
}

// ── Styles ──────────────────────────────────────────────────────

const s = StyleSheet.create({
  container: { flex: 1 },
  header: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 8,
    borderBottomWidth: 1,
  },
  headerTop: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: "700",
  },
  searchBar: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    gap: 8,
    marginBottom: 10,
  },
  searchInput: {
    flex: 1,
    fontSize: 14,
    paddingVertical: 2,
  },
  toggleRow: {
    flexDirection: "row",
    gap: 8,
    marginBottom: 4,
  },
  toggleBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 8,
    borderWidth: 1,
    flex: 1,
    justifyContent: "center",
  },
});
