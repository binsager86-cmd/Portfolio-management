/**
 * Editable transaction row — inline edit mode for bulk transaction editing.
 *
 * Exports data helpers (`txnToEditRow`, `editRowChanged`) and the
 * `EditableTableRow` component used by TradingScreen’s edit view.
 */

import type { ThemePalette } from "@/constants/theme";
import { useStockList } from "@/hooks/queries/useStockQueries";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import ReactDOM from "react-dom";
import {
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";
import { ts } from "./TradingTable";

// ── Edit row data type ──────────────────────────────────────────────

/** Mutable field bag for one transaction row in edit mode. */
export interface EditRowData {
  id: number;
  date: string;
  symbol: string;
  portfolio: string;
  type: string;
  quantity: string;
  price: string;
  fees: string;
  notes: string;
}

/** Convert a raw transaction object to an `EditRowData` for the edit form. */
export function txnToEditRow(txn: {
  id: number;
  date?: string | null;
  symbol?: string | null;
  portfolio?: string | null;
  type?: string | null;
  quantity?: number | null;
  price?: number | null;
  fees?: number | null;
  notes?: string | null;
}): EditRowData {
  return {
    id: txn.id,
    date: (txn.date ?? "").substring(0, 10),
    symbol: txn.symbol ?? "",
    portfolio: txn.portfolio ?? "",
    type: txn.type ?? "",
    quantity: txn.quantity != null && txn.quantity !== 0 ? String(txn.quantity) : "",
    price: txn.price != null && txn.price !== 0 ? String(txn.price) : "",
    fees: txn.fees != null && txn.fees !== 0 ? String(txn.fees) : "",
    notes: txn.notes ?? "",
  };
}

/** Return `true` if any editable field differs between two snapshots. */
export function editRowChanged(a: EditRowData, b: EditRowData): boolean {
  return (
    a.date !== b.date ||
    a.symbol !== b.symbol ||
    a.portfolio !== b.portfolio ||
    a.quantity !== b.quantity ||
    a.price !== b.price ||
    a.fees !== b.fees ||
    a.notes !== b.notes
  );
}

export const EDIT_COLUMNS = [
  { key: "select", label: "🗑️", width: 40 },
  { key: "id", label: "ID", width: 60 },
  { key: "date", label: "Date", width: 130 },
  { key: "symbol", label: "Symbol", width: 170 },
  { key: "portfolio", label: "Portfolio", width: 110 },
  { key: "type", label: "Type", width: 80 },
  { key: "quantity", label: "Qty", width: 90 },
  { key: "price", label: "Price", width: 100 },
  { key: "fees", label: "Fees", width: 90 },
  { key: "notes", label: "Notes", width: 160 },
] as const;

export const EDIT_TABLE_WIDTH = EDIT_COLUMNS.reduce((sum, c) => sum + c.width, 0);

const PORTFOLIO_OPTIONS = ["KFH", "BBYN", "USA"];

// ── Stock Picker Dropdown ───────────────────────────────────────────

/** Web-only portal: renders children into document.body so the dropdown
 *  escapes any overflow:hidden ancestor (ScrollView, tableOuter, etc.). */
function WebPortal({ children }: { children: React.ReactNode }) {
  const [container] = useState(() => {
    if (Platform.OS !== "web") return null;
    const el = document.createElement("div");
    el.style.position = "fixed";
    el.style.top = "0";
    el.style.left = "0";
    el.style.width = "0";
    el.style.height = "0";
    el.style.zIndex = "9999";
    el.style.overflow = "visible";
    return el;
  });

  useEffect(() => {
    if (!container) return;
    document.body.appendChild(container);
    return () => { document.body.removeChild(container); };
  }, [container]);

  if (!container) return <>{children}</>;
  return ReactDOM.createPortal(children, container);
}

function StockPickerDropdown({
  value,
  onChange,
  colors,
  width,
  portfolio,
}: {
  value: string;
  onChange: (symbol: string) => void;
  colors: ThemePalette;
  width: number;
  portfolio: string;
}) {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("");
  const triggerRef = useRef<View>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState({ top: 0, left: 0 });

  const market = portfolio === "USA" ? "us" : "kuwait";
  const { data: refData } = useStockList(market);
  const stocks = refData?.stocks ?? [];

  const filtered = useMemo(() => {
    if (!filter.trim()) return stocks;
    const q = filter.toLowerCase();
    return stocks.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        (s.name ?? "").toLowerCase().includes(q)
    );
  }, [stocks, filter]);

  const close = useCallback(() => { setOpen(false); setFilter(""); }, []);

  // Measure trigger position when opening
  const handleOpen = useCallback(() => {
    if (open) { close(); return; }
    if (Platform.OS === "web" && triggerRef.current) {
      const node = triggerRef.current as unknown as HTMLElement;
      const rect = node.getBoundingClientRect();
      setPos({ top: rect.bottom + 4, left: rect.left });
    }
    setOpen(true);
    setFilter("");
  }, [open, close]);

  // Close on click outside (web)
  useEffect(() => {
    if (!open || Platform.OS !== "web") return;
    const handler = (e: MouseEvent) => {
      const trigger = triggerRef.current as unknown as HTMLElement | null;
      const list = listRef.current;
      if (trigger && trigger.contains(e.target as Node)) return;
      if (list && list.contains(e.target as Node)) return;
      close();
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open, close]);

  const matchLabel = useMemo(() => {
    if (!value) return null;
    const s = stocks.find((st) => st.symbol === value);
    return s?.name ?? null;
  }, [value, stocks]);

  const DROPDOWN_W = Math.max(width, 260);

  const renderList = () => (
    <>
      {/* Search bar */}
      <View style={spk.searchWrap}>
        <FontAwesome name="search" size={12} color={colors.textMuted} style={spk.searchIcon} />
        {Platform.OS === "web" ? (
          <input
            type="text"
            placeholder="Type to search…"
            value={filter}
            onChange={(e: any) => setFilter(e.target.value)}
            autoFocus
            style={{
              flex: 1, fontSize: 12, color: colors.textPrimary,
              background: "transparent", border: "none", outline: "none",
              fontFamily: "inherit", padding: 0, width: "100%",
            } as any}
          />
        ) : (
          <TextInput
            placeholder="Type to search…"
            placeholderTextColor={colors.textMuted}
            value={filter}
            onChangeText={setFilter}
            autoFocus
            style={{ flex: 1, fontSize: 12, color: colors.textPrimary, padding: 0 }}
          />
        )}
      </View>

      {/* Divider */}
      <View style={{ height: 1, backgroundColor: colors.borderColor }} />

      {/* Items */}
      <ScrollView style={{ maxHeight: 200 }} keyboardShouldPersistTaps="handled">
        {filtered.length === 0 ? (
          <View style={spk.emptyWrap}>
            <FontAwesome name="inbox" size={20} color={colors.textMuted} />
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4 }}>No matching stocks</Text>
          </View>
        ) : (
          filtered.map((s) => {
            const selected = s.symbol === value;
            return (
              <Pressable
                key={s.symbol}
                onPress={() => { onChange(s.symbol); close(); }}
                style={({ pressed, hovered }: any) => [
                  spk.item,
                  selected && { backgroundColor: colors.accentPrimary + "14" },
                  (hovered && !selected) && { backgroundColor: colors.bgCardHover },
                  pressed && { opacity: 0.7 },
                ]}
              >
                <View style={spk.itemLeft}>
                  <Text style={[spk.itemSymbol, { color: selected ? colors.accentPrimary : colors.textPrimary }]}>
                    {s.symbol}
                  </Text>
                  {s.name ? (
                    <Text style={[spk.itemName, { color: colors.textMuted }]} numberOfLines={1}>
                      {s.name}
                    </Text>
                  ) : null}
                </View>
                {selected && (
                  <FontAwesome name="check" size={12} color={colors.accentPrimary} />
                )}
              </Pressable>
            );
          })
        )}
      </ScrollView>
    </>
  );

  return (
    <View style={[editStyles.editCell, { width, zIndex: open ? 200 : 1 }]}>
      <Pressable
        ref={triggerRef}
        onPress={handleOpen}
        style={({ hovered }: any) => [
          spk.trigger,
          {
            borderColor: open ? colors.accentPrimary : colors.borderColor,
            backgroundColor: hovered ? colors.bgCardHover : colors.bgInput,
          },
        ]}
      >
        <View style={spk.triggerContent}>
          <Text style={[spk.triggerSymbol, { color: value ? colors.textPrimary : colors.textMuted }]} numberOfLines={1}>
            {value || "Select…"}
          </Text>
          {matchLabel && !open ? (
            <Text style={[spk.triggerName, { color: colors.textMuted }]} numberOfLines={1}>
              {matchLabel}
            </Text>
          ) : null}
        </View>
        <FontAwesome name={open ? "caret-up" : "caret-down"} size={11} color={colors.textMuted} />
      </Pressable>

      {open && Platform.OS === "web" && (
        <WebPortal>
          <div
            ref={listRef}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: DROPDOWN_W,
              backgroundColor: colors.bgCard,
              border: `1px solid ${colors.borderColor}`,
              borderRadius: 8,
              boxShadow: "0 4px 20px rgba(0,0,0,0.3)",
              overflow: "hidden",
              zIndex: 9999,
            }}
          >
            {renderList()}
          </div>
        </WebPortal>
      )}

      {open && Platform.OS !== "web" && (
        <View
          style={[
            spk.listContainer,
            {
              width: DROPDOWN_W,
              backgroundColor: colors.bgCard,
              borderColor: colors.borderColor,
            },
          ]}
        >
          {renderList()}
        </View>
      )}
    </View>
  );
}

const spk = StyleSheet.create({
  trigger: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 4,
    gap: 4,
  },
  triggerContent: { flex: 1, flexDirection: "column" },
  triggerSymbol: { fontSize: 12, fontWeight: "700" },
  triggerName: { fontSize: 10, marginTop: 1 },
  listContainer: {
    position: "absolute", top: 38, left: 0,
    borderWidth: 1, borderRadius: 8, zIndex: 300, elevation: 8,
    shadowColor: "#000", shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25, shadowRadius: 12,
    overflow: "hidden",
  },
  searchWrap: {
    flexDirection: "row", alignItems: "center", paddingHorizontal: 10, paddingVertical: 8, gap: 8,
  },
  searchIcon: { width: 14 },
  emptyWrap: { alignItems: "center", paddingVertical: 20 },
  item: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    paddingHorizontal: 12, paddingVertical: 8, gap: 8,
  },
  itemLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  itemSymbol: { fontSize: 12, fontWeight: "700", minWidth: 60 },
  itemName: { fontSize: 11, flex: 1 },
});

// ── Portfolio Dropdown ──────────────────────────────────────────────

function PortfolioDropdown({
  value,
  onChange,
  colors,
  width,
}: {
  value: string;
  onChange: (v: string) => void;
  colors: ThemePalette;
  width: number;
}) {
  const [open, setOpen] = useState(false);

  if (Platform.OS === "web") {
    return (
      <View style={[editStyles.editCell, { width }]}>
        <select
          value={value}
          onChange={(e: any) => onChange(e.target.value)}
          title="Portfolio"
          style={{
            flex: 1, fontSize: 12, color: colors.textPrimary,
            background: colors.bgInput, border: `1px solid ${colors.borderColor}`,
            borderRadius: 4, padding: "2px 4px", fontFamily: "inherit", cursor: "pointer",
          } as any}
        >
          {PORTFOLIO_OPTIONS.map((opt) => (
            <option key={opt} value={opt}>{opt}</option>
          ))}
        </select>
      </View>
    );
  }

  return (
    <View style={[editStyles.editCell, { width }]}>
      <Pressable
        onPress={() => setOpen(!open)}
        style={[editStyles.dropdownBtn, { borderColor: colors.borderColor, backgroundColor: colors.bgInput }]}
      >
        <Text style={[editStyles.dropdownText, { color: colors.textPrimary }]}>{value}</Text>
        <FontAwesome name={open ? "caret-up" : "caret-down"} size={10} color={colors.textMuted} />
      </Pressable>
      {open && (
        <View style={[editStyles.dropdownList, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
          {PORTFOLIO_OPTIONS.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => { onChange(opt); setOpen(false); }}
              style={[editStyles.dropdownItem, opt === value && { backgroundColor: colors.accentPrimary + "20" }]}
            >
              <Text style={[editStyles.dropdownItemText, { color: opt === value ? colors.accentPrimary : colors.textPrimary }]}>
                {opt}
              </Text>
            </Pressable>
          ))}
        </View>
      )}
    </View>
  );
}

// ── Editable Table Row ──────────────────────────────────────────────

/** Inline-editable row with text inputs per field and a delete checkbox. */
export function EditableTableRow({
  row,
  isSelected,
  onToggleSelect,
  onUpdateField,
  colors,
  isEven,
}: {
  row: EditRowData;
  isSelected: boolean;
  onToggleSelect: (id: number) => void;
  onUpdateField: (id: number, field: keyof EditRowData, value: string) => void;
  colors: ThemePalette;
  isEven: boolean;
}) {
  const rowBg = isSelected
    ? colors.danger + "15"
    : isEven ? "transparent" : colors.bgCardHover + "30";

  const inputStyle = (width: number) => [
    editStyles.inputField,
    { color: colors.textPrimary, borderColor: colors.borderColor, backgroundColor: colors.bgInput, width: width - 12 },
  ];

  return (
    <View style={[ts.dataRow, { backgroundColor: rowBg, borderBottomColor: colors.borderColor }]}>
      <Pressable onPress={() => onToggleSelect(row.id)} style={[editStyles.editCell, { width: 40, alignItems: "center" }]}>
        <View style={[editStyles.checkbox, { borderColor: isSelected ? colors.danger : colors.borderColor, backgroundColor: isSelected ? colors.danger : "transparent" }]}>
          {isSelected && <FontAwesome name="check" size={10} color="#fff" />}
        </View>
      </Pressable>

      <View style={[editStyles.editCell, { width: 60 }]}>
        <Text style={[ts.cellText, { color: colors.textMuted }]}>{row.id}</Text>
      </View>

      <View style={[editStyles.editCell, { width: 130 }]}>
        {Platform.OS === "web" ? (
          <input
            type="date"
            value={row.date}
            onChange={(e: any) => onUpdateField(row.id, "date", e.target.value)}
            title="Transaction date"
            style={{
              fontSize: 12, color: colors.textPrimary, background: colors.bgInput,
              border: `1px solid ${colors.borderColor}`, borderRadius: 4,
              padding: "2px 4px", fontFamily: "inherit", width: 118,
            } as any}
          />
        ) : (
          <TextInput
            value={row.date}
            onChangeText={(t) => onUpdateField(row.id, "date", t)}
            placeholder="YYYY-MM-DD"
            placeholderTextColor={colors.textMuted}
            style={inputStyle(130)}
            maxLength={10}
          />
        )}
      </View>

      <StockPickerDropdown value={row.symbol} onChange={(v) => onUpdateField(row.id, "symbol", v)} colors={colors} width={170} portfolio={row.portfolio} />
      <PortfolioDropdown value={row.portfolio} onChange={(v) => onUpdateField(row.id, "portfolio", v)} colors={colors} width={110} />

      <View style={[editStyles.editCell, { width: 80 }]}>
        <Text style={[ts.cellText, { color: colors.textMuted }]}>{row.type}</Text>
      </View>

      <View style={[editStyles.editCell, { width: 90 }]}>
        <TextInput value={row.quantity} onChangeText={(t) => onUpdateField(row.id, "quantity", t)} keyboardType="numeric" style={inputStyle(90)} placeholder="0" placeholderTextColor={colors.textMuted} />
      </View>
      <View style={[editStyles.editCell, { width: 100 }]}>
        <TextInput value={row.price} onChangeText={(t) => onUpdateField(row.id, "price", t)} keyboardType="decimal-pad" style={inputStyle(100)} placeholder="0.000" placeholderTextColor={colors.textMuted} />
      </View>
      <View style={[editStyles.editCell, { width: 90 }]}>
        <TextInput value={row.fees} onChangeText={(t) => onUpdateField(row.id, "fees", t)} keyboardType="decimal-pad" style={inputStyle(90)} placeholder="0.00" placeholderTextColor={colors.textMuted} />
      </View>
      <View style={[editStyles.editCell, { width: 160 }]}>
        <TextInput value={row.notes} onChangeText={(t) => onUpdateField(row.id, "notes", t)} style={inputStyle(160)} placeholder="Notes..." placeholderTextColor={colors.textMuted} />
      </View>
    </View>
  );
}

// ── Edit Mode Styles ────────────────────────────────────────────────

export const editStyles = StyleSheet.create({
  editCell: { paddingHorizontal: 3, paddingVertical: 4, justifyContent: "center" },
  inputField: {
    fontSize: 12, borderWidth: 1, borderRadius: 4,
    paddingHorizontal: 6, paddingVertical: Platform.OS === "ios" ? 6 : 3,
    ...(Platform.OS === "web" ? { outlineStyle: "none" as any } : {}),
  },
  checkbox: {
    width: 20, height: 20, borderWidth: 2, borderRadius: 4,
    alignItems: "center", justifyContent: "center",
  },
  dropdownBtn: {
    flexDirection: "row", alignItems: "center", justifyContent: "space-between",
    borderWidth: 1, borderRadius: 4, paddingHorizontal: 6,
    paddingVertical: Platform.OS === "ios" ? 6 : 3,
  },
  dropdownText: { fontSize: 12, fontWeight: "600" },
  dropdownList: {
    position: "absolute", top: 28, left: 3, right: 3,
    borderWidth: 1, borderRadius: 6, zIndex: 100, elevation: 5,
    shadowColor: "#000", shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2, shadowRadius: 4,
  },
  dropdownItem: { paddingHorizontal: 10, paddingVertical: 6 },
  dropdownItemText: { fontSize: 12, fontWeight: "500" },
  modeToggle: {
    flexDirection: "row", borderRadius: 8, borderWidth: 1,
    overflow: "hidden", alignSelf: "flex-start", marginBottom: 8,
  },
  modeBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8,
  },
  modeBtnText: { fontSize: 13, fontWeight: "600" },
  editWarning: {
    flexDirection: "row", alignItems: "center", gap: 8,
    padding: 10, borderRadius: 8, borderWidth: 1, marginBottom: 8,
  },
  editWarningText: { fontSize: 12, fontWeight: "500", flex: 1 },
  editActionRow: {
    flexDirection: "row", gap: 10, marginBottom: 8, flexWrap: "wrap", alignItems: "center",
  },
  editActionBtn: {
    flexDirection: "row", alignItems: "center", gap: 6,
    paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8, borderWidth: 1,
  },
  editActionBtnText: { fontSize: 13, fontWeight: "700" },
  confirmOverlay: {
    padding: 12, borderRadius: 8, borderWidth: 1, marginBottom: 8,
  },
  confirmText: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  confirmBtnRow: { flexDirection: "row", gap: 10 },
  confirmBtn: {
    flexDirection: "row", alignItems: "center", gap: 4,
    paddingHorizontal: 12, paddingVertical: 6, borderRadius: 6, borderWidth: 1,
  },
  confirmBtnText: { fontSize: 12, fontWeight: "700" },
});
