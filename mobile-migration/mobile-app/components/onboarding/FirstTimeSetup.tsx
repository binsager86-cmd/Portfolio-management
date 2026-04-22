import { useThemeStore } from "@/services/themeStore";
import type { ThemePalette } from "@/constants/theme";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import React, { useState } from "react";
import { useTranslation } from "react-i18next";
import { Alert, Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

interface FirstTimeSetupProps {
  visible: boolean;
  onComplete: () => void;
}

export function FirstTimeSetup({ visible, onComplete }: FirstTimeSetupProps) {
  const router = useRouter();
  const { colors } = useThemeStore();
  const [step, setStep] = useState(1);
  const { t } = useTranslation();

  const handleImportExcel = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ["application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"],
        copyToCacheDirectory: true,
      });

      if (!result.canceled && result.assets?.[0]) {
        // Navigate to import screen with file
        router.push({
          pathname: "/(tabs)/transactions",
          params: { importFile: result.assets[0].uri },
        });
        onComplete();
      }
    } catch (err) {
      Alert.alert(t("addTransaction.importError"), t("onboarding.importRetry"));
    }
  };

  const handleAddManual = () => {
    router.push("/(tabs)/add-transaction");
    onComplete();
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <View style={styles.stepContent}>
            <View style={[styles.stepIcon, { backgroundColor: colors.accentPrimary + "15" }]}>
              <FontAwesome name="rocket" size={40} color={colors.accentPrimary} />
            </View>
            <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>
              {t("onboarding.letsSetUp")}
            </Text>
            <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>
              {t("onboarding.addFirstTxnDesc")}
            </Text>

            {/* Progress */}
            <View style={styles.progress}>
              <View style={[styles.progressFill, { width: "33%", backgroundColor: colors.accentPrimary }]} />
            </View>
            <Text style={[styles.progressText, { color: colors.textMuted }]}>{t("onboarding.step1of3")}</Text>

            {/* Options */}
            <Pressable
              onPress={handleImportExcel}
              style={[styles.optionCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
            >
              <FontAwesome name="upload" size={24} color={colors.success} />
              <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>{t("onboarding.importFromExcel")}</Text>
              <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                {t("onboarding.fastestWay")}
              </Text>
            </Pressable>

            <Pressable
              onPress={handleAddManual}
              style={[styles.optionCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}
            >
              <FontAwesome name="plus-circle" size={24} color={colors.accentPrimary} />
              <Text style={[styles.optionTitle, { color: colors.textPrimary }]}>{t("onboarding.addManually")}</Text>
              <Text style={[styles.optionDesc, { color: colors.textSecondary }]}>
                {t("onboarding.enterFirstTxn")}
              </Text>
            </Pressable>
          </View>
        );

      case 2:
        return (
          <View style={styles.stepContent}>
            <View style={[styles.stepIcon, { backgroundColor: colors.success + "15" }]}>
              <FontAwesome name="check-circle" size={40} color={colors.success} />
            </View>
            <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>
              {t("onboarding.greatStart")}
            </Text>
            <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>
              {t("onboarding.txnAddedDesc")}
            </Text>

            <View style={styles.nextSteps}>
              <NextStepItem icon="line-chart" title={t("onboarding.viewOverview")} desc={t("onboarding.seePortfolioSummary")} colors={colors} />
              <NextStepItem icon="flask" title={t("onboarding.analyzeStocks")} desc={t("onboarding.getAIPoweredInsights")} colors={colors} />
              <NextStepItem icon="calculator" title={t("onboarding.runValuations")} desc={t("onboarding.calculateIntrinsicValue")} colors={colors} />
            </View>

            <View style={styles.progress}>
              <View style={[styles.progressFill, { width: "66%", backgroundColor: colors.success }]} />
            </View>
            <Text style={[styles.progressText, { color: colors.textMuted }]}>{t("onboarding.step2of3")}</Text>
          </View>
        );

      case 3:
        return (
          <View style={styles.stepContent}>
            <View style={[styles.stepIcon, { backgroundColor: colors.accentSecondary + "15" }]}>
              <FontAwesome name="star" size={40} color={colors.accentSecondary} />
            </View>
            <Text style={[styles.stepTitle, { color: colors.textPrimary }]}>
              {t("onboarding.youreAllSet")}
            </Text>
            <Text style={[styles.stepDesc, { color: colors.textSecondary }]}>
              {t("onboarding.portfolioReady")}
            </Text>

            {/* Feature Discovery Cards */}
            <ScrollView style={styles.featureScroll} showsVerticalScrollIndicator={false}>
              <FeatureCard
                icon="bell"
                title={t("onboarding.portfolioAlerts")}
                desc={t("onboarding.getNotifiedOnPriceChanges")}
                color="#f59e0b"
                colors={colors}
              />
              <FeatureCard
                icon="refresh"
                title={t("onboarding.syncBankAccounts")}
                desc={t("onboarding.autoImportTransactions")}
                color="#3b82f6"
                colors={colors}
              />
              <FeatureCard
                icon="file-pdf-o"
                title={t("onboarding.exportReports")}
                desc={t("onboarding.downloadPDFSummaries")}
                color="#10b981"
                colors={colors}
              />
            </ScrollView>

            <View style={styles.progress}>
              <View style={[styles.progressFill, { width: "100%", backgroundColor: colors.accentSecondary }]} />
            </View>
            <Text style={[styles.progressText, { color: colors.textMuted }]}>{t("onboarding.step3of3")}</Text>

            <Pressable
              onPress={onComplete}
              style={[styles.finishButton, { backgroundColor: colors.accentSecondary }]}
            >
              <Text style={styles.finishButtonText}>{t("onboarding.startUsingApp")}</Text>
              <FontAwesome name="arrow-right" size={16} color="#fff" style={{ marginLeft: 8 }} />
            </Pressable>
          </View>
        );
    }
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={[styles.overlay, { backgroundColor: "rgba(0,0,0,0.5)" }]}>
        <View style={[styles.modal, { backgroundColor: colors.bgCard }]}>
          {renderStep()}

          {step < 3 && (
            <Pressable
              onPress={() => onComplete()}
              style={styles.skipButton}
            >
              <Text style={[styles.skipText, { color: colors.textMuted }]}>{t("onboarding.skipForNow")}</Text>
            </Pressable>
          )}
        </View>
      </View>
    </Modal>
  );
}

function NextStepItem({ icon, title, desc, colors }: { icon: React.ComponentProps<typeof FontAwesome>["name"]; title: string; desc: string; colors: ThemePalette }) {
  return (
    <View style={[styles.nextStepItem, { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor }]}>
      <FontAwesome name={icon} size={18} color={colors.accentPrimary} />
      <View style={styles.nextStepContent}>
        <Text style={[styles.nextStepTitle, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.nextStepDesc, { color: colors.textMuted }]}>{desc}</Text>
      </View>
      <FontAwesome name="chevron-right" size={14} color={colors.textMuted} />
    </View>
  );
}

function FeatureCard({ icon, title, desc, color, colors }: { icon: React.ComponentProps<typeof FontAwesome>["name"]; title: string; desc: string; color: string; colors: ThemePalette }) {
  return (
    <View style={[styles.featureCard, { backgroundColor: colors.bgPrimary, borderColor: colors.borderColor }]}>
      <View style={[styles.featureIcon, { backgroundColor: color + "15" }]}>
        <FontAwesome name={icon} size={20} color={color} />
      </View>
      <View style={styles.featureContent}>
        <Text style={[styles.featureTitle, { color: colors.textPrimary }]}>{title}</Text>
        <Text style={[styles.featureDesc, { color: colors.textSecondary }]}>{desc}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: { flex: 1, justifyContent: "center", alignItems: "center", padding: 20 },
  modal: { width: "100%", maxWidth: 420, borderRadius: 20, padding: 24, maxHeight: "85%" },
  stepContent: { alignItems: "center" },
  stepIcon: { width: 80, height: 80, borderRadius: 40, alignItems: "center", justifyContent: "center", marginBottom: 20 },
  stepTitle: { fontSize: 22, fontWeight: "800", textAlign: "center", marginBottom: 12 },
  stepDesc: { fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 20, paddingHorizontal: 20 },
  progress: { width: "100%", height: 4, backgroundColor: "rgba(0,0,0,0.1)", borderRadius: 2, marginBottom: 8, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 2 },
  progressText: { fontSize: 12, marginBottom: 20 },
  optionCard: { width: "100%", padding: 16, borderRadius: 12, borderWidth: 1, marginBottom: 10, alignItems: "center" },
  optionTitle: { fontSize: 16, fontWeight: "700", marginTop: 8 },
  optionDesc: { fontSize: 13, textAlign: "center", marginTop: 4 },
  nextSteps: { width: "100%", gap: 8, marginBottom: 20 },
  nextStepItem: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 10, borderWidth: 1 },
  nextStepContent: { flex: 1 },
  nextStepTitle: { fontSize: 14, fontWeight: "600" },
  nextStepDesc: { fontSize: 12, marginTop: 2 },
  featureScroll: { width: "100%", maxHeight: 180, marginBottom: 20 },
  featureCard: { flexDirection: "row", alignItems: "center", gap: 12, padding: 12, borderRadius: 10, borderWidth: 1, marginBottom: 8 },
  featureIcon: { width: 40, height: 40, borderRadius: 10, alignItems: "center", justifyContent: "center" },
  featureContent: { flex: 1 },
  featureTitle: { fontSize: 14, fontWeight: "600" },
  featureDesc: { fontSize: 12, marginTop: 2 },
  finishButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12, marginTop: 10 },
  finishButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  skipButton: { marginTop: 16, paddingVertical: 10, alignItems: "center" },
  skipText: { fontSize: 14, fontWeight: "500" },
});
