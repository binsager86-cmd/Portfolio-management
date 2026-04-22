/**
 * Add Transaction — multi-step wizard using react-hook-form + zod.
 *
 * Step 1 → Portfolio + Transaction Type
 * Step 2 → Stock, Date, Amounts, Dividends, Advanced, Notes
 * Step 3 → Review summary with edit-back buttons
 *
 * Import / Danger-zone UI shown in footer on step 1.
 */

import { FormScreen } from "@/components/screens";
import { useToast } from "@/components/ui/ToastProvider";
import { UITokens } from "@/constants/uiTokens";
import { useStockList, useStocks, useTransaction } from "@/hooks/queries";
import { useCreateTransaction, useUpdateTransaction } from "@/hooks/useTransactionMutations";
import { todayISO } from "@/lib/dateUtils";
import type { StockListEntry } from "@/services/api";
import { createStock, fetchStockPrice } from "@/services/api";
import { useThemeStore } from "@/services/themeStore";
import { Step1Type } from "@/src/features/transactions/components/Step1Type";
import { Step2Details } from "@/src/features/transactions/components/Step2Details";
import { Step3Review } from "@/src/features/transactions/components/Step3Review";
import { TransactionImport } from "@/src/features/transactions/components/TransactionImport";
import {
  PORTFOLIOS,
  STEP1_FIELDS,
  STEP2_FIELDS,
  toPayload,
  txnSchema,
  type TxnFormValues,
  type TxnTypeLabel,
} from "@/src/features/transactions/transactionSchema";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { ActivityIndicator, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ProgressBar } from "react-native-paper";

const TOTAL_STEPS = 3;

// ── Component ───────────────────────────────────────────────────────

export default function AddTransactionScreen() {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const params = useLocalSearchParams<{ symbol?: string; portfolio?: string; editId?: string }>();
  const isEditMode = !!params.editId;

  const [step, setStep] = useState(1);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [stockSearchText, setStockSearchText] = useState(params.symbol ?? "");
  const [selectedRefStock, setSelectedRefStock] = useState<StockListEntry | null>(null);

  // ── Fetch existing transaction in edit mode ────────────────────
  const { data: editTxn, isLoading: isLoadingEdit } = useTransaction(params.editId);
  const { data: stocksData } = useStocks();

  const methods = useForm<TxnFormValues>({
    resolver: zodResolver(txnSchema),
    defaultValues: {
      portfolio: (params.portfolio as (typeof PORTFOLIOS)[number]) ?? "KFH",
      stock_symbol: params.symbol ?? "",
      txn_date: todayISO(),
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

  const { handleSubmit, reset, watch, trigger } = methods;

  // ── Pre-fill form in edit mode ────────────────────────────────
  useEffect(() => {
    if (!editTxn) return;
    const apiTypeToLabel = (val: string): TxnTypeLabel => {
      if (val === "DIVIDEND_ONLY") return "Dividend Only";
      return val as TxnTypeLabel;
    };
    const n = (v: number | null | undefined) => (v != null ? v : ("" as unknown as number));
    reset({
      portfolio: editTxn.portfolio as (typeof PORTFOLIOS)[number],
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
    if (editTxn.fees || editTxn.price_override || editTxn.planned_cum_shares || editTxn.broker || editTxn.reference) {
      setShowAdvanced(true);
    }
  }, [editTxn, reset]);

  const currentPortfolio = watch("portfolio");
  const market = currentPortfolio === "USA" ? "us" : "kuwait";
  const { data: refStocksData } = useStockList(market);

  const filteredStocks = useMemo(() => {
    const all: StockListEntry[] = refStocksData?.stocks ?? [];
    if (!stockSearchText.trim()) return all;
    const q = stockSearchText.toLowerCase();
    return all.filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  }, [refStocksData, stockSearchText]);

  const navigateToTransactions = () => {
    toast.success(isEditMode ? "Transaction updated successfully" : "Transaction saved successfully");
    router.replace("/(tabs)/transactions");
  };

  const createMutation = useCreateTransaction(navigateToTransactions);
  const updateMutation = useUpdateTransaction(navigateToTransactions);
  const activeMutation = isEditMode ? updateMutation : createMutation;

  const onSubmit = async (values: TxnFormValues) => {
    const existingStocks = stocksData?.stocks ?? [];
    const alreadyExists = existingStocks.some(
      (s) => s.symbol.toUpperCase() === values.stock_symbol.toUpperCase()
    );
    if (!alreadyExists && values.stock_symbol) {
      const refList = refStocksData?.stocks ?? [];
      const refMatch =
        selectedRefStock?.symbol.toUpperCase() === values.stock_symbol.toUpperCase()
          ? selectedRefStock
          : refList.find((r) => r.symbol.toUpperCase() === values.stock_symbol.toUpperCase());
      try {
        const currency = values.portfolio === "USA" ? "USD" : "KWD";
        let price: number | undefined;
        if (refMatch?.yf_ticker) {
          try {
            const res = await fetchStockPrice(refMatch.yf_ticker, currency);
            if (res.price != null && res.price > 0) price = res.price;
          } catch {
            // price stays undefined — non-fatal
          }
        }
        await createStock({
          symbol: values.stock_symbol,
          name: refMatch?.name ?? values.stock_symbol,
          portfolio: values.portfolio,
          currency,
          current_price: price,
          yf_ticker: refMatch?.yf_ticker,
        });
        await queryClient.invalidateQueries({ queryKey: ["stocks"] });
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

  // ── Step navigation ─────────────────────────────────────────────

  const triggerHaptic = (style: "light" | "error") => {
    if (Platform.OS === "web") return;
    import("expo-haptics").then((h) => {
      if (style === "error") {
        h.notificationAsync(h.NotificationFeedbackType.Error);
      } else {
        h.impactAsync(h.ImpactFeedbackStyle.Light);
      }
    });
  };

  const handleNext = async () => {
    const fieldsToValidate = step === 1 ? STEP1_FIELDS : STEP2_FIELDS;
    const valid = await trigger(fieldsToValidate);
    if (!valid) {
      triggerHaptic("error");
      return;
    }
    triggerHaptic("light");
    setStep((s) => Math.min(s + 1, TOTAL_STEPS));
  };

  const handleBack = () => setStep((s) => Math.max(s - 1, 1));

  const submitLabel =
    step < TOTAL_STEPS
      ? t("addTransaction.next")
      : isEditMode
        ? t("addTransaction.updateTransaction")
        : t("addTransaction.title");

  const onFormSubmit = step < TOTAL_STEPS ? handleNext : handleSubmit(onSubmit);

  const footerContent = !isEditMode && step === 1 ? <TransactionImport /> : undefined;

  // ── Render ──────────────────────────────────────────────────────

  return (
    <FormProvider {...methods}>
      <FormScreen
        title={isEditMode ? t("addTransaction.editTitle") : t("addTransaction.title")}
        onSubmit={onFormSubmit}
        isSubmitting={activeMutation.isPending || (isEditMode && isLoadingEdit)}
        submitLabel={submitLabel}
        footer={footerContent}
      >
        {/* ── Progress bar ── */}
        <ProgressBar
          progress={step / TOTAL_STEPS}
          color={colors.accentPrimary}
          style={styles.progressBar}
        />

        {/* ── Step indicator with labels ── */}
        <View style={styles.stepRow}>
          {([
            { num: 1, label: t("addTransaction.stepPortfolio", "Portfolio") },
            { num: 2, label: t("addTransaction.stepDetails", "Details") },
            { num: 3, label: t("addTransaction.stepReview", "Review") },
          ] as const).map(({ num, label }) => (
            <View key={num} style={styles.stepItem}>
              <View
                style={[styles.stepDot, { backgroundColor: num <= step ? colors.accentPrimary : colors.bgSecondary }]}
              >
                {num < step ? (
                  <FontAwesome name="check" size={12} color="#fff" />
                ) : (
                  <Text style={[styles.stepNum, { color: num <= step ? "#fff" : colors.textMuted }]}>{num}</Text>
                )}
              </View>
              <Text style={[styles.stepLabel, { color: num <= step ? colors.textPrimary : colors.textMuted }]}>
                {label}
              </Text>
            </View>
          ))}
          <View style={[styles.stepLine, { backgroundColor: colors.borderColor }]} />
        </View>

        {/* ── Back button (steps 2+) ── */}
        {step > 1 && (
          <Pressable
            onPress={handleBack}
            accessibilityRole="button"
            accessibilityLabel={t("addTransaction.back")}
            hitSlop={8}
            style={styles.backBtn}
          >
            <FontAwesome name="arrow-left" size={14} color={colors.accentPrimary} />
            <Text style={[styles.backText, { color: colors.accentPrimary }]}>{t("addTransaction.back")}</Text>
          </Pressable>
        )}

        {/* ── Loading spinner for edit mode ──── */}
        {isEditMode && isLoadingEdit && (
          <View style={{ alignItems: "center", paddingVertical: 40 }}>
            <ActivityIndicator size="large" color={colors.accentPrimary} />
            <Text style={{ color: colors.textSecondary, marginTop: 12, fontSize: 14 }}>
              {t("addTransaction.loading")}
            </Text>
          </View>
        )}

        {/* ── Wizard steps ── */}
        {(!isEditMode || (isEditMode && editTxn)) && (
          <>
            {step === 1 && <Step1Type />}
            {step === 2 && (
              <Step2Details
                filteredStocks={filteredStocks}
                onSelectStock={setSelectedRefStock}
                searchText={stockSearchText}
                onSearchTextChange={setStockSearchText}
                showAdvanced={showAdvanced}
                onToggleAdvanced={() => setShowAdvanced(!showAdvanced)}
              />
            )}
            {step === 3 && <Step3Review onEditStep={setStep} />}
          </>
        )}
      </FormScreen>
    </FormProvider>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  progressBar: {
    height: 6,
    borderRadius: 3,
    marginBottom: UITokens.spacing.md,
  },
  stepRow: {
    flexDirection: "row", alignItems: "flex-start", justifyContent: "center",
    gap: 32, marginBottom: 20, position: "relative",
  },
  stepItem: {
    alignItems: "center", zIndex: 1, gap: 4,
  },
  stepDot: {
    width: 32, height: 32, borderRadius: 16,
    alignItems: "center", justifyContent: "center",
  },
  stepNum: { fontSize: 14, fontWeight: "700" },
  stepLabel: { fontSize: 11, fontWeight: "600" },
  stepLine: { position: "absolute", height: 2, left: "20%", right: "20%", top: 16 },
  backBtn: { flexDirection: "row", alignItems: "center", gap: 6, marginBottom: 12 },
  backText: { fontSize: 14, fontWeight: "600" },
});
