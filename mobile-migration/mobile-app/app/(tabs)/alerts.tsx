/**
 * Alerts — manage price & portfolio alert rules.
 *
 * - List active alerts with enable/disable toggle
 * - "Add Alert" FAB → modal with stock symbol, alert type, threshold
 * - Swipe-to-delete with confirmation
 * - Empty state
 * - Uses react-hook-form + Zod for validation
 */

import { SegmentedControl } from "@/components/form";
import { useStockList } from "@/hooks/queries";
import { useScreenStyles } from "@/hooks/useScreenStyles";
import {
    type AlertCondition,
    type AlertRule,
    conditionLabel,
    createAlertRule,
    loadAlertRules,
    saveAlertRules,
} from "@/services/alerts/alertRules";
import { requestNotificationPermissions } from "@/services/alerts/notificationService";
import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { zodResolver } from "@hookform/resolvers/zod";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import {
    Alert,
    Modal,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Switch,
    Text,
    TextInput,
    View,
} from "react-native";
import { z } from "zod";

// ── Zod schema ───────────────────────────────────────────────────────

const alertConditions: AlertCondition[] = [
  "price-above",
  "price-below",
  "daily-change-pct",
  "portfolio-value-above",
  "portfolio-value-below",
];

function createAlertFormSchema(t: (key: string) => string) {
  return z
    .object({
      condition: z.enum(alertConditions as [AlertCondition, ...AlertCondition[]]),
      symbol: z.string().optional(),
      threshold: z
        .string()
        .min(1, t("alerts.thresholdRequired"))
        .refine((v) => !isNaN(parseFloat(v)) && parseFloat(v) > 0, t("alerts.mustBePositive")),
      label: z.string().optional(),
    })
    .refine(
      (data) => {
        const isPortfolio =
          data.condition === "portfolio-value-above" ||
          data.condition === "portfolio-value-below";
        return isPortfolio || (data.symbol && data.symbol.trim().length > 0);
      },
      { message: t("alerts.stockSymbolRequired"), path: ["symbol"] },
    );
}

type AlertFormData = z.infer<ReturnType<typeof createAlertFormSchema>>;

// ── Condition config ─────────────────────────────────────────────────

const CONDITION_OPTS: AlertCondition[] = [
  "price-above",
  "price-below",
  "daily-change-pct",
  "portfolio-value-above",
  "portfolio-value-below",
];

const CONDITION_LABELS: Record<AlertCondition, string> = {
  "price-above": "alerts.priceAbove",
  "price-below": "alerts.priceBelow",
  "daily-change-pct": "alerts.dailyChange",
  "portfolio-value-above": "alerts.portfolioAbove",
  "portfolio-value-below": "alerts.portfolioBelow",
};

// ── Component ────────────────────────────────────────────────────────

export default function AlertsScreen() {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const ss = useScreenStyles();

  const [rules, setRules] = useState<AlertRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [prefillSymbol, setPrefillSymbol] = useState<string | undefined>();

  const translatedCondLabels = useMemo(() => {
    const result: Record<string, string> = {};
    for (const [key, val] of Object.entries(CONDITION_LABELS)) {
      result[key] = t(val);
    }
    return result;
  }, [t]);

  // Load rules on mount
  useEffect(() => {
    loadAlertRules().then((loaded) => {
      setRules(loaded);
      setLoading(false);
    });
    requestNotificationPermissions();
  }, []);

  const persist = useCallback(async (updated: AlertRule[]) => {
    setRules(updated);
    await saveAlertRules(updated);
  }, []);

  const handleToggle = (id: string) => {
    persist(rules.map((r) => (r.id === id ? { ...r, enabled: !r.enabled } : r)));
  };

  const handleDelete = (id: string) => {
    const doDelete = () => persist(rules.filter((r) => r.id !== id));
    if (Platform.OS === "web") {
      if (window.confirm(t('alerts.areYouSure'))) doDelete();
    } else {
      Alert.alert(t('alerts.deleteAlert'), t('alerts.areYouSure'), [
        { text: t('app.cancel'), style: "cancel" },
        { text: t('app.delete'), style: "destructive", onPress: doDelete },
      ]);
    }
  };

  const handleAddRule = (rule: AlertRule) => {
    persist([rule, ...rules]);
    setModalOpen(false);
    setPrefillSymbol(undefined);
  };

  const openAddModal = (symbol?: string) => {
    setPrefillSymbol(symbol);
    setModalOpen(true);
  };

  return (
    <View style={ss.container}>
      <ScrollView contentContainerStyle={ss.scrollContent}>
        {/* ── Header ── */}
        <Text style={[ss.title, { marginBottom: 16 }]}>{t('alerts.title')}</Text>

        {/* ── Active Alerts ── */}
        {loading ? (
          <Text style={{ color: colors.textMuted, textAlign: "center", padding: 20 }}>
            {t("app.loading")}
          </Text>
        ) : rules.length === 0 ? (
          <View
            style={[
              st.emptyCard,
              { backgroundColor: colors.bgCard, borderColor: colors.borderColor },
            ]}
          >
            <FontAwesome name="bell-slash-o" size={36} color={colors.textMuted} />
            <Text style={[st.emptyTitle, { color: colors.textSecondary }]}>
              {t('alerts.noAlerts')}
            </Text>
            <Text style={[st.emptyText, { color: colors.textMuted }]}>
              {t('alerts.noAlertsDesc')}
            </Text>
          </View>
        ) : (
          rules.map((rule) => (
            <View
              key={rule.id}
              style={[
                st.ruleCard,
                {
                  backgroundColor: colors.bgCard,
                  borderColor: colors.borderColor,
                  opacity: rule.enabled ? 1 : 0.55,
                },
              ]}
            >
              <View style={st.ruleTop}>
                <View style={{ flex: 1 }}>
                  <Text style={[st.ruleSymbol, { color: colors.accentSecondary }]}>
                    {rule.symbol ?? t("alerts.portfolio")}
                  </Text>
                  <Text style={[st.ruleCondition, { color: colors.textSecondary }]}>
                    {conditionLabel(rule.condition)}: {rule.threshold}
                  </Text>
                  {rule.label ? (
                    <Text style={[st.ruleLabel, { color: colors.textMuted }]}>
                      {rule.label}
                    </Text>
                  ) : null}
                </View>

                <Switch
                  value={rule.enabled}
                  onValueChange={() => handleToggle(rule.id)}
                  trackColor={{
                    false: colors.borderColor,
                    true: colors.accentPrimary + "80",
                  }}
                  thumbColor={rule.enabled ? colors.accentPrimary : colors.textMuted}
                />

                <Pressable onPress={() => handleDelete(rule.id)} style={st.deleteBtn}>
                  <FontAwesome name="trash-o" size={18} color={colors.danger} />
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>

      {/* ── FAB ── */}
      <Pressable
        onPress={() => openAddModal()}
        style={[st.fab, { backgroundColor: colors.accentPrimary }]}
        accessibilityLabel="Add alert"
      >
        <FontAwesome name="plus" size={22} color="#fff" />
      </Pressable>

      {/* ── Add Alert Modal ── */}
      <AddAlertModal
        visible={modalOpen}
        onClose={() => {
          setModalOpen(false);
          setPrefillSymbol(undefined);
        }}
        onSave={handleAddRule}
        prefillSymbol={prefillSymbol}
        colors={colors}
      />
    </View>
  );
}

// ── Add Alert Modal ──────────────────────────────────────────────────

function AddAlertModal({
  visible,
  onClose,
  onSave,
  prefillSymbol,
  colors,
}: {
  visible: boolean;
  onClose: () => void;
  onSave: (rule: AlertRule) => void;
  prefillSymbol?: string;
  colors: any;
}) {
  const { t } = useTranslation();
  const alertFormSchema = useMemo(() => createAlertFormSchema(t), [t]);
  const {
    control,
    handleSubmit,
    watch,
    reset,
    formState: { errors },
  } = useForm<AlertFormData>({
    resolver: zodResolver(alertFormSchema),
    defaultValues: {
      condition: "price-above",
      symbol: prefillSymbol ?? "",
      threshold: "",
      label: "",
    },
  });

  // Reset form whenever modal opens with new prefill
  useEffect(() => {
    if (visible) {
      reset({
        condition: "price-above",
        symbol: prefillSymbol ?? "",
        threshold: "",
        label: "",
      });
      setStockSearchText(prefillSymbol ?? "");
      setShowStockDropdown(false);
    }
  }, [visible, prefillSymbol, reset]);

  // ── Stock picker state ─────────────────────────────────
  const [stockSearchText, setStockSearchText] = useState(prefillSymbol ?? "");
  const [showStockDropdown, setShowStockDropdown] = useState(false);
  const { data: refStocksData } = useStockList("kuwait");

  const filteredStocks = useMemo(() => {
    const all = refStocksData?.stocks ?? [];
    if (!stockSearchText.trim()) return all;
    const q = stockSearchText.toLowerCase();
    return all.filter(
      (s) =>
        s.symbol.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q),
    );
  }, [refStocksData, stockSearchText]);

  const watchCondition = watch("condition");
  const isPortfolio =
    watchCondition === "portfolio-value-above" ||
    watchCondition === "portfolio-value-below";

  const onSubmit = (data: AlertFormData) => {
    const rule = createAlertRule({
      symbol: isPortfolio ? null : data.symbol!.trim().toUpperCase(),
      condition: data.condition,
      threshold: parseFloat(data.threshold),
      label: data.label?.trim() || undefined,
    });
    onSave(rule);
    reset();
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={st.modalOverlay}>
        <View
          style={[
            st.modalContent,
            { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor },
          ]}
        >
          {/* Header */}
          <View style={st.modalHeader}>
            <Text style={[st.modalTitle, { color: colors.textPrimary }]}>
              {t('alerts.addAlert')}
            </Text>
            <Pressable onPress={onClose} style={st.modalCloseBtn}>
              <FontAwesome name="times" size={20} color={colors.textSecondary} />
            </Pressable>
          </View>

          <ScrollView
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingBottom: 20 }}
          >
            {/* Condition */}
            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>
              {t('alerts.condition')}
            </Text>
            <Controller
              control={control}
              name="condition"
              render={({ field: { value, onChange } }) => {
                const translatedLabels: Record<string, string> = {};
                for (const [k, v] of Object.entries(CONDITION_LABELS)) {
                  translatedLabels[k] = t(v);
                }
                return (
                  <SegmentedControl
                    options={CONDITION_OPTS}
                    value={value}
                    onChange={onChange}
                    labels={translatedLabels}
                  />
                );
              }}
            />

            {/* Symbol */}
            {!isPortfolio && (
              <>
                <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>
                  {t("alerts.stockSymbol")}
                </Text>
                <Controller
                  control={control}
                  name="symbol"
                  render={({ field: { value, onChange } }) => (
                    <View>
                      <Pressable
                        onPress={() => setShowStockDropdown(!showStockDropdown)}
                        style={[st.stockPickerBtn, {
                          backgroundColor: colors.bgSecondary,
                          borderColor: errors.symbol ? colors.danger : colors.borderColor,
                        }]}
                      >
                        <FontAwesome name="search" size={14} color={colors.textMuted} />
                        <Text
                          style={[st.stockPickerText, { color: value ? colors.textPrimary : colors.textMuted }]}
                          numberOfLines={1}
                        >
                          {value || "Select or type stock symbol\u2026"}
                        </Text>
                        <FontAwesome
                          name={showStockDropdown ? "chevron-up" : "chevron-down"}
                          size={12}
                          color={colors.textMuted}
                        />
                      </Pressable>

                      {showStockDropdown && (
                        <View style={[st.stockDropdown, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
                          <TextInput
                            value={stockSearchText}
                            onChangeText={setStockSearchText}
                            placeholder="Search stocks\u2026"
                            placeholderTextColor={colors.textMuted}
                            autoFocus
                            autoCapitalize="characters"
                            style={[st.input, { backgroundColor: colors.bgSecondary, color: colors.textPrimary, borderColor: colors.borderColor, marginBottom: 6 }]}
                          />

                          {filteredStocks.length > 0 ? (
                            <ScrollView
                              style={{ maxHeight: 280 }}
                              nestedScrollEnabled
                              keyboardShouldPersistTaps="handled"
                            >
                              {filteredStocks.map((stock) => (
                                <Pressable
                                  key={stock.symbol}
                                  onPress={() => {
                                    onChange(stock.symbol);
                                    setShowStockDropdown(false);
                                    setStockSearchText("");
                                  }}
                                  style={[st.stockOption, {
                                    backgroundColor: value === stock.symbol ? colors.accentPrimary + "18" : "transparent",
                                    borderBottomColor: colors.borderColor,
                                  }]}
                                >
                                  <Text style={[st.stockSymbol, { color: colors.textPrimary }]}>
                                    {stock.symbol}
                                  </Text>
                                  <Text style={[st.stockName, { color: colors.textSecondary }]} numberOfLines={1}>
                                    {stock.name}
                                  </Text>
                                </Pressable>
                              ))}
                            </ScrollView>
                          ) : (
                            <Text style={{ color: colors.textMuted, fontSize: 12, textAlign: "center", paddingVertical: 12 }}>
                              {t("alerts.noStocksFound")}
                            </Text>
                          )}

                          {/* Manual entry fallback */}
                          <View style={st.manualRow}>
                            <TextInput
                              value={value}
                              onChangeText={(t) => onChange(t.toUpperCase().trim())}
                              placeholder={t("alerts.orTypeManually")}
                              placeholderTextColor={colors.textMuted}
                              autoCapitalize="characters"
                              style={[st.input, { backgroundColor: colors.bgSecondary, color: colors.textPrimary, borderColor: colors.borderColor, flex: 1 }]}
                            />
                          </View>
                        </View>
                      )}
                    </View>
                  )}
                />
                {errors.symbol && (
                  <Text style={[st.errorText, { color: colors.danger }]}>
                    {errors.symbol.message}
                  </Text>
                )}
              </>
            )}

            {/* Threshold */}
            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>
              {watchCondition === "daily-change-pct"
                ? t("alerts.changePctThreshold")
                : t("alerts.priceValue")}
            </Text>
            <Controller
              control={control}
              name="threshold"
              render={({ field: { value, onChange, onBlur } }) => (
                <TextInput
                  style={[
                    st.input,
                    {
                      backgroundColor: colors.bgSecondary,
                      color: colors.textPrimary,
                      borderColor: errors.threshold
                        ? colors.danger
                        : colors.borderColor,
                    },
                  ]}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder={
                    watchCondition === "daily-change-pct" ? t("alerts.placeholderThresholdPct") : t("alerts.placeholderThresholdPrice")
                  }
                  placeholderTextColor={colors.textMuted}
                  keyboardType="decimal-pad"
                />
              )}
            />
            {errors.threshold && (
              <Text style={[st.errorText, { color: colors.danger }]}>
                {errors.threshold.message}
              </Text>
            )}

            {/* Label */}
            <Text style={[st.fieldLabel, { color: colors.textSecondary }]}>
              {t("alerts.labelOptional")}
            </Text>
            <Controller
              control={control}
              name="label"
              render={({ field: { value, onChange, onBlur } }) => (
                <TextInput
                  style={[
                    st.input,
                    {
                      backgroundColor: colors.bgSecondary,
                      color: colors.textPrimary,
                      borderColor: colors.borderColor,
                    },
                  ]}
                  value={value}
                  onChangeText={onChange}
                  onBlur={onBlur}
                  placeholder={t("alerts.placeholderLabel")}
                  placeholderTextColor={colors.textMuted}
                />
              )}
            />

            {/* Quick-suggest chips (only for stock alerts) */}
            {!isPortfolio &&
              (watchCondition === "price-below" ||
                watchCondition === "daily-change-pct") && (
                <View style={st.suggestRow}>
                  {(watchCondition === "daily-change-pct"
                    ? ["3", "5", "10"]
                    : ["5%↓", "10%↓"]
                  ).map((hint) => (
                    <Pressable
                      key={hint}
                      onPress={() => {
                        // For % suggestions — just set threshold
                        const num = parseFloat(hint);
                        if (!isNaN(num)) {
                          // direct number
                        }
                      }}
                      style={[
                        st.suggestChip,
                        {
                          backgroundColor: colors.bgSecondary,
                          borderColor: colors.borderColor,
                        },
                      ]}
                    >
                      <Text style={[st.suggestText, { color: colors.textSecondary }]}>
                        {hint}
                      </Text>
                    </Pressable>
                  ))}
                </View>
              )}

            {/* Actions */}
            <View style={st.modalActions}>
              <Pressable
                onPress={onClose}
                style={[
                  st.actionBtn,
                  { borderColor: colors.borderColor, borderWidth: 1 },
                ]}
              >
                <Text style={[st.actionBtnText, { color: colors.textSecondary }]}>
                  {t("app.cancel")}
                </Text>
              </Pressable>
              <Pressable
                onPress={handleSubmit(onSubmit)}
                style={[st.actionBtn, { backgroundColor: colors.accentPrimary }]}
              >
                <FontAwesome
                  name="bell"
                  size={14}
                  color="#fff"
                  style={{ marginRight: 6 }}
                />
                <Text style={[st.actionBtnText, { color: "#fff" }]}>{t("alerts.saveAlert")}</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────

const st = StyleSheet.create({
  emptyCard: {
    padding: 40,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: "center",
    gap: 8,
  },
  emptyTitle: {
    fontSize: 16,
    fontWeight: "700",
    marginTop: 4,
  },
  emptyText: {
    fontSize: 13,
    textAlign: "center",
  },
  ruleCard: {
    padding: 14,
    borderRadius: 10,
    borderWidth: 1,
    marginBottom: 10,
  },
  ruleTop: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  ruleSymbol: {
    fontSize: 15,
    fontWeight: "700",
  },
  ruleCondition: {
    fontSize: 13,
    marginTop: 2,
  },
  ruleLabel: {
    fontSize: 12,
    marginTop: 2,
    fontStyle: "italic",
  },
  deleteBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  fab: {
    position: "absolute",
    bottom: 20,
    right: 20,
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: "center",
    justifyContent: "center",
    elevation: 6,
    shadowColor: "#000",
    shadowOpacity: 0.3,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
  },
  // ── Modal ──
  modalOverlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    paddingHorizontal: 20,
  },
  modalContent: {
    borderRadius: 16,
    borderWidth: 1,
    padding: 20,
    maxHeight: "85%",
  },
  modalHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "700",
  },
  modalCloseBtn: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
  },
  fieldLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginBottom: 6,
    marginTop: 14,
  },
  input: {
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  errorText: {
    fontSize: 11,
    marginTop: 4,
  },
  suggestRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 10,
  },
  suggestChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 14,
    borderWidth: 1,
  },
  suggestText: {
    fontSize: 12,
    fontWeight: "600",
  },
  modalActions: {
    flexDirection: "row",
    gap: 12,
    marginTop: 24,
  },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 12,
    borderRadius: 8,
  },
  actionBtnText: {
    fontSize: 14,
    fontWeight: "700",
  },
  // ── Stock picker ──
  stockPickerBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  stockPickerText: {
    flex: 1,
    fontSize: 14,
  },
  stockDropdown: {
    borderWidth: 1,
    borderRadius: 8,
    marginTop: 6,
    padding: 8,
  },
  stockOption: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 8,
    paddingHorizontal: 10,
    borderBottomWidth: 1,
  },
  stockSymbol: {
    fontSize: 13,
    fontWeight: "700",
    minWidth: 60,
  },
  stockName: {
    fontSize: 12,
    flex: 1,
  },
  manualRow: {
    flexDirection: "row",
    gap: 8,
    marginTop: 8,
  },
});
