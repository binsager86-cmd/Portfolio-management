/**
 * NewsAttribution — compliance component showing source, verification, and link.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import { Linking, Pressable, StyleSheet, Text, View } from "react-native";

import type { ThemePalette } from "@/constants/theme";
import i18n from "@/lib/i18n/config";
import { sourceLabel } from "@/lib/news/summarizer";
import type { NewsSource } from "@/services/news/types";

interface NewsAttributionProps {
  source: NewsSource;
  url?: string;
  isVerified: boolean;
  colors: ThemePalette;
}

export function NewsAttribution({ source, url, isVerified, colors }: NewsAttributionProps) {
  return (
    <View style={s.container}>
      <View style={s.left}>
        <Text style={[s.text, { color: colors.textMuted }]}>
          {i18n.t('news.source')}: {sourceLabel(source)}{" "}
          {isVerified && (
            <Text style={{ color: colors.success }}>✓ {i18n.t('news.verified')}</Text>
          )}
        </Text>
      </View>
      {url && (
        <Pressable onPress={() => Linking.openURL(url)} hitSlop={8}>
          <Text style={[s.link, { color: colors.accentPrimary }]}>
            <FontAwesome name="external-link" size={10} color={colors.accentPrimary} />{" "}
            {i18n.t('news.viewOriginal')}
          </Text>
        </Pressable>
      )}
    </View>
  );
}

export function NewsDisclaimer({ colors }: { colors: ThemePalette }) {
  return (
    <Text style={[s.disclaimer, { color: colors.textMuted }]}>
      {i18n.t('news.disclaimer')}
    </Text>
  );
}

const s = StyleSheet.create({
  container: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 4,
  },
  left: { flex: 1 },
  text: { fontSize: 10, fontStyle: "italic" },
  link: { fontSize: 10, textDecorationLine: "underline" },
  disclaimer: { fontSize: 9, fontStyle: "italic", marginTop: 4, textAlign: "center" },
});
