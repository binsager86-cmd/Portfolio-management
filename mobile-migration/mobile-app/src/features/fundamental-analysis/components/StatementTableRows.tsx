/**
 * StatementTableRows — EditableCell (memoized) and SortableRow (dnd-kit)
 * sub-components extracted from StatementsTable.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";

import { useSortable } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";

import type { ThemePalette } from "@/constants/theme";
import { formatNumber } from "../utils";

// ── Types ───────────────────────────────────────────────────────────

export type PeriodInfo = {
  label: string;
  period: string;
  statementId: number;
  items: Record<string, { id: number; amount: number; name: string; isTotal: boolean; edited: boolean }>;
};

// ── EditableCell ────────────────────────────────────────────────────

export const EditableCell = React.memo(function EditableCell({
  itemId, value, isTotal, isEdited, colWidth, colors, editingKey,
  onStartEdit, onSave, onCancel, cellEditKey, onCreateSave,
}: {
  itemId: number | null;
  value: number | undefined | null;
  isTotal: boolean;
  isEdited: boolean;
  colWidth: number;
  colors: ThemePalette;
  editingKey: string | null;
  onStartEdit: (id: string, val: string) => void;
  onSave: (id: number, amount: number) => void;
  onCancel: () => void;
  cellEditKey?: string;
  onCreateSave?: (amount: number) => void;
}) {
  const actualKey = itemId != null ? String(itemId) : cellEditKey ?? null;
  const isEditing = editingKey != null && actualKey === editingKey;
  const [localValue, setLocalValue] = useState(String(value ?? "0"));

  useEffect(() => {
    if (isEditing) setLocalValue(String(value ?? "0"));
  }, [isEditing, value]);

  const handleSubmit = useCallback(() => {
    const num = parseFloat(localValue);
    if (isNaN(num)) return;
    if (itemId != null) {
      onSave(itemId, num);
    } else if (onCreateSave) {
      onCreateSave(num);
    }
  }, [localValue, itemId, onSave, onCreateSave]);

  if (isEditing) {
    return (
      <View style={{ width: colWidth, alignItems: "flex-end", justifyContent: "center" }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
          <TextInput
            value={localValue}
            onChangeText={setLocalValue}
            keyboardType="numeric"
            autoFocus
            style={{
              width: colWidth - 40, height: 26, borderWidth: 1, borderRadius: 6,
              borderColor: colors.accentPrimary, color: colors.textPrimary,
              backgroundColor: colors.bgCard, fontSize: 11,
              paddingHorizontal: 6, textAlign: "right", fontVariant: ["tabular-nums"],
            }}
            onSubmitEditing={handleSubmit}
          />
          <Pressable onPress={handleSubmit} hitSlop={6}>
            <FontAwesome name="check" size={12} color={colors.success} />
          </Pressable>
          <Pressable onPress={onCancel} hitSlop={6}>
            <FontAwesome name="times" size={12} color={colors.textMuted} />
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View style={{ width: colWidth, alignItems: "flex-end", justifyContent: "center" }}>
      <Pressable
        onPress={() => { if (actualKey) onStartEdit(actualKey, String(value ?? "0")); }}
        style={{ flexDirection: "row", alignItems: "center" }}
      >
        <Text style={{
          fontSize: 12, fontWeight: isTotal ? "700" : "500",
          color: value != null && value < 0 ? colors.danger : (isTotal ? colors.textPrimary : colors.textSecondary),
          fontVariant: ["tabular-nums"], textAlign: "right",
        }}>
          {value != null ? formatNumber(value) : "-"}
        </Text>
        {isEdited && (
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: colors.warning, marginLeft: 4 }} />
        )}
      </Pressable>
    </View>
  );
});

// ── SortableRow ─────────────────────────────────────────────────────

export function SortableRow({
  id, item, rowIdx, periods, colors, COL_NAME_W, COL_VAL_W,
  editingKey, onStartEdit, onSaveEdit, onCancelEdit, onCreateSave, onDeleteRow,
  mergeMode, mergeSelected, onToggleMerge,
}: {
  id: string;
  item: { code: string; name: string; isTotal: boolean };
  rowIdx: number;
  periods: PeriodInfo[];
  colors: ThemePalette;
  COL_NAME_W: number;
  COL_VAL_W: number;
  editingKey: string | null;
  onStartEdit: (id: string, val: string) => void;
  onSaveEdit: (id: number, amount: number) => void;
  onCancelEdit: () => void;
  onCreateSave: (statementId: number, code: string, name: string, orderIdx: number, amount: number) => void;
  onDeleteRow: (code: string, name: string) => void;
  mergeMode: boolean;
  mergeSelected: boolean;
  onToggleMerge: (code: string) => void;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition: transition ?? undefined,
    opacity: isDragging ? 0.5 : 1,
    display: "flex",
    flexDirection: "row",
    alignItems: "center",
    paddingTop: 8,
    paddingBottom: 8,
    paddingLeft: 8,
    paddingRight: 8,
    backgroundColor: isDragging
      ? (colors.accentPrimary + "20")
      : item.isTotal ? (colors.bgInput + "60") : rowIdx % 2 === 0 ? "transparent" : (colors.bgPrimary + "30"),
    borderTopWidth: item.isTotal ? 1 : 0,
    borderTopColor: colors.borderColor,
    borderTopStyle: item.isTotal ? "solid" as const : undefined,
    zIndex: isDragging ? 999 : undefined,
  };

  return (
    <div ref={setNodeRef} style={{
      ...style,
      ...(mergeSelected ? { backgroundColor: colors.accentPrimary + "25", borderLeft: `3px solid ${colors.accentPrimary}` } : {}),
    }}>
      {mergeMode && (
        <Pressable onPress={() => onToggleMerge(item.code)} hitSlop={4} style={{ marginRight: 4, padding: 2 }}>
          <View style={{
            width: 18, height: 18, borderRadius: 4, borderWidth: 1.5,
            borderColor: mergeSelected ? colors.accentPrimary : colors.textMuted,
            backgroundColor: mergeSelected ? colors.accentPrimary : "transparent",
            alignItems: "center", justifyContent: "center",
          }}>
            {mergeSelected && <FontAwesome name="check" size={10} color="#fff" />}
          </View>
        </Pressable>
      )}
      <div
        {...attributes}
        {...listeners}
        style={{ cursor: "grab", padding: 2, marginRight: 4, display: "flex", alignItems: "center", touchAction: "none" }}
      >
        <Text style={{ fontSize: 12, color: colors.textMuted }}>⠿</Text>
      </div>
      <Text numberOfLines={1} style={{
        width: COL_NAME_W - 36, fontSize: 12,
        fontWeight: item.isTotal ? "700" : "400",
        color: item.isTotal ? colors.textPrimary : colors.textSecondary,
      }}>
        {item.name}
      </Text>
      <Pressable onPress={() => onDeleteRow(item.code, item.name)} hitSlop={4} style={{ marginRight: 2, padding: 2 }}>
        <FontAwesome name="trash-o" size={10} color={colors.danger + "80"} />
      </Pressable>
      {periods.map((p) => {
        const cell = p.items[item.code];
        const dashKey = cell?.id == null ? `create_${p.statementId}_${item.code}` : undefined;
        return (
          <EditableCell
            key={p.period}
            itemId={cell?.id ?? null}
            value={cell?.amount}
            isTotal={item.isTotal}
            isEdited={!!cell?.edited}
            colWidth={COL_VAL_W}
            colors={colors}
            editingKey={editingKey}
            onStartEdit={onStartEdit}
            onSave={onSaveEdit}
            onCancel={onCancelEdit}
            cellEditKey={dashKey}
            onCreateSave={dashKey ? (amount: number) => onCreateSave(p.statementId, item.code, item.name, rowIdx + 1, amount) : undefined}
          />
        );
      })}
    </div>
  );
}
