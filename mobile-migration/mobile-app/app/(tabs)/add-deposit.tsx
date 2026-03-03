/**
 * Add Deposit screen — form to record a cash deposit or withdrawal.
 *
 * • react-hook-form + zod validation
 * • Portfolio / Date / Amount / Currency / Bank / Source / Notes
 * • Mutation with React Query cache invalidation
 */

import React, { useState } from "react";
import {
  View,
  Text,
  ScrollView,
  Pressable,
  StyleSheet,
  Platform,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
} from "react-native";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import FontAwesome from "@expo/vector-icons/FontAwesome";

import { createDeposit, updateDeposit } from "@/services/api";
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

const depositSchema = z.object({
  portfolio: z.enum(["KFH", "BBYN", "USA"], {
    required_error: "Select a portfolio",
  }),
  source: z.enum(["deposit", "withdrawal"]),
  deposit_date: z
    .string()
    .min(1, "Date is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Use format YYYY-MM-DD"),
  amount: z
    .string()
    .min(1, "Amount is required")
    .refine((v) => !isNaN(Number(v)) && Number(v) > 0, "Must be > 0"),
  currency: z.string().min(1, "Currency is required"),
  bank_name: z.string().optional(),
  notes: z.string().optional(),
});

type DepositForm = z.infer<typeof depositSchema>;

// ── Currency map ────────────────────────────────────────────────────

const PORTFOLIO_CURRENCY: Record<string, string> = {
  KFH: "KWD",
  BBYN: "KWD",
  USA: "USD",
};

// ── Component ───────────────────────────────────────────────────────

export default function AddDepositScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { colors } = useThemeStore();
  const { isDesktop } = useResponsive();

  // ── Edit mode params ──────────────────────────────────────────
  const params = useLocalSearchParams<{
    editId?: string;
    editPortfolio?: string;
    editDate?: string;
    editAmount?: string;
    editCurrency?: string;
    editBankName?: string;
    editSource?: string;
    editNotes?: string;
  }>();
  const isEditMode = !!params.editId;
  const editId = params.editId ? Number(params.editId) : undefined;

  const {
    control,
    handleSubmit,
    setValue,
    watch,
    formState: { errors },
  } = useForm<DepositForm>({
    resolver: zodResolver(depositSchema),
    defaultValues: {
      portfolio: (params.editPortfolio as "KFH" | "BBYN" | "USA") ?? "KFH",
      source: (params.editSource as "deposit" | "withdrawal") ?? "deposit",
      deposit_date: params.editDate ?? new Date().toISOString().slice(0, 10),
      amount: params.editAmount ?? "",
      currency: params.editCurrency ?? "KWD",
      bank_name: params.editBankName ?? "",
      notes: params.editNotes ?? "",
    },
  });

  const selectedPortfolio = watch("portfolio");
  const selectedSource = watch("source");

  // Auto-sync currency when portfolio changes
  React.useEffect(() => {
    const ccy = PORTFOLIO_CURRENCY[selectedPortfolio] ?? "KWD";
    setValue("currency", ccy);
  }, [selectedPortfolio, setValue]);

  // ── Mutation ──────────────────────────────────────────────────

  const mutation = useMutation({
    mutationFn: (values: DepositForm) => {
      const payload = {
        portfolio: values.portfolio,
        deposit_date: values.deposit_date,
        amount: Number(values.amount),
        currency: values.currency,
        bank_name: values.bank_name || null,
        source: values.source,
        notes: values.notes || null,
      };
      if (isEditMode && editId) {
        return updateDeposit(editId, payload);
      }
      return createDeposit(payload);
    },
    onSuccess: async () => {
      // Await refetches so overview/cash data is fresh BEFORE navigating back
      await Promise.all([
        queryClient.refetchQueries({ queryKey: ["portfolio-overview"] }),
        queryClient.refetchQueries({ queryKey: ["cash-balances"] }),
        queryClient.refetchQueries({ queryKey: ["deposits"] }),
        queryClient.refetchQueries({ queryKey: ["deposits-total"] }),
        queryClient.refetchQueries({ queryKey: ["holdings"] }),
        queryClient.refetchQueries({ queryKey: ["snapshots"] }),
        queryClient.refetchQueries({ queryKey: ["snapshots-chart"] }),
        queryClient.refetchQueries({ queryKey: ["tracker-data"] }),
      ]);

      // Navigate back first, then show non-blocking success message
      router.back();
      const successMsg = isEditMode ? "Deposit updated successfully!" : "Deposit saved successfully!";
      setTimeout(() => {
        if (Platform.OS === "web") {
          window.alert(successMsg);
        } else {
          Alert.alert("Success", successMsg);
        }
      }, 100);
    },
    onError: (err: any) => {
      const msg = err?.response?.data?.detail ?? err?.message ?? "Failed to save";
      if (Platform.OS === "web") {
        window.alert(`Error: ${msg}`);
      } else {
        Alert.alert("Error", msg);
      }
    },
  });

  const onSubmit = handleSubmit((values) => mutation.mutate(values));

  // ── Render ────────────────────────────────────────────────────

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: colors.bgPrimary }}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        contentContainerStyle={[
          s.scroll,
          isDesktop && { maxWidth: 600, alignSelf: "center", width: "100%" },
        ]}
        keyboardShouldPersistTaps="handled"
      >
        {/* ── Header ──────────────────────────────────────────── */}
        <View style={s.headerRow}>
          <Pressable onPress={() => router.back()} style={s.backBtn}>
            <FontAwesome name="arrow-left" size={18} color={colors.textPrimary} />
          </Pressable>
          <Text style={[s.title, { color: colors.textPrimary }]}>
            {isEditMode ? "Edit Deposit" : "Add Cash Deposit"}
          </Text>
        </View>

        {/* ── Source toggle (Deposit / Withdrawal) ────────────── */}
        <Controller
          control={control}
          name="source"
          render={({ field: { value, onChange } }) => (
            <SegmentedControl
              options={["deposit", "withdrawal"]}
              value={value}
              onChange={onChange}
              labels={{ deposit: "Deposit", withdrawal: "Withdrawal" }}
            />
          )}
        />

        {/* ── Portfolio ───────────────────────────────────────── */}
        <Controller
          control={control}
          name="portfolio"
          render={({ field: { value, onChange } }) => (
            <FormField
              label="Portfolio"
              required
              error={errors.portfolio?.message}
            >
              <SegmentedControl
                options={["KFH", "BBYN", "USA"]}
                value={value}
                onChange={onChange}
              />
            </FormField>
          )}
        />

        {/* ── Date ────────────────────────────────────────────── */}
        <Controller
          control={control}
          name="deposit_date"
          render={({ field: { value, onChange } }) => (
            <FormField label="Date" required error={errors.deposit_date?.message}>
              <DateInput
                value={value}
                onChangeText={onChange}
                hasError={!!errors.deposit_date}
              />
            </FormField>
          )}
        />

        {/* ── Amount ──────────────────────────────────────────── */}
        <Controller
          control={control}
          name="amount"
          render={({ field: { value, onChange } }) => (
            <FormField label="Amount" required error={errors.amount?.message}>
              <NumberInput
                value={value}
                onChangeText={onChange}
                placeholder="0.000"
                hasError={!!errors.amount}
                suffix={watch("currency")}
              />
            </FormField>
          )}
        />

        {/* ── Currency ────────────────────────────────────────── */}
        <Controller
          control={control}
          name="currency"
          render={({ field: { value, onChange } }) => (
            <FormField label="Currency" error={errors.currency?.message}>
              <SegmentedControl
                options={["KWD", "USD"]}
                value={value}
                onChange={onChange}
              />
            </FormField>
          )}
        />

        {/* ── Bank Name ───────────────────────────────────────── */}
        <Controller
          control={control}
          name="bank_name"
          render={({ field: { value, onChange } }) => (
            <FormField label="Bank Name">
              <TextInput
                value={value ?? ""}
                onChangeText={onChange}
                placeholder="e.g. KFH, NBK, Boubyan"
              />
            </FormField>
          )}
        />

        {/* ── Notes ───────────────────────────────────────────── */}
        <Controller
          control={control}
          name="notes"
          render={({ field: { value, onChange } }) => (
            <FormField label="Notes">
              <TextInput
                value={value ?? ""}
                onChangeText={onChange}
                placeholder="Optional notes"
                multiline
                numberOfLines={3}
              />
            </FormField>
          )}
        />

        {/* ── Submit ──────────────────────────────────────────── */}
        <Pressable
          onPress={onSubmit}
          disabled={mutation.isPending}
          style={[
            s.submitBtn,
            {
              backgroundColor: selectedSource === "withdrawal"
                ? colors.danger
                : colors.accentPrimary,
              opacity: mutation.isPending ? 0.6 : 1,
            },
          ]}
        >
          {mutation.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={s.submitLabel}>
              {isEditMode
                ? "Update Deposit"
                : selectedSource === "withdrawal"
                  ? "Record Withdrawal"
                  : "Record Deposit"}
            </Text>
          )}
        </Pressable>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

// ── Styles ──────────────────────────────────────────────────────────

const s = StyleSheet.create({
  scroll: {
    padding: 20,
    paddingBottom: 60,
  },
  headerRow: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 20,
    gap: 12,
  },
  backBtn: {
    width: 36,
    height: 36,
    borderRadius: 18,
    justifyContent: "center",
    alignItems: "center",
  },
  title: {
    fontSize: 22,
    fontWeight: "700",
  },
  submitBtn: {
    paddingVertical: 16,
    borderRadius: 12,
    alignItems: "center",
    marginTop: 8,
  },
  submitLabel: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "700",
  },
});
