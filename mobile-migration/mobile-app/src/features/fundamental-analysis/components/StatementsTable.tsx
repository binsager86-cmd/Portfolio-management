/**
 * StatementsTable — Virtualized grid with sorting, editing, drag-drop,
 * merge, delete, and AI reconciliation toolbar.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import {
    Pressable,
    RefreshControl,
    ScrollView,
    Text,
    View,
} from "react-native";

import {
    closestCenter,
    DndContext,
} from "@dnd-kit/core";
import {
    SortableContext,
    verticalListSortingStrategy,
} from "@dnd-kit/sortable";

import type { ThemePalette } from "@/constants/theme";
import { FinancialStatement } from "@/services/api";
import { useStatementsTableState } from "../hooks/useStatementsTableState";
import { st } from "../styles";
import { SortableRow } from "./StatementTableRows";
import { StatementsToolbar } from "./StatementsToolbar";

export type { PeriodInfo } from "./StatementTableRows";

// ── StatementsTable ─────────────────────────────────────────────────

export interface StatementsTableProps {
  stockId: number;
  stockSymbol: string;
  statements: FinancialStatement[];
  colors: ThemePalette;
  isDesktop: boolean;
  isFetching: boolean;
  onRefresh: () => void;
  statementType?: string;
}

export function StatementsTable({
  stockId, stockSymbol, statements, colors, isDesktop, isFetching, onRefresh, statementType,
}: StatementsTableProps) {
  const state = useStatementsTableState(stockId, stockSymbol, statements, isDesktop, statementType);
  const {
    editingKey, selectedPeriods, deleteMode,
    headerScrollRef,
    periods, displayRows, COL_NAME_W, COL_VAL_W,
    sensors,
    handleStartEdit, handleSaveEdit, handleCancelEdit,
    handleCreateSave, handleDeleteRow, handleDragEnd,
    togglePeriod, handleToggleMerge,
    mergeMode, mergeSelection,
  } = state;

  if (periods.length === 0) {
    return (
      <View style={st.empty}>
        <View style={[st.emptyIcon, { backgroundColor: colors.accentSecondary + "10" }]}>
          <FontAwesome name="file-text-o" size={32} color={colors.accentSecondary} />
        </View>
        <Text style={[st.emptyTitle, { color: colors.textPrimary }]}>No statements</Text>
        <Text style={[st.emptySubtitle, { color: colors.textMuted }]}>Upload a financial report PDF above to extract statements with AI</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <StatementsToolbar state={state} colors={colors} stockSymbol={stockSymbol} />

      {/* ── Scrollable table with sticky year header ───────────────── */}
      <ScrollView
        refreshControl={<RefreshControl refreshing={isFetching} onRefresh={onRefresh} tintColor={colors.accentPrimary} />}
        style={{ flex: 1 }}
        stickyHeaderIndices={[0]}
      >
        {/* Child 0 — sticky year column header (synced horizontally) */}
        <View style={{ backgroundColor: colors.bgCard, zIndex: 10 }}>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            ref={headerScrollRef}
            scrollEnabled={false}
            style={{ flexDirection: "row" }}
          >
            <View style={{ flexDirection: "row", paddingVertical: 6, paddingHorizontal: 8 }}>
              <View style={{ width: COL_NAME_W }}>
                <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textPrimary, textTransform: "uppercase", letterSpacing: 0.5 }}>Line Item</Text>
              </View>
              {periods.map((p) => (
                <Pressable
                  key={p.period}
                  onPress={() => deleteMode && togglePeriod(p.period)}
                  style={{ width: COL_VAL_W, alignItems: "flex-end", flexDirection: "row", justifyContent: "flex-end", gap: 4 }}
                >
                  {deleteMode && (
                    <View style={{
                      width: 14, height: 14, borderRadius: 3, borderWidth: 1.5,
                      borderColor: selectedPeriods.has(p.period) ? colors.danger : colors.textMuted,
                      backgroundColor: selectedPeriods.has(p.period) ? colors.danger : "transparent",
                      alignItems: "center", justifyContent: "center",
                    }}>
                      {selectedPeriods.has(p.period) && <FontAwesome name="check" size={8} color="#fff" />}
                    </View>
                  )}
                  <Text style={{ fontSize: 11, fontWeight: "700", color: colors.textPrimary, textTransform: "uppercase", letterSpacing: 0.5 }}>
                    {p.label}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          <View style={{ height: 1, backgroundColor: colors.borderColor }} />
        </View>

        {/* Child 1 — body rows (syncs scroll with header) */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator
          onScroll={(e) => headerScrollRef.current?.scrollTo({ x: e.nativeEvent.contentOffset.x, animated: false })}
          scrollEventThrottle={16}
        >
          <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
            <SortableContext items={displayRows.map((r) => r.code)} strategy={verticalListSortingStrategy}>
              <View>
                {displayRows.map((item, idx) => (
                  <SortableRow
                    key={item.code}
                    id={item.code}
                    item={item}
                    rowIdx={idx}
                    periods={periods}
                    colors={colors}
                    COL_NAME_W={COL_NAME_W}
                    COL_VAL_W={COL_VAL_W}
                    editingKey={editingKey}
                    onStartEdit={handleStartEdit}
                    onSaveEdit={handleSaveEdit}
                    onCancelEdit={handleCancelEdit}
                    onCreateSave={handleCreateSave}
                    onDeleteRow={handleDeleteRow}
                    mergeMode={mergeMode}
                    mergeSelected={mergeSelection.includes(item.code)}
                    onToggleMerge={handleToggleMerge}
                  />
                ))}
              </View>
            </SortableContext>
          </DndContext>
        </ScrollView>
      </ScrollView>
    </View>
  );
}
