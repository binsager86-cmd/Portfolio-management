/**
 * KFH Trade Help Modal — instructions + cash position input before upload.
 */

import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";

interface Props {
  visible: boolean;
  onClose: () => void;
  onUpload?: (cashBalance: number | null) => void;
}

export default function KfhTradeHelpModal({ visible, onClose, onUpload }: Props) {
  const { colors } = useThemeStore();
  const { t } = useTranslation();
  const [step, setStep] = useState<"instructions" | "cash">("instructions");
  const [cashInput, setCashInput] = useState("");

  const handleClose = () => {
    setStep("instructions");
    setCashInput("");
    onClose();
  };

  const handleNext = () => {
    setStep("cash");
  };

  const handleUpload = () => {
    const val = cashInput.trim();
    const parsed = val ? parseFloat(val.replace(/,/g, "")) : null;
    const cashBalance = parsed != null && !isNaN(parsed) ? parsed : null;
    setStep("instructions");
    setCashInput("");
    onUpload?.(cashBalance);
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <Pressable style={s.backdrop} onPress={handleClose}>
        <Pressable style={[s.card, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]} onPress={(e) => e.stopPropagation()}>
          <View style={s.header}>
            <FontAwesome
              name={step === "instructions" ? "info-circle" : "money"}
              size={20}
              color={colors.accentPrimary}
            />
            <Text style={[s.title, { color: colors.textPrimary }]}>
              {step === "instructions"
                ? t("kfhImport.howToSave")
                : t("importCash.enterCashTitle")}
            </Text>
            <Pressable onPress={handleClose} hitSlop={12}>
              <FontAwesome name="times" size={18} color={colors.textMuted} />
            </Pressable>
          </View>

          {step === "instructions" ? (
            <>
              <ScrollView style={s.body}>
                <View style={[s.warningBox, { backgroundColor: colors.warning + "15", borderColor: colors.warning + "40" }]}>
                  <FontAwesome name="exclamation-triangle" size={14} color={colors.warning} />
                  <Text style={[s.warningText, { color: colors.warning }]}>
                    {t("kfhImport.importantNote")}
                  </Text>
                </View>

                <Text style={[s.sectionTitle, { color: colors.textPrimary }]}>
                  {t("kfhImport.beforeUpload")}
                </Text>

                <View style={s.steps}>
                  {[
                    t("kfhImport.step1"),
                    t("kfhImport.step2"),
                    t("kfhImport.step3"),
                    t("kfhImport.step4"),
                    t("kfhImport.step5"),
                    t("kfhImport.step6"),
                  ].map((text, i) => (
                    <View key={i} style={s.step}>
                      <View style={[s.stepNum, { backgroundColor: colors.accentPrimary + "20" }]}>
                        <Text style={[s.stepNumText, { color: colors.accentPrimary }]}>{i + 1}</Text>
                      </View>
                      <Text style={[s.stepText, { color: colors.textSecondary }]}>{text}</Text>
                    </View>
                  ))}
                </View>

                <View style={[s.tipBox, { backgroundColor: colors.accentPrimary + "10", borderColor: colors.accentPrimary + "30" }]}>
                  <FontAwesome name="lightbulb-o" size={14} color={colors.accentPrimary} />
                  <Text style={[s.tipText, { color: colors.textSecondary }]}>
                    {t("kfhImport.tipText")}
                  </Text>
                </View>
              </ScrollView>

              <View style={s.footer}>
                {onUpload && (
                  <Pressable
                    onPress={handleNext}
                    style={[s.uploadBtn, { backgroundColor: colors.accentPrimary }]}
                  >
                    <FontAwesome name="arrow-right" size={14} color="#fff" />
                    <Text style={s.uploadBtnText}>{t("importCash.next")}</Text>
                  </Pressable>
                )}
              </View>
            </>
          ) : (
            <>
              <ScrollView style={s.body}>
                <Text style={[s.cashDesc, { color: colors.textSecondary }]}>
                  {t("importCash.enterCashDesc")}
                </Text>

                <Text style={[s.inputLabel, { color: colors.textPrimary }]}>
                  {t("importCash.cashBalanceLabel")}
                </Text>
                <View style={[s.inputRow, { borderColor: colors.borderColor, backgroundColor: colors.bgPrimary }]}>
                  <Text style={[s.currencyLabel, { color: colors.textMuted }]}>KWD</Text>
                  <TextInput
                    value={cashInput}
                    onChangeText={setCashInput}
                    placeholder="0.00"
                    placeholderTextColor={colors.textMuted}
                    keyboardType="decimal-pad"
                    style={[s.cashTextInput, { color: colors.textPrimary }]}
                    autoFocus
                  />
                </View>

                <View style={[s.tipBox, { backgroundColor: colors.accentPrimary + "10", borderColor: colors.accentPrimary + "30", marginTop: 16 }]}>
                  <FontAwesome name="lightbulb-o" size={14} color={colors.accentPrimary} />
                  <Text style={[s.tipText, { color: colors.textSecondary }]}>
                    {t("importCash.cashTip")}
                  </Text>
                </View>
              </ScrollView>

              <View style={s.footerRow}>
                <Pressable
                  onPress={() => setStep("instructions")}
                  style={[s.backBtn, { borderColor: colors.borderColor }]}
                >
                  <FontAwesome name="arrow-left" size={12} color={colors.textSecondary} />
                  <Text style={[s.backBtnText, { color: colors.textSecondary }]}>
                    {t("importCash.back")}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={handleUpload}
                  style={[s.uploadBtn, { backgroundColor: colors.accentPrimary, flex: 1 }]}
                >
                  <FontAwesome name="upload" size={14} color="#fff" />
                  <Text style={s.uploadBtnText}>{t("kfhImport.uploadNow")}</Text>
                </Pressable>
              </View>
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.5)",
    justifyContent: "center",
    alignItems: "center",
    padding: 20,
  },
  card: {
    maxWidth: 480,
    width: "100%",
    borderRadius: 16,
    borderWidth: 1,
    overflow: "hidden",
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255,255,255,0.1)",
  },
  title: { flex: 1, fontSize: 16, fontWeight: "700" },
  body: { padding: 16, maxHeight: 400 },
  note: { fontSize: 13, fontWeight: "600", marginBottom: 12 },
  sectionTitle: { fontSize: 14, fontWeight: "600", marginBottom: 12 },
  steps: { gap: 10, marginBottom: 16 },
  step: { flexDirection: "row", alignItems: "center", gap: 12 },
  stepNum: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
  },
  stepNumText: { fontSize: 13, fontWeight: "700" },
  stepText: { fontSize: 13, flex: 1 },
  tipBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
  },
  tipText: { fontSize: 12, flex: 1, lineHeight: 18 },
  warningBox: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    marginBottom: 14,
  },
  warningText: { fontSize: 13, fontWeight: "600", flex: 1 },
  footer: {
    padding: 16,
    paddingTop: 0,
  },
  footerRow: {
    flexDirection: "row",
    gap: 10,
    padding: 16,
    paddingTop: 0,
  },
  uploadBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    paddingVertical: 13,
    borderRadius: 10,
  },
  uploadBtnText: { color: "#fff", fontSize: 14, fontWeight: "700" },
  backBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 13,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
  },
  backBtnText: { fontSize: 13, fontWeight: "600" },
  cashDesc: { fontSize: 13, lineHeight: 20, marginBottom: 16 },
  inputLabel: { fontSize: 13, fontWeight: "600", marginBottom: 8 },
  inputRow: {
    flexDirection: "row",
    alignItems: "center",
    borderWidth: 1,
    borderRadius: 10,
    paddingHorizontal: 12,
    height: 48,
  },
  currencyLabel: { fontSize: 13, fontWeight: "600", marginRight: 8 },
  cashTextInput: { flex: 1, fontSize: 16, fontWeight: "600" },
});
