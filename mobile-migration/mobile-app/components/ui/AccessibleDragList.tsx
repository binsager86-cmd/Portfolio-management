import React, { useCallback } from "react";
import { FlatList, Platform, Pressable, StyleSheet, Text, View } from "react-native";

import { UITokens } from "@/constants/uiTokens";
import { useThemeStore } from "@/services/themeStore";

export interface DragItem {
  id: string | number;
  label: string;
}

interface Props<T extends DragItem> {
  data: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  onReorder: (data: T[]) => void;
  keyExtractor?: (item: T) => string;
}

/**
 * Accessible reorder list — uses up/down buttons for keyboard & screen
 * reader accessibility (WCAG 2.1 AA). Works cross-platform without
 * native gesture dependencies.
 *
 * On web, @dnd-kit can be layered on top if drag UX is desired.
 */
export function AccessibleDragList<T extends DragItem>({
  data,
  renderItem,
  onReorder,
  keyExtractor,
}: Props<T>) {
  const { colors } = useThemeStore();

  const move = useCallback(
    (fromIndex: number, toIndex: number) => {
      if (toIndex < 0 || toIndex >= data.length) return;
      const next = [...data];
      const [item] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, item);
      onReorder(next);
    },
    [data, onReorder],
  );

  return (
    <FlatList
      data={data}
      keyExtractor={keyExtractor ?? ((item) => String(item.id))}
      contentContainerStyle={{ padding: UITokens.spacing.sm }}
      renderItem={({ item, index }) => (
        <View
          style={[styles.row, { borderBottomColor: colors.borderColor }]}
          accessibilityRole="none"
          accessibilityLabel={`${item.label}, position ${index + 1} of ${data.length}`}
        >
          <View style={styles.content}>{renderItem(item, index)}</View>
          <View style={styles.controls}>
            <Pressable
              onPress={() => move(index, index - 1)}
              disabled={index === 0}
              accessibilityLabel={`Move ${item.label} up`}
              accessibilityRole="button"
              style={[
                styles.btn,
                { opacity: index === 0 ? 0.3 : 1, backgroundColor: colors.bgCardHover },
              ]}
            >
              <Text style={[styles.btnText, { color: colors.textPrimary }]}>↑</Text>
            </Pressable>
            <Pressable
              onPress={() => move(index, index + 1)}
              disabled={index === data.length - 1}
              accessibilityLabel={`Move ${item.label} down`}
              accessibilityRole="button"
              style={[
                styles.btn,
                { opacity: index === data.length - 1 ? 0.3 : 1, backgroundColor: colors.bgCardHover },
              ]}
            >
              <Text style={[styles.btnText, { color: colors.textPrimary }]}>↓</Text>
            </Pressable>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    alignItems: "center",
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingVertical: UITokens.spacing.sm,
  },
  content: { flex: 1 },
  controls: { flexDirection: "column", gap: 4, marginLeft: UITokens.spacing.sm },
  btn: {
    width: 32,
    height: 32,
    borderRadius: UITokens.radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
  btnText: { fontSize: 16, fontWeight: "600" },
});
