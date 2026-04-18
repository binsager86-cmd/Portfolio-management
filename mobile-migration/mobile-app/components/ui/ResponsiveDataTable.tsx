import React from "react";
import { Platform, StyleSheet, Text, View } from "react-native";
import { FlashList } from "@shopify/flash-list";

import { UITokens } from "@/constants/uiTokens";
import { useResponsive } from "@/hooks/useResponsive";
import { useThemeStore } from "@/services/themeStore";
import { PressableCard } from "./PressableCard";

export interface DataColumn<T = any> {
  key: string;
  label: string;
  render: (item: T) => React.ReactNode;
  priority?: "high" | "medium" | "low";
}

interface Props<T = any> {
  data: T[];
  columns: DataColumn<T>[];
  /** Custom key extractor — defaults to item.id or index. */
  keyExtractor?: (item: T) => string;
  /** Desktop/tablet table renderer — falls through to this on wider screens. */
  desktopTable?: React.ReactNode;
  /** Card press handler */
  onPressItem?: (item: T) => void;
  /** Accessibility label factory per item */
  itemA11yLabel?: (item: T) => string;
}

export function ResponsiveDataTable<T extends Record<string, any>>({
  data,
  columns,
  keyExtractor,
  desktopTable,
  onPressItem,
  itemA11yLabel,
}: Props<T>) {
  const { isDesktop, isTablet, isPhone } = useResponsive();
  const { colors } = useThemeStore();

  if ((isDesktop || isTablet) && desktopTable) {
    return <>{desktopTable}</>;
  }

  const visibleCols = isPhone
    ? columns.filter((c) => c.priority === "high" || c.priority === undefined)
    : columns;
  const extraCount = columns.length - visibleCols.length;

  return (
    <FlashList
      data={data}
      estimatedItemSize={isPhone ? 100 : 88}
      keyExtractor={keyExtractor ?? ((item, i) => String((item as any).id ?? i))}
      renderItem={({ item }) => (
        <PressableCard
          onPress={onPressItem ? () => onPressItem(item) : undefined}
          style={[styles.mobileCard, isPhone && styles.mobileCardPhone]}
          accessibilityLabel={itemA11yLabel?.(item)}
        >
          {visibleCols.map((col) => (
            <View key={col.key} style={styles.row}>
              <Text style={[styles.label, { color: colors.textMuted }]}>
                {col.label}
              </Text>
              <View style={styles.valueWrap}>
                <Text
                  style={[styles.value, { color: colors.textPrimary }]}
                  numberOfLines={1}
                >
                  {col.render(item)}
                </Text>
              </View>
            </View>
          ))}
          {extraCount > 0 && (
            <Text style={[styles.expansion, { color: colors.accentPrimary }]}>
              + {extraCount} fields
            </Text>
          )}
        </PressableCard>
      )}
    />
  );
}

const styles = StyleSheet.create({
  mobileCard: { marginVertical: UITokens.spacing.xs },
  mobileCardPhone: {
    paddingVertical: UITokens.spacing.md,
    paddingHorizontal: UITokens.spacing.md,
    minHeight: UITokens.touchTarget.mobile,
  },
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    minHeight: 32,
  },
  label: {
    fontSize: UITokens.typography.caption.size,
    opacity: 0.7,
    flexShrink: 0,
    marginRight: UITokens.spacing.sm,
  },
  valueWrap: {
    flex: 1,
    alignItems: "flex-end",
  },
  value: {
    fontSize: UITokens.typography.body.size,
    fontWeight: "500",
    textAlign: "right",
  },
  expansion: {
    marginTop: UITokens.spacing.sm,
    textAlign: "center",
    fontSize: UITokens.typography.caption.size,
  },
});
