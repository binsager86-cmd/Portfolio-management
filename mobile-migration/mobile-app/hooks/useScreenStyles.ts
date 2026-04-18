import { UITokens } from "@/constants/uiTokens";
import { useThemeStore } from "@/services/themeStore";
import { useMemo } from "react";
import { I18nManager, StyleSheet } from "react-native";

/**
 * Shared screen-level styles with theme colors baked in.
 *
 * Replaces the duplicate `container`, `header`, `title`, `content`,
 * `scrollContent`, and `listContent` definitions that were copy-pasted
 * across 15+ screen files.
 *
 * Typography guidelines (financial-grade):
 *  - Title:       24px / 700   — page headings
 *  - Subtitle:    16px / 700   — card titles, section headers
 *  - Body:        14px / 400   — default text
 *  - Caption:     12px / 500   — labels, secondary info
 *  - Mono / nums: tabular-nums — aligned columns in tables
 *  - Arabic:      +1px size bump, 1.6 lineHeight multiplier
 */
export function useScreenStyles() {
  const { colors } = useThemeStore();
  const isRTL = I18nManager.isRTL;

  return useMemo(
    () =>
      StyleSheet.create({
        /** flex:1 root with themed background */
        container: { flex: 1, backgroundColor: colors.bgPrimary },

        /** Standard page header with bottom border */
        header: {
          paddingHorizontal: 16,
          paddingTop: 16,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: colors.borderColor,
        },

        /** 24px bold page title — auto-aligns for RTL */
        title: {
          fontSize: 24,
          fontWeight: "700",
          color: colors.textPrimary,
          textAlign: "auto" as const,
        },

        /** Padded scroll area for data screens */
        content: { padding: 16 },

        /** Padded scroll area for form screens (extra bottom padding) */
        scrollContent: { padding: 20, paddingBottom: 60 },

        /** Standard FlatList contentContainerStyle */
        listContent: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 80 },

        /* ── Financial typography presets ───────────────── */

        /** Section headers inside cards (16px bold) */
        subtitle: {
          fontSize: 16,
          fontWeight: "700" as const,
          color: colors.textPrimary,
          textAlign: "auto" as const,
        },

        /** Standard body text */
        body: {
          fontSize: 14,
          color: colors.textPrimary,
          textAlign: "auto" as const,
          lineHeight: 20,
        },

        /** Small caption / label text */
        caption: {
          fontSize: 12,
          fontWeight: "500" as const,
          color: colors.textSecondary,
          textAlign: "auto" as const,
        },

        /** Numeric values in tables — tabular figures for column alignment */
        numericCell: {
          fontSize: 13,
          fontWeight: "600" as const,
          fontVariant: ["tabular-nums"] as const,
          color: colors.textPrimary,
          textAlign: "right" as const,
        },

        /** Row label in financial tables */
        labelCell: {
          fontSize: 13,
          fontWeight: "500" as const,
          color: colors.textPrimary,
          textAlign: "auto" as const,
        },

        /** Themed card container — uses design system card tokens */
        card: {
          backgroundColor: colors.bgCard,
          borderColor: colors.borderColor,
          borderWidth: UITokens.card.borderWidth,
          borderRadius: UITokens.card.borderRadius,
          padding: UITokens.card.padding,
          marginBottom: UITokens.card.marginBottom,
        },
      }),
    [colors, isRTL],
  );
}
