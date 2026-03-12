import { useMemo } from "react";
import { StyleSheet } from "react-native";
import { useThemeStore } from "@/services/themeStore";

/**
 * Shared screen-level styles with theme colors baked in.
 *
 * Replaces the duplicate `container`, `header`, `title`, `content`,
 * `scrollContent`, and `listContent` definitions that were copy-pasted
 * across 15+ screen files.
 */
export function useScreenStyles() {
  const { colors } = useThemeStore();

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

        /** 24px bold page title */
        title: { fontSize: 24, fontWeight: "700", color: colors.textPrimary },

        /** Padded scroll area for data screens */
        content: { padding: 16 },

        /** Padded scroll area for form screens (extra bottom padding) */
        scrollContent: { padding: 20, paddingBottom: 60 },

        /** Standard FlatList contentContainerStyle */
        listContent: { paddingHorizontal: 12, paddingTop: 8, paddingBottom: 80 },
      }),
    [colors],
  );
}
