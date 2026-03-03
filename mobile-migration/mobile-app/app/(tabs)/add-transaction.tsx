/**
 * Add Transaction — form screen using react-hook-form + zod.
 *
 * Fields adapt based on txn_type:
 *   Buy  → purchase_cost (required)
 *   Sell → sell_value   (required)
 *
 * Optional fields collapsed behind an "Advanced" toggle.
 * Submits via React Query mutation + invalidates caches.
 */

import React, { useState, useMemo, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  Alert,
  Platform,
  KeyboardAvoidingView,
  ActivityIndicator,
  FlatList,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as DocumentPicker from "expo-document-picker";
import {
  TransactionCreate,
  TransactionRecord,
  importTransactions,
  deleteAllTransactions,
  getStocks,
  getStockList,
  StockListEntry,
  createStock,
  getTransaction,
} from "@/services/api";
import { useCreateTransaction, useUpdateTransaction, TXN_DEPENDENT_QUERY_KEYS } from "@/hooks/useTransactionMutations";
import { useThemeStore } from "@/services/themeStore";
import { useResponsive } from "@/hooks/useResponsive";
import {
  FormField,
  SegmentedControl,
  TextInput,
  NumberInput,
  DateInput,
} from "@/components/form";

// ── Schema ──────────────────────────────────────────────────────────

const PORTFOLIOS = ["KFH", "BBYN", "USA"] as const;
const TXN_TYPES = ["Buy", "Sell", "Dividend Only"] as const;
type TxnTypeLabel = (typeof TXN_TYPES)[number];

/** Map UI label → API value */
function txnTypeToApi(label: TxnTypeLabel): "Buy" | "Sell" | "DIVIDEND_ONLY" {
  if (label === "Dividend Only") return "DIVIDEND_ONLY";
  return label;
}

const txnSchema = z
  .object({
    portfolio: z.enum(PORTFOLIOS),
    stock_symbol: z
      .string()
      .min(1, "Symbol is required")
      .max(50)
      .transform((v) => v.toUpperCase().trim()),
    txn_date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be YYYY-MM-DD"),
    txn_type: z.enum(TXN_TYPES),
    shares: z.coerce
      .number({ invalid_type_error: "Enter a number" })
      .nonnegative("Shares must be >= 0")
      .optional()
      .or(z.literal("")),
    purchase_cost: z.coerce.number().nonnegative().optional().or(z.literal("")),
    sell_value: z.coerce.number().nonnegative().optional().or(z.literal("")),
    // Financial fields
    bonus_shares: z.coerce.number().nonnegative().optional().or(z.literal("")),
    cash_dividend: z.coerce.number().nonnegative().optional().or(z.literal("")),
    reinvested_dividend: z.coerce.number().nonnegative().optional().or(z.literal("")),
    fees: z.coerce.number().nonnegative().optional().or(z.literal("")),
    price_override: z.coerce.number().nonnegative().optional().or(z.literal("")),
    planned_cum_shares: z.coerce.number().nonnegative().optional().or(z.literal("")),
    broker: z.string().max(100).optional(),
    reference: z.string().max(100).optional(),
    notes: z.string().optional(),
  })
  .superRefine((data, ctx) => {
    if (data.txn_type === "Buy") {
      const shares = typeof data.shares === "number" ? data.shares : 0;
      if (shares <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Shares must be > 0 for Buy",
          path: ["shares"],
        });
      }
      const cost = typeof data.purchase_cost === "number" ? data.purchase_cost : undefined;
      if (cost == null || cost <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Purchase cost is required for Buy",
          path: ["purchase_cost"],
        });
      }
    }
    if (data.txn_type === "Sell") {
      const shares = typeof data.shares === "number" ? data.shares : 0;
      if (shares <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Shares must be > 0 for Sell",
          path: ["shares"],
        });
      }
      const val = typeof data.sell_value === "number" ? data.sell_value : undefined;
      if (val == null || val <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Sell value is required for Sell",
          path: ["sell_value"],
        });
      }
    }
    if (data.txn_type === "Dividend Only") {
      const cd = typeof data.cash_dividend === "number" ? data.cash_dividend : 0;
      const rd = typeof data.reinvested_dividend === "number" ? data.reinvested_dividend : 0;
      const bs = typeof data.bonus_shares === "number" ? data.bonus_shares : 0;
      if (cd <= 0 && rd <= 0 && bs <= 0) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: "At least one of Cash Dividend, Reinvested Dividend, or Bonus Shares is required",
          path: ["cash_dividend"],
        });
      }
    }
  });

type TxnFormValues = z.infer<typeof txnSchema>;

// ── Helpers ─────────────────────────────────────────────────────────

/** Convert zod form values → API payload (strip empty strings etc.) */
function toPayload(values: TxnFormValues): TransactionCreate {
  const clean = (v: unknown): number | undefined => {
    if (typeof v === "number" && !isNaN(v)) return v;
    return undefined;
  };
  const isDividendOnly = values.txn_type === "Dividend Only";
  return {
    portfolio: values.portfolio,
    stock_symbol: values.stock_symbol,
    txn_date: values.txn_date,
    txn_type: txnTypeToApi(values.txn_type),
    shares: isDividendOnly ? 0 : (clean(values.shares) ?? 0),
    purchase_cost: isDividendOnly ? null : (clean(values.purchase_cost) ?? null),
    sell_value: isDividendOnly ? null : (clean(values.sell_value) ?? null),
    bonus_shares: clean(values.bonus_shares) ?? null,
    cash_dividend: clean(values.cash_dividend) ?? null,
    reinvested_dividend: clean(values.reinvested_dividend) ?? null,
    fees: isDividendOnly ? null : (clean(values.fees) ?? null),
    price_override: isDividendOnly ? null : (clean(values.price_override) ?? null),
    planned_cum_shares: isDividendOnly ? null : (clean(values.planned_cum_shares) ?? null),
    broker: isDividendOnly ? null : (values.broker || null),
    reference: isDividendOnly ? null : (values.reference || null),
    notes: values.notes || null,
  };
}

// ── Component ───────────────────────────────────────────────────────

export default function AddTransactionScreen() {
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useLocalSearchParams<{ symbol?: string; portfolio?: string; editId?: string }>();
  const isEditMode = !!params.editId;
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [stockSearchText, setStockSearchText] = useState(params.symbol ?? "");
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const [selectedRefStock, setSelectedRefStock] = useState<StockListEntry | null>(null);

  // ── Upload / Bulk state ──────────────────────────────────────────
  const [uploadPortfolio, setUploadPortfolio] = useState<"KFH" | "BBYN" | "USA">("KFH");
  const [uploadMode, setUploadMode] = useState<"merge" | "replace">("merge");
  const [selectedFile, setSelectedFile] = useState<{ name: string; file: File } | null>(null);
  const [uploadResult, setUploadResult] = useState<any>(null);

  // ── Fetch existing transaction in edit mode ────────────────────
  const { data: editTxn, isLoading: isLoadingEdit } = useQuery({
    queryKey: ["transaction", params.editId],
    queryFn: () => getTransaction(Number(params.editId)),
    enabled: isEditMode,
    staleTime: 0,
  });

  // ── Also fetch user's existing stocks (for potential enrichment) ─
  const { data: stocksData } = useQuery({
    queryKey: ["stocks"],
    queryFn: () => getStocks(),
    staleTime: 60_000,
  });

  const {
    control,
    handleSubmit,
    watch,
    setValue,
    reset,
    formState: { errors },
  } = useForm<TxnFormValues>({
    resolver: zodResolver(txnSchema),
    defaultValues: {
      portfolio: (params.portfolio as "KFH" | "BBYN" | "USA") ?? "KFH",
      stock_symbol: params.symbol ?? "",
      txn_date: new Date().toISOString().slice(0, 10),
      txn_type: "Buy",
      shares: undefined as unknown as number,
      purchase_cost: "" as unknown as number,
      sell_value: "" as unknown as number,
      bonus_shares: "" as unknown as number,
      cash_dividend: "" as unknown as number,
      reinvested_dividend: "" as unknown as number,
      fees: "" as unknown as number,
      price_override: "" as unknown as number,
      planned_cum_shares: "" as unknown as number,
      broker: "",
      reference: "",
      notes: "",
    },
  });

  // ── Pre-fill form in edit mode ────────────────────────────────
  useEffect(() => {
    if (!editTxn) return;
    const apiTypeToLabel = (t: string): TxnTypeLabel => {
      if (t === "DIVIDEND_ONLY") return "Dividend Only";
      return t as TxnTypeLabel;
    };
    const n = (v: number | null | undefined) => (v != null ? v : ("" as unknown as number));
    reset({
      portfolio: editTxn.portfolio as typeof PORTFOLIOS[number],
      stock_symbol: editTxn.stock_symbol,
      txn_date: editTxn.txn_date,
      txn_type: apiTypeToLabel(editTxn.txn_type),
      shares: editTxn.shares != null && editTxn.shares !== 0 ? editTxn.shares : (undefined as unknown as number),
      purchase_cost: n(editTxn.purchase_cost),
      sell_value: n(editTxn.sell_value),
      bonus_shares: n(editTxn.bonus_shares),
      cash_dividend: n(editTxn.cash_dividend),
      reinvested_dividend: n(editTxn.reinvested_dividend),
      fees: n(editTxn.fees),
      price_override: n(editTxn.price_override),
      planned_cum_shares: n(editTxn.planned_cum_shares),
      broker: editTxn.broker ?? "",
      reference: editTxn.reference ?? "",
      notes: editTxn.notes ?? "",
    });
    setStockSearchText(editTxn.stock_symbol);
    // Expand advanced section if any advanced field has data
    if (editTxn.fees || editTxn.price_override || editTxn.planned_cum_shares || editTxn.broker || editTxn.reference) {
      setShowAdvanced(true);
    }
  }, [editTxn, reset]);

  const txnType = watch("txn_type");
  const currentPortfolio = watch("portfolio");
  const isDividendOnly = txnType === "Dividend Only";
  const isBuy = txnType === "Buy";
  const isSell = txnType === "Sell";

  // ── Market derived from portfolio ──────────────────────────────
  const market = currentPortfolio === "USA" ? "us" : "kuwait";

  // ── Fetch full reference stock list (yfinance) for dropdown ────
  // These are static hardcoded lists – cache aggressively (never refetch)
  const { data: refStocksData } = useQuery({
    queryKey: ["stock-list", market],
    queryFn: () => getStockList({ market }),
    staleTime: Infinity,
    gcTime: 24 * 60 * 60_000, // keep in memory 24h
  });

  // Filter reference stocks by search text (market already filtered by query)
  const filteredStocks = useMemo(() => {
    const all: StockListEntry[] = refStocksData?.stocks ?? [];
    if (!stockSearchText.trim()) return all;
    const q = stockSearchText.toLowerCase();
    return all.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q)
    );
  }, [refStocksData, stockSearchText]);

  const createMutation = useCreateTransaction(() => router.back());
  const updateMutation = useUpdateTransaction(() => router.back());
  const activeMutation = isEditMode ? updateMutation : createMutation;

  const onSubmit = async (values: TxnFormValues) => {
    // Auto-create stock record (with yf_ticker) if it doesn't exist yet
    const existingStocks = stocksData?.stocks ?? [];
    const alreadyExists = existingStocks.some(
      (s) => s.symbol.toUpperCase() === values.stock_symbol.toUpperCase()
    );
    if (!alreadyExists && values.stock_symbol) {
      // Find matching ref stock for yf_ticker
      const refList = refStocksData?.stocks ?? [];
      const refMatch = selectedRefStock?.symbol.toUpperCase() === values.stock_symbol.toUpperCase()
        ? selectedRefStock
        : refList.find((r) => r.symbol.toUpperCase() === values.stock_symbol.toUpperCase());
      try {
        await createStock({
          symbol: values.stock_symbol,
          name: refMatch?.name ?? values.stock_symbol,
          portfolio: values.portfolio,
          currency: values.portfolio === "USA" ? "USD" : "KWD",
          yf_ticker: refMatch?.yf_ticker,
        });
        queryClient.invalidateQueries({ queryKey: ["stocks"] });
      } catch {
        // Stock might already exist (race condition / duplicate) — continue
      }
    }
    if (isEditMode) {
      updateMutation.mutate({ txnId: Number(params.editId), payload: toPayload(values) });
    } else {
      createMutation.mutate(toPayload(values));
    }
  };

  // ── Upload mutation ─────────────────────────────────────────────
  const uploadMutation = useMutation({
    mutationFn: () => {
      if (!selectedFile) throw new Error("No file selected");
      return importTransactions(selectedFile.file, uploadPortfolio, uploadMode);
    },
    onSuccess: async (result) => {
      setUploadResult(result);
      setSelectedFile(null);
      await Promise.all(
        [...TXN_DEPENDENT_QUERY_KEYS, "stocks-list"].map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] })
        )
      );
      const msg = `Imported ${result?.imported ?? 0} transactions (${uploadMode} mode)`;
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Import Complete", msg);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.message ?? "Upload failed";
      if (Platform.OS === "web") window.alert(`Error: ${msg}`);
      else Alert.alert("Import Error", String(msg));
    },
  });

  // ── Delete-all mutation ─────────────────────────────────────────
  const deleteMutation = useMutation({
    mutationFn: () => deleteAllTransactions(),
    onSuccess: async (result) => {
      await Promise.all(
        TXN_DEPENDENT_QUERY_KEYS.map((key) =>
          queryClient.invalidateQueries({ queryKey: [key] })
        )
      );
      const msg = result?.message ?? `Deleted ${result?.deleted_count ?? 0} transactions`;
      if (Platform.OS === "web") window.alert(msg);
      else Alert.alert("Deleted", msg);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.message ?? "Delete failed";
      if (Platform.OS === "web") window.alert(`Error: ${msg}`);
      else Alert.alert("Error", String(msg));
    },
  });

  // ── File picker handler ─────────────────────────────────────────
  const pickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: [
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
          "application/vnd.ms-excel",
        ],
        copyToCacheDirectory: true,
      });

      if (result.canceled || !result.assets?.length) return;

      const asset = result.assets[0];

      if (Platform.OS === "web") {
        // On web the asset has a file property or we can fetch the uri
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const file = new File([blob], asset.name, { type: asset.mimeType ?? "application/octet-stream" });
        setSelectedFile({ name: asset.name, file });
      } else {
        // On native, create a File-like object from the URI
        const response = await fetch(asset.uri);
        const blob = await response.blob();
        const file = new File([blob], asset.name, { type: asset.mimeType ?? "application/octet-stream" });
        setSelectedFile({ name: asset.name, file });
      }
    } catch (error) {
      console.error("File picker error:", error);
    }
  };

  const confirmDeleteAll = () => {
    if (Platform.OS === "web") {
      // eslint-disable-next-line no-restricted-globals
      if (confirm("Are you sure you want to delete ALL transactions? This action can be undone via restore.")) {
        deleteMutation.mutate();
      }
    } else {
      Alert.alert(
        "Delete All Transactions",
        "Are you sure? This will soft-delete all your transactions. They can be restored later.",
        [
          { text: "Cancel", style: "cancel" },
          { text: "Delete All", style: "destructive", onPress: () => deleteMutation.mutate() },
        ]
      );
    }
  };

  // ── Render ──────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1 }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        style={[styles.screen, { backgroundColor: colors.bgPrimary }]}
        contentContainerStyle={[
          styles.scrollContent,
          isDesktop && { maxWidth: 600, alignSelf: "center", width: "100%" },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ────────────────────────────── */}
        <View style={styles.headerRow}>
          <Pressable onPress={() => router.back()} style={styles.backBtn}>
            <FontAwesome
              name="arrow-left"
              size={18}
              color={colors.textPrimary}
            />
          </Pressable>
          <Text style={[styles.title, { color: colors.textPrimary }]}>
            {isEditMode ? "Edit Transaction" : "Add Transaction"}
          </Text>
        </View>

        {/* ── Loading spinner for edit mode ──── */}
        {isEditMode && isLoadingEdit && (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <ActivityIndicator size="large" color={colors.accentPrimary} />
            <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: 14 }}>
              Loading transaction…
            </Text>
          </View>
        )}

        {/* ── Form (hidden until loaded in edit mode) ── */}
        {(!isEditMode || (isEditMode && editTxn)) && (
        <>
        {/* ── Portfolio ─────────────────────────── */}
        <FormField label="Portfolio" required error={errors.portfolio?.message}>
          <Controller
            control={control}
            name="portfolio"
            render={({ field: { value, onChange } }) => (
              <SegmentedControl
                options={[...PORTFOLIOS]}
                value={value}
                onChange={onChange}
              />
            )}
          />
        </FormField>

        {/* ── Transaction Type ──────────────────── */}
        <FormField
          label="Transaction Type"
          required
          error={errors.txn_type?.message}
        >
          <Controller
            control={control}
            name="txn_type"
            render={({ field: { value, onChange } }) => (
              <SegmentedControl
                options={[...TXN_TYPES]}
                value={value}
                onChange={onChange}
              />
            )}
          />
        </FormField>

        {/* ── Symbol (Dropdown + Text Input) ────── */}
        <FormField
          label="Stock Symbol"
          required
          error={errors.stock_symbol?.message}
        >
          <Controller
            control={control}
            name="stock_symbol"
            render={({ field: { value, onChange } }) => (
              <View>
                <Pressable
                  onPress={() => setShowStockDropdown(!showStockDropdown)}
                  style={[
                    styles.stockPickerBtn,
                    {
                      backgroundColor: colors.bgInput ?? colors.bgSecondary,
                      borderColor: errors.stock_symbol ? colors.danger : colors.borderColor,
                    },
                  ]}
                >
                  <FontAwesome name="search" size={14} color={colors.textMuted} />
                  <Text
                    style={[
                      styles.stockPickerText,
                      { color: value ? colors.textPrimary : colors.textMuted },
                    ]}
                    numberOfLines={1}
                  >
                    {value || "Select or type stock symbol…"}
                  </Text>
                  <FontAwesome
                    name={showStockDropdown ? "chevron-up" : "chevron-down"}
                    size={12}
                    color={colors.textMuted}
                  />
                </Pressable>

                {showStockDropdown && (
                  <View
                    style={[
                      styles.stockDropdown,
                      { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
                    ]}
                  >
                    {/* Search within stocks */}
                    <TextInput
                      value={stockSearchText}
                      onChangeText={setStockSearchText}
                      placeholder="Search stocks…"
                      autoFocus
                      autoCapitalize="characters"
                    />

                    {filteredStocks.length > 0 ? (
                      <ScrollView
                        style={{ maxHeight: 220 }}
                        nestedScrollEnabled
                        keyboardShouldPersistTaps="handled"
                      >
                        {filteredStocks.map((stock) => (
                          <Pressable
                            key={stock.symbol}
                            onPress={() => {
                              onChange(stock.symbol);
                              setSelectedRefStock(stock);
                              setShowStockDropdown(false);
                              setStockSearchText("");
                            }}
                            style={[
                              styles.stockOption,
                              {
                                backgroundColor:
                                  value === stock.symbol
                                    ? colors.accentPrimary + "18"
                                    : "transparent",
                                borderBottomColor: colors.borderColor,
                              },
                            ]}
                          >
                            <Text
                              style={[
                                styles.stockSymbol,
                                { color: colors.textPrimary },
                              ]}
                            >
                              {stock.symbol}
                            </Text>
                            <Text
                              style={[
                                styles.stockName,
                                { color: colors.textSecondary },
                              ]}
                              numberOfLines={1}
                            >
                              {stock.name}
                            </Text>
                          </Pressable>
                        ))}
                      </ScrollView>
                    ) : (
                      <Text
                        style={[
                          styles.stockEmpty,
                          { color: colors.textMuted },
                        ]}
                      >
                        No stocks found. Type symbol below.
                      </Text>
                    )}

                    {/* Manual entry fallback */}
                    <View style={styles.manualRow}>
                      <TextInput
                        value={value}
                        onChangeText={(t) => onChange(t.toUpperCase().trim())}
                        placeholder="Or type symbol manually"
                        autoCapitalize="characters"
                        hasError={!!errors.stock_symbol}
                      />
                    </View>
                  </View>
                )}
              </View>
            )}
          />
        </FormField>

        {/* ── Date ──────────────────────────────── */}
        <FormField label="Date" required error={errors.txn_date?.message}>
          <Controller
            control={control}
            name="txn_date"
            render={({ field: { value, onChange } }) => (
              <DateInput
                value={value}
                onChangeText={onChange}
                hasError={!!errors.txn_date}
              />
            )}
          />
        </FormField>

        {/* ── Shares (Buy/Sell only) ──────────── */}
        {!isDividendOnly && (
          <FormField label="Shares" required error={errors.shares?.message}>
            <Controller
              control={control}
              name="shares"
              render={({ field: { value, onChange } }) => (
                <NumberInput
                  value={value != null ? String(value) : ""}
                  onChangeText={(t) =>
                    onChange(t === "" ? undefined : Number(t))
                  }
                  placeholder="0"
                  hasError={!!errors.shares}
                />
              )}
            />
          </FormField>
        )}

        {/* ── Purchase Cost (Buy only) ──────────── */}
        {isBuy && (
          <FormField
            label="Purchase Cost"
            required
            error={errors.purchase_cost?.message}
          >
            <Controller
              control={control}
              name="purchase_cost"
              render={({ field: { value, onChange } }) => (
                <NumberInput
                  value={value != null && value !== ("" as any) ? String(value) : ""}
                  onChangeText={(t) =>
                    onChange(t === "" ? "" : Number(t))
                  }
                  placeholder="Total cost"
                  suffix="KWD"
                  hasError={!!errors.purchase_cost}
                />
              )}
            />
          </FormField>
        )}

        {/* ── Sell Value (Sell only) ────────────── */}
        {isSell && (
          <FormField
            label="Sell Value"
            required
            error={errors.sell_value?.message}
          >
            <Controller
              control={control}
              name="sell_value"
              render={({ field: { value, onChange } }) => (
                <NumberInput
                  value={value != null && value !== ("" as any) ? String(value) : ""}
                  onChangeText={(t) =>
                    onChange(t === "" ? "" : Number(t))
                  }
                  placeholder="Total proceeds"
                  suffix="KWD"
                  hasError={!!errors.sell_value}
                />
              )}
            />
          </FormField>
        )}

        {/* ══════════════════════════════════════════════════════
            ── Dividend / Income Fields (all types) ──────────
            ══════════════════════════════════════════════════════ */}
        <View style={[styles.fieldGroupHeader, { borderColor: colors.borderColor }]}>
          <FontAwesome name="money" size={13} color={colors.accentTertiary ?? colors.accentSecondary} />
          <Text style={[styles.fieldGroupTitle, { color: colors.textPrimary }]}>
            {isDividendOnly ? "Dividend Details" : "Dividend & Bonus (Optional)"}
          </Text>
        </View>

        {/* Cash Dividend */}
        <FormField
          label={isDividendOnly ? "Cash Dividend (KD)" : "Cash Dividend"}
          required={isDividendOnly}
          error={errors.cash_dividend?.message}
        >
          <Controller
            control={control}
            name="cash_dividend"
            render={({ field: { value, onChange } }) => (
              <NumberInput
                value={value != null && value !== ("" as any) ? String(value) : ""}
                onChangeText={(t) => onChange(t === "" ? "" : Number(t))}
                placeholder="0.000"
                suffix="KWD"
                hasError={!!errors.cash_dividend}
              />
            )}
          />
        </FormField>

        {/* Reinvested Dividend */}
        <FormField label="Reinvested Dividend" error={errors.reinvested_dividend?.message}>
          <Controller
            control={control}
            name="reinvested_dividend"
            render={({ field: { value, onChange } }) => (
              <NumberInput
                value={value != null && value !== ("" as any) ? String(value) : ""}
                onChangeText={(t) => onChange(t === "" ? "" : Number(t))}
                placeholder="0.000"
                suffix="KWD"
              />
            )}
          />
        </FormField>

        {/* Bonus Shares */}
        <FormField label="Bonus Shares (Stock Dividend)" error={errors.bonus_shares?.message}>
          <Controller
            control={control}
            name="bonus_shares"
            render={({ field: { value, onChange } }) => (
              <NumberInput
                value={value != null && value !== ("" as any) ? String(value) : ""}
                onChangeText={(t) => onChange(t === "" ? "" : Number(t))}
                placeholder="0"
              />
            )}
          />
        </FormField>

        {/* ══════════════════════════════════════════════════════
            ── Advanced Section (Buy/Sell only) ──────────────
            ══════════════════════════════════════════════════════ */}
        {!isDividendOnly && (
          <>
            <Pressable
              onPress={() => setShowAdvanced(!showAdvanced)}
              style={[
                styles.advancedToggle,
                { borderColor: colors.borderColor },
              ]}
            >
              <Text style={[styles.advancedLabel, { color: colors.textSecondary }]}>
                Advanced Fields
              </Text>
              <FontAwesome
                name={showAdvanced ? "chevron-up" : "chevron-down"}
                size={14}
                color={colors.textSecondary}
              />
            </Pressable>

            {showAdvanced && (
              <View style={styles.advancedSection}>
                {/* Fees */}
                <FormField label="Fees" error={errors.fees?.message}>
                  <Controller
                    control={control}
                    name="fees"
                    render={({ field: { value, onChange } }) => (
                      <NumberInput
                        value={value != null && value !== ("" as any) ? String(value) : ""}
                        onChangeText={(t) => onChange(t === "" ? "" : Number(t))}
                        placeholder="0.000"
                        suffix="KWD"
                      />
                    )}
                  />
                </FormField>

                {/* Price Override */}
                <FormField label="Price Override" error={errors.price_override?.message}>
                  <Controller
                    control={control}
                    name="price_override"
                    render={({ field: { value, onChange } }) => (
                      <NumberInput
                        value={value != null && value !== ("" as any) ? String(value) : ""}
                        onChangeText={(t) => onChange(t === "" ? "" : Number(t))}
                        placeholder="0.000000"
                      />
                    )}
                  />
                </FormField>

                {/* Planned Cum Shares */}
                <FormField label="Planned Cum. Shares" error={errors.planned_cum_shares?.message}>
                  <Controller
                    control={control}
                    name="planned_cum_shares"
                    render={({ field: { value, onChange } }) => (
                      <NumberInput
                        value={value != null && value !== ("" as any) ? String(value) : ""}
                        onChangeText={(t) => onChange(t === "" ? "" : Number(t))}
                        placeholder="0"
                      />
                    )}
                  />
                </FormField>

                {/* Broker */}
                <FormField label="Broker" error={errors.broker?.message}>
                  <Controller
                    control={control}
                    name="broker"
                    render={({ field: { value, onChange } }) => (
                      <TextInput
                        value={value ?? ""}
                        onChangeText={onChange}
                        placeholder="e.g. KFH Capital"
                      />
                    )}
                  />
                </FormField>

                {/* Reference */}
                <FormField label="Reference" error={errors.reference?.message}>
                  <Controller
                    control={control}
                    name="reference"
                    render={({ field: { value, onChange } }) => (
                      <TextInput
                        value={value ?? ""}
                        onChangeText={onChange}
                        placeholder="Order/Receipt #"
                      />
                    )}
                  />
                </FormField>
              </View>
            )}
          </>
        )}

        {/* ── Notes (all types) ──────────────── */}
        <FormField label="Notes" error={errors.notes?.message}>
          <Controller
            control={control}
            name="notes"
            render={({ field: { value, onChange } }) => (
              <TextInput
                value={value ?? ""}
                onChangeText={onChange}
                placeholder="Optional notes…"
                multiline
                numberOfLines={3}
              />
            )}
          />
        </FormField>

        {/* ── Submit ────────────────────────────── */}
        <Pressable
          onPress={handleSubmit(onSubmit)}
          disabled={activeMutation.isPending || (isEditMode && isLoadingEdit)}
          style={({ pressed }) => [
            styles.submitBtn,
            {
              backgroundColor: colors.accentPrimary,
              opacity: pressed || activeMutation.isPending ? 0.7 : 1,
            },
          ]}
        >
          {activeMutation.isPending ? (
            <Text style={styles.submitText}>{isEditMode ? "Updating…" : "Submitting…"}</Text>
          ) : (
            <Text style={styles.submitText}>{isEditMode ? "Update Transaction" : "Add Transaction"}</Text>
          )}
        </Pressable>
        </>)}

        {/* ══════════════════════════════════════════════════════════
            ── Excel Import & Danger Zone (hidden in edit mode) ──
            ══════════════════════════════════════════════════════════ */}
        {!isEditMode && (<>
        <View style={[styles.divider, { borderColor: colors.borderColor }]} />

        <Text style={[styles.sectionTitle, { color: colors.textPrimary }]}>
          <FontAwesome name="upload" size={16} color={colors.textPrimary} />{" "}
          Import from Excel
        </Text>
        <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
          Upload an Excel file (.xlsx) with a &quot;Transactions&quot; sheet to bulk-import.
        </Text>

        {/* Portfolio selector */}
        <View style={styles.uploadRow}>
          <Text style={[styles.uploadLabel, { color: colors.textSecondary }]}>Portfolio</Text>
          <View style={styles.segmentRow}>
            {(["KFH", "BBYN", "USA"] as const).map((p) => (
              <Pressable
                key={p}
                onPress={() => setUploadPortfolio(p)}
                style={[
                  styles.segmentBtn,
                  {
                    backgroundColor: uploadPortfolio === p ? colors.accentPrimary : colors.bgSecondary,
                    borderColor: colors.borderColor,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: uploadPortfolio === p ? "#fff" : colors.textPrimary },
                  ]}
                >
                  {p}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* Mode selector */}
        <View style={styles.uploadRow}>
          <Text style={[styles.uploadLabel, { color: colors.textSecondary }]}>Mode</Text>
          <View style={styles.segmentRow}>
            {([
              { key: "merge" as const, label: "Merge (Append)", icon: "plus" as const },
              { key: "replace" as const, label: "Replace All", icon: "refresh" as const },
            ]).map((m) => (
              <Pressable
                key={m.key}
                onPress={() => setUploadMode(m.key)}
                style={[
                  styles.segmentBtn,
                  {
                    backgroundColor: uploadMode === m.key ? colors.accentPrimary : colors.bgSecondary,
                    borderColor: colors.borderColor,
                    flex: 1,
                  },
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    { color: uploadMode === m.key ? "#fff" : colors.textPrimary },
                  ]}
                >
                  <FontAwesome
                    name={m.icon}
                    size={12}
                    color={uploadMode === m.key ? "#fff" : colors.textPrimary}
                  />{" "}
                  {m.label}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>
        {uploadMode === "replace" && (
          <Text style={[styles.warningText, { color: colors.warning ?? "#e67e22" }]}>
            ⚠ Replace mode will delete all existing transactions in {uploadPortfolio} before importing.
          </Text>
        )}

        {/* File picker */}
        <Pressable
          onPress={pickFile}
          style={[
            styles.filePickBtn,
            { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor },
          ]}
        >
          <FontAwesome name="file-excel-o" size={20} color={colors.accentPrimary} />
          <Text style={[styles.filePickText, { color: colors.textPrimary }]}>
            {selectedFile ? selectedFile.name : "Choose Excel File…"}
          </Text>
        </Pressable>

        {/* Upload button */}
        <Pressable
          onPress={() => uploadMutation.mutate()}
          disabled={!selectedFile || uploadMutation.isPending}
          style={({ pressed }) => [
            styles.submitBtn,
            {
              backgroundColor: !selectedFile ? colors.textMuted ?? "#888" : colors.accentPrimary,
              opacity: pressed || uploadMutation.isPending ? 0.7 : 1,
            },
          ]}
        >
          {uploadMutation.isPending ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color="#fff" />
              <Text style={[styles.submitText, { marginLeft: 8 }]}>Importing…</Text>
            </View>
          ) : (
            <Text style={styles.submitText}>
              <FontAwesome name="cloud-upload" size={16} color="#fff" /> Upload &amp; Import
            </Text>
          )}
        </Pressable>

        {/* Upload result */}
        {uploadResult && (
          <View style={[styles.resultBox, { backgroundColor: colors.bgSecondary, borderColor: colors.borderColor }]}>
            <Text style={[styles.resultTitle, { color: colors.accentPrimary }]}>Import Result</Text>
            <Text style={{ color: colors.textPrimary }}>
              Imported: {uploadResult.imported ?? 0} | Skipped: {uploadResult.skipped ?? 0} | Errors: {uploadResult.errors ?? 0}
            </Text>
            {uploadResult.mode && (
              <Text style={{ color: colors.textSecondary, fontSize: 12, marginTop: 4 }}>
                Mode: {uploadResult.mode}
              </Text>
            )}
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════
            ── Danger Zone ───────────────────────────────────────
            ══════════════════════════════════════════════════════════ */}
        <View style={[styles.divider, { borderColor: colors.borderColor }]} />

        <Text style={[styles.sectionTitle, { color: colors.danger ?? "#e74c3c" }]}>
          <FontAwesome name="exclamation-triangle" size={16} color={colors.danger ?? "#e74c3c"} />{" "}
          Danger Zone
        </Text>

        <Pressable
          onPress={confirmDeleteAll}
          disabled={deleteMutation.isPending}
          style={({ pressed }) => [
            styles.deleteAllBtn,
            {
              borderColor: colors.danger ?? "#e74c3c",
              opacity: pressed || deleteMutation.isPending ? 0.7 : 1,
            },
          ]}
        >
          {deleteMutation.isPending ? (
            <View style={styles.loadingRow}>
              <ActivityIndicator size="small" color={colors.danger ?? "#e74c3c"} />
              <Text style={[styles.deleteAllText, { color: colors.danger ?? "#e74c3c", marginLeft: 8 }]}>
                Deleting…
              </Text>
            </View>
          ) : (
            <Text style={[styles.deleteAllText, { color: colors.danger ?? "#e74c3c" }]}>
              <FontAwesome name="trash" size={14} color={colors.danger ?? "#e74c3c"} />{" "}
              Delete All Transactions
            </Text>
          )}
        </Pressable>
        <Text style={[styles.sectionHint, { color: colors.textSecondary }]}>
          Soft-deletes all transactions. They can be restored from the Transactions list.
        </Text>
        </>)}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scrollContent: { padding: 20, paddingBottom: 60 },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 24,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
  },
  title: { fontSize: 24, fontWeight: "700" },
  // Stock picker / dropdown
  stockPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    borderRadius: 10,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  stockPickerText: {
    flex: 1,
    fontSize: 14,
    fontWeight: "500",
  },
  stockDropdown: {
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 6,
    padding: 10,
    gap: 6,
  },
  stockOption: {
    flexDirection: "row",
    alignItems: "center",
    paddingVertical: 10,
    paddingHorizontal: 8,
    borderBottomWidth: StyleSheet.hairlineWidth,
    gap: 8,
  },
  stockSymbol: {
    fontSize: 14,
    fontWeight: "700",
    minWidth: 80,
  },
  stockName: {
    flex: 1,
    fontSize: 12,
  },
  stockEmpty: {
    fontSize: 13,
    textAlign: "center",
    paddingVertical: 12,
    fontStyle: "italic",
  },
  manualRow: {
    marginTop: 6,
  },
  // Field group header
  fieldGroupHeader: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingVertical: 10,
    marginTop: 8,
    borderTopWidth: 1,
    marginBottom: 4,
  },
  fieldGroupTitle: {
    fontSize: 14,
    fontWeight: "700",
  },
  advancedToggle: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingVertical: 12,
    borderTopWidth: 1,
    marginTop: 8,
    marginBottom: 8,
  },
  advancedLabel: { fontSize: 14, fontWeight: "600" },
  advancedSection: { marginBottom: 8 },
  submitBtn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 12,
  },
  submitText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
  // ── Upload / Bulk styles ──────────────────────────────────────
  divider: {
    borderTopWidth: 1,
    marginTop: 28,
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "700",
    marginBottom: 6,
  },
  sectionHint: {
    fontSize: 13,
    marginBottom: 16,
    lineHeight: 18,
  },
  uploadRow: {
    marginBottom: 12,
  },
  uploadLabel: {
    fontSize: 13,
    fontWeight: "600",
    marginBottom: 6,
  },
  segmentRow: {
    flexDirection: "row",
    gap: 8,
  },
  segmentBtn: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    alignItems: "center",
  },
  segmentText: {
    fontSize: 13,
    fontWeight: "600",
  },
  warningText: {
    fontSize: 12,
    marginBottom: 12,
    fontStyle: "italic",
  },
  filePickBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderStyle: "dashed",
    marginBottom: 12,
  },
  filePickText: {
    fontSize: 14,
    fontWeight: "500",
  },
  loadingRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
  },
  resultBox: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
  },
  resultTitle: {
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  deleteAllBtn: {
    paddingVertical: 14,
    borderRadius: 12,
    alignItems: "center",
    borderWidth: 2,
    marginBottom: 6,
  },
  deleteAllText: {
    fontSize: 15,
    fontWeight: "700",
  },
});
