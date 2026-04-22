/**
 * StocksPanel — Stock list with search, add/edit/delete, and stock picker.
 */

import FontAwesome from "@expo/vector-icons/FontAwesome";
import { FlashList } from "@shopify/flash-list";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import React, { useMemo, useState } from "react";
import {
    Alert,
    FlatList,
    Modal,
    Platform,
    Pressable,
    RefreshControl,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    View,
} from "react-native";

import { FAPanelSkeleton } from "@/components/ui/PageSkeletons";
import type { ThemePalette } from "@/constants/theme";
import { useAnalysisStocks, useStockList } from "@/hooks/queries";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { showErrorAlert } from "@/lib/errorHandling";
import {
    AnalysisStock,
    createAnalysisStock,
    deleteAnalysisStock,
    StockListEntry,
    updateAnalysisStock,
} from "@/services/api";
import { st } from "../styles";
import { getApiErrorMessage } from "../types";
import { ActionButton, Card, Chip, FadeIn, LabeledInput } from "./shared";

// ── Static styles (no theme dependency) ─────────────────────────────
const S = StyleSheet.create({
  flex1: { flex: 1 },
  contentWrap: { flex: 1, marginLeft: 12 },
  tagsGap: { gap: 6, marginTop: 4 },
  actionsCol: { alignItems: "flex-end" as const, gap: 8 },
  actionsRow: { flexDirection: "row" as const, gap: 10 },
  addBtnText: { color: "#fff", fontSize: 13, fontWeight: "700", marginLeft: 6 },
  addStockBtnText: { color: "#fff", fontSize: 14, fontWeight: "700", marginLeft: 8 },
  formFieldRow: { flexDirection: "row" as const, gap: 10 },
  formBtnRow: { flexDirection: "row" as const, gap: 10, marginTop: 8 },
});

/* ═══════════════════════════════════════════════════════════════════ */

export function StocksPanel({
  colors, isDesktop, onSelect,
}: { colors: ThemePalette; isDesktop: boolean; onSelect: (stock: AnalysisStock) => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebouncedValue(search);
  const [showAdd, setShowAdd] = useState(false);
  const [editStock, setEditStock] = useState<AnalysisStock | null>(null);

  const { data, isLoading, refetch, isFetching } = useAnalysisStocks(debouncedSearch);

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAnalysisStock(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["analysis-stocks"] }),
    onError: (err: Error) => showErrorAlert("Delete Failed", err),
  });

  const stocks = data?.stocks ?? [];

  // ── Pre-computed themed styles for renderItem ───────────────────
  const ts = useMemo(() => ({
    symbolBadgeBg: { backgroundColor: colors.accentPrimary + "15" },
    symbolText: { color: colors.accentPrimary, fontSize: 14, fontWeight: "800" as const, letterSpacing: 0.5 },
    symbolName: { color: colors.textPrimary, fontSize: 15, fontWeight: "700" as const },
    companyName: { color: colors.textSecondary, fontSize: 13, marginTop: 1 },
    tagBg: { backgroundColor: colors.bgInput },
    tagText: { color: colors.textMuted, fontSize: 10, fontWeight: "600" as const },
    sectorTagBg: { backgroundColor: colors.accentPrimary + "10" },
    sectorTagText: { color: colors.accentPrimary, fontSize: 10, fontWeight: "600" as const },
    editBtnBg: { backgroundColor: colors.accentPrimary + "12" },
    deleteBtnBg: { backgroundColor: colors.danger + "12" },
    emptyIconBg: { backgroundColor: colors.accentPrimary + "10" },
    emptyTitle: { color: colors.textPrimary },
    emptySubtitle: { color: colors.textMuted, textAlign: "center" as const },
    addStockBtn: { backgroundColor: colors.accentPrimary, marginTop: 20, paddingHorizontal: 24 },
    desktopList: isDesktop ? { maxWidth: 900, alignSelf: "center" as const, width: "100%" as const } : undefined,
  }), [colors, isDesktop]);

  const handleDelete = (stock: AnalysisStock) => {
    const msg = `Delete ${stock.symbol} and all related data?`;
    if (Platform.OS === "web") {
      if (confirm(msg)) deleteMut.mutate(stock.id);
    } else {
      Alert.alert("Delete Stock", msg, [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => deleteMut.mutate(stock.id) },
      ]);
    }
  };

  return (
    <View style={S.flex1}>
      {/* Search + Add */}
      <View style={[st.searchRow, { borderBottomColor: colors.borderColor }]}>
        <View style={[st.searchBox, { backgroundColor: colors.bgInput, borderColor: colors.borderColor }]}>
          <FontAwesome name="search" size={13} color={colors.textMuted} />
          <TextInput
            placeholder="Search by symbol or name..."
            placeholderTextColor={colors.textMuted + "90"}
            value={search}
            onChangeText={setSearch}
            style={[st.searchInput, { color: colors.textPrimary }]}
          />
          {search.length > 0 && (
            <Pressable onPress={() => setSearch("")} hitSlop={8}>
              <FontAwesome name="times-circle" size={14} color={colors.textMuted} />
            </Pressable>
          )}
        </View>
        <Pressable onPress={() => setShowAdd(true)} style={[st.addBtn, { backgroundColor: colors.accentPrimary }]}>
          <FontAwesome name="plus" size={12} color="#fff" />
          <Text style={S.addBtnText}>Add</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <FAPanelSkeleton />
      ) : (
        <FlashList
          data={stocks}
          keyExtractor={(item) => String(item.id)}
          drawDistance={200}
          contentContainerStyle={[st.listContent, ts.desktopList]}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}
          renderItem={({ item, index }) => (
            <FadeIn delay={index * 40}>
              <Pressable onPress={() => onSelect(item)}>
                <Card colors={colors} style={st.rowCenter}>
                  <View style={[st.symbolBadge, ts.symbolBadgeBg]}>
                    <Text style={ts.symbolText}>
                      {item.symbol.slice(0, 3)}
                    </Text>
                  </View>
                  <View style={S.contentWrap}>
                    <Text style={ts.symbolName}>{item.symbol}</Text>
                    <Text style={ts.companyName} numberOfLines={1}>
                      {item.company_name}
                    </Text>
                    <View style={[st.rowCenter, S.tagsGap]}>
                      <View style={[st.tagPill, ts.tagBg]}>
                        <Text style={ts.tagText}>{item.exchange}</Text>
                      </View>
                      <View style={[st.tagPill, ts.tagBg]}>
                        <Text style={ts.tagText}>{item.currency}</Text>
                      </View>
                      {item.sector && (
                        <View style={[st.tagPill, ts.sectorTagBg]}>
                          <Text style={ts.sectorTagText}>{item.sector}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  <View style={S.actionsCol}>
                    <View style={S.actionsRow}>
                      <Pressable onPress={() => setEditStock(item)} hitSlop={10} style={[st.iconBtn, ts.editBtnBg]}>
                        <FontAwesome name="pencil" size={12} color={colors.accentPrimary} />
                      </Pressable>
                      <Pressable onPress={() => handleDelete(item)} hitSlop={10} style={[st.iconBtn, ts.deleteBtnBg]}>
                        <FontAwesome name="trash-o" size={12} color={colors.danger} />
                      </Pressable>
                    </View>
                    <FontAwesome name="chevron-right" size={11} color={colors.textMuted} />
                  </View>
                </Card>
              </Pressable>
            </FadeIn>
          )}
          ListEmptyComponent={
            <View style={st.empty}>
              <View style={[st.emptyIcon, ts.emptyIconBg]}>
                <FontAwesome name="flask" size={32} color={colors.accentPrimary} />
              </View>
              <Text style={[st.emptyTitle, ts.emptyTitle]}>No stocks yet</Text>
              <Text style={[st.emptySubtitle, ts.emptySubtitle]}>
                Add your first stock profile to begin{"\n"}fundamental analysis
              </Text>
              <Pressable onPress={() => setShowAdd(true)} style={[st.addBtn, ts.addStockBtn]}>
                <FontAwesome name="plus" size={12} color="#fff" />
                <Text style={S.addStockBtnText}>Add Stock</Text>
              </Pressable>
            </View>
          }
        />
      )}

      {showAdd && <StockFormModal colors={colors} onClose={() => setShowAdd(false)} />}
      {editStock && <StockFormModal stock={editStock} colors={colors} onClose={() => setEditStock(null)} />}
    </View>
  );
}

/* ── Stock Form Modal (unified Add/Edit) ──────────────────────────── */

function StockFormModal({ stock, colors, onClose }: { stock?: AnalysisStock; colors: ThemePalette; onClose: () => void }) {
  const isEdit = !!stock;
  const queryClient = useQueryClient();
  const [symbol, setSymbol] = useState(stock?.symbol ?? "");
  const [companyName, setCompanyName] = useState(stock?.company_name ?? "");
  const [exchange, setExchange] = useState(stock?.exchange ?? "KSE");
  const [currency, setCurrency] = useState(stock?.currency ?? "KWD");
  const [sector, setSector] = useState(stock?.sector ?? "");
  const [industry, setIndustry] = useState(stock?.industry ?? "");
  const [outstandingShares, setOutstandingShares] = useState(
    stock?.outstanding_shares != null ? String(stock.outstanding_shares) : ""
  );

  const [market, setMarket] = useState<"kuwait" | "us">("kuwait");
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<StockListEntry | null>(null);

  const stockListQ = useStockList(market, !isEdit);

  const filteredStocks = useMemo(() => {
    const all = stockListQ.data?.stocks ?? [];
    if (!pickerSearch.trim()) return all.slice(0, 50);
    const q = pickerSearch.toLowerCase();
    return all.filter(
      (s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [stockListQ.data, pickerSearch]);

  const handlePickStock = (entry: StockListEntry) => {
    setSelectedEntry(entry);
    setSymbol(entry.symbol);
    setCompanyName(entry.name);
    setExchange(market === "kuwait" ? "KSE" : "US");
    setCurrency(market === "kuwait" ? "KWD" : "USD");
    setPickerSearch("");
  };

  const mutation = useMutation({
    mutationFn: () =>
      isEdit
        ? updateAnalysisStock(stock!.id, {
            company_name: companyName.trim(), exchange, currency,
            sector: sector || undefined, industry: industry || undefined,
            outstanding_shares: outstandingShares ? parseFloat(outstandingShares) : undefined,
          })
        : createAnalysisStock({
            symbol: symbol.trim().toUpperCase(),
            company_name: companyName.trim(), exchange, currency,
            sector: sector || undefined,
          }),
    onSuccess: (_result) => {
      queryClient.invalidateQueries({ queryKey: ["analysis-stocks"] });
      onClose();
    },
    onError: (err: Error) => showErrorAlert(isEdit ? "Update Failed" : "Create Failed", err),
  });

  const canSubmit = companyName.trim().length > 0 && (isEdit || symbol.trim().length > 0);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.modalOverlay} onPress={onClose}>
        <Pressable style={[st.modalBox, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, maxHeight: "85%" }]} onPress={() => {}}>
          <View style={[st.rowBetween, { marginBottom: 16 }]}>
            <Text style={[st.modalTitle, { color: colors.textPrimary }]}>
              {isEdit ? `Edit ${stock?.symbol ?? "Stock"}` : "Add Analysis Stock"}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} style={[st.iconBtn, { backgroundColor: colors.bgInput }]}>
              <FontAwesome name="times" size={14} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* Stock Picker (Add mode) */}
            {!isEdit && !selectedEntry && (
              <View style={{ marginBottom: 14 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", marginBottom: 6, letterSpacing: 0.5 }}>SELECT MARKET</Text>
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
                  <Chip label="Kuwait (KSE)" active={market === "kuwait"} onPress={() => setMarket("kuwait")} colors={colors} icon="globe" />
                  <Chip label="US Stocks" active={market === "us"} onPress={() => setMarket("us")} colors={colors} icon="usd" />
                </View>

                <Text style={[st.fieldLabel, { color: colors.textMuted }]}>SEARCH & SELECT STOCK *</Text>
                <View style={[st.searchBox, { backgroundColor: colors.bgInput, borderColor: colors.borderColor, marginBottom: 8 }]}>
                  <FontAwesome name="search" size={12} color={colors.textMuted} />
                  <TextInput
                    placeholder={`Search ${market === "kuwait" ? "KSE" : "US"} stocks by symbol or name...`}
                    placeholderTextColor={colors.textMuted + "80"}
                    value={pickerSearch}
                    onChangeText={setPickerSearch}
                    autoFocus
                    style={[st.searchInput, { color: colors.textPrimary, fontSize: 13 }]}
                  />
                  {pickerSearch.length > 0 && (
                    <Pressable onPress={() => setPickerSearch("")} hitSlop={8}>
                      <FontAwesome name="times-circle" size={13} color={colors.textMuted} />
                    </Pressable>
                  )}
                </View>

                {stockListQ.isLoading ? (
                  <View style={{ paddingVertical: 20, alignItems: "center" }}>
                    <Text style={{ color: colors.textMuted, fontSize: 12 }}>Loading stock list...</Text>
                  </View>
                ) : (
                  <View style={{ maxHeight: 220, borderWidth: 1, borderColor: colors.borderColor, borderRadius: 10, overflow: "hidden" }}>
                    <FlatList
                      data={filteredStocks}
                      keyExtractor={(item) => item.symbol}
                      keyboardShouldPersistTaps="handled"
                      initialNumToRender={15}
                      maxToRenderPerBatch={10}
                      renderItem={({ item, index }) => (
                        <Pressable
                          onPress={() => handlePickStock(item)}
                          style={[st.pickerRow, {
                            backgroundColor: index % 2 === 0 ? "transparent" : colors.bgPrimary + "40",
                            borderBottomWidth: 1, borderBottomColor: colors.borderColor + "40",
                          }]}
                        >
                          <View style={[st.pickerSymbolBadge, { backgroundColor: colors.accentPrimary + "12" }]}>
                            <Text style={{ color: colors.accentPrimary, fontSize: 10, fontWeight: "800" }}>
                              {item.symbol.slice(0, 4)}
                            </Text>
                          </View>
                          <View style={{ flex: 1, marginLeft: 8 }}>
                            <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "600" }}>{item.symbol}</Text>
                            <Text style={{ color: colors.textMuted, fontSize: 11 }} numberOfLines={1}>{item.name}</Text>
                          </View>
                          <FontAwesome name="plus-circle" size={16} color={colors.accentPrimary} />
                        </Pressable>
                      )}
                      ListEmptyComponent={
                        <View style={{ padding: 20, alignItems: "center" }}>
                          <Text style={{ color: colors.textMuted, fontSize: 12 }}>
                            {pickerSearch ? "No stocks match your search" : "Type to search"}
                          </Text>
                        </View>
                      }
                    />
                  </View>
                )}

                {stockListQ.data && (
                  <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 6, textAlign: "right" }}>
                    {stockListQ.data.count} stocks in {market === "kuwait" ? "KSE" : "US"} list
                  </Text>
                )}
              </View>
            )}

            {/* Selected stock confirmation (Add mode) */}
            {!isEdit && selectedEntry && (
              <View style={{ marginBottom: 14 }}>
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", marginBottom: 6, letterSpacing: 0.5 }}>SELECTED STOCK</Text>
                <View style={[st.selectedStockCard, { backgroundColor: colors.accentPrimary + "08", borderColor: colors.accentPrimary + "25" }]}>
                  <View style={[st.symbolBadge, { backgroundColor: colors.accentPrimary + "15", width: 40, height: 40, borderRadius: 12 }]}>
                    <Text style={{ color: colors.accentPrimary, fontSize: 13, fontWeight: "800" }}>
                      {selectedEntry.symbol.slice(0, 3)}
                    </Text>
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{symbol}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 12 }}>{companyName}</Text>
                    <View style={{ flexDirection: "row", gap: 6, marginTop: 3 }}>
                      <View style={[st.tagPill, { backgroundColor: colors.bgInput }]}>
                        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600" }}>{exchange}</Text>
                      </View>
                      <View style={[st.tagPill, { backgroundColor: colors.bgInput }]}>
                        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600" }}>{currency}</Text>
                      </View>
                    </View>
                  </View>
                  <Pressable onPress={() => { setSelectedEntry(null); setSymbol(""); setCompanyName(""); }} hitSlop={10} style={[st.iconBtn, { backgroundColor: colors.bgInput }]}>
                    <FontAwesome name="exchange" size={11} color={colors.textMuted} />
                  </Pressable>
                </View>
              </View>
            )}

            {/* Editable fields */}
            {(isEdit || selectedEntry) && (
              <>
                {selectedEntry && <LabeledInput label="COMPANY NAME" value={companyName} onChangeText={setCompanyName} colors={colors} />}
                {isEdit && <LabeledInput label="COMPANY NAME *" value={companyName} onChangeText={setCompanyName} colors={colors} />}
                <View style={S.formFieldRow}>
                  <LabeledInput label="EXCHANGE" value={exchange} onChangeText={setExchange} colors={colors} flex={1} />
                  <LabeledInput label="CURRENCY" value={currency} onChangeText={setCurrency} colors={colors} flex={1} />
                </View>
                <View style={S.formFieldRow}>
                  <LabeledInput label="SECTOR" value={sector} onChangeText={setSector} colors={colors} flex={1} />
                  <LabeledInput label="INDUSTRY" value={industry} onChangeText={setIndustry} colors={colors} flex={1} />
                </View>
                {isEdit && (
                  <LabeledInput label="OUTSTANDING SHARES" value={outstandingShares} onChangeText={setOutstandingShares} colors={colors} keyboardType="numeric" />
                )}
              </>
            )}

            {mutation.isError && (
              <View style={[st.errorBanner, { backgroundColor: colors.danger + "12" }]}>
                <FontAwesome name="exclamation-circle" size={12} color={colors.danger} />
                <Text style={{ color: colors.danger, fontSize: 12, marginLeft: 6, flex: 1 }}>
                  {getApiErrorMessage(mutation.error)}
                </Text>
              </View>
            )}

            <View style={S.formBtnRow}>
              <ActionButton label="Cancel" onPress={onClose} colors={colors} variant="secondary" flex={1} />
              <ActionButton
                label={mutation.isPending ? (isEdit ? "Saving..." : "Creating...") : (isEdit ? "Save Changes" : "Create Stock")}
                onPress={() => mutation.mutate()}
                colors={colors}
                variant="primary"
                disabled={!canSubmit}
                loading={mutation.isPending}
                icon={isEdit ? "check" : "plus"}
                flex={1}
              />
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
