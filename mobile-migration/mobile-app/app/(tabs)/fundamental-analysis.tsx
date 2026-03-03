/**
 * Fundamental Analysis — stock profiles, financial statements,
 * metrics & ratios, growth analysis, scoring, and valuation models.
 *
 * Premium UI with CFA-grade financial analysis tools.
 */

import React, { useState, useCallback, useRef, useEffect, useMemo } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  ScrollView,
  Pressable,
  TextInput,
  RefreshControl,
  Alert,
  Modal,
  Platform,
  Animated,
  Dimensions,
  ActivityIndicator,
} from "react-native";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as DocumentPicker from "expo-document-picker";

import {
  getAnalysisStocks,
  getAnalysisStock,
  createAnalysisStock,
  updateAnalysisStock,
  deleteAnalysisStock,
  getStatements,
  getStockMetrics,
  calculateMetrics,
  getGrowthAnalysis,
  getStockScore,
  getScoreHistory,
  getValuations,
  runGrahamValuation,
  runDCFValuation,
  runDDMValuation,
  runMultiplesValuation,
  updateLineItem,
  getStockList,
  uploadFinancialStatement,
  AnalysisStock,
  FinancialStatement,
  FinancialLineItem,
  StockMetric,
  StockScore,
  ValuationResult,
  StockListEntry,
  AIUploadResult,
} from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import { LoadingScreen } from "@/components/ui/LoadingScreen";
import { ErrorScreen } from "@/components/ui/ErrorScreen";
import type { ThemePalette } from "@/constants/theme";

/* ────────────────────────────────────────────────────────────────── */
/*  TYPE + CONSTANTS                                                 */
/* ────────────────────────────────────────────────────────────────── */

type SubTab = "stocks" | "statements" | "comparison" | "metrics" | "growth" | "score" | "valuations";

const SUB_TABS: { key: SubTab; label: string; icon: React.ComponentProps<typeof FontAwesome>["name"] }[] = [
  { key: "stocks",      label: "Stocks",      icon: "th-list" },
  { key: "statements",  label: "Statements",  icon: "file-text-o" },
  { key: "comparison",  label: "Compare",     icon: "columns" },
  { key: "metrics",     label: "Metrics",     icon: "bar-chart" },
  { key: "growth",      label: "Growth",      icon: "line-chart" },
  { key: "score",       label: "Score",       icon: "star" },
  { key: "valuations",  label: "Valuations",  icon: "calculator" },
];

const STMNT_TYPES = ["income", "balance", "cashflow", "equity"] as const;

const STMNT_META: Record<string, { label: string; icon: React.ComponentProps<typeof FontAwesome>["name"]; color: string }> = {
  income:   { label: "Income",        icon: "money",         color: "#10b981" },
  balance:  { label: "Balance Sheet", icon: "balance-scale",  color: "#6366f1" },
  cashflow: { label: "Cash Flow",     icon: "exchange",      color: "#3b82f6" },
  equity:   { label: "Equity",        icon: "users",         color: "#ec4899" },
};

// Keep STMNT_ICONS alias for backward compat (upload result badges etc.)
const STMNT_ICONS = STMNT_META;

const CATEGORY_LABELS: Record<string, { label: string; icon: React.ComponentProps<typeof FontAwesome>["name"]; color: string }> = {
  profitability: { label: "Profitability",        icon: "trophy",        color: "#10b981" },
  liquidity:     { label: "Liquidity",            icon: "tint",          color: "#3b82f6" },
  leverage:      { label: "Capital Structure",    icon: "building",      color: "#f59e0b" },
  efficiency:    { label: "Efficiency",           icon: "bolt",          color: "#8b5cf6" },
  valuation:     { label: "Valuation (Per-Share)", icon: "diamond",       color: "#ec4899" },
  cashflow:      { label: "Cash Flow",            icon: "money",         color: "#06b6d4" },
  growth:        { label: "Growth Rates",         icon: "line-chart",    color: "#f97316" },
};

/* ────────────────────────────────────────────────────────────────── */
/*  REUSABLE MICRO-COMPONENTS                                        */
/* ────────────────────────────────────────────────────────────────── */

/** Pill-shaped filter chip */
function Chip({
  label, active, onPress, colors, icon,
}: { label: string; active: boolean; onPress: () => void; colors: ThemePalette; icon?: React.ComponentProps<typeof FontAwesome>["name"] }) {
  return (
    <Pressable
      onPress={onPress}
      style={[
        st.chip,
        {
          backgroundColor: active ? colors.accentPrimary : colors.bgCard,
          borderColor: active ? colors.accentPrimary : colors.borderColor,
        },
      ]}
    >
      {icon && <FontAwesome name={icon} size={11} color={active ? "#fff" : colors.textMuted} style={{ marginRight: 5 }} />}
      <Text style={{ color: active ? "#fff" : colors.textSecondary, fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** Professional segmented tab bar for statement types */
function StatementTabBar({
  value, onChange, colors, showAll,
}: {
  value: string | undefined;
  onChange: (v: string | undefined) => void;
  colors: ThemePalette;
  showAll?: boolean;
}) {
  const tabs = showAll
    ? [{ key: undefined as string | undefined, label: "All", icon: "th-list" as const, color: colors.accentPrimary }, ...STMNT_TYPES.map((t) => ({ key: t as string | undefined, ...STMNT_META[t] }))]
    : STMNT_TYPES.map((t) => ({ key: t as string | undefined, ...STMNT_META[t] }));

  return (
    <View style={{
      flexDirection: "row",
      backgroundColor: colors.bgPrimary,
      borderBottomWidth: 1,
      borderBottomColor: colors.borderColor,
      paddingHorizontal: 8,
      paddingTop: 4,
    }}>
      {tabs.map((t) => {
        const active = value === t.key;
        const tColor = active ? t.color : colors.textMuted;
        return (
          <Pressable
            key={t.key ?? "_all"}
            onPress={() => onChange(t.key)}
            style={({ pressed }) => ({
              flex: 1,
              alignItems: "center",
              paddingVertical: 10,
              paddingHorizontal: 4,
              borderBottomWidth: 2.5,
              borderBottomColor: active ? t.color : "transparent",
              opacity: pressed ? 0.7 : 1,
            })}
          >
            <View style={{
              width: 30, height: 30, borderRadius: 15,
              backgroundColor: active ? t.color + "18" : "transparent",
              alignItems: "center", justifyContent: "center",
              marginBottom: 4,
            }}>
              <FontAwesome name={t.icon} size={14} color={tColor} />
            </View>
            <Text style={{
              fontSize: 10,
              fontWeight: active ? "800" : "600",
              color: tColor,
              textAlign: "center",
              letterSpacing: 0.2,
            }} numberOfLines={1}>
              {t.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Section header with icon + optional badge count */
function SectionHeader({
  title, icon, iconColor, badge, colors, style,
}: { title: string; icon?: React.ComponentProps<typeof FontAwesome>["name"]; iconColor?: string; badge?: number; colors: ThemePalette; style?: any }) {
  return (
    <View style={[st.sectionHeader, style]}>
      {icon && (
        <View style={[st.sectionIcon, { backgroundColor: (iconColor ?? colors.accentPrimary) + "18" }]}>
          <FontAwesome name={icon} size={12} color={iconColor ?? colors.accentPrimary} />
        </View>
      )}
      <Text style={[st.sectionTitle, { color: colors.textPrimary }]}>{title}</Text>
      {badge != null && badge > 0 && (
        <View style={[st.badge, { backgroundColor: colors.accentPrimary + "20" }]}>
          <Text style={{ color: colors.accentPrimary, fontSize: 11, fontWeight: "700" }}>{badge}</Text>
        </View>
      )}
    </View>
  );
}

/** Premium card container with shadow */
function Card({ colors, children, style, noPadding }: { colors: ThemePalette; children: React.ReactNode; style?: any; noPadding?: boolean }) {
  return (
    <View style={[
      st.card,
      {
        backgroundColor: colors.bgCard,
        borderColor: colors.borderColor,
        shadowColor: colors.cardShadowColor,
      },
      noPadding && { paddingHorizontal: 0, paddingVertical: 0 },
      style,
    ]}>
      {children}
    </View>
  );
}

/** Labeled text input with floating label effect */
function LabeledInput({
  label, value, onChangeText, colors, keyboardType, placeholder, autoCapitalize, flex,
}: {
  label: string; value: string; onChangeText: (v: string) => void; colors: ThemePalette;
  keyboardType?: "numeric" | "default"; placeholder?: string; autoCapitalize?: "characters" | "none"; flex?: number;
}) {
  return (
    <View style={[{ flex: flex ?? undefined, marginBottom: 10 }]}>
      <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", marginBottom: 4, letterSpacing: 0.5 }}>
        {label}
      </Text>
      <TextInput
        placeholder={placeholder ?? label}
        placeholderTextColor={colors.textMuted + "80"}
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        autoCapitalize={autoCapitalize}
        style={[st.input, {
          color: colors.textPrimary,
          borderColor: colors.borderColor,
          backgroundColor: colors.bgInput,
        }]}
      />
    </View>
  );
}

/** Action button */
function ActionButton({
  label, onPress, colors, variant = "primary", disabled, loading, icon, flex,
}: {
  label: string; onPress: () => void; colors: ThemePalette;
  variant?: "primary" | "success" | "secondary" | "danger"; disabled?: boolean; loading?: boolean;
  icon?: React.ComponentProps<typeof FontAwesome>["name"]; flex?: number;
}) {
  const bgMap = { primary: colors.accentPrimary, success: colors.success, secondary: colors.bgCard, danger: colors.danger };
  const textMap = { primary: "#fff", success: "#fff", secondary: colors.textPrimary, danger: "#fff" };
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled || loading}
      style={[st.actionBtn, {
        backgroundColor: bgMap[variant],
        opacity: disabled ? 0.5 : 1,
        borderWidth: variant === "secondary" ? 1 : 0,
        borderColor: colors.borderColor,
        flex: flex,
      }]}
    >
      {loading ? (
        <Text style={[st.actionBtnText, { color: textMap[variant] }]}>...</Text>
      ) : (
        <>
          {icon && <FontAwesome name={icon} size={13} color={textMap[variant]} style={{ marginRight: 6 }} />}
          <Text style={[st.actionBtnText, { color: textMap[variant] }]}>{label}</Text>
        </>
      )}
    </Pressable>
  );
}

/** Animated fade-in wrapper */
function FadeIn({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(8)).current;
  useEffect(() => {
    Animated.parallel([
      Animated.timing(opacity, { toValue: 1, duration: 350, delay, useNativeDriver: true }),
      Animated.timing(translateY, { toValue: 0, duration: 350, delay, useNativeDriver: true }),
    ]).start();
  }, []);
  return (
    <Animated.View style={{ opacity, transform: [{ translateY }] }}>
      {children}
    </Animated.View>
  );
}

/* ────────────────────────────────────────────────────────────────── */
/*  MAIN SCREEN                                                      */
/* ────────────────────────────────────────────────────────────────── */

export default function FundamentalAnalysisScreen() {
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();
  const [tab, setTab] = useState<SubTab>("stocks");
  const [selectedStockId, setSelectedStockId] = useState<number | null>(null);
  const [selectedStockSymbol, setSelectedStockSymbol] = useState<string>("");

  const handleSelectStock = useCallback((stock: AnalysisStock) => {
    setSelectedStockId(stock.id);
    setSelectedStockSymbol(stock.symbol);
    setTab("statements");
  }, []);

  const handleBack = useCallback(() => {
    setSelectedStockId(null);
    setSelectedStockSymbol("");
    setTab("stocks");
  }, []);

  return (
    <View style={[st.container, { backgroundColor: colors.bgPrimary }]}>
      {/* ── Header ─────────────────────────────────────────── */}
      <View style={[st.header, { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor }]}>
        <View style={{ flex: 1 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            {selectedStockId && (
              <Pressable onPress={handleBack} hitSlop={12} style={st.headerBack}>
                <FontAwesome name="chevron-left" size={14} color={colors.accentPrimary} />
              </Pressable>
            )}
            <Text style={[st.headerTitle, { color: colors.textPrimary }]}>
              {selectedStockId ? selectedStockSymbol : "Fundamental Analysis"}
            </Text>
            {selectedStockId && (
              <View style={[st.headerBadge, { backgroundColor: colors.accentPrimary + "15" }]}>
                <FontAwesome name="flask" size={10} color={colors.accentPrimary} />
              </View>
            )}
          </View>
          {!selectedStockId && (
            <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 2 }}>
              CFA-grade stock analysis & valuation
            </Text>
          )}
        </View>
      </View>

      {/* ── Tab row ────────────────────────────────────────── */}
      <View style={[st.tabContainer, { backgroundColor: colors.headerBg, borderBottomColor: colors.borderColor }]}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 8 }}>
          {SUB_TABS.map((t) => {
            const disabled = t.key !== "stocks" && !selectedStockId;
            const active = tab === t.key;
            return (
              <Pressable
                key={t.key}
                onPress={() => !disabled && setTab(t.key)}
                style={[
                  st.tabBtn,
                  active && [st.tabBtnActive, { backgroundColor: colors.accentPrimary + "12" }],
                  disabled && { opacity: 0.35 },
                ]}
              >
                <FontAwesome
                  name={t.icon}
                  size={12}
                  color={active ? colors.accentPrimary : colors.textMuted}
                  style={{ marginRight: 5 }}
                />
                <Text style={{
                  color: active ? colors.accentPrimary : colors.textSecondary,
                  fontWeight: active ? "700" : "500",
                  fontSize: 12,
                }}>
                  {t.label}
                </Text>
              </Pressable>
            );
          })}
        </ScrollView>
      </View>

      {/* ── Content ────────────────────────────────────────── */}
      {tab === "stocks" && <StocksPanel colors={colors} isDesktop={isDesktop} onSelect={handleSelectStock} />}
      {tab === "statements" && selectedStockId && <StatementsPanel stockId={selectedStockId} colors={colors} isDesktop={isDesktop} />}
      {tab === "comparison" && selectedStockId && <ComparisonPanel stockId={selectedStockId} colors={colors} isDesktop={isDesktop} />}
      {tab === "metrics" && selectedStockId && <MetricsPanel stockId={selectedStockId} colors={colors} isDesktop={isDesktop} />}
      {tab === "growth" && selectedStockId && <GrowthPanel stockId={selectedStockId} colors={colors} isDesktop={isDesktop} />}
      {tab === "score" && selectedStockId && <ScorePanel stockId={selectedStockId} colors={colors} isDesktop={isDesktop} />}
      {tab === "valuations" && selectedStockId && <ValuationsPanel stockId={selectedStockId} colors={colors} isDesktop={isDesktop} />}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  STOCKS PANEL                                                      */
/* ═══════════════════════════════════════════════════════════════════ */

function StocksPanel({
  colors, isDesktop, onSelect,
}: { colors: ThemePalette; isDesktop: boolean; onSelect: (stock: AnalysisStock) => void }) {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [editStock, setEditStock] = useState<AnalysisStock | null>(null);

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["analysis-stocks", search],
    queryFn: () => getAnalysisStocks({ search: search || undefined }),
  });

  const deleteMut = useMutation({
    mutationFn: (id: number) => deleteAnalysisStock(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["analysis-stocks"] }),
  });

  const stocks = data?.stocks ?? [];

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
    <View style={{ flex: 1 }}>
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
          <Text style={{ color: "#fff", fontSize: 13, fontWeight: "700", marginLeft: 6 }}>Add</Text>
        </Pressable>
      </View>

      {isLoading ? (
        <LoadingScreen />
      ) : (
        <FlatList
          data={stocks}
          keyExtractor={(item) => String(item.id)}
          contentContainerStyle={[st.listContent, isDesktop && { maxWidth: 900, alignSelf: "center", width: "100%" }]}
          refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}
          renderItem={({ item, index }) => (
            <FadeIn delay={index * 40}>
              <Pressable onPress={() => onSelect(item)}>
                <Card colors={colors} style={{ flexDirection: "row", alignItems: "center" }}>
                  {/* Symbol badge */}
                  <View style={[st.symbolBadge, { backgroundColor: colors.accentPrimary + "15" }]}>
                    <Text style={{ color: colors.accentPrimary, fontSize: 14, fontWeight: "800", letterSpacing: 0.5 }}>
                      {item.symbol.slice(0, 3)}
                    </Text>
                  </View>
                  {/* Info */}
                  <View style={{ flex: 1, marginLeft: 12 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 15, fontWeight: "700" }}>{item.symbol}</Text>
                    <Text style={{ color: colors.textSecondary, fontSize: 13, marginTop: 1 }} numberOfLines={1}>
                      {item.company_name}
                    </Text>
                    <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 4 }}>
                      <View style={[st.tagPill, { backgroundColor: colors.bgInput }]}>
                        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600" }}>{item.exchange}</Text>
                      </View>
                      <View style={[st.tagPill, { backgroundColor: colors.bgInput }]}>
                        <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "600" }}>{item.currency}</Text>
                      </View>
                      {item.sector && (
                        <View style={[st.tagPill, { backgroundColor: colors.accentPrimary + "10" }]}>
                          <Text style={{ color: colors.accentPrimary, fontSize: 10, fontWeight: "600" }}>{item.sector}</Text>
                        </View>
                      )}
                    </View>
                  </View>
                  {/* Actions */}
                  <View style={{ alignItems: "flex-end", gap: 8 }}>
                    <View style={{ flexDirection: "row", gap: 10 }}>
                      <Pressable onPress={() => setEditStock(item)} hitSlop={10} style={[st.iconBtn, { backgroundColor: colors.accentPrimary + "12" }]}>
                        <FontAwesome name="pencil" size={12} color={colors.accentPrimary} />
                      </Pressable>
                      <Pressable onPress={() => handleDelete(item)} hitSlop={10} style={[st.iconBtn, { backgroundColor: colors.danger + "12" }]}>
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
              <View style={[st.emptyIcon, { backgroundColor: colors.accentPrimary + "10" }]}>
                <FontAwesome name="flask" size={32} color={colors.accentPrimary} />
              </View>
              <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginTop: 16 }}>No stocks yet</Text>
              <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4, textAlign: "center" }}>
                Add your first stock profile to begin{"\n"}fundamental analysis
              </Text>
              <Pressable onPress={() => setShowAdd(true)} style={[st.addBtn, { backgroundColor: colors.accentPrimary, marginTop: 20, paddingHorizontal: 24 }]}>
                <FontAwesome name="plus" size={12} color="#fff" />
                <Text style={{ color: "#fff", fontSize: 14, fontWeight: "700", marginLeft: 8 }}>Add Stock</Text>
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

  // Stock picker state (Add mode only)
  const [market, setMarket] = useState<"kuwait" | "us">("kuwait");
  const [pickerSearch, setPickerSearch] = useState("");
  const [selectedEntry, setSelectedEntry] = useState<StockListEntry | null>(null);

  // Fetch cached stock list
  const stockListQ = useQuery({
    queryKey: ["stock-list", market],
    queryFn: () => getStockList({ market }),
    staleTime: 1000 * 60 * 30, // 30 min cache
    enabled: !isEdit,
  });

  const filteredStocks = useMemo(() => {
    const all = stockListQ.data?.stocks ?? [];
    if (!pickerSearch.trim()) return all.slice(0, 50); // show first 50 by default
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
            company_name: companyName.trim(),
            exchange, currency,
            sector: sector || undefined,
            industry: industry || undefined,
            outstanding_shares: outstandingShares ? parseFloat(outstandingShares) : undefined,
          })
        : createAnalysisStock({
            symbol: symbol.trim().toUpperCase(),
            company_name: companyName.trim(),
            exchange, currency,
            sector: sector || undefined,
          }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["analysis-stocks"] });
      onClose();
    },
  });

  const canSubmit = companyName.trim().length > 0 && (isEdit || symbol.trim().length > 0);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={st.modalOverlay} onPress={onClose}>
        <Pressable style={[st.modalBox, { backgroundColor: colors.bgCard, borderColor: colors.borderColor, maxHeight: "85%" }]} onPress={() => {}}>
          {/* Title row */}
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 16 }}>
            <Text style={[st.modalTitle, { color: colors.textPrimary }]}>
              {isEdit ? `Edit ${stock!.symbol}` : "Add Analysis Stock"}
            </Text>
            <Pressable onPress={onClose} hitSlop={12} style={[st.iconBtn, { backgroundColor: colors.bgInput }]}>
              <FontAwesome name="times" size={14} color={colors.textMuted} />
            </Pressable>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
            {/* ── Stock Picker (Add mode) ── */}
            {!isEdit && !selectedEntry && (
              <View style={{ marginBottom: 14 }}>
                {/* Market toggle */}
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", marginBottom: 6, letterSpacing: 0.5 }}>SELECT MARKET</Text>
                <View style={{ flexDirection: "row", gap: 6, marginBottom: 10 }}>
                  <Chip label="Kuwait (KSE)" active={market === "kuwait"} onPress={() => setMarket("kuwait")} colors={colors} icon="globe" />
                  <Chip label="US Stocks" active={market === "us"} onPress={() => setMarket("us")} colors={colors} icon="usd" />
                </View>

                {/* Search */}
                <Text style={{ color: colors.textMuted, fontSize: 11, fontWeight: "600", marginBottom: 4, letterSpacing: 0.5 }}>SEARCH & SELECT STOCK *</Text>
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

                {/* Results */}
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
                      renderItem={({ item, index }) => (
                        <Pressable
                          onPress={() => handlePickStock(item)}
                          style={[st.pickerRow, {
                            backgroundColor: index % 2 === 0 ? "transparent" : colors.bgPrimary + "40",
                            borderBottomWidth: 1,
                            borderBottomColor: colors.borderColor + "40",
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

                {/* Count badge */}
                {stockListQ.data && (
                  <Text style={{ color: colors.textMuted, fontSize: 10, marginTop: 6, textAlign: "right" }}>
                    {stockListQ.data.count} stocks in {market === "kuwait" ? "KSE" : "US"} list
                  </Text>
                )}
              </View>
            )}

            {/* ── Selected stock confirmation (Add mode) ── */}
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

            {/* ── Editable fields (always show for Edit, show after selection for Add) ── */}
            {(isEdit || selectedEntry) && (
              <>
                {selectedEntry && (
                  <LabeledInput label="COMPANY NAME" value={companyName} onChangeText={setCompanyName} colors={colors} />
                )}
                {isEdit && (
                  <LabeledInput label="COMPANY NAME *" value={companyName} onChangeText={setCompanyName} colors={colors} />
                )}

                <View style={{ flexDirection: "row", gap: 10 }}>
                  <LabeledInput label="EXCHANGE" value={exchange} onChangeText={setExchange} colors={colors} flex={1} />
                  <LabeledInput label="CURRENCY" value={currency} onChangeText={setCurrency} colors={colors} flex={1} />
                </View>

                <View style={{ flexDirection: "row", gap: 10 }}>
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
                  {(mutation.error as any)?.response?.data?.detail ?? "Something went wrong."}
                </Text>
              </View>
            )}

            <View style={{ flexDirection: "row", gap: 10, marginTop: 8 }}>
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

/* ═══════════════════════════════════════════════════════════════════ */
/*  STATEMENTS PANEL                                                  */
/* ═══════════════════════════════════════════════════════════════════ */

function StatementsPanel({ stockId, colors, isDesktop }: { stockId: number; colors: ThemePalette; isDesktop: boolean }) {
  const queryClient = useQueryClient();
  const [typeFilter, setTypeFilter] = useState<string | undefined>("income");
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["analysis-statements", stockId, typeFilter],
    queryFn: () => getStatements(stockId, typeFilter),
  });

  // ── AI Upload state ───────────────────────────────────────────────
  const [uploading, setUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState("");
  const [uploadResult, setUploadResult] = useState<AIUploadResult | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handlePickAndUpload = useCallback(async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets || result.assets.length === 0) return;

      const file = result.assets[0];
      if (!file.uri) return;

      // Validate file
      if (file.size && file.size > 50 * 1024 * 1024) {
        Alert.alert("File Too Large", "Maximum file size is 50 MB.");
        return;
      }

      setUploading(true);
      setUploadProgress("Uploading PDF to server...");
      setUploadError(null);
      setUploadResult(null);

      setTimeout(() => {
        if (uploading) setUploadProgress("AI is analyzing the financial statements...");
      }, 3000);

      const res = await uploadFinancialStatement(
        stockId,
        file.uri,
        file.name || "financial_report.pdf",
        file.mimeType || "application/pdf",
      );

      setUploadResult(res);
      setUploadProgress("");
      queryClient.invalidateQueries({ queryKey: ["analysis-statements"] });
      Alert.alert(
        "Extraction Complete",
        `${res.statements.length} statements extracted with ${res.statements.reduce((s, st) => s + st.line_items_count, 0)} line items.`,
      );
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      let msg: string;
      if (typeof detail === "string") {
        msg = detail;
      } else if (Array.isArray(detail)) {
        // FastAPI validation errors: [{type, loc, msg, input, ctx}, ...]
        msg = detail.map((e: any) => (typeof e === "string" ? e : e?.msg || JSON.stringify(e))).join("; ");
      } else if (detail && typeof detail === "object") {
        msg = detail.msg || detail.message || JSON.stringify(detail);
      } else {
        msg = err?.message || "Upload failed.";
      }
      setUploadError(msg);
      setUploadProgress("");
      Alert.alert("Upload Failed", msg);
    } finally {
      setUploading(false);
    }
  }, [stockId, queryClient, uploading]);

  const statements = data?.statements ?? [];

  return (
    <View style={{ flex: 1 }}>
      {/* ── Upload Section ─────────────────────────────────────────── */}
      <View style={{
        paddingHorizontal: 16, paddingVertical: 14,
        borderBottomWidth: 1, borderBottomColor: colors.borderColor,
        backgroundColor: colors.bgCard,
      }}>
        <Pressable
          onPress={handlePickAndUpload}
          disabled={uploading}
          style={({ pressed }) => [
            {
              flexDirection: "row",
              alignItems: "center",
              justifyContent: "center",
              paddingVertical: 14,
              paddingHorizontal: 20,
              borderRadius: 12,
              borderWidth: 2,
              borderStyle: "dashed",
              borderColor: uploading ? colors.textMuted : colors.accentPrimary,
              backgroundColor: uploading ? colors.bgInput : colors.accentPrimary + "08",
              gap: 10,
            },
            pressed && !uploading && { backgroundColor: colors.accentPrimary + "15", transform: [{ scale: 0.98 }] },
          ]}
        >
          {uploading ? (
            <ActivityIndicator size="small" color={colors.accentPrimary} />
          ) : (
            <View style={{
              width: 36, height: 36, borderRadius: 18,
              backgroundColor: colors.accentPrimary + "15",
              alignItems: "center", justifyContent: "center",
            }}>
              <FontAwesome name="cloud-upload" size={18} color={colors.accentPrimary} />
            </View>
          )}
          <View style={{ flex: 1 }}>
            <Text style={{
              color: uploading ? colors.textMuted : colors.textPrimary,
              fontSize: 14, fontWeight: "700",
            }}>
              {uploading ? "Processing..." : "Upload Financial Report (PDF)"}
            </Text>
            <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>
              {uploading ? uploadProgress : "AI extracts income, balance sheet, cash flow & equity statements"}
            </Text>
          </View>
          {!uploading && (
            <FontAwesome name="file-pdf-o" size={20} color={colors.danger + "80"} />
          )}
        </Pressable>

        {/* Upload result summary */}
        {uploadResult && !uploading && (
          <View style={{
            marginTop: 10, padding: 12, borderRadius: 10,
            backgroundColor: colors.success + "10",
            borderWidth: 1, borderColor: colors.success + "30",
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <FontAwesome name="check-circle" size={16} color={colors.success} />
              <Text style={{ color: colors.success, fontSize: 13, fontWeight: "700", flex: 1 }}>
                Extraction Complete
              </Text>
              <Pressable onPress={() => setUploadResult(null)} hitSlop={8}>
                <FontAwesome name="times" size={14} color={colors.textMuted} />
              </Pressable>
            </View>
            <View style={{ marginTop: 8, gap: 4 }}>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                <Text style={{ fontWeight: "600" }}>Source:</Text> {uploadResult.source_file} ({uploadResult.pages_processed} pages)
              </Text>
              <Text style={{ color: colors.textSecondary, fontSize: 12 }}>
                <Text style={{ fontWeight: "600" }}>Model:</Text> {uploadResult.model}
              </Text>
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 4 }}>
                {uploadResult.statements.map((s, i) => (
                  <View key={i} style={{
                    paddingHorizontal: 8, paddingVertical: 3,
                    borderRadius: 6,
                    backgroundColor: (STMNT_ICONS[s.statement_type]?.color ?? "#6366f1") + "15",
                  }}>
                    <Text style={{
                      color: STMNT_ICONS[s.statement_type]?.color ?? "#6366f1",
                      fontSize: 10, fontWeight: "700", textTransform: "capitalize",
                    }}>
                      {s.statement_type} {s.fiscal_year} ({s.line_items_count} items)
                    </Text>
                  </View>
                ))}
              </View>
            </View>
          </View>
        )}

        {/* Upload error */}
        {uploadError && !uploading && (
          <View style={{
            marginTop: 10, padding: 12, borderRadius: 10,
            backgroundColor: colors.danger + "10",
            borderWidth: 1, borderColor: colors.danger + "30",
          }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <FontAwesome name="exclamation-circle" size={16} color={colors.danger} />
              <Text style={{ color: colors.danger, fontSize: 13, fontWeight: "600", flex: 1 }}>
                {uploadError}
              </Text>
              <Pressable onPress={() => setUploadError(null)} hitSlop={8}>
                <FontAwesome name="times" size={14} color={colors.textMuted} />
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {/* Type filter tabs */}
      <StatementTabBar value={typeFilter} onChange={(v) => setTypeFilter(v ?? "income")} colors={colors} showAll={false} />

      {isLoading ? (
        <LoadingScreen />
      ) : (
        <StatementsTable statements={statements} colors={colors} isDesktop={isDesktop} isFetching={isFetching} onRefresh={refetch} />
      )}
    </View>
  );
}

/** Table view of financial statements — years left-to-right, line items as rows */
function StatementsTable({
  statements, colors, isDesktop, isFetching, onRefresh,
}: {
  statements: FinancialStatement[];
  colors: ThemePalette;
  isDesktop: boolean;
  isFetching: boolean;
  onRefresh: () => void;
}) {
  const queryClient = useQueryClient();
  const [editingKey, setEditingKey] = useState<string | null>(null); // "itemId"
  const [editValue, setEditValue] = useState("");

  const updateMut = useMutation({
    mutationFn: ({ itemId, amount }: { itemId: number; amount: number }) => updateLineItem(itemId, amount),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ["analysis-statements"] }); setEditingKey(null); },
  });

  // Build columns (periods sorted by date)
  const periods = useMemo(() =>
    [...statements]
      .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date))
      .map((st) => ({
        label: `FY${st.fiscal_year}${st.fiscal_quarter ? ` Q${st.fiscal_quarter}` : ""}`,
        period: st.period_end_date,
        items: Object.fromEntries(
          (st.line_items ?? []).map((li) => [li.line_item_code, { id: li.id, amount: li.amount, name: li.line_item_name, isTotal: li.is_total, edited: li.manually_edited }])
        ),
      })),
  [statements]);

  // Build unified row list preserving order from first statement that has each code
  const allCodes = useMemo(() => {
    const codes: { code: string; name: string; isTotal: boolean }[] = [];
    const seen = new Set<string>();
    for (const s of statements) {
      for (const li of (s.line_items ?? []).sort((a, b) => (a.order_index ?? 0) - (b.order_index ?? 0))) {
        if (!seen.has(li.line_item_code)) {
          seen.add(li.line_item_code);
          codes.push({ code: li.line_item_code, name: li.line_item_name, isTotal: li.is_total });
        }
      }
    }
    return codes;
  }, [statements]);

  if (periods.length === 0) {
    return (
      <View style={st.empty}>
        <View style={[st.emptyIcon, { backgroundColor: colors.accentSecondary + "10" }]}>
          <FontAwesome name="file-text-o" size={32} color={colors.accentSecondary} />
        </View>
        <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginTop: 16 }}>No statements</Text>
        <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>Upload a financial report PDF above to extract statements with AI</Text>
      </View>
    );
  }

  const COL_NAME_W = isDesktop ? 200 : 160;
  const COL_VAL_W = isDesktop ? 120 : 105;

  return (
    <ScrollView refreshControl={<RefreshControl refreshing={isFetching} onRefresh={onRefresh} tintColor={colors.accentPrimary} />}>
      <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingHorizontal: 8, paddingTop: 4, paddingBottom: 80 }}>
        <View>
          {/* ── Header row ── */}
          <View style={{
            flexDirection: "row",
            alignItems: "center",
            paddingVertical: 10,
            paddingHorizontal: 8,
            borderBottomWidth: 2,
            borderBottomColor: colors.accentPrimary,
            backgroundColor: colors.bgCard,
          }}>
            <Text style={{ width: COL_NAME_W, fontSize: 12, fontWeight: "800", color: colors.textPrimary }} numberOfLines={1}>
              Line Item
            </Text>
            {periods.map((p) => (
              <Text key={p.period} style={{ width: COL_VAL_W, textAlign: "right", fontSize: 12, fontWeight: "800", color: colors.textPrimary }}>
                {p.label}
              </Text>
            ))}
          </View>

          {/* ── Data rows ── */}
          {allCodes.map((item, rowIdx) => (
            <View
              key={item.code}
              style={{
                flexDirection: "row",
                alignItems: "center",
                paddingVertical: 8,
                paddingHorizontal: 8,
                backgroundColor: item.isTotal
                  ? colors.bgInput + "60"
                  : rowIdx % 2 === 0
                  ? "transparent"
                  : colors.bgPrimary + "30",
                borderTopWidth: item.isTotal ? 1 : 0,
                borderTopColor: colors.borderColor,
              }}
            >
              {/* Row label */}
              <Text
                numberOfLines={1}
                style={{
                  width: COL_NAME_W,
                  fontSize: 12,
                  fontWeight: item.isTotal ? "700" : "400",
                  color: item.isTotal ? colors.textPrimary : colors.textSecondary,
                  paddingRight: 8,
                }}
              >
                {item.name}
              </Text>

              {/* Value cells */}
              {periods.map((p) => {
                const cell = p.items[item.code];
                const val = cell?.amount;
                const cellKey = cell ? String(cell.id) : null;
                const isEditing = editingKey != null && cellKey === editingKey;

                return (
                  <View key={p.period} style={{ width: COL_VAL_W, alignItems: "flex-end", justifyContent: "center" }}>
                    {isEditing ? (
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                        <TextInput
                          value={editValue}
                          onChangeText={setEditValue}
                          keyboardType="numeric"
                          autoFocus
                          style={{
                            width: COL_VAL_W - 40,
                            height: 26,
                            borderWidth: 1,
                            borderRadius: 6,
                            borderColor: colors.accentPrimary,
                            color: colors.textPrimary,
                            backgroundColor: colors.bgCard,
                            fontSize: 11,
                            paddingHorizontal: 6,
                            textAlign: "right",
                            fontVariant: ["tabular-nums"],
                          }}
                          onSubmitEditing={() => {
                            const num = parseFloat(editValue);
                            if (!isNaN(num) && cellKey) updateMut.mutate({ itemId: parseInt(cellKey), amount: num });
                          }}
                        />
                        <Pressable onPress={() => { const n = parseFloat(editValue); if (!isNaN(n) && cellKey) updateMut.mutate({ itemId: parseInt(cellKey), amount: n }); }} hitSlop={6}>
                          <FontAwesome name="check" size={12} color={colors.success} />
                        </Pressable>
                        <Pressable onPress={() => setEditingKey(null)} hitSlop={6}>
                          <FontAwesome name="times" size={12} color={colors.textMuted} />
                        </Pressable>
                      </View>
                    ) : (
                      <Pressable
                        onPress={() => {
                          if (cellKey) { setEditingKey(cellKey); setEditValue(String(val)); }
                        }}
                        style={{ flexDirection: "row", alignItems: "center" }}
                      >
                        <Text style={{
                          fontSize: 12,
                          fontWeight: item.isTotal ? "700" : "500",
                          color: val != null && val < 0 ? colors.danger : (item.isTotal ? colors.textPrimary : colors.textSecondary),
                          fontVariant: ["tabular-nums"],
                          textAlign: "right",
                        }}>
                          {val != null ? formatNumber(val) : "-"}
                        </Text>
                        {cell?.edited && (
                          <FontAwesome name="pencil" size={8} color={colors.accentPrimary} style={{ marginLeft: 3, opacity: 0.6 }} />
                        )}
                      </Pressable>
                    )}
                  </View>
                );
              })}
            </View>
          ))}
        </View>
      </ScrollView>
    </ScrollView>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  COMPARISON PANEL — Multi-Period Side-by-Side                      */
/* ═══════════════════════════════════════════════════════════════════ */

function ComparisonPanel({ stockId, colors, isDesktop }: { stockId: number; colors: ThemePalette; isDesktop: boolean }) {
  const [typeFilter, setTypeFilter] = useState<string>("income");
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["analysis-statements", stockId, typeFilter],
    queryFn: () => getStatements(stockId, typeFilter),
  });

  const statements = data?.statements ?? [];

  const periods = useMemo(() =>
    [...statements]
      .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date))
      .map((st) => ({
        label: `FY${st.fiscal_year}${st.fiscal_quarter ? ` Q${st.fiscal_quarter}` : ""}`,
        period: st.period_end_date,
        items: Object.fromEntries(
          (st.line_items ?? []).map((li) => [li.line_item_code, { amount: li.amount, name: li.line_item_name, isTotal: li.is_total }])
        ),
      })),
  [statements]);

  const allCodes = useMemo(() => {
    const codes: { code: string; name: string; isTotal: boolean }[] = [];
    const seen = new Set<string>();
    for (const s of statements) {
      for (const li of s.line_items ?? []) {
        if (!seen.has(li.line_item_code)) { seen.add(li.line_item_code); codes.push({ code: li.line_item_code, name: li.line_item_name, isTotal: li.is_total }); }
      }
    }
    return codes;
  }, [statements]);

  return (
    <View style={{ flex: 1 }}>
      <StatementTabBar value={typeFilter} onChange={(v) => setTypeFilter(v ?? "income")} colors={colors} />

      {isLoading ? (
        <LoadingScreen />
      ) : periods.length < 2 ? (
        <View style={st.empty}>
          <View style={[st.emptyIcon, { backgroundColor: colors.warning + "10" }]}>
            <FontAwesome name="columns" size={32} color={colors.warning} />
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginTop: 16 }}>Need 2+ periods</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>Upload statements for multiple fiscal years to compare.</Text>
        </View>
      ) : (
        <ScrollView refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}>
          <ScrollView horizontal showsHorizontalScrollIndicator contentContainerStyle={{ paddingHorizontal: 12, paddingTop: 8, paddingBottom: 80 }}>
            <View>
              {/* Header row */}
              <View style={[st.compHeaderRow, { borderBottomColor: colors.borderColor }]}>
                <Text style={[st.compCellName, { color: colors.textPrimary, fontWeight: "800" }]}>Line Item</Text>
                {periods.map((p, i) => (
                  <React.Fragment key={p.period}>
                    <Text style={[st.compCellVal, { color: colors.textPrimary, fontWeight: "800" }]}>{p.label}</Text>
                    {i > 0 && <Text style={[st.compCellYoy, { color: colors.accentPrimary, fontWeight: "700" }]}>YoY %</Text>}
                  </React.Fragment>
                ))}
              </View>

              {/* Data rows */}
              {allCodes.map((item, rowIdx) => {
                const isTotal = item.isTotal;
                return (
                  <View
                    key={item.code}
                    style={[
                      st.compRow,
                      { backgroundColor: isTotal ? colors.bgInput + "50" : (rowIdx % 2 === 0 ? "transparent" : colors.bgPrimary + "30") },
                      isTotal && { borderTopWidth: 1, borderTopColor: colors.borderColor },
                    ]}
                  >
                    <Text numberOfLines={1} style={[st.compCellName, { color: isTotal ? colors.textPrimary : colors.textSecondary, fontWeight: isTotal ? "700" : "400" }]}>
                      {item.name}
                    </Text>
                    {periods.map((p, i) => {
                      const val = p.items[item.code]?.amount;
                      const prevVal = i > 0 ? periods[i - 1].items[item.code]?.amount : undefined;
                      const yoy = prevVal && prevVal !== 0 && val != null ? ((val - prevVal) / Math.abs(prevVal)) * 100 : null;
                      return (
                        <React.Fragment key={p.period}>
                          <Text style={[st.compCellVal, {
                            color: val != null && val < 0 ? colors.danger : (isTotal ? colors.textPrimary : colors.textSecondary),
                            fontWeight: isTotal ? "700" : "500",
                          }]}>
                            {val != null ? formatNumber(val) : "–"}
                          </Text>
                          {i > 0 && (
                            <Text style={[st.compCellYoy, {
                              color: yoy == null ? colors.textMuted : yoy >= 0 ? colors.success : colors.danger,
                              fontWeight: "600",
                            }]}>
                              {yoy != null ? `${yoy >= 0 ? "+" : ""}${yoy.toFixed(1)}%` : "–"}
                            </Text>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </View>
                );
              })}
            </View>
          </ScrollView>
        </ScrollView>
      )}
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  METRICS PANEL                                                     */
/* ═══════════════════════════════════════════════════════════════════ */

function MetricsPanel({ stockId, colors, isDesktop }: { stockId: number; colors: ThemePalette; isDesktop: boolean }) {
  const queryClient = useQueryClient();
  const [viewMode, setViewMode] = useState<"historical" | "grouped">("historical");
  const [calcAllRunning, setCalcAllRunning] = useState(false);

  const stmtQ = useQuery({ queryKey: ["analysis-statements", stockId], queryFn: () => getStatements(stockId) });
  const periods = useMemo(() => {
    const seen = new Set<string>();
    return (stmtQ.data?.statements ?? [])
      .filter((s) => { if (seen.has(s.period_end_date)) return false; seen.add(s.period_end_date); return true; })
      .sort((a, b) => a.period_end_date.localeCompare(b.period_end_date))
      .map((s) => ({ period_end_date: s.period_end_date, fiscal_year: s.fiscal_year, fiscal_quarter: s.fiscal_quarter }));
  }, [stmtQ.data]);

  const [selectedPeriod, setSelectedPeriod] = useState<string | null>(null);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["analysis-metrics", stockId],
    queryFn: () => getStockMetrics(stockId),
  });

  const calcMut = useMutation({
    mutationFn: (p: { period_end_date: string; fiscal_year: number; fiscal_quarter?: number }) => calculateMetrics(stockId, p),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["analysis-metrics", stockId] }),
  });

  const handleCalculateAll = async () => {
    if (periods.length === 0) return;
    setCalcAllRunning(true);
    for (const p of periods) {
      await calculateMetrics(stockId, { period_end_date: p.period_end_date, fiscal_year: p.fiscal_year, fiscal_quarter: p.fiscal_quarter ?? undefined }).catch(() => {});
    }
    queryClient.invalidateQueries({ queryKey: ["analysis-metrics", stockId] });
    setCalcAllRunning(false);
  };

  const grouped = data?.grouped ?? {};
  const allMetrics = data?.metrics ?? [];
  const categories = Object.keys(grouped);
  const historicalCategories = useMemo(() => buildHistoricalMetrics(allMetrics), [allMetrics]);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[st.listContent, isDesktop && { maxWidth: 960, alignSelf: "center", width: "100%" }]}
      refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}
    >
      {/* Calculate section */}
      <FadeIn>
        <Card colors={colors} style={{ marginBottom: 16 }}>
          <SectionHeader title="Calculate Metrics" icon="cogs" iconColor={colors.accentSecondary} colors={colors} />
          <Text style={{ color: colors.textMuted, fontSize: 12, marginTop: 4, marginBottom: 10 }}>
            Select a period or calculate all at once from uploaded statements.
          </Text>

          {periods.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
              {periods.map((p) => (
                <Chip
                  key={p.period_end_date}
                  label={`FY${p.fiscal_year}${p.fiscal_quarter ? ` Q${p.fiscal_quarter}` : ""}`}
                  active={selectedPeriod === p.period_end_date}
                  onPress={() => setSelectedPeriod(p.period_end_date)}
                  colors={colors}
                />
              ))}
            </ScrollView>
          )}

          <View style={{ flexDirection: "row", gap: 8 }}>
            <ActionButton
              label={calcMut.isPending ? "Calculating..." : "Calculate Selected"}
              onPress={() => {
                const p = periods.find((x) => x.period_end_date === selectedPeriod);
                if (p) calcMut.mutate({ period_end_date: p.period_end_date, fiscal_year: p.fiscal_year, fiscal_quarter: p.fiscal_quarter ?? undefined });
              }}
              colors={colors}
              variant="primary"
              disabled={!selectedPeriod}
              loading={calcMut.isPending}
              icon="calculator"
              flex={1}
            />
            <ActionButton
              label={calcAllRunning ? "Running..." : "Calculate All"}
              onPress={handleCalculateAll}
              colors={colors}
              variant="success"
              disabled={periods.length === 0}
              loading={calcAllRunning}
              icon="refresh"
              flex={1}
            />
          </View>
        </Card>
      </FadeIn>

      {isLoading ? (
        <LoadingScreen />
      ) : categories.length === 0 ? (
        <View style={st.empty}>
          <View style={[st.emptyIcon, { backgroundColor: colors.accentPrimary + "10" }]}>
            <FontAwesome name="bar-chart" size={32} color={colors.accentPrimary} />
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginTop: 16 }}>No metrics yet</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4, textAlign: "center" }}>
            Upload statements and calculate metrics above.
          </Text>
        </View>
      ) : (
        <>
          {/* View toggle */}
          <View style={{ flexDirection: "row", marginBottom: 14, gap: 8 }}>
            <Chip label="Historical Table" active={viewMode === "historical"} onPress={() => setViewMode("historical")} colors={colors} icon="table" />
            <Chip label="Grouped List" active={viewMode === "grouped"} onPress={() => setViewMode("grouped")} colors={colors} icon="list-ul" />
          </View>

          {viewMode === "historical" ? (
            Object.entries(historicalCategories).map(([cat, { metricNames, yearData, years }], idx) => {
              const catInfo = CATEGORY_LABELS[cat] ?? { label: cat, icon: "circle" as const, color: "#6366f1" };
              return (
                <FadeIn key={cat} delay={idx * 60}>
                  <SectionHeader title={catInfo.label} icon={catInfo.icon} iconColor={catInfo.color} badge={metricNames.length} colors={colors} />
                  <ScrollView horizontal showsHorizontalScrollIndicator style={{ marginBottom: 16 }}>
                    <Card colors={colors} noPadding>
                      {/* Header */}
                      <View style={[st.metricTableHeader, { borderBottomColor: colors.borderColor }]}>
                        <Text style={[st.metricTableNameCell, { color: colors.textPrimary, fontWeight: "800" }]}>Metric</Text>
                        {years.map((yr) => (
                          <Text key={yr} style={[st.metricTableValCell, { color: colors.textPrimary, fontWeight: "800" }]}>FY{yr}</Text>
                        ))}
                      </View>
                      {/* Rows */}
                      {metricNames.map((name, ri) => (
                        <View key={name} style={[st.metricTableRow, { backgroundColor: ri % 2 === 0 ? "transparent" : colors.bgPrimary + "30" }]}>
                          <Text numberOfLines={1} style={[st.metricTableNameCell, { color: colors.textSecondary }]}>{name}</Text>
                          {years.map((yr) => {
                            const val = yearData[yr]?.[name];
                            return (
                              <Text key={yr} style={[st.metricTableValCell, {
                                color: val != null ? colors.textPrimary : colors.textMuted,
                                fontWeight: val != null ? "600" : "400",
                              }]}>
                                {val != null ? formatMetricValue(name, val) : "–"}
                              </Text>
                            );
                          })}
                        </View>
                      ))}
                    </Card>
                  </ScrollView>
                </FadeIn>
              );
            })
          ) : (
            categories.map((cat, idx) => {
              const catInfo = CATEGORY_LABELS[cat] ?? { label: cat, icon: "circle" as const, color: "#6366f1" };
              return (
                <FadeIn key={cat} delay={idx * 50}>
                  <SectionHeader title={catInfo.label} icon={catInfo.icon} iconColor={catInfo.color} colors={colors} />
                  <Card colors={colors} style={{ marginBottom: 14 }}>
                    {grouped[cat].map((m: StockMetric, mi: number) => (
                      <View key={m.id} style={[st.metricRow, mi < grouped[cat].length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderColor + "40" }]}>
                        <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 13 }}>{m.metric_name}</Text>
                        <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                          {formatMetricValue(m.metric_name, m.metric_value)}
                        </Text>
                        <View style={[st.tagPill, { backgroundColor: colors.bgInput, marginLeft: 8 }]}>
                          <Text style={{ color: colors.textMuted, fontSize: 9, fontWeight: "600" }}>{m.period_end_date}</Text>
                        </View>
                      </View>
                    ))}
                  </Card>
                </FadeIn>
              );
            })
          )}
        </>
      )}
    </ScrollView>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  GROWTH PANEL                                                      */
/* ═══════════════════════════════════════════════════════════════════ */

function GrowthPanel({ stockId, colors, isDesktop }: { stockId: number; colors: ThemePalette; isDesktop: boolean }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["analysis-growth", stockId],
    queryFn: () => getGrowthAnalysis(stockId),
  });

  const growth = data?.growth ?? {};
  const labels = Object.keys(growth);

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[st.listContent, isDesktop && { maxWidth: 960, alignSelf: "center", width: "100%" }]}
      refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}
    >
      {isLoading ? (
        <LoadingScreen />
      ) : labels.length === 0 ? (
        <View style={st.empty}>
          <View style={[st.emptyIcon, { backgroundColor: colors.success + "10" }]}>
            <FontAwesome name="line-chart" size={32} color={colors.success} />
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginTop: 16 }}>Insufficient data</Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>Need at least 2 periods of financial statements.</Text>
        </View>
      ) : (
        labels.map((label, idx) => (
          <FadeIn key={label} delay={idx * 60}>
            <SectionHeader title={label} icon="line-chart" iconColor={colors.success} colors={colors} badge={growth[label].length} />
            <Card colors={colors} style={{ marginBottom: 16 }}>
              {growth[label].map((g: any, i: number) => {
                const pct = g.growth * 100;
                const positive = g.growth >= 0;
                const barWidth = Math.min(Math.abs(pct), 100);
                return (
                  <View key={i} style={[st.growthRow, i < growth[label].length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderColor + "30" }]}>
                    <View style={{ flex: 1 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                        <Text style={{ color: colors.textMuted, fontSize: 11 }}>{g.prev_period}</Text>
                        <FontAwesome name="long-arrow-right" size={10} color={colors.textMuted} style={{ marginHorizontal: 6 }} />
                        <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "500" }}>{g.period}</Text>
                      </View>
                      {/* Visual bar */}
                      <View style={[st.growthBarTrack, { backgroundColor: colors.borderColor + "40" }]}>
                        <View style={[
                          st.growthBarFill,
                          {
                            width: `${barWidth}%`,
                            backgroundColor: positive ? colors.success + "30" : colors.danger + "30",
                            borderColor: positive ? colors.success : colors.danger,
                          },
                        ]} />
                      </View>
                    </View>
                    <View style={{ alignItems: "flex-end", marginLeft: 12, minWidth: 70 }}>
                      <View style={{ flexDirection: "row", alignItems: "center" }}>
                        <FontAwesome
                          name={positive ? "caret-up" : "caret-down"}
                          size={16}
                          color={positive ? colors.success : colors.danger}
                          style={{ marginRight: 4 }}
                        />
                        <Text style={{
                          color: positive ? colors.success : colors.danger,
                          fontSize: 15,
                          fontWeight: "800",
                          fontVariant: ["tabular-nums"],
                        }}>
                          {positive ? "+" : ""}{pct.toFixed(1)}%
                        </Text>
                      </View>
                    </View>
                  </View>
                );
              })}
            </Card>
          </FadeIn>
        ))
      )}
    </ScrollView>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  SCORE PANEL                                                       */
/* ═══════════════════════════════════════════════════════════════════ */

function ScorePanel({ stockId, colors, isDesktop }: { stockId: number; colors: ThemePalette; isDesktop: boolean }) {
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["analysis-score", stockId],
    queryFn: () => getStockScore(stockId),
  });
  const historyQ = useQuery({
    queryKey: ["analysis-score-history", stockId],
    queryFn: () => getScoreHistory(stockId),
  });

  const score = data;
  const scoreHistory = historyQ.data?.scores ?? [];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[st.listContent, isDesktop && { maxWidth: 700, alignSelf: "center", width: "100%" }]}
      refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}
    >
      {isLoading ? (
        <LoadingScreen />
      ) : !score || score.overall_score == null ? (
        <View style={st.empty}>
          <View style={[st.emptyIcon, { backgroundColor: colors.warning + "10" }]}>
            <FontAwesome name="star-o" size={32} color={colors.warning} />
          </View>
          <Text style={{ color: colors.textPrimary, fontSize: 16, fontWeight: "700", marginTop: 16 }}>
            {score?.error ?? "No score available"}
          </Text>
          <Text style={{ color: colors.textMuted, fontSize: 13, marginTop: 4 }}>Calculate metrics first, then compute the score.</Text>
        </View>
      ) : (
        <>
          {/* Overall Score */}
          <FadeIn>
            <Card colors={colors} style={{ alignItems: "center", paddingVertical: 28, marginBottom: 16 }}>
              <View style={[st.scoreRing, { borderColor: scoreColor(score.overall_score!, colors) }]}>
                <View style={[st.scoreRingInner, { backgroundColor: scoreColor(score.overall_score!, colors) + "10" }]}>
                  <Text style={[st.scoreNum, { color: scoreColor(score.overall_score!, colors) }]}>
                    {score.overall_score!.toFixed(0)}
                  </Text>
                </View>
              </View>
              <Text style={{ color: colors.textPrimary, fontSize: 18, fontWeight: "800", marginTop: 14 }}>
                {scoreLabel(score.overall_score!)}
              </Text>
              <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 6, textAlign: "center", lineHeight: 16 }}>
                CFA-Based Composite Score{"\n"}
                Fundamentals 30% · Valuation 25% · Growth 25% · Quality 20%
              </Text>
            </Card>
          </FadeIn>

          {/* Sub-scores */}
          <FadeIn delay={100}>
            <SectionHeader title="Sub-Scores" icon="sliders" iconColor={colors.accentSecondary} colors={colors} />
            <Card colors={colors} style={{ marginBottom: 16 }}>
              <ScoreBarPremium label="Fundamental" weight="30%" value={score.fundamental_score} colors={colors} iconColor="#10b981" />
              <ScoreBarPremium label="Valuation" weight="25%" value={score.valuation_score} colors={colors} iconColor="#6366f1" />
              <ScoreBarPremium label="Growth" weight="25%" value={score.growth_score} colors={colors} iconColor="#f97316" />
              <ScoreBarPremium label="Quality" weight="20%" value={score.quality_score} colors={colors} iconColor="#3b82f6" />
            </Card>
          </FadeIn>

          {/* Score History */}
          {scoreHistory.length > 1 && (
            <FadeIn delay={200}>
              <SectionHeader title="Score History" icon="history" iconColor={colors.warning} badge={scoreHistory.length} colors={colors} />
              <Card colors={colors} noPadding style={{ marginBottom: 16 }}>
                {/* Header */}
                <View style={[st.scoreHistRow, { borderBottomWidth: 1, borderBottomColor: colors.borderColor, backgroundColor: colors.bgInput + "40" }]}>
                  <Text style={[st.scoreHistCell, { flex: 1, fontWeight: "800", color: colors.textPrimary }]}>Date</Text>
                  <Text style={[st.scoreHistCell, { width: 52, fontWeight: "800", color: colors.textPrimary }]}>Score</Text>
                  <Text style={[st.scoreHistCell, { width: 40, color: colors.textMuted }]}>F</Text>
                  <Text style={[st.scoreHistCell, { width: 40, color: colors.textMuted }]}>V</Text>
                  <Text style={[st.scoreHistCell, { width: 40, color: colors.textMuted }]}>G</Text>
                  <Text style={[st.scoreHistCell, { width: 40, color: colors.textMuted }]}>Q</Text>
                </View>
                {scoreHistory.map((sh, idx) => (
                  <View key={sh.id} style={[st.scoreHistRow, { backgroundColor: idx % 2 === 0 ? "transparent" : colors.bgPrimary + "30" }]}>
                    <Text style={[st.scoreHistCell, { flex: 1, color: colors.textSecondary }]}>{sh.scoring_date}</Text>
                    <Text style={[st.scoreHistCell, { width: 52, fontWeight: "800", color: scoreColor(sh.overall_score ?? 0, colors) }]}>
                      {sh.overall_score?.toFixed(0) ?? "–"}
                    </Text>
                    <Text style={[st.scoreHistCell, { width: 40, color: colors.textMuted }]}>{sh.fundamental_score?.toFixed(0) ?? "–"}</Text>
                    <Text style={[st.scoreHistCell, { width: 40, color: colors.textMuted }]}>{sh.valuation_score?.toFixed(0) ?? "–"}</Text>
                    <Text style={[st.scoreHistCell, { width: 40, color: colors.textMuted }]}>{sh.growth_score?.toFixed(0) ?? "–"}</Text>
                    <Text style={[st.scoreHistCell, { width: 40, color: colors.textMuted }]}>{sh.quality_score?.toFixed(0) ?? "–"}</Text>
                  </View>
                ))}
              </Card>
            </FadeIn>
          )}

          {/* Underlying Metrics */}
          {score.details && Object.keys(score.details).length > 0 && (
            <FadeIn delay={300}>
              <SectionHeader title="Underlying Metrics" icon="list-ol" iconColor={colors.accentPrimary} badge={Object.keys(score.details).length} colors={colors} />
              <Card colors={colors}>
                {Object.entries(score.details).map(([name, val], idx, arr) => (
                  <View key={name} style={[st.metricRow, idx < arr.length - 1 && { borderBottomWidth: 1, borderBottomColor: colors.borderColor + "30" }]}>
                    <Text style={{ flex: 1, color: colors.textSecondary, fontSize: 12 }}>{name}</Text>
                    <Text style={{ color: colors.textPrimary, fontSize: 12, fontWeight: "700", fontVariant: ["tabular-nums"] }}>
                      {formatMetricValue(name, val as number)}
                    </Text>
                  </View>
                ))}
              </Card>
            </FadeIn>
          )}
        </>
      )}
    </ScrollView>
  );
}

function ScoreBarPremium({
  label, weight, value, colors, iconColor,
}: { label: string; weight: string; value: number | null | undefined; colors: ThemePalette; iconColor: string }) {
  const v = value ?? 0;
  const barColor = scoreColor(v, colors);
  return (
    <View style={{ marginBottom: 14 }}>
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 6 }}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={[st.sectionIcon, { backgroundColor: iconColor + "18", width: 22, height: 22 }]}>
            <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: iconColor }} />
          </View>
          <Text style={{ color: colors.textSecondary, fontSize: 13, fontWeight: "500", marginLeft: 8 }}>{label}</Text>
          <Text style={{ color: colors.textMuted, fontSize: 10, marginLeft: 4 }}>({weight})</Text>
        </View>
        <Text style={{ color: barColor, fontSize: 14, fontWeight: "800", fontVariant: ["tabular-nums"] }}>{v.toFixed(0)}</Text>
      </View>
      <View style={[st.scoreBarTrack, { backgroundColor: colors.borderColor + "50" }]}>
        <View style={[st.scoreBarFill, { width: `${Math.min(v, 100)}%`, backgroundColor: barColor }]} />
      </View>
    </View>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  VALUATIONS PANEL                                                  */
/* ═══════════════════════════════════════════════════════════════════ */

function ValuationsPanel({ stockId, colors, isDesktop }: { stockId: number; colors: ThemePalette; isDesktop: boolean }) {
  const queryClient = useQueryClient();
  const [model, setModel] = useState<"graham" | "dcf" | "ddm" | "multiples">("graham");

  const [eps, setEps] = useState("");
  const [bvps, setBvps] = useState("");
  const [fcf, setFcf] = useState("");
  const [g1, setG1] = useState("0.10");
  const [g2, setG2] = useState("0.05");
  const [dr, setDr] = useState("0.10");
  const [shares, setShares] = useState("1");
  const [div, setDiv] = useState("");
  const [divGr, setDivGr] = useState("0.05");
  const [rr, setRr] = useState("0.10");
  const [mv, setMv] = useState("");
  const [pm, setPm] = useState("");

  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["analysis-valuations", stockId],
    queryFn: () => getValuations(stockId),
  });

  const grahamMut = useMutation({
    mutationFn: () => runGrahamValuation(stockId, { eps: parseFloat(eps), book_value_per_share: parseFloat(bvps) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["analysis-valuations", stockId] }),
  });
  const dcfMut = useMutation({
    mutationFn: () => runDCFValuation(stockId, {
      fcf: parseFloat(fcf), growth_rate_stage1: parseFloat(g1), growth_rate_stage2: parseFloat(g2),
      discount_rate: parseFloat(dr), shares_outstanding: parseFloat(shares) || 1,
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["analysis-valuations", stockId] }),
  });
  const ddmMut = useMutation({
    mutationFn: () => runDDMValuation(stockId, { last_dividend: parseFloat(div), growth_rate: parseFloat(divGr), required_return: parseFloat(rr) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["analysis-valuations", stockId] }),
  });
  const multMut = useMutation({
    mutationFn: () => runMultiplesValuation(stockId, { metric_value: parseFloat(mv), peer_multiple: parseFloat(pm), shares_outstanding: parseFloat(shares) || 1 }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["analysis-valuations", stockId] }),
  });

  const valuations = data?.valuations ?? [];

  const MODEL_INFO: Record<string, { title: string; formula: string; icon: React.ComponentProps<typeof FontAwesome>["name"] }> = {
    graham:    { title: "Graham Number", formula: "V = √(22.5 × EPS × BVPS)", icon: "university" },
    dcf:       { title: "Two-Stage DCF", formula: "Gordon Growth Terminal Value", icon: "sitemap" },
    ddm:       { title: "Dividend Discount", formula: "Gordon Growth Model", icon: "money" },
    multiples: { title: "Comparable Multiples", formula: "e.g., P/E × EPS", icon: "balance-scale" },
  };

  const info = MODEL_INFO[model];

  return (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[st.listContent, isDesktop && { maxWidth: 960, alignSelf: "center", width: "100%" }]}
      refreshControl={<RefreshControl refreshing={isFetching && !isLoading} onRefresh={refetch} tintColor={colors.accentPrimary} />}
    >
      <FadeIn>
        <SectionHeader title="Run Valuation" icon="calculator" iconColor={colors.accentTertiary} colors={colors} />

        {/* Model selector */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 12 }}>
          {(["graham", "dcf", "ddm", "multiples"] as const).map((m) => (
            <Chip key={m} label={m === "multiples" ? "MULTIPLES" : m.toUpperCase()} active={model === m} onPress={() => setModel(m)} colors={colors}
              icon={MODEL_INFO[m].icon} />
          ))}
        </ScrollView>

        <Card colors={colors}>
          {/* Model header */}
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 12 }}>
            <View style={[st.sectionIcon, { backgroundColor: colors.accentTertiary + "18" }]}>
              <FontAwesome name={info.icon} size={12} color={colors.accentTertiary} />
            </View>
            <View style={{ marginLeft: 10 }}>
              <Text style={{ color: colors.textPrimary, fontSize: 14, fontWeight: "700" }}>{info.title}</Text>
              <Text style={{ color: colors.textMuted, fontSize: 11 }}>{info.formula}</Text>
            </View>
          </View>

          {model === "graham" && (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="EPS" value={eps} onChangeText={setEps} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="BOOK VALUE / SHARE" value={bvps} onChangeText={setBvps} colors={colors} keyboardType="numeric" flex={1} />
              </View>
              <ActionButton label={grahamMut.isPending ? "Calculating..." : "Calculate Graham"} onPress={() => grahamMut.mutate()}
                colors={colors} disabled={!eps || !bvps} loading={grahamMut.isPending} icon="play" />
            </>
          )}

          {model === "dcf" && (
            <>
              <View style={{ flexDirection: "row", gap: 10, flexWrap: "wrap" }}>
                <LabeledInput label="FCF" value={fcf} onChangeText={setFcf} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="STAGE 1 GROWTH" value={g1} onChangeText={setG1} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="STAGE 2 GROWTH" value={g2} onChangeText={setG2} colors={colors} keyboardType="numeric" flex={1} />
              </View>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="DISCOUNT RATE" value={dr} onChangeText={setDr} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="SHARES" value={shares} onChangeText={setShares} colors={colors} keyboardType="numeric" flex={1} />
              </View>
              <ActionButton label={dcfMut.isPending ? "Calculating..." : "Calculate DCF"} onPress={() => dcfMut.mutate()}
                colors={colors} disabled={!fcf} loading={dcfMut.isPending} icon="play" />
            </>
          )}

          {model === "ddm" && (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="LAST DIVIDEND" value={div} onChangeText={setDiv} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="GROWTH RATE" value={divGr} onChangeText={setDivGr} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="REQ. RETURN" value={rr} onChangeText={setRr} colors={colors} keyboardType="numeric" flex={1} />
              </View>
              <ActionButton label={ddmMut.isPending ? "Calculating..." : "Calculate DDM"} onPress={() => ddmMut.mutate()}
                colors={colors} disabled={!div} loading={ddmMut.isPending} icon="play" />
            </>
          )}

          {model === "multiples" && (
            <>
              <View style={{ flexDirection: "row", gap: 10 }}>
                <LabeledInput label="METRIC VALUE" value={mv} onChangeText={setMv} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="PEER MULTIPLE" value={pm} onChangeText={setPm} colors={colors} keyboardType="numeric" flex={1} />
                <LabeledInput label="SHARES" value={shares} onChangeText={setShares} colors={colors} keyboardType="numeric" flex={1} />
              </View>
              <ActionButton label={multMut.isPending ? "Calculating..." : "Calculate Multiples"} onPress={() => multMut.mutate()}
                colors={colors} disabled={!mv || !pm} loading={multMut.isPending} icon="play" />
            </>
          )}
        </Card>
      </FadeIn>

      {/* Valuation history */}
      {valuations.length > 0 && (
        <FadeIn delay={100}>
          <SectionHeader title="Valuation History" icon="history" iconColor={colors.accentSecondary} badge={valuations.length} colors={colors} style={{ marginTop: 20 }} />
          {valuations.map((v, idx) => (
            <FadeIn key={v.id} delay={idx * 40}>
              <Card colors={colors} style={{ marginBottom: 10 }}>
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  {/* Model icon */}
                  <View style={[st.sectionIcon, { backgroundColor: colors.accentPrimary + "15" }]}>
                    <FontAwesome name={MODEL_INFO[v.model_type]?.icon ?? "calculator"} size={12} color={colors.accentPrimary} />
                  </View>
                  <View style={{ flex: 1, marginLeft: 10 }}>
                    <Text style={{ color: colors.textPrimary, fontSize: 13, fontWeight: "700", textTransform: "uppercase" }}>{v.model_type}</Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10 }}>{v.valuation_date}</Text>
                  </View>
                  <View style={{ alignItems: "flex-end" }}>
                    <Text style={{
                      color: v.intrinsic_value != null ? colors.accentPrimary : colors.textMuted,
                      fontSize: 20,
                      fontWeight: "800",
                      fontVariant: ["tabular-nums"],
                    }}>
                      {v.intrinsic_value != null ? v.intrinsic_value.toFixed(2) : "N/A"}
                    </Text>
                    <Text style={{ color: colors.textMuted, fontSize: 10, fontWeight: "500" }}>Intrinsic Value</Text>
                  </View>
                </View>

                {v.parameters && Object.keys(v.parameters).length > 0 && (
                  <View style={{ marginTop: 10, borderTopWidth: 1, borderTopColor: colors.borderColor, paddingTop: 8 }}>
                    {Object.entries(v.parameters).map(([k, val]) => (
                      <View key={k} style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 }}>
                        <Text style={{ color: colors.textMuted, fontSize: 11, textTransform: "capitalize" }}>{k.replace(/_/g, " ")}</Text>
                        <Text style={{ color: colors.textSecondary, fontSize: 11, fontWeight: "500", fontVariant: ["tabular-nums"] }}>
                          {typeof val === "number" ? val.toFixed(4) : String(val)}
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
              </Card>
            </FadeIn>
          ))}
        </FadeIn>
      )}
    </ScrollView>
  );
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  HELPERS                                                           */
/* ═══════════════════════════════════════════════════════════════════ */

function buildHistoricalMetrics(allMetrics: StockMetric[]) {
  const catMap: Record<string, { nameSet: Set<string>; yearData: Record<number, Record<string, number>> }> = {};
  for (const m of allMetrics) {
    const cat = m.metric_type;
    if (!catMap[cat]) catMap[cat] = { nameSet: new Set(), yearData: {} };
    catMap[cat].nameSet.add(m.metric_name);
    if (!catMap[cat].yearData[m.fiscal_year]) catMap[cat].yearData[m.fiscal_year] = {};
    catMap[cat].yearData[m.fiscal_year][m.metric_name] = m.metric_value;
  }
  const result: Record<string, { metricNames: string[]; yearData: Record<number, Record<string, number>>; years: number[] }> = {};
  const catOrder = ["profitability", "liquidity", "leverage", "efficiency", "valuation", "cashflow", "growth"];
  for (const cat of catOrder) {
    if (!catMap[cat]) continue;
    result[cat] = { metricNames: Array.from(catMap[cat].nameSet), yearData: catMap[cat].yearData, years: Object.keys(catMap[cat].yearData).map(Number).sort() };
  }
  for (const cat of Object.keys(catMap)) {
    if (result[cat]) continue;
    result[cat] = { metricNames: Array.from(catMap[cat].nameSet), yearData: catMap[cat].yearData, years: Object.keys(catMap[cat].yearData).map(Number).sort() };
  }
  return result;
}

function formatNumber(n: number): string {
  return n.toLocaleString("en-US", { minimumFractionDigits: 0, maximumFractionDigits: 2 });
}

function formatMetricValue(name: string, value: number): string {
  const lc = name.toLowerCase();
  if (["margin", "ratio", "roe", "roa", "growth", "payout", "turnover", "coverage"].some((p) => lc.includes(p)) || lc.includes("dupont"))
    return (value * 100).toFixed(1) + "%";
  if (lc.includes("days") || lc.includes("cycle")) return value.toFixed(0) + " days";
  if (lc.includes("multiplier")) return value.toFixed(2) + "x";
  return formatNumber(value);
}

function scoreColor(score: number, colors: ThemePalette): string {
  if (score >= 70) return colors.success;
  if (score >= 50) return colors.warning ?? "#f59e0b";
  return colors.danger;
}

function scoreLabel(score: number): string {
  if (score >= 80) return "Excellent";
  if (score >= 70) return "Good";
  if (score >= 60) return "Above Average";
  if (score >= 50) return "Average";
  if (score >= 40) return "Below Average";
  return "Poor";
}

/* ═══════════════════════════════════════════════════════════════════ */
/*  STYLES                                                            */
/* ═══════════════════════════════════════════════════════════════════ */

const st = StyleSheet.create({
  container: { flex: 1 },

  /* Header */
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    paddingBottom: 14,
    borderBottomWidth: 1,
  },
  headerTitle: { fontSize: 20, fontWeight: "800", letterSpacing: -0.3 },
  headerBack: {
    width: 30,
    height: 30,
    borderRadius: 15,
    justifyContent: "center",
    alignItems: "center",
  },
  headerBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },

  /* Tabs */
  tabContainer: { borderBottomWidth: 1 },
  tabBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginHorizontal: 2,
    borderRadius: 8,
    marginVertical: 4,
  },
  tabBtnActive: {
    borderRadius: 8,
  },

  /* Search */
  searchRow: {
    flexDirection: "row",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    gap: 8,
    alignItems: "center",
  },
  searchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 12,
    borderWidth: 1,
    gap: 8,
  },
  searchInput: { flex: 1, fontSize: 14 },
  addBtn: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 12,
  },

  /* Chips */
  chip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 20,
    borderWidth: 1,
    marginRight: 6,
  },

  /* Cards */
  card: {
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 10,
    paddingHorizontal: 16,
    paddingVertical: 14,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 8,
    elevation: 2,
  },

  /* Stock list */
  listContent: { paddingHorizontal: 12, paddingTop: 10, paddingBottom: 80 },
  symbolBadge: {
    width: 48,
    height: 48,
    borderRadius: 14,
    justifyContent: "center",
    alignItems: "center",
  },
  tagPill: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },

  /* Sections */
  sectionHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 10,
  },
  sectionIcon: {
    width: 26,
    height: 26,
    borderRadius: 8,
    justifyContent: "center",
    alignItems: "center",
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: "700",
    marginLeft: 8,
    flex: 1,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: 10,
  },

  /* Statements */
  stmtHeader: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  stmtIcon: {
    width: 40,
    height: 40,
    borderRadius: 12,
    justifyContent: "center",
    alignItems: "center",
  },
  lineItemRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 6,
    paddingHorizontal: 16,
  },
  editInput: {
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    fontSize: 12,
    width: 90,
    textAlign: "right",
    fontVariant: ["tabular-nums"],
  },

  /* Comparison */
  compHeaderRow: {
    flexDirection: "row",
    paddingBottom: 8,
    marginBottom: 4,
    borderBottomWidth: 2,
  },
  compRow: {
    flexDirection: "row",
    paddingVertical: 5,
  },
  compCellName: { width: 170, fontSize: 12, paddingRight: 8 },
  compCellVal: { width: 100, textAlign: "right", fontSize: 12, fontVariant: ["tabular-nums"] },
  compCellYoy: { width: 72, textAlign: "right", fontSize: 11, fontVariant: ["tabular-nums"] },

  /* Metrics */
  metricRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 8,
  },
  metricTableHeader: {
    flexDirection: "row",
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderBottomWidth: 1,
  },
  metricTableRow: {
    flexDirection: "row",
    paddingVertical: 7,
    paddingHorizontal: 14,
  },
  metricTableNameCell: { width: 150, fontSize: 12 },
  metricTableValCell: { width: 90, textAlign: "right", fontSize: 12, fontVariant: ["tabular-nums"] },

  /* Growth */
  growthRow: { paddingVertical: 12, flexDirection: "row", alignItems: "center" },
  growthBarTrack: { height: 6, borderRadius: 3, overflow: "hidden" },
  growthBarFill: { height: 6, borderRadius: 3, borderWidth: 1 },

  /* Score */
  scoreRing: {
    width: 110,
    height: 110,
    borderRadius: 55,
    borderWidth: 5,
    justifyContent: "center",
    alignItems: "center",
  },
  scoreRingInner: {
    width: 90,
    height: 90,
    borderRadius: 45,
    justifyContent: "center",
    alignItems: "center",
  },
  scoreNum: { fontSize: 34, fontWeight: "900", fontVariant: ["tabular-nums"] },
  scoreBarTrack: { height: 8, borderRadius: 4, overflow: "hidden" },
  scoreBarFill: { height: 8, borderRadius: 4 },
  scoreHistRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  scoreHistCell: { fontSize: 11, textAlign: "center", fontVariant: ["tabular-nums"] },

  /* Empty states */
  empty: { alignItems: "center", paddingVertical: 60, gap: 4 },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    justifyContent: "center",
    alignItems: "center",
  },

  /* Modal */
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    alignItems: "center",
  },
  modalBox: {
    width: "92%",
    maxWidth: 460,
    borderRadius: 18,
    borderWidth: 1,
    padding: 22,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 10,
  },
  modalTitle: { fontSize: 18, fontWeight: "800" },

  /* Form */
  input: {
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 14,
    paddingVertical: 10,
    fontSize: 14,
  },
  actionBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 12,
    marginTop: 4,
  },
  actionBtnText: { fontSize: 14, fontWeight: "700" },
  errorBanner: {
    flexDirection: "row",
    alignItems: "center",
    padding: 10,
    borderRadius: 8,
    marginTop: 6,
  },

  /* Stock picker */
  pickerRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  pickerSymbolBadge: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: "center",
    alignItems: "center",
  },
  selectedStockCard: {
    flexDirection: "row",
    alignItems: "center",
    padding: 12,
    borderRadius: 12,
    borderWidth: 1,
  },
});
