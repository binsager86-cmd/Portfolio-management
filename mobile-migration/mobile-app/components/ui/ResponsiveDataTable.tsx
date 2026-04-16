import React from "react";
import { StyleSheet, Text, View } from "react-native";
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
      estimatedItemSize={88}
      keyExtractor={keyExtractor ?? ((item, i) => String((item as any).id ?? i))}
      renderItem={({ item }) => (
        <PressableCard
          onPress={onPressItem ? () => onPressItem(item) : undefined}
          style={styles.mobileCard}
          accessibilityLabel={itemA11yLabel?.(item)}
        >
          {visibleCols.map((col) => (
            <View key={col.key} style={styles.row}>
              <Text style={[styles.label, { color: colors.textMuted }]}>
                {col.label}
              </Text>
              <Text style={[styles.value, { color: colors.textPrimary }]}>
                {col.render(item)}
              </Text>
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
  row: {
    flexDirection: "row",
    justifyContent: "space-between",
    paddingVertical: 6,
  },
  label: {
    fontSize: UITokens.typography.caption.size,
    opacity: 0.7,
  },
  value: {
    fontSize: UITokens.typography.body.size,
    fontWeight: "500",
  },
  expansion: {
    marginTop: UITokens.spacing.sm,
    textAlign: "center",
    fontSize: UITokens.typography.caption.size,
  },
});
