import React from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import FontAwesome from "@expo/vector-icons/FontAwesome";
import { useRouter } from "expo-router";
import { useThemeStore } from "@/services/themeStore";

interface EmptyStateProps {
  type: "transactions" | "holdings" | "dividends" | "general";
  onPrimaryAction?: () => void;
}

export function EmptyState({ type, onPrimaryAction }: EmptyStateProps) {
  const router = useRouter();
  const { colors } = useThemeStore();

  const config = {
    transactions: {
      icon: "exchange" as const,
      title: "No Transactions Yet",
      description: "Add your first transaction or import from Excel to get started.",
      primaryAction: "Add Transaction",
      secondaryAction: "Import Excel",
    },
    holdings: {
      icon: "briefcase" as const,
      title: "No Holdings Found",
      description: "Transactions will appear here once you add them.",
      primaryAction: "Add Transaction",
      secondaryAction: null,
    },
    dividends: {
      icon: "money" as const,
      title: "No Dividends Yet",
      description: "Dividend transactions will appear here automatically.",
      primaryAction: "Add Dividend",
      secondaryAction: null,
    },
    general: {
      icon: "inbox" as const,
      title: "Nothing Here Yet",
      description: "Get started by adding your first item.",
      primaryAction: "Get Started",
      secondaryAction: null,
    },
  };

  const { icon, title, description, primaryAction, secondaryAction } = config[type];

  return (
    <View style={[styles.container, { backgroundColor: colors.bgPrimary }]}>
      <View style={[styles.iconBox, { backgroundColor: colors.accentPrimary + "10" }]}>
        <FontAwesome name={icon} size={48} color={colors.accentPrimary} />
      </View>

      <Text style={[styles.title, { color: colors.textPrimary }]}>{title}</Text>
      <Text style={[styles.description, { color: colors.textSecondary }]}>{description}</Text>

      <View style={styles.actions}>
        <Pressable
          onPress={onPrimaryAction || (() => router.push("/(tabs)/add-transaction"))}
          style={[styles.primaryButton, { backgroundColor: colors.accentPrimary }]}
        >
          <FontAwesome name="plus" size={16} color="#fff" style={{ marginRight: 8 }} />
          <Text style={styles.primaryButtonText}>{primaryAction}</Text>
        </Pressable>

        {secondaryAction && (
          <Pressable
            onPress={() => router.push("/(tabs)/transactions")}
            style={[styles.secondaryButton, { borderColor: colors.success }]}
          >
            <FontAwesome name="upload" size={16} color={colors.success} style={{ marginRight: 8 }} />
            <Text style={[styles.secondaryButtonText, { color: colors.success }]}>
              {secondaryAction}
            </Text>
          </Pressable>
        )}
      </View>

      {/* Quick Tips */}
      <View style={[styles.tipsCard, { backgroundColor: colors.bgCard, borderColor: colors.borderColor }]}>
        <FontAwesome name="lightbulb-o" size={14} color={colors.warning} />
        <Text style={[styles.tipsText, { color: colors.textSecondary }]}>
          Pro tip: Import your broker statement for fastest setup
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, alignItems: "center", justifyContent: "center", padding: 32 },
  iconBox: { width: 100, height: 100, borderRadius: 50, alignItems: "center", justifyContent: "center", marginBottom: 24 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  description: { fontSize: 15, textAlign: "center", lineHeight: 22, marginBottom: 24, paddingHorizontal: 20 },
  actions: { width: "100%", gap: 12, marginBottom: 24 },
  primaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12 },
  primaryButtonText: { color: "#fff", fontSize: 16, fontWeight: "700" },
  secondaryButton: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, borderWidth: 1.5, borderStyle: "dashed" },
  secondaryButtonText: { fontSize: 15, fontWeight: "600" },
  tipsCard: { flexDirection: "row", alignItems: "center", gap: 10, padding: 14, borderRadius: 10, borderWidth: 1, maxWidth: 320 },
  tipsText: { flex: 1, fontSize: 13, lineHeight: 18 },
});
