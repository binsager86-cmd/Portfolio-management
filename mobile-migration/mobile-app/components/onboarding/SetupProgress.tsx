import { useThemeStore } from "@/services/themeStore";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import React from "react";
import { useTranslation } from "react-i18next";
import { Pressable, StyleSheet, Text, View } from "react-native";

interface SetupProgressProps {
  transactionCount: number;
  hasHoldings: boolean;
  hasDividends: boolean;
  hasSnapshots: boolean;
  onDismiss?: () => void;
}

export function SetupProgress({
  transactionCount,
  hasHoldings,
  hasDividends,
  hasSnapshots,
  onDismiss,
}: SetupProgressProps) {
  const { colors } = useThemeStore();
  const { t } = useTranslation();

  const tasks = [
    { id: 1, label: t("onboarding.taskAddTxn"), done: transactionCount > 0, icon: "plus-circle" as const },
    { id: 2, label: t("onboarding.taskViewHoldings"), done: hasHoldings, icon: "briefcase" as const },
    { id: 3, label: t("onboarding.taskTrackDividends"), done: hasDividends, icon: "money" as const },
    { id: 4, label: t("onboarding.taskSaveSnapshot"), done: hasSnapshots, icon: "camera" as const },
  ];

  const completed = tasks.filter((t) => t.done).length;
  const progress = (completed / tasks.length) * 100;

  if (completed === tasks.length) return null;

  return (
    <View style={[styles.container, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
      <View style={styles.header}>
        <Text style={[styles.title, { color: colors.textPrimary }]}>{t("onboarding.setupProgress")}</Text>
        <Pressable onPress={onDismiss} hitSlop={8}>
          <FontAwesome name="times" size={14} color={colors.textMuted} />
        </Pressable>
      </View>

      {/* Progress Bar */}
      <View style={styles.progressTrack}>
        <View style={[styles.progressFill, { width: `${progress}%`, backgroundColor: colors.success }]} />
      </View>
      <Text style={[styles.progressText, { color: colors.textMuted }]}>
        {t("onboarding.tasksCompleted", { completed, total: tasks.length })}
      </Text>

      {/* Tasks */}
      <View style={styles.tasks}>
        {tasks.map((task) => (
          <View key={task.id} style={styles.task}>
            <View
              style={[
                styles.taskIcon,
                {
                  backgroundColor: task.done ? colors.success + "15" : colors.bgInput,
                  borderColor: task.done ? colors.success : colors.borderColor,
                },
              ]}
            >
              <FontAwesome
                name={task.done ? "check" : task.icon}
                size={12}
                color={task.done ? colors.success : colors.textMuted}
              />
            </View>
            <Text
              style={[
                styles.taskLabel,
                { color: task.done ? colors.textPrimary : colors.textMuted },
              ]}
            >
              {task.label}
            </Text>
          </View>
        ))}
      </View>

      {/* Completion Reward */}
      {completed === tasks.length - 1 && (
        <View style={[styles.rewardCard, { backgroundColor: colors.accentPrimary + "10" }]}>
          <FontAwesome name="trophy" size={16} color={colors.accentPrimary} />
          <Text style={[styles.rewardText, { color: colors.accentPrimary }]}>
            {t("onboarding.oneMoreTask")}
          </Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { margin: 16, padding: 16, borderRadius: 14, borderWidth: 1 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { fontSize: 15, fontWeight: "700" },
  progressTrack: { height: 6, backgroundColor: "rgba(0,0,0,0.1)", borderRadius: 3, marginBottom: 6, overflow: "hidden" },
  progressFill: { height: "100%", borderRadius: 3 },
  progressText: { fontSize: 12, marginBottom: 12 },
  tasks: { gap: 10 },
  task: { flexDirection: "row", alignItems: "center", gap: 10 },
  taskIcon: { width: 24, height: 24, borderRadius: 6, borderWidth: 1.5, alignItems: "center", justifyContent: "center" },
  taskLabel: { flex: 1, fontSize: 13 },
  rewardCard: { flexDirection: "row", alignItems: "center", gap: 8, padding: 10, borderRadius: 8, marginTop: 12 },
  rewardText: { flex: 1, fontSize: 12, fontWeight: "600" },
});
